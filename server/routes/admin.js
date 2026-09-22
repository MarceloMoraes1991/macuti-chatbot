const express = require('express');
const {
  DEPARTMENTS,
  listConversations,
  listMessages,
  addMessage,
  markRead,
  claimConversation,
  transferConversation,
  closeConversation,
  getConversation,
  listUsers,
  createUser,
  updateUser,
  getUserByUsername,
  saveFlow,
  getActiveFlow,
  listChannelConfigs,
  upsertChannelConfig,
  setChannelConfigActive,
  reportByDepartment,
  reportByChannel,
} = require('../db');
const { requireAuth, requireAdmin, hashPassword } = require('../auth');

const whatsapp = require('../channels/whatsapp');
const telegram = require('../channels/telegram');
const meta = require('../channels/meta');

function userCanSeeConversation(user, conversation) {
  if (user.role === 'admin') return true;
  if (conversation.assigned_agent_id === user.id) return true;
  return conversation.department && user.departments.includes(conversation.department);
}

function buildAdminRouter(io) {
  const router = express.Router();

  router.get('/departments', requireAuth, (req, res) => res.json(DEPARTMENTS));

  // --- Conversas / fila de atendimento ---
  // scope=queue  -> por atender, nos departamentos do agente (ou todos, se admin)
  // scope=mine   -> atribuídas a mim
  // scope=all    -> tudo (só admin)
  router.get('/conversations', requireAuth, (req, res) => {
    const { scope = 'queue', department } = req.query;
    const user = req.user;

    if (scope === 'mine') {
      return res.json(listConversations({ assigned_agent_id: user.id }));
    }

    if (scope === 'all') {
      if (user.role !== 'admin') return res.status(403).json({ error: 'Só o administrador vê tudo' });
      return res.json(listConversations({ department: department || undefined }));
    }

    // scope === 'queue'
    if (user.role === 'admin') {
      return res.json(listConversations({ status: 'waiting', department: department || undefined }));
    }
    const results = user.departments.flatMap((dep) => listConversations({ status: 'waiting', department: dep }));
    res.json(results);
  });

  router.get('/conversations/:id/messages', requireAuth, (req, res) => {
    const conversation = getConversation(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });
    if (!userCanSeeConversation(req.user, conversation)) return res.status(403).json({ error: 'Sem acesso a esta conversa' });

    markRead(req.params.id);
    res.json(listMessages(req.params.id));
  });

  router.post('/conversations/:id/claim', requireAuth, (req, res) => {
    const conversation = getConversation(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });
    if (req.user.role !== 'admin' && !req.user.departments.includes(conversation.department)) {
      return res.status(403).json({ error: 'Este atendimento não é do teu departamento' });
    }
    claimConversation(conversation.id, req.user.id);
    io.emit('conversation_updated', { conversationId: conversation.id });
    res.json({ ok: true });
  });

  router.post('/conversations/:id/transfer', requireAuth, (req, res) => {
    const conversation = getConversation(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });
    if (!userCanSeeConversation(req.user, conversation)) return res.status(403).json({ error: 'Sem acesso a esta conversa' });

    const { department, agent_id } = req.body || {};
    if (department && !DEPARTMENTS.includes(department)) return res.status(400).json({ error: 'Departamento inválido' });

    transferConversation(conversation.id, { department, agent_id });
    io.emit('conversation_updated', { conversationId: conversation.id });
    res.json({ ok: true });
  });

  router.post('/conversations/:id/close', requireAuth, (req, res) => {
    const conversation = getConversation(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });
    if (!userCanSeeConversation(req.user, conversation)) return res.status(403).json({ error: 'Sem acesso a esta conversa' });

    closeConversation(conversation.id);
    io.emit('conversation_updated', { conversationId: conversation.id });
    res.json({ ok: true });
  });

  router.post('/conversations/:id/reply', requireAuth, async (req, res) => {
    const { text } = req.body;
    const conversation = getConversation(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });
    if (!userCanSeeConversation(req.user, conversation)) return res.status(403).json({ error: 'Sem acesso a esta conversa' });

    try {
      if (conversation.channel === 'whatsapp') {
        await whatsapp.sendMessage(conversation.external_id, text);
      } else if (conversation.channel === 'telegram') {
        await telegram.sendMessage(conversation.external_id, text);
      } else if (conversation.channel === 'instagram' || conversation.channel === 'messenger') {
        await meta.sendMessage(conversation.external_id, text);
      } else if (conversation.channel === 'webchat') {
        io.to(`webchat:${conversation.external_id}`).emit('agent_reply', { text });
      }

      addMessage(conversation.id, 'out', text);
      io.emit('new_message', { conversationId: conversation.id, channel: conversation.channel });
      res.json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: 'Falha ao enviar a mensagem', details: String(err) });
    }
  });

  // --- Utilizadores (só admin) ---
  router.get('/users', requireAdmin, (req, res) => {
    res.json(listUsers().map((u) => ({ ...u, departments: JSON.parse(u.departments) })));
  });

  router.post('/users', requireAdmin, async (req, res) => {
    const { username, password, full_name, role, departments } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username e password são obrigatórios' });
    if (getUserByUsername(username)) return res.status(409).json({ error: 'Já existe um utilizador com esse username' });

    const password_hash = await hashPassword(password);
    const id = createUser({
      username,
      password_hash,
      full_name,
      role: role === 'admin' ? 'admin' : 'agent',
      departments: Array.isArray(departments) ? departments.filter((d) => DEPARTMENTS.includes(d)) : [],
    });
    res.json({ id });
  });

  router.patch('/users/:id', requireAdmin, async (req, res) => {
    const { full_name, role, departments, active, password } = req.body || {};
    const patch = { full_name, role, active };
    if (Array.isArray(departments)) patch.departments = departments.filter((d) => DEPARTMENTS.includes(d));
    if (password) patch.password_hash = await hashPassword(password);
    updateUser(req.params.id, patch);
    res.json({ ok: true });
  });

  // --- Fluxo de chamada (só admin edita; qualquer agente autenticado pode consultar) ---
  router.get('/flow', requireAuth, (req, res) => {
    res.json(getActiveFlow() || { name: null, definition: { nodes: [], edges: [] } });
  });

  router.post('/flow', requireAdmin, (req, res) => {
    const { name, definition } = req.body || {};
    if (!definition?.nodes) return res.status(400).json({ error: 'Definição de fluxo inválida' });
    const id = saveFlow(name || 'Fluxo principal', definition);
    res.json({ id });
  });

  // --- Canais de atendimento (só admin) ---
  router.get('/channels', requireAdmin, (req, res) => {
    res.json(listChannelConfigs());
  });

  router.post('/channels', requireAdmin, (req, res) => {
    const { channel, label, credentials } = req.body || {};
    if (!channel || !credentials) return res.status(400).json({ error: 'channel e credentials são obrigatórios' });
    upsertChannelConfig({ channel, label, credentials });
    res.json({ ok: true });
  });

  router.patch('/channels/:id/active', requireAdmin, (req, res) => {
    setChannelConfigActive(req.params.id, !!req.body?.active);
    res.json({ ok: true });
  });

  // --- Relatórios (só admin) ---
  router.get('/reports', requireAdmin, (req, res) => {
    res.json({
      byDepartment: reportByDepartment(),
      byChannel: reportByChannel(),
    });
  });

  return router;
}

module.exports = { buildAdminRouter };
