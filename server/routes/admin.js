const express = require('express');
const {
  listConversations,
  getConversation,
  listMessages,
  addMessage,
  markRead,
} = require('../db');

const whatsapp = require('../channels/whatsapp');
const telegram = require('../channels/telegram');
const meta = require('../channels/meta');

const { ADMIN_TOKEN } = process.env;

// Proteção simples por token — suficiente para uma única pessoa a gerir o painel.
// Para várias contas de agente, isto teria de evoluir para login com sessões.
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Não autorizado' });
  next();
}

function buildAdminRouter(io) {
  const router = express.Router();
  router.use(requireAdmin);

  router.get('/conversations', (req, res) => {
    res.json(listConversations());
  });

  router.get('/conversations/:id/messages', (req, res) => {
    markRead(req.params.id);
    res.json(listMessages(req.params.id));
  });

  router.post('/conversations/:id/reply', async (req, res) => {
    const { text } = req.body;
    const conversation = getConversation(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });

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
      res.json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: 'Falha ao enviar a mensagem', details: String(err) });
    }
  });

  return router;
}

module.exports = { buildAdminRouter, requireAdmin };
