const bcrypt = require('bcryptjs');
const { getSession, getUserById } = require('./db');

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Lê o token de "Authorization: Bearer <token>" ou do cabeçalho x-session-token.
function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return req.headers['x-session-token'] || null;
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  const session = token && getSession(token);
  if (!session) return res.status(401).json({ error: 'Sessão inválida ou expirada' });

  const user = getUserById(session.user_id);
  if (!user || !user.active) return res.status(401).json({ error: 'Utilizador inativo' });

  req.user = { ...user, departments: JSON.parse(user.departments || '[]') };
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Só o administrador tem acesso' });
    next();
  });
}

module.exports = { hashPassword, verifyPassword, requireAuth, requireAdmin };
