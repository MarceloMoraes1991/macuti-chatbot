const fetch = require('node-fetch');
const { getActiveChannelConfig } = require('../db');

const GRAPH_URL = 'https://graph.facebook.com/v20.0';

function getPageAccessToken() {
  const dbConfig = getActiveChannelConfig('messenger') || getActiveChannelConfig('instagram');
  return dbConfig?.credentials?.pageAccessToken || process.env.META_PAGE_ACCESS_TOKEN;
}

async function sendMessage(recipientId, text) {
  const token = getPageAccessToken();
  const res = await fetch(`${GRAPH_URL}/me/messages?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  return res.json();
}

function parseIncomingWebhook(body) {
  const channel = body.object === 'instagram' ? 'instagram' : 'messenger';
  const results = [];

  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      if (!event.message || event.message.is_echo) continue;
      results.push({
        channel,
        external_id: event.sender?.id,
        contact_name: null,
        text: event.message.text || '[mensagem sem texto — imagem/anexo]',
      });
    }
  }
  return results;
}

module.exports = { sendMessage, parseIncomingWebhook };
