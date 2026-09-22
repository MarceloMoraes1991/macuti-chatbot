# Macuti Chatbot — guia do projeto

Plataforma de atendimento multicanal para a Macuti (empresa de AVAC), feita à medida.
Centraliza WhatsApp, Telegram, Instagram, Facebook Messenger e o webchat do site
macuti.pt numa única caixa de entrada, com contas por funcionário, departamentos, um
fluxo de encaminhamento visual e relatórios.

## Stack

- Backend: Node.js + Express + Socket.IO (tempo real) + better-sqlite3
- Autenticação: bcryptjs (hash de password) + tabela `sessions` própria (token aleatório
  em `Authorization: Bearer <token>`, sem JWT)
- Frontend do painel: HTML/CSS/JS puro, sem frameworks (`public/admin.html`)
- Widget de webchat: ficheiro JS autocontido (`widget/macuti-webchat-widget.js`)
- Sem build step — corre diretamente com `node server/index.js`

## Conceitos centrais

- **Departamentos**: lista fixa em `server/db.js` → `DEPARTMENTS` (Call Center, Vendas,
  Financeiro, SAC). Um utilizador (`users.departments`, JSON) pode pertencer a vários.
- **Fluxo de chamada**: definido visualmente no separador "Fluxo de Chamada" (só admin),
  guardado em `flows.definition` como `{ nodes, edges }`. `server/flow-engine.js`
  interpreta esse grafo mensagem a mensagem; `server/flow-integration.js` liga isso a
  cada canal. Tipos de nó: `start`, `message`, `menu` (várias saídas rotuladas por
  opção), `department` (terminal — atribui `conversations.department`).
- **Conversas**: `status` vai `flow` (ainda no fluxo automático) → `waiting` (à espera de
  agente) → `active` (com agente atribuído) → `closed`. `assigned_agent_id` liga ao
  agente atual.
- **Canais dinâmicos**: `channel_configs` guarda credenciais adicionadas pelo painel
  (separador "Canais"); cada adaptador em `server/channels/*.js` lê primeiro dali, com
  fallback para variáveis `.env` (para quem prefere configurar por ficheiro).

## Estrutura

- `server/index.js` — arranque, bootstrap do primeiro admin (a partir de
  `ADMIN_USERNAME`/`ADMIN_PASSWORD` no `.env`, só corre se não existir nenhum utilizador)
- `server/db.js` — todo o schema e queries SQLite
- `server/auth.js` — `requireAuth` / `requireAdmin` (middlewares Express)
- `server/flow-engine.js` + `server/flow-integration.js` — motor de encaminhamento
- `server/channels/*.js` — um adaptador por canal (chamadas às APIs externas)
- `server/routes/*.js` — `auth.js` (login/logout/me), um router por canal (webhooks),
  `admin.js` (conversas, utilizadores, fluxo, canais, relatórios)
- `public/` — painel de administração
- `widget/` — script a embutir no macuti.pt

## Convenções a manter

- Textos visíveis ao utilizador em português de Portugal
- Paleta: navy (`#0a1420`, `#0f1c2c`, `#14263b`, `#1c3350`), steel (`#5c7285`, `#8ba0b3`,
  `#c7d4de`), copper (`#c97c4a`, `#e3a87c`) — identidade do site macuti.pt
- Tipografia: Space Grotesk (títulos), Inter (UI/texto), IBM Plex Mono (labels técnicos)
- Rotas `/api/admin/*` de gestão (utilizadores, fluxo, canais, relatórios) usam
  `requireAdmin`; rotas de atendimento usam `requireAuth` + verificação manual de
  departamento (`userCanSeeConversation` em `routes/admin.js`)
- Webhooks dos canais (`/api/whatsapp/webhook`, `/api/telegram/webhook`,
  `/api/meta/webhook`) não passam por autenticação — são chamados pelos serviços
  externos, não por utilizadores do painel

## Como correr localmente

```bash
npm install
cp .env.example .env   # define ADMIN_USERNAME e ADMIN_PASSWORD
npm start
# painel em http://localhost:3000/admin.html
```

## Limitações conhecidas (ver README.md para mais detalhe)

- Sem suporte a anexos (imagem/áudio/documento), só texto
- Fluxo visual só suporta menus de texto
- Nome de contacto do Instagram/Messenger não é preenchido automaticamente
- Sem paginação de mensagens em conversas muito longas
