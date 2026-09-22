const express = require('express');
const { getConversationByExternal, listMessages } = require('../db');
const { handleIncomingMessage } = require('../flow-integration');

function buildWebchatRouter(io) {
  const router = express.Router();

  router.post('/message', (req, res) => {
    const { visitor_id, name, text } = req.body;
    if (!visitor_id || !text) return res.status(400).json({ error: 'visitor_id e text são obrigatórios' });

    const conversationId = handleIncomingMessage({
      io,
      channel: 'webchat',
      external_id: visitor_id,
      contact_name: name || 'Visitante do site',
      text,
      sendReply: (replyText) => {
        io.to(`webchat:${visitor_id}`).emit('agent_reply', { text: replyText });
        return Promise.resolve();
      },
    });

    res.json({ conversationId });
  });

  router.get('/history/:visitor_id', (req, res) => {
    const conversation = getConversationByExternal('webchat', req.params.visitor_id);
    if (!conversation) return res.json({ conversation: null, messages: [] });
    res.json({ conversation, messages: listMessages(conversation.id) });
  });

  return router;
}

module.exports = buildWebchatRouter;
