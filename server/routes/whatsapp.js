const express = require('express');
const whatsapp = require('../channels/whatsapp');
const { upsertConversation, addMessage } = require('../db');

function buildWhatsappRouter(io) {
  const router = express.Router();

  // O painel de admin chama isto em loop (polling) para mostrar o QR code
  // enquanto o telemóvel não estiver ligado.
  router.get('/qr', async (req, res) => {
    try {
      const data = await whatsapp.getQrCode();
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: 'Não foi possível contactar a Evolution API', details: String(err) });
    }
  });

  router.get('/status', async (req, res) => {
    try {
      const state = await whatsapp.getStatus();
      res.json({ state });
    } catch (err) {
      res.status(502).json({ error: 'Não foi possível contactar a Evolution API', details: String(err) });
    }
  });

  // Configurar este URL como webhook da instância na Evolution API:
  // https://<o-teu-dominio>/api/whatsapp/webhook
  router.post('/webhook', (req, res) => {
    const parsed = whatsapp.parseIncomingWebhook(req.body);
    if (parsed) {
      const conversationId = upsertConversation({
        channel: 'whatsapp',
        external_id: parsed.external_id,
        contact_name: parsed.contact_name,
        last_message: parsed.text,
      });
      addMessage(conversationId, 'in', parsed.text);
      io.emit('new_message', { conversationId, channel: 'whatsapp' });
    }
    res.sendStatus(200);
  });

  return router;
}

module.exports = buildWhatsappRouter;
