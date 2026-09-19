# Macuti Chatbot — guia do projeto

Plataforma de atendimento multicanal para a Macuti (empresa de AVAC), feita à medida
(sem plataformas de terceiros como Chatwoot). Centraliza WhatsApp, Telegram, Instagram,
Facebook Messenger e o webchat do site macuti.pt numa única caixa de entrada.

## Stack

- Backend: Node.js + Express + Socket.IO (tempo real) + better-sqlite3 (base de dados)
- Frontend do painel: HTML/CSS/JS puro, sem frameworks (`public/admin.html`)
- Widget de webchat: um único ficheiro JS autocontido (`widget/macuti-webchat-widget.js`)
- Sem build step — corre diretamente com `node server/index.js`

## Estrutura

- `server/index.js` — arranque do servidor, monta as rotas e o Socket.IO
- `server/db.js` — todas as queries SQLite (conversas + mensagens)
- `server/channels/*.js` — um adaptador por canal (whatsapp, telegram, meta), cada um
  isola as chamadas à API externa correspondente (Evolution API, Telegram Bot API, Graph API)
- `server/routes/*.js` — endpoints HTTP: um router por canal para os webhooks, mais
  `webchat.js` (mensagens do widget) e `admin.js` (API usada pelo painel)
- `public/` — painel de administração (admin.html/css/js)
- `widget/` — script a embutir no macuti.pt

## Convenções a manter

- Textos visíveis ao utilizador (painel e widget) em português de Portugal
- Paleta de cores: navy (`#0a1420`, `#0f1c2c`, `#14263b`, `#1c3350`), steel (`#5c7285`,
  `#8ba0b3`, `#c7d4de`), copper (`#c97c4a`, `#e3a87c`) — mesma identidade do site macuti.pt
- Tipografia: Space Grotesk (títulos/marca), Inter (texto/UI), IBM Plex Mono (labels
  técnicos, tags de canal)
- Autenticação do painel: token único em `x-admin-token`, comparado com `ADMIN_TOKEN` do
  `.env` (ver `server/routes/admin.js` → `requireAdmin`) — ainda não há contas por agente
- Cada canal guarda conversas na mesma tabela `conversations`, distinguidas pelo campo
  `channel` (`whatsapp` | `telegram` | `instagram` | `messenger` | `webchat`)

## Como correr localmente

```bash
npm install
npm start
# painel em http://localhost:3000/admin.html
```

## Limitações conhecidas (ver README.md para mais detalhe)

- Sem suporte a anexos (imagem/áudio/documento), só texto
- Sem contas de agente separadas
- Nome de contacto do Instagram/Messenger não é preenchido automaticamente
