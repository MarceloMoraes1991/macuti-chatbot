const fetch = require('node-fetch');

const { META_PAGE_ACCESS_TOKEN } = process.env;
const GRAPH_URL = 'https://graph.facebook.com/v20.0';

// Serve tanto para Messenger como para Instagram Direct — a Graph API usa o
// mesmo endpoint de "me/messages" para ambos, desde que a página e a conta
// de Instagram estejam ligadas uma à outra.
async function sendMessage(recipientId, text) {
  const res = await fetch(
    `${GRAPH_URL}/me/messages?access_token=${META_PAGE_ACCESS_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    }
  );
  return res.json();
}

// A Meta envia um "entry" por página/conta, cada um com vários "messaging" events.
// Distinguimos Instagram de Messenger pelo campo `entry[].messaging[].message` +
// a origem do evento (campo "object" no corpo: "page" = Messenger, "instagram" = IG).
function parseIncomingWebhook(body) {
  const channel = body.object === 'instagram' ? 'instagram' : 'messenger';
  const results = [];

  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      if (!event.message || event.message.is_echo) continue;
      results.push({
        channel,
        external_id: event.sender?.id,
        contact_name: null, // exige uma chamada extra à Graph API para obter o nome do perfil
        text: event.message.text || '[mensagem sem texto — imagem/anexo]',
      });
    }
  }
  return results;
}

module.exports = { sendMessage, parseIncomingWebhook };
