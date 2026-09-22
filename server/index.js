require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const { countUsers, createUser, DEPARTMENTS } = require('./db');
const { hashPassword } = require('./auth');

const buildAuthRouter = require('./routes/auth');
const buildWhatsappRouter = require('./routes/whatsapp');
const buildTelegramRouter = require('./routes/telegram');
const buildMetaRouter = require('./routes/meta');
const buildWebchatRouter = require('./routes/webchat');
const { buildAdminRouter } = require('./routes/admin');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/widget', express.static(path.join(__dirname, '..', 'widget')));

io.on('connection', (socket) => {
  socket.on('join_webchat', (visitorId) => {
    socket.join(`webchat:${visitorId}`);
  });
});

app.use('/api/auth', buildAuthRouter());
app.use('/api/whatsapp', buildWhatsappRouter(io));
app.use('/api/telegram', buildTelegramRouter(io));
app.use('/api/meta', buildMetaRouter(io));
app.use('/api/webchat', buildWebchatRouter(io));
app.use('/api/admin', buildAdminRouter(io));

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/', (req, res) => res.redirect('/admin.html'));

// Se ainda não existir nenhum utilizador, cria o administrador inicial a
// partir do .env — é a única vez que isto corre.
async function bootstrapAdmin() {
  if (countUsers() > 0) return;

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.warn(
      '\n⚠️  Nenhum utilizador existe ainda e ADMIN_PASSWORD não está definido no .env.\n' +
      '   Define ADMIN_USERNAME e ADMIN_PASSWORD no .env e reinicia o servidor para criares o primeiro administrador.\n'
    );
    return;
  }

  const password_hash = await hashPassword(password);
  createUser({ username, password_hash, full_name: 'Administrador', role: 'admin', departments: DEPARTMENTS });
  console.log(`✅ Administrador inicial criado: username="${username}"`);
}

const PORT = process.env.PORT || 3000;
bootstrapAdmin().finally(() => {
  server.listen(PORT, () => {
    console.log(`Servidor da Macuti a correr na porta ${PORT}`);
  });
});
