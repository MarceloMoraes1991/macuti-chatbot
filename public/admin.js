const state = {
  token: localStorage.getItem('macuti_token') || '',
  user: JSON.parse(localStorage.getItem('macuti_user') || 'null'),
  departments: [],
  conversations: [],
  activeId: null,
  scope: 'queue',
  flow: { nodes: [], edges: [] },
  connectingFrom: null,
  dragging: null,
};

const el = (id) => document.getElementById(id);

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json', ...extra };
}

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, { ...options, headers: authHeaders() });
  if (res.status === 401) {
    logout();
    throw new Error('unauthorized');
  }
  return res.json();
}

function isAdmin() {
  return state.user?.role === 'admin';
}

// ============================== LOGIN ==============================

function logout() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('macuti_token');
  localStorage.removeItem('macuti_user');
  el('app').classList.add('hidden');
  el('loginScreen').classList.remove('hidden');
}

el('loginBtn').addEventListener('click', async () => {
  const username = el('usernameInput').value.trim();
  const password = el('passwordInput').value;
  if (!username || !password) return;

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    el('loginError').textContent = data.error || 'Não foi possível entrar.';
    return;
  }

  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('macuti_token', data.token);
  localStorage.setItem('macuti_user', JSON.stringify(data.user));
  enterApp();
});

el('logoutBtn').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch {}
  logout();
});

function enterApp() {
  el('loginScreen').classList.add('hidden');
  el('app').classList.remove('hidden');
  el('userLabel').textContent = `${state.user.full_name || state.user.username} · ${state.user.role === 'admin' ? 'Administrador' : 'Agente'}`;
  document.querySelectorAll('.admin-only').forEach((elm) => {
    elm.classList.toggle('hidden', !isAdmin());
  });
  boot();
}

// ============================== TABS ==============================

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));

  if (tab === 'relatorios') loadReports();
  if (tab === 'utilizadores') loadUsers();
  if (tab === 'fluxo') loadFlow();
  if (tab === 'canais') { loadChannels(); pollWhatsappStatus(); }
}

// ============================== ATENDIMENTO ==============================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

document.querySelectorAll('.scope-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.scope-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.scope = btn.dataset.scope;
    loadConversations();
  });
});

el('departmentFilter').addEventListener('change', loadConversations);

function populateDepartmentControls() {
  const filter = el('departmentFilter');
  filter.innerHTML = '<option value="">Todos os departamentos</option>' +
    state.departments.map((d) => `<option value="${d}">${d}</option>`).join('');

  const transfer = el('transferSelect');
  transfer.innerHTML = '<option value="">Transferir para…</option>' +
    state.departments.map((d) => `<option value="${d}">${d}</option>`).join('');

  const newDeps = el('newDepartments');
  newDeps.innerHTML = state.departments
    .map((d) => `<label><input type="checkbox" value="${d}" /> ${d}</label>`)
    .join('');
}

