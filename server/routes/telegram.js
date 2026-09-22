const express = require('express');
const telegram = require('../channels/telegram');
const { handleIncomingMessage } = require('../flow-integration');

function buildTelegramRouter(io) {
  const router = express.Router();

  router.post('/webhook', (req, res) => {
    const parsed = telegram.parseIncomingWebhook(req.body);
    if (parsed) {
      handleIncomingMessage({
        io,
        channel: 'telegram',
        external_id: parsed.external_id,
        contact_name: parsed.contact_name,
        text: parsed.text,
        sendReply: (text) => telegram.sendMessage(parsed.external_id, text),
      });
    }
    res.sendStatus(200);
  });

  return router;
}

module.exports = buildTelegramRouter;
