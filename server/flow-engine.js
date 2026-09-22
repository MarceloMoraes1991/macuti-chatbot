const { getActiveFlow, getConversation, setConversationFlowState, routeConversationToDepartment, addMessage } = require('./db');

/**
 * Formato de um fluxo (definition):
 * {
 *   nodes: [
 *     { id: 'n1', type: 'start' },
 *     { id: 'n2', type: 'menu', text: 'Escreve 1 para Vendas, 2 para Suporte...' },
 *     { id: 'n3', type: 'message', text: 'Obrigado, um agente vai responder.' },
 *     { id: 'n4', type: 'department', department: 'Vendas' },
 *   ],
 *   edges: [
 *     { from: 'n1', to: 'n2' },
 *     { from: 'n2', to: 'n4', label: '1' },
 *     { from: 'n2', to: 'n5', label: '2' },
 *   ]
 * }
 *
 * Só os nós 'menu' têm várias edges de saída (uma por opção, distinguidas por `label`).
 * Os nós 'message' e 'start' têm uma única edge de saída, seguida automaticamente.
 * O nó 'department' é terminal — encaminha a conversa e termina o fluxo.
 */

function findNode(flow, id) {
  return flow.nodes.find((n) => n.id === id);
}

function findStartNode(flow) {
  return flow.nodes.find((n) => n.type === 'start');
}

function outgoingEdges(flow, nodeId) {
  return flow.edges.filter((e) => e.from === nodeId);
}

// Devolve o texto a enviar ao contacto para este nó, ou null se não houver nada a dizer.
function nodeOutgoingText(node) {
  if (node.type === 'menu' || node.type === 'message') return node.text;
  return null;
}

// Avança automaticamente por nós 'start'/'message' sem edges rotuladas até
// chegar a um nó que precise de esperar por resposta ('menu') ou terminal ('department').
function advanceUntilWaiting(flow, nodeId, sendText) {
  let current = findNode(flow, nodeId);
  while (current) {
    const text = nodeOutgoingText(current);
    if (text) sendText(text);

    if (current.type === 'department') {
      return { done: true, department: current.department };
    }
    if (current.type === 'menu') {
      return { done: false, waitingNodeId: current.id };
    }

    const edges = outgoingEdges(flow, current.id);
    if (!edges.length) return { done: false, waitingNodeId: current.id }; // fluxo mal configurado — não trava
    current = findNode(flow, edges[0].to);
  }
  return { done: false, waitingNodeId: null };
}

/**
 * Chamado sempre que chega uma mensagem nova de um contacto.
 * `sendText(text)` deve enviar a mensagem de volta ao contacto pelo canal de origem.
 * Devolve `true` se a conversa foi encaminhada para um departamento (fluxo terminado),
 * `false` se ainda está a decorrer (ou não há fluxo configurado).
 */
function processIncoming(conversationId, incomingText, sendText) {
  const flow = getActiveFlow();
  if (!flow) return false; // sem fluxo configurado — cai direto numa fila geral

  const conversation = getConversation(conversationId);
  if (!conversation || conversation.department) return false; // já foi encaminhada antes

  let result;
  if (!conversation.current_node_id) {
    // Primeira mensagem desta conversa — arranca do início do fluxo.
    const start = findStartNode(flow.definition);
    if (!start) return false;
    result = advanceUntilWaiting(flow.definition, start.id, sendText);
  } else {
    // Já estava à espera de resposta a um menu — interpreta a opção escolhida.
    const currentNode = findNode(flow.definition, conversation.current_node_id);
    const edges = outgoingEdges(flow.definition, currentNode.id);
    const chosen = edges.find((e) => e.label?.trim() === incomingText.trim());

    if (!chosen) {
      sendText('Não percebi essa opção. ' + (currentNode.text || ''));
      return false;
    }
    result = advanceUntilWaiting(flow.definition, chosen.to, sendText);
  }

  if (result.done) {
    routeConversationToDepartment(conversationId, result.department);
    return true;
  }
  setConversationFlowState(conversationId, { current_node_id: result.waitingNodeId });
  return false;
}

module.exports = { processIncoming };
