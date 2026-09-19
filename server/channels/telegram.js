const fetch = require('node-fetch');

const { TELEGRAM_BOT_TOKEN } = process.env;
const API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function sendMessage(chatId, text) {
  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return res.json();
}

// Regista o webhook no Telegram (correr uma vez após o deploy).
async function setWebhook(url) {
  const res = await fetch(`${API}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return res.json();
}

function parseIncomingWebhook(body) {
  const msg = body?.message;
  if (!msg) return null;

  return {
    external_id: String(msg.chat.id),
    contact_name: [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' '),
    text: msg.text || '[mensagem sem texto]',
  };
}

module.exports = { sendMessage, setWebhook, parseIncomingWebhook };
