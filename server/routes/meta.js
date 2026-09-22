const express = require('express');
const meta = require('../channels/meta');
const { handleIncomingMessage } = require('../flow-integration');

const { META_VERIFY_TOKEN } = process.env;

function buildMetaRouter(io) {
  const router = express.Router();

  router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) return res.status(200).send(challenge);
    res.sendStatus(403);
  });

  router.post('/webhook', (req, res) => {
    const parsedList = meta.parseIncomingWebhook(req.body);
    for (const parsed of parsedList) {
      handleIncomingMessage({
        io,
        channel: parsed.channel,
        external_id: parsed.external_id,
        contact_name: parsed.contact_name,
        text: parsed.text,
        sendReply: (text) => meta.sendMessage(parsed.external_id, text),
      });
    }
    res.sendStatus(200);
  });

  return router;
}

module.exports = buildMetaRouter;
