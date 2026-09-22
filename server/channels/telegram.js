const fetch = require('node-fetch');
const { getActiveChannelConfig } = require('../db');

function getToken() {
  const dbConfig = getActiveChannelConfig('telegram');
  return dbConfig?.credentials?.botToken || process.env.TELEGRAM_BOT_TOKEN;
}

function apiUrl() {
  return `https://api.telegram.org/bot${getToken()}`;
}

async function sendMessage(chatId, text) {
  const res = await fetch(`${apiUrl()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return res.json();
}

async function setWebhook(url) {
  const res = await fetch(`${apiUrl()}/setWebhook`, {
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
