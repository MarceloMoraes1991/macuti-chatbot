const { upsertConversation, addMessage, getConversation } = require('./db');
const { processIncoming } = require('./flow-engine');

/**
 * Processa uma mensagem recebida em qualquer canal:
 * - regista/atualiza a conversa e a mensagem recebida
 * - se a conversa ainda não tiver departamento atribuído, corre o fluxo automático
 * - notifica o painel em tempo real
 *
 * `sendReply(text)` deve enviar texto de volta ao contacto, específico do canal.
 */
function handleIncomingMessage({ io, channel, external_id, contact_name, text, sendReply }) {
  const { id: conversationId } = upsertConversation({
    channel,
    external_id,
    contact_name,
    last_message: text,
  });
  addMessage(conversationId, 'in', text);

  const conversation = getConversation(conversationId);
  let routed = false;

  if (!conversation.department) {
    routed = processIncoming(conversationId, text, (replyText) => {
      addMessage(conversationId, 'out', replyText);
      sendReply(replyText).catch((err) => console.error(`[${channel}] falha ao responder no fluxo:`, err));
    });
  }

  io.emit('new_message', { conversationId, channel, routed });
  return conversationId;
}

module.exports = { handleIncomingMessage };
