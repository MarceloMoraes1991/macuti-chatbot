const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'macuti-chatbot.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,              -- whatsapp | telegram | instagram | messenger | webchat
    external_id TEXT NOT NULL,          -- id do contacto/chat no canal de origem
    contact_name TEXT,
    last_message TEXT,
    last_message_at TEXT,
    unread INTEGER DEFAULT 1,
    UNIQUE(channel, external_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    direction TEXT NOT NULL,            -- in | out
    body TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );
`);

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
    return existing.id;
  }

  const info = db
    .prepare(
      `INSERT INTO conversations (channel, external_id, contact_name, last_message, last_message_at, unread)
       VALUES (?, ?, ?, ?, ?, 1)`
    )
    .run(channel, external_id, contact_name || external_id, last_message, now);
  return info.lastInsertRowid;
}

function addMessage(conversation_id, direction, body) {
  db.prepare(
    `INSERT INTO messages (conversation_id, direction, body) VALUES (?, ?, ?)`
  ).run(conversation_id, direction, body);
}

function listConversations() {
  return db
    .prepare('SELECT * FROM conversations ORDER BY last_message_at DESC')
    .all();
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
  return db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversation_id);
}

function markRead(conversation_id) {
  db.prepare('UPDATE conversations SET unread = 0 WHERE id = ?').run(conversation_id);
}

module.exports = {
  db,
  upsertConversation,
  addMessage,
  listConversations,
  getConversation,
  getConversationByExternal,
  listMessages,
  markRead,
};
