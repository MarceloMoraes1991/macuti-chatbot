const fetch = require('node-fetch');

const {
  EVOLUTION_API_URL,
  EVOLUTION_API_KEY,
  EVOLUTION_INSTANCE_NAME,
} = process.env;

function evoHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: EVOLUTION_API_KEY,
  };
}

// Cria a instância na Evolution API (só precisa de correr uma vez).
async function createInstance(webhookUrl) {
  const res = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
    method: 'POST',
    headers: evoHeaders(),
    body: JSON.stringify({
      instanceName: EVOLUTION_INSTANCE_NAME,
      qrcode: true,
      webhook: webhookUrl,
      webhook_by_events: false,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
    }),
  });
  return res.json();
}

// Devolve o QR code atual (base64) para ligar o telemóvel.
async function getQrCode() {
  const res = await fetch(
    `${EVOLUTION_API_URL}/instance/connect/${EVOLUTION_INSTANCE_NAME}`,
    { headers: evoHeaders() }
  );
  return res.json(); // { base64: 'data:image/png;base64,...' } quando ainda não está ligado
}

// Estado da ligação: "open" (ligado), "close" (desligado), "connecting"
async function getStatus() {
  const res = await fetch(
    `${EVOLUTION_API_URL}/instance/connectionState/${EVOLUTION_INSTANCE_NAME}`,
    { headers: evoHeaders() }
  );
  const data = await res.json();
  return data?.instance?.state || 'close';
}

async function sendMessage(toNumber, text) {
  const res = await fetch(
    `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`,
    {
      method: 'POST',
      headers: evoHeaders(),
      body: JSON.stringify({ number: toNumber, text }),
    }
  );
  return res.json();
}

// Normaliza o payload de webhook da Evolution API para o formato interno.
function parseIncomingWebhook(body) {
  const msg = body?.data;
  if (!msg || msg.key?.fromMe) return null; // ignora mensagens enviadas por nós

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    '[mensagem sem texto — imagem/áudio/documento]';

  return {
    external_id: msg.key?.remoteJid?.replace('@s.whatsapp.net', ''),
    contact_name: msg.pushName || null,
    text,
  };
}

module.exports = { createInstance, getQrCode, getStatus, sendMessage, parseIncomingWebhook };
