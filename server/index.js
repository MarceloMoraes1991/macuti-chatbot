require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

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

// O widget entra na sua própria "sala" para receber respostas do agente em tempo real.
io.on('connection', (socket) => {
  socket.on('join_webchat', (visitorId) => {
    socket.join(`webchat:${visitorId}`);
  });
});

app.use('/api/whatsapp', buildWhatsappRouter(io));
app.use('/api/telegram', buildTelegramRouter(io));
app.use('/api/meta', buildMetaRouter(io));
app.use('/api/webchat', buildWebchatRouter(io));
app.use('/api/admin', buildAdminRouter(io));

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor da Macuti a correr na porta ${PORT}`);
});
