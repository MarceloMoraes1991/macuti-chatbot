const fetch = require('node-fetch');
const { getActiveChannelConfig } = require('../db');

// Configuração vem preferencialmente do painel (Canais de atendimento).
// Se o admin ainda não tiver configurado nada lá, usa o .env como reserva.
function getConfig() {
  const dbConfig = getActiveChannelConfig('whatsapp');
  return {
    apiUrl: dbConfig?.credentials?.apiUrl || process.env.EVOLUTION_API_URL,
    apiKey: dbConfig?.credentials?.apiKey || process.env.EVOLUTION_API_KEY,
    instanceName: dbConfig?.credentials?.instanceName || process.env.EVOLUTION_INSTANCE_NAME || 'macuti',
  };
}

function evoHeaders(apiKey) {
  return { 'Content-Type': 'application/json', apikey: apiKey };
}

async function createInstance(webhookUrl) {
  const { apiUrl, apiKey, instanceName } = getConfig();
  const res = await fetch(`${apiUrl}/instance/create`, {
    method: 'POST',
    headers: evoHeaders(apiKey),
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      webhook: webhookUrl,
      webhook_by_events: false,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
    }),
  });
  return res.json();
}

async function getQrCode() {
  const { apiUrl, apiKey, instanceName } = getConfig();
  if (!apiUrl || !apiKey) throw new Error('WhatsApp ainda não está configurado (falta URL/API key da Evolution API)');
  const res = await fetch(`${apiUrl}/instance/connect/${instanceName}`, { headers: evoHeaders(apiKey) });
  return res.json();
}

async function getStatus() {
  const { apiUrl, apiKey, instanceName } = getConfig();
  if (!apiUrl || !apiKey) return 'close';
  const res = await fetch(`${apiUrl}/instance/connectionState/${instanceName}`, { headers: evoHeaders(apiKey) });
  const data = await res.json();
  return data?.instance?.state || 'close';
}

async function sendMessage(toNumber, text) {
  const { apiUrl, apiKey, instanceName } = getConfig();
  const res = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: evoHeaders(apiKey),
    body: JSON.stringify({ number: toNumber, text }),
  });
  return res.json();
}

function parseIncomingWebhook(body) {
  const msg = body?.data;
  if (!msg || msg.key?.fromMe) return null;

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
