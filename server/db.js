const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'macuti-chatbot.db'));
db.pragma('journal_mode = WAL');

const DEPARTMENTS = ['Call Center', 'Vendas', 'Financeiro', 'SAC'];

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'agent',   -- 'admin' | 'agent'
    departments TEXT NOT NULL DEFAULT '[]', -- JSON array de nomes de departamento
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS flows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    definition TEXT NOT NULL,   -- JSON: { nodes: [...], edges: [...] }
    is_active INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS channel_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,      -- whatsapp | telegram | instagram | messenger
    label TEXT,
    credentials TEXT NOT NULL,  -- JSON com as chaves específicas do canal
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,
    external_id TEXT NOT NULL,
    contact_name TEXT,
    last_message TEXT,
    last_message_at TEXT,
    unread INTEGER DEFAULT 1,
    department TEXT,
    status TEXT NOT NULL DEFAULT 'flow',
    assigned_agent_id INTEGER,
    current_node_id TEXT,
    UNIQUE(channel, external_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    direction TEXT NOT NULL,
    body TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );
`);

// Migração defensiva: se a base de dados já existir de uma versão anterior
// (sem estas colunas), acrescenta-as sem apagar dados.
function safeAddColumn(table, columnDef) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (e) {
    /* a coluna já existe — ignorar */
  }
}
safeAddColumn('conversations', 'department TEXT');
safeAddColumn('conversations', "status TEXT NOT NULL DEFAULT 'flow'");
safeAddColumn('conversations', 'assigned_agent_id INTEGER');
safeAddColumn('conversations', 'current_node_id TEXT');

// --- Utilizadores ---
function createUser({ username, password_hash, full_name, role, departments }) {
  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, full_name, role, departments) VALUES (?, ?, ?, ?, ?)`
    )
    .run(username, password_hash, full_name || username, role, JSON.stringify(departments || []));
  return info.lastInsertRowid;
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function listUsers() {
  return db
    .prepare('SELECT id, username, full_name, role, departments, active, created_at FROM users ORDER BY created_at ASC')
    .all();
}

function updateUser(id, { full_name, role, departments, active, password_hash }) {
  const fields = [];
  const values = [];
  if (full_name !== undefined) { fields.push('full_name = ?'); values.push(full_name); }
  if (role !== undefined) { fields.push('role = ?'); values.push(role); }
  if (departments !== undefined) { fields.push('departments = ?'); values.push(JSON.stringify(departments)); }
  if (active !== undefined) { fields.push('active = ?'); values.push(active ? 1 : 0); }
  if (password_hash !== undefined) { fields.push('password_hash = ?'); values.push(password_hash); }
  if (!fields.length) return;
  values.push(id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function countUsers() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

// --- Sessões ---
function createSession(user_id) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user_id);
  return token;
}

function getSession(token) {
  return db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
}

function deleteSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// --- Conversas ---
function upsertConversation({ channel, external_id, contact_name, last_message }) {
  const now = new Date().toISOString();
  const existing = db
    .prepare('SELECT * FROM conversations WHERE channel = ? AND external_id = ?')
    .get(channel, external_id);

  if (existing) {
    db.prepare(
      `UPDATE conversations SET contact_name = COALESCE(?, contact_name),
       last_message = ?, last_message_at = ?, unread = 1 WHERE id = ?`
    ).run(contact_name, last_message, now, existing.id);
    return { id: existing.id, isNew: false };
  }

  const info = db
    .prepare(
      `INSERT INTO conversations (channel, external_id, contact_name, last_message, last_message_at, unread, status)
       VALUES (?, ?, ?, ?, ?, 1, 'flow')`
    )
    .run(channel, external_id, contact_name || external_id, last_message, now);
  return { id: info.lastInsertRowid, isNew: true };
}

function addMessage(conversation_id, direction, body) {
  db.prepare(
    `INSERT INTO messages (conversation_id, direction, body) VALUES (?, ?, ?)`
  ).run(conversation_id, direction, body);
}

function listConversations({ department, status, assigned_agent_id } = {}) {
  let query = 'SELECT c.*, u.full_name AS agent_name FROM conversations c LEFT JOIN users u ON u.id = c.assigned_agent_id WHERE 1=1';
  const params = [];
  if (department) { query += ' AND c.department = ?'; params.push(department); }
  if (status) { query += ' AND c.status = ?'; params.push(status); }
  if (assigned_agent_id) { query += ' AND c.assigned_agent_id = ?'; params.push(assigned_agent_id); }
  query += ' ORDER BY c.last_message_at DESC';
  return db.prepare(query).all(...params);
}