async function loadConversations() {
  const params = new URLSearchParams({ scope: state.scope });
  const dept = el('departmentFilter').value;
  if (dept) params.set('department', dept);
  state.conversations = await api(`/admin/conversations?${params}`);
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
        ${conv.department ? `<span class="dept-tag">${conv.department}</span>` : ''}
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
  el('threadName').textContent = conv?.contact_name || conv?.external_id || '';
  el('threadChannel').textContent = conv?.channel || '';
  el('threadDept').textContent = conv?.department || '(sem departamento)';

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

el('claimBtn').addEventListener('click', async () => {
  if (!state.activeId) return;
  await api(`/admin/conversations/${state.activeId}/claim`, { method: 'POST' });
  loadConversations();
});

el('transferSelect').addEventListener('change', async (e) => {
  const department = e.target.value;
  if (!department || !state.activeId) return;
  await api(`/admin/conversations/${state.activeId}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ department }),
  });
  e.target.value = '';
  loadConversations();
});

el('closeBtn').addEventListener('click', async () => {
  if (!state.activeId) return;
  await api(`/admin/conversations/${state.activeId}/close`, { method: 'POST' });
  el('threadActive').classList.add('hidden');
  el('threadEmpty').classList.remove('hidden');
  loadConversations();
});

el('replyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = el('replyInput');
  const text = input.value.trim();
  if (!text || !state.activeId) return;
  input.value = '';
  await api(`/admin/conversations/${state.activeId}/reply`, { method: 'POST', body: JSON.stringify({ text }) });
  openConversation(state.activeId);
});

// ============================== RELATÓRIOS ==============================

async function loadReports() {
  const { byDepartment, byChannel } = await api('/admin/reports');

  el('reportByDept').innerHTML = byDepartment.length
    ? byDepartment.map((r) => `
        <div class="report-card">
          <div class="label">${r.department}</div>
          <div class="value">${r.total_conversas}</div>
          <div class="sub">${r.em_curso} em curso · ${r.fechadas} fechadas</div>
        </div>`).join('')
    : '<p style="color:var(--steel-600)">Ainda sem conversas encaminhadas.</p>';

  el('reportByChannel').innerHTML = byChannel.length
    ? byChannel.map((r) => `
        <div class="report-card">
          <div class="label">${r.channel}</div>
          <div class="value">${r.total_conversas}</div>
        </div>`).join('')
    : '<p style="color:var(--steel-600)">Sem dados ainda.</p>';
}

// ============================== UTILIZADORES ==============================

async function loadUsers() {
  const users = await api('/admin/users');
  el('userList').innerHTML = users.map((u) => `
    <div class="user-row">
      <div class="meta">
        <strong>${escapeHtml(u.full_name || u.username)}</strong> (@${escapeHtml(u.username)})
        <span class="tag-pill">${u.role === 'admin' ? 'Administrador' : 'Agente'}</span>
        ${u.departments.map((d) => `<span class="tag-pill">${d}</span>`).join('')}
        ${!u.active ? '<span class="tag-pill">Inativo</span>' : ''}
      </div>
      <button class="btn btn-outline btn-small" data-toggle-active="${u.id}" data-active="${u.active}">
        ${u.active ? 'Desativar' : 'Ativar'}
      </button>
    </div>
  `).join('');

  document.querySelectorAll('[data-toggle-active]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-toggle-active');
      const active = btn.getAttribute('data-active') === 'true';
      await api(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ active: !active }) });
      loadUsers();
    });
  });
}

el('userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const departments = Array.from(el('newDepartments').querySelectorAll('input:checked')).map((i) => i.value);
  const body = {
    username: el('newUsername').value.trim(),
    full_name: el('newFullName').value.trim(),
    password: el('newPassword').value,
    role: el('newRole').value,
    departments,
  };
  const res = await fetch('/api/admin/users', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { alert(data.error || 'Não foi possível criar o utilizador.'); return; }
  e.target.reset();
  loadUsers();
});

// ============================== CANAIS ==============================

const CHANNEL_FIELD_DEFS = {
  whatsapp: [
    { key: 'apiUrl', label: 'URL da Evolution API' },
    { key: 'apiKey', label: 'API Key' },
    { key: 'instanceName', label: 'Nome da instância', placeholder: 'macuti' },
  ],
  telegram: [{ key: 'botToken', label: 'Token do bot (BotFather)' }],
  messenger: [{ key: 'pageAccessToken', label: 'Page Access Token (Meta)' }],
  instagram: [{ key: 'pageAccessToken', label: 'Page Access Token (Meta)' }],
};

function renderChannelFields() {
  const type = el('channelType').value;
  el('channelFields').innerHTML = CHANNEL_FIELD_DEFS[type]
    .map((f) => `<input type="text" data-field="${f.key}" placeholder="${f.label}" />`)
    .join('');
}
el('channelType').addEventListener('change', renderChannelFields);

async function loadChannels() {
  const channels = await api('/admin/channels');
  el('channelList').innerHTML = channels.length
    ? channels.map((c) => `
        <div class="user-row">
          <div class="meta"><strong>${escapeHtml(c.label || c.channel)}</strong> <span class="tag-pill">${c.channel}</span> ${!c.active ? '<span class="tag-pill">Inativo</span>' : ''}</div>
          <button class="btn btn-outline btn-small" data-toggle-channel="${c.id}" data-active="${c.active}">${c.active ? 'Desativar' : 'Ativar'}</button>
        </div>`).join('')
    : '<p style="color:var(--steel-600)">Nenhum canal configurado ainda.</p>';

  document.querySelectorAll('[data-toggle-channel]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-toggle-channel');
      const active = btn.getAttribute('data-active') === 'true';
      await api(`/admin/channels/${id}/active`, { method: 'PATCH', body: JSON.stringify({ active: !active }) });
      loadChannels();
    });
  });
}

el('channelForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const channel = el('channelType').value;
  const label = el('channelLabel').value.trim();
  const credentials = {};
  el('channelFields').querySelectorAll('[data-field]').forEach((input) => {
    credentials[input.dataset.field] = input.value.trim();
  });
  await api('/admin/channels', { method: 'POST', body: JSON.stringify({ channel, label, credentials }) });
  e.target.reset();
  renderChannelFields();
  loadChannels();
});

// --- WhatsApp QR ---
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
      } else if (data.error) {
        el('qrStatusText').textContent = data.error;
      }
    } catch {
      el('qrStatusText').textContent = 'Não foi possível obter o código.';
    }
  };
  fetchQr();
  clearInterval(state.qrPoll);
  state.qrPoll = setInterval(fetchQr, 20000);
}

async function pollWhatsappStatus() {
  try {
    const { state: connState } = await api('/whatsapp/status');
    const connected = connState === 'open';
    el('waDot').className = 'dot ' + (connected ? 'dot-on' : 'dot-off');
    el('waStatusText').textContent = connected ? 'WhatsApp ligado' : 'WhatsApp desligado';
    if (connected) { el('qrModal').classList.add('hidden'); clearInterval(state.qrPoll); }
  } catch {
    el('waStatusText').textContent = 'Estado indisponível';
  }
}

// ============================== FLUXO DE CHAMADA ==============================

const NODE_DEFAULT_TEXT = {
  message: 'Escreve aqui a mensagem…',
  menu: 'Escreve 1 para Vendas, 2 para Suporte…',
};

function newNodeId() {
  return 'n_' + Math.random().toString(36).slice(2, 9);
}

function ensureStartNode() {
  if (!state.flow.nodes.some((n) => n.type === 'start')) {
    state.flow.nodes.push({ id: newNodeId(), type: 'start', x: 40, y: 40 });
  }
}

async function loadFlow() {
  const data = await api('/admin/flow');
  state.flow = data.definition && data.definition.nodes?.length ? data.definition : { nodes: [], edges: [] };
  ensureStartNode();
  renderFlow();
}

el('saveFlowBtn').addEventListener('click', async () => {
  await api('/admin/flow', { method: 'POST', body: JSON.stringify({ name: 'Fluxo principal', definition: state.flow }) });
  alert('Fluxo guardado.');
});

document.querySelectorAll('[data-add]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const type = btn.getAttribute('data-add');
    const node = { id: newNodeId(), type, x: 280 + Math.random() * 200, y: 100 + Math.random() * 300 };
    if (type === 'message' || type === 'menu') node.text = NODE_DEFAULT_TEXT[type];
    if (type === 'department') node.department = state.departments[0] || '';
    state.flow.nodes.push(node);
    renderFlow();
  });
});

function renderFlow() {
  const canvas = el('flowCanvas');
  canvas.querySelectorAll('.flow-node').forEach((n) => n.remove());

  for (const node of state.flow.nodes) {
    canvas.appendChild(buildNodeElement(node));
  }
  renderEdges();
}

function buildNodeElement(node) {
  const box = document.createElement('div');
  box.className = 'flow-node';
  box.style.left = `${node.x}px`;
  box.style.top = `${node.y}px`;
  box.dataset.id = node.id;

  const typeLabel = { start: 'Início', message: 'Mensagem', menu: 'Menu', department: 'Departamento' }[node.type];
  let inner = `<div class="flow-node-type">${typeLabel}</div>`;

  if (node.type === 'message' || node.type === 'menu') {
    inner += `<textarea data-textfor="${node.id}">${escapeHtml(node.text || '')}</textarea>`;
  } else if (node.type === 'department') {
    inner += `<select data-deptfor="${node.id}">${state.departments.map((d) => `<option value="${d}" ${d === node.department ? 'selected' : ''}>${d}</option>`).join('')}</select>`;
  } else {
    inner += `<div style="font-size:12px;color:var(--steel-400)">Ponto de entrada do fluxo</div>`;
  }

  inner += `<div class="flow-node-actions">
    <button class="btn btn-outline" data-connect="${node.id}">Ligar →</button>
    ${node.type !== 'start' ? `<button class="btn btn-outline" data-delete="${node.id}">Apagar</button>` : ''}
  </div>`;

  box.innerHTML = inner;

  box.querySelector('[data-textfor]')?.addEventListener('input', (e) => {
    node.text = e.target.value;
  });
  box.querySelector('[data-deptfor]')?.addEventListener('change', (e) => {
    node.department = e.target.value;
  });
  box.querySelector('[data-delete]')?.addEventListener('click', () => {
    state.flow.nodes = state.flow.nodes.filter((n) => n.id !== node.id);
    state.flow.edges = state.flow.edges.filter((ed) => ed.from !== node.id && ed.to !== node.id);
    renderFlow();
  });
  box.querySelector('[data-connect]').addEventListener('click', () => startConnecting(node.id));

  box.addEventListener('mousedown', (e) => {
    if (['TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName)) return;
    state.dragging = { id: node.id, offsetX: e.offsetX, offsetY: e.offsetY };
  });

  return box;
}

function startConnecting(fromId) {
  if (state.connectingFrom === fromId) { state.connectingFrom = null; renderFlow(); return; }
  state.connectingFrom = fromId;
  renderFlow();
  document.querySelector(`.flow-node[data-id="${fromId}"]`)?.classList.add('connecting');

  const handler = (e) => {
    const target = e.target.closest('.flow-node');
    if (target && target.dataset.id !== fromId) {
      const toId = target.dataset.id;
      const fromNode = state.flow.nodes.find((n) => n.id === fromId);
      let label;
      if (fromNode.type === 'menu') {
        label = prompt('Que opção o cliente escreve para seguir por aqui? (ex: 1)') || '';
      }
      if (fromNode.type !== 'menu') {
        state.flow.edges = state.flow.edges.filter((ed) => ed.from !== fromId);
      }
      state.flow.edges.push({ from: fromId, to: toId, label });
      state.connectingFrom = null;
      renderFlow();
      document.removeEventListener('click', handler, true);
    }
  };
  document.addEventListener('click', handler, true);
}

function renderEdges() {
  const svg = el('flowSvg');
  svg.innerHTML = `
    <defs>
      <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
        <path d="M0,0 L0,6 L9,3 z" fill="#c97c4a" />
      </marker>
    </defs>`;

  for (const edge of state.flow.edges) {
    const fromEl = document.querySelector(`.flow-node[data-id="${edge.from}"]`);
    const toEl = document.querySelector(`.flow-node[data-id="${edge.to}"]`);
    if (!fromEl || !toEl) continue;

    const x1 = fromEl.offsetLeft + fromEl.offsetWidth;
    const y1 = fromEl.offsetTop + fromEl.offsetHeight / 2;
    const x2 = toEl.offsetLeft;
    const y2 = toEl.offsetTop + toEl.offsetHeight / 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const midX = (x1 + x2) / 2;
    path.setAttribute('d', `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
    path.setAttribute('stroke', '#c97c4a');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', 'url(#arrow)');
    svg.appendChild(path);

    if (edge.label) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', midX);
      text.setAttribute('y', (y1 + y2) / 2 - 6);
      text.setAttribute('class', 'flow-edge-label');
      text.textContent = edge.label;
      svg.appendChild(text);
    }
  }
}

el('flowCanvas').addEventListener('mousemove', (e) => {
  if (!state.dragging) return;
  const canvasRect = el('flowCanvas').getBoundingClientRect();
  const node = state.flow.nodes.find((n) => n.id === state.dragging.id);
  node.x = e.clientX - canvasRect.left + el('flowCanvas').scrollLeft - state.dragging.offsetX;
  node.y = e.clientY - canvasRect.top + el('flowCanvas').scrollTop - state.dragging.offsetY;
  const nodeEl = document.querySelector(`.flow-node[data-id="${node.id}"]`);
  nodeEl.style.left = `${node.x}px`;
  nodeEl.style.top = `${node.y}px`;
  renderEdges();
});
document.addEventListener('mouseup', () => { state.dragging = null; });

// ============================== TEMPO REAL ==============================

function connectSocket() {
  const socket = io();
  socket.on('new_message', () => {
    loadConversations();
    if (state.activeId) openConversation(state.activeId);
  });
  socket.on('conversation_updated', () => loadConversations());
}

// ============================== ARRANQUE ==============================

async function boot() {
  state.departments = await api('/admin/departments');
  populateDepartmentControls();
  loadConversations();
  connectSocket();
}

if (state.token && state.user) {
  enterApp();
}
renderChannelFields();
