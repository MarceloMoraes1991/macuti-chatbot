const express = require('express');
const { getUserByUsername, createSession, deleteSession } = require('../db');
const { verifyPassword, requireAuth } = require('../auth');

function buildAuthRouter() {
  const router = express.Router();

  router.post('/login', async (req, res) => {
    const { username, password } = req.body || {};
    const user = username && getUserByUsername(username);
    if (!user || !user.active) return res.status(401).json({ error: 'Credenciais inválidas' });

    const ok = await verifyPassword(password || '', user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = createSession(user.id);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        departments: JSON.parse(user.departments || '[]'),
      },
    });
  });

  router.post('/logout', requireAuth, (req, res) => {
    const token = req.headers.authorization?.slice(7) || req.headers['x-session-token'];
    if (token) deleteSession(token);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({
      id: req.user.id,
      username: req.user.username,
      full_name: req.user.full_name,
      role: req.user.role,
      departments: req.user.departments,
    });
  });

  return router;
}

module.exports = buildAuthRouter;