function getConversation(id) {
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

function getConversationByExternal(channel, external_id) {
  return db
    .prepare('SELECT * FROM conversations WHERE channel = ? AND external_id = ?')
    .get(channel, external_id);
}

function listMessages(conversation_id) {
  return db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversation_id);
}

function markRead(conversation_id) {
  db.prepare('UPDATE conversations SET unread = 0 WHERE id = ?').run(conversation_id);
}

function setConversationFlowState(id, { current_node_id }) {
  db.prepare('UPDATE conversations SET current_node_id = ? WHERE id = ?').run(current_node_id, id);
}

function routeConversationToDepartment(id, department) {
  db.prepare(
    `UPDATE conversations SET department = ?, status = 'waiting', current_node_id = NULL, assigned_agent_id = NULL WHERE id = ?`
  ).run(department, id);
}

function claimConversation(id, agent_id) {
  db.prepare(`UPDATE conversations SET status = 'active', assigned_agent_id = ? WHERE id = ?`).run(agent_id, id);
}

function transferConversation(id, { department, agent_id }) {
  if (department) {
    db.prepare(
      `UPDATE conversations SET department = ?, status = 'waiting', assigned_agent_id = NULL WHERE id = ?`
    ).run(department, id);
  } else if (agent_id) {
    db.prepare(`UPDATE conversations SET status = 'active', assigned_agent_id = ? WHERE id = ?`).run(agent_id, id);
  }
}

function closeConversation(id) {
  db.prepare(`UPDATE conversations SET status = 'closed' WHERE id = ?`).run(id);
}

// --- Fluxos ---
function saveFlow(name, definition) {
  db.prepare('UPDATE flows SET is_active = 0').run();
  const info = db
    .prepare('INSERT INTO flows (name, definition, is_active) VALUES (?, ?, 1)')
    .run(name, JSON.stringify(definition));
  return info.lastInsertRowid;
}

function getActiveFlow() {
  const row = db.prepare('SELECT * FROM flows WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get();
  if (!row) return null;
  return { ...row, definition: JSON.parse(row.definition) };
}

// --- Canais ---
function upsertChannelConfig({ channel, label, credentials }) {
  db.prepare(
    `INSERT INTO channel_configs (channel, label, credentials, active) VALUES (?, ?, ?, 1)`
  ).run(channel, label, JSON.stringify(credentials));
}

function listChannelConfigs() {
  return db
    .prepare('SELECT * FROM channel_configs ORDER BY created_at DESC')
    .all()
    .map((c) => ({ ...c, credentials: JSON.parse(c.credentials) }));
}

function getActiveChannelConfig(channel) {
  const row = db
    .prepare('SELECT * FROM channel_configs WHERE channel = ? AND active = 1 ORDER BY created_at DESC LIMIT 1')
    .get(channel);
  if (!row) return null;
  return { ...row, credentials: JSON.parse(row.credentials) };
}

function setChannelConfigActive(id, active) {
  db.prepare('UPDATE channel_configs SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

// --- Relatórios ---
function reportByDepartment() {
  return db
    .prepare(
      `SELECT department,
              COUNT(*) AS total_conversas,
              SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS fechadas,
              SUM(CASE WHEN status IN ('waiting','active') THEN 1 ELSE 0 END) AS em_curso
       FROM conversations
       WHERE department IS NOT NULL
       GROUP BY department`
    )
    .all();
}

function reportByChannel() {
  return db
    .prepare(`SELECT channel, COUNT(*) AS total_conversas FROM conversations GROUP BY channel`)
    .all();
}

module.exports = {
  db,
  DEPARTMENTS,
  createUser,
  getUserByUsername,
  getUserById,
  listUsers,
  updateUser,
  countUsers,
  createSession,
  getSession,
  deleteSession,
  upsertConversation,
  addMessage,
  listConversations,
  getConversation,
  getConversationByExternal,
  listMessages,
  markRead,
  setConversationFlowState,
  routeConversationToDepartment,
  claimConversation,
  transferConversation,
  closeConversation,
  saveFlow,
  getActiveFlow,
  upsertChannelConfig,
  listChannelConfigs,
  getActiveChannelConfig,
  setChannelConfigActive,
  reportByDepartment,
  reportByChannel,
};
