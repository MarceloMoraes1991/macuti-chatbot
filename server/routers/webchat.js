const express = require('express');
const { upsertConversation, addMessage, getConversationByExternal, listMessages } = require('../db');

function buildWebchatRouter(io) {
  const router = express.Router();

  // O widget do site chama isto sempre que o visitante envia uma mensagem.
  // visitor_id é gerado e guardado pelo próprio widget (ex: localStorage).
  router.post('/message', (req, res) => {
    const { visitor_id, name, text } = req.body;
    if (!visitor_id || !text) {
      return res.status(400).json({ error: 'visitor_id e text são obrigatórios' });
    }

    const conversationId = upsertConversation({
      channel: 'webchat',
      external_id: visitor_id,
      contact_name: name || 'Visitante do site',
      last_message: text,
    });
    addMessage(conversationId, 'in', text);

    io.emit('new_message', { conversationId, channel: 'webchat' });
    // Sala própria do visitante — é para aqui que enviamos a resposta do agente.
    io.to(`webchat:${visitor_id}`).emit('ack', { ok: true });

    res.json({ conversationId });
  });

  // O widget entra nesta "sala" ao carregar, para poder receber respostas em tempo real.
  router.get('/history/:visitor_id', (req, res) => {
    const conversation = getConversationByExternal('webchat', req.params.visitor_id);
    if (!conversation) return res.json({ conversation: null, messages: [] });
    res.json({ conversation, messages: listMessages(conversation.id) });
  });

  return router;
}

module.exports = buildWebchatRouter;
