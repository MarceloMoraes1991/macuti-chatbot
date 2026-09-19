const express = require('express');
const telegram = require('../channels/telegram');
const { upsertConversation, addMessage } = require('../db');

function buildTelegramRouter(io) {
  const router = express.Router();

  // Configurar via telegram.setWebhook('https://<o-teu-dominio>/api/telegram/webhook')
  router.post('/webhook', (req, res) => {
    const parsed = telegram.parseIncomingWebhook(req.body);
    if (parsed) {
      const conversationId = upsertConversation({
        channel: 'telegram',
        external_id: parsed.external_id,
        contact_name: parsed.contact_name,
        last_message: parsed.text,
      });
      addMessage(conversationId, 'in', parsed.text);
      io.emit('new_message', { conversationId, channel: 'telegram' });
    }
    res.sendStatus(200);
  });

  return router;
}

module.exports = buildTelegramRouter;
