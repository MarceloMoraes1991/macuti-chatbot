const express = require('express');
const whatsapp = require('../channels/whatsapp');
const { handleIncomingMessage } = require('../flow-integration');
const { requireAuth } = require('../auth');

function buildWhatsappRouter(io) {
  const router = express.Router();

  // O painel de admin chama isto em loop enquanto o telemóvel não estiver ligado.
  router.get('/qr', requireAuth, async (req, res) => {
    try {
      const data = await whatsapp.getQrCode();
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: String(err.message || err) });
    }
  });

  router.get('/status', requireAuth, async (req, res) => {
    try {
      const state = await whatsapp.getStatus();
      res.json({ state });
    } catch (err) {
      res.status(502).json({ error: String(err.message || err) });
    }
  });

  // Configurar como webhook da instância na Evolution API (sem autenticação —
  // é a Evolution API a chamar-nos, não um utilizador do painel).
  router.post('/webhook', (req, res) => {
    const parsed = whatsapp.parseIncomingWebhook(req.body);
    if (parsed) {
      handleIncomingMessage({
        io,
        channel: 'whatsapp',
        external_id: parsed.external_id,
        contact_name: parsed.contact_name,
        text: parsed.text,
        sendReply: (text) => whatsapp.sendMessage(parsed.external_id, text),
      });
    }
    res.sendStatus(200);
  });

  return router;
}

module.exports = buildWhatsappRouter;
