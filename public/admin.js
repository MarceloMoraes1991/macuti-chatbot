const state = {
  token: localStorage.getItem('macuti_admin_token') || '',
  conversations: [],
  activeId: null,
  qrPoll: null,
  statusPoll: null,
};

const el = (id) => document.getElementById(id);

function authHeaders() {
  return { 'x-admin-token': state.token, 'Content-Type': 'application/json' };
}

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, { ...options, headers: authHeaders() });
  if (res.status === 401) {
    logout('Password incorreta.');
    throw new Error('unauthorized');
  }
  return res.json();
}

// --- Login ---
function logout(message) {
  state.token = '';
  localStorage.removeItem('macuti_admin_token');
  el('app').classList.add('hidden');
  el('loginScreen').classList.remove('hidden');
  if (message) el('loginError').textContent = message;
}

el('loginBtn').addEventListener('click', async () => {
  const value = el('tokenInput').value.trim();
  if (!value) return;
  state.token = value;
  try {
    await api('/admin/conversations');
    localStorage.setItem('macuti_admin_token', value);
    el('loginScreen').classList.add('hidden');
    el('app').classList.remove('hidden');
    boot();
  } catch {
    el('loginError').textContent = 'Password incorreta.';
  }
});

// --- Conversas ---
async function loadConversations() {
  state.conversations = await api('/admin/conversations');
  renderConvList();
}

function renderConvList() {
  const list = el('convList');
  list.innerHTML = '';
  for (const conv of state.conversations) {
    const item = document.createElement('div');
    item.className = 'conv-item' + (conv.id === state.activeId ? ' active' : '');
    item.innerHTML = `
      <div class="conv-item-top">
        <span class="conv-name">${escapeHtml(conv.contact_name || conv.external_id)}</span>
        ${conv.unread ? '<span class="unread-dot"></span>' : ''}
      </div>
      <div class="conv-item-top">
        <span class="conv-preview">${escapeHtml(conv.last_message || '')}</span>
        <span class="channel-tag">${conv.channel}</span>
      </div>
    `;
    item.addEventListener('click', () => openConversation(conv.id));
    list.appendChild(item);
  }
}

async function openConversation(id) {
  state.activeId = id;
  renderConvList();
  const conv = state.conversations.find((c) => c.id === id);
  const messages = await api(`/admin/conversations/${id}/messages`);

  el('threadEmpty').classList.add('hidden');
  el('threadActive').classList.remove('hidden');
  el('threadName').textContent = conv.contact_name || conv.external_id;
  el('threadChannel').textContent = conv.channel;

  const box = el('threadMessages');
  box.innerHTML = '';
  for (const msg of messages) {
    const bubble = document.createElement('div');
    bubble.className = `msg ${msg.direction === 'in' ? 'msg-in' : 'msg-out'}`;
    bubble.textContent = msg.body;
    box.appendChild(bubble);
  }
  box.scrollTop = box.scrollHeight;
}

el('replyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = el('replyInput');
  const text = input.value.trim();
  if (!text || !state.activeId) return;
  input.value = '';
  await api(`/admin/conversations/${state.activeId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  openConversation(state.activeId);
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// --- WhatsApp / QR code ---
el('waConnectBtn').addEventListener('click', () => {
  el('qrModal').classList.remove('hidden');
  pollQr();
});

el('qrCloseBtn').addEventListener('click', () => {
  el('qrModal').classList.add('hidden');
  clearInterval(state.qrPoll);
});

async function pollQr() {
  const fetchQr = async () => {
    try {
      const data = await api('/whatsapp/qr');
      if (data.base64) {
        el('qrImage').src = data.base64;
        el('qrStatusText').textContent = 'A aguardar leitura do código…';
      }
    } catch {
      el('qrStatusText').textContent = 'Não foi possível obter o código. Verifica a Evolution API.';
    }
  };
  fetchQr();
  clearInterval(state.qrPoll);
  state.qrPoll = setInterval(fetchQr, 20000); // o QR expira periodicamente, renovar
}

async function pollWhatsappStatus() {
  try {
    const { state: connState } = await api('/whatsapp/status');
    const connected = connState === 'open';
    el('waDot').className = 'dot ' + (connected ? 'dot-on' : 'dot-off');
    el('waStatusText').textContent = connected ? 'WhatsApp ligado' : 'WhatsApp desligado';
    if (connected) {
      el('qrModal').classList.add('hidden');
      clearInterval(state.qrPoll);
    }
  } catch {
    el('waStatusText').textContent = 'Estado indisponível';
  }
}

// --- Tempo real ---
function connectSocket() {
  const socket = io();
  socket.on('new_message', () => {
    loadConversations();
    if (state.activeId) openConversation(state.activeId);
  });
}

// --- Arranque ---
function boot() {
  loadConversations();
  pollWhatsappStatus();
  state.statusPoll = setInterval(pollWhatsappStatus, 10000);
  connectSocket();
}

if (state.token) {
  el('loginScreen').classList.add('hidden');
  el('app').classList.remove('hidden');
  boot();
}
