const express = require('express');
const meta = require('../channels/meta');
const { upsertConversation, addMessage } = require('../db');

const { META_VERIFY_TOKEN } = process.env;

function buildMetaRouter(io) {
  const router = express.Router();

  // Passo de verificação exigido pela Meta ao configurar o webhook.
  router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    res.sendStatus(403);
  });

  // Recebe mensagens do Instagram Direct e do Messenger.
  router.post('/webhook', (req, res) => {
    const parsedList = meta.parseIncomingWebhook(req.body);
    for (const parsed of parsedList) {
      const conversationId = upsertConversation({
        channel: parsed.channel,
        external_id: parsed.external_id,
        contact_name: parsed.contact_name,
        last_message: parsed.text,
      });
      addMessage(conversationId, 'in', parsed.text);
      io.emit('new_message', { conversationId, channel: parsed.channel });
    }
    res.sendStatus(200);
  });

  return router;
}

module.exports = buildMetaRouter;
