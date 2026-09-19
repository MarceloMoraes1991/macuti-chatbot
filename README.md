# Macuti Chatbot — plataforma de atendimento à medida

Servidor Node.js feito à medida (sem Chatwoot) que centraliza WhatsApp (QR code do telemóvel),
Telegram, Instagram, Facebook Messenger e o webchat do site macuti.pt numa única caixa de
entrada, com um painel de administração próprio.

## Estrutura

```
macuti-chatbot/
├── server/
│   ├── index.js              # servidor Express + Socket.IO
│   ├── db.js                 # base de dados SQLite (conversas e mensagens)
│   ├── channels/
│   │   ├── whatsapp.js       # fala com a Evolution API (QR code / Baileys)
│   │   ├── telegram.js       # fala com a Telegram Bot API
│   │   └── meta.js           # fala com a Graph API (Instagram + Messenger)
│   └── routes/                # endpoints HTTP + webhooks de cada canal
├── public/
│   ├── admin.html             # painel de administração
│   ├── admin.css
│   └── admin.js
├── widget/
│   └── macuti-webchat-widget.js   # script a colar no macuti.pt
├── .env.example
└── package.json
```

## 1. Instalar e correr localmente

```bash
npm install
cp .env.example .env
# edita o .env com as tuas chaves (ver secção 3)
npm start
```

O painel fica em `http://localhost:3000/admin.html`.
A password de acesso é o valor que definires em `ADMIN_TOKEN` no `.env`.

## 2. Publicar (Railway ou VPS)

Este projeto não precisa de nada especial — é só um Node.js normal:

- **Railway**: cria um novo serviço a partir deste repositório, define as variáveis de
  ambiente do `.env.example` no separador *Variables*, e o Railway trata do resto
  (`npm install` + `npm start`).
- **VPS**: `git clone`, `npm install --production`, e corre com um gestor de processos
  como `pm2 start server/index.js --name macuti-chatbot`.

Depois do deploy, anota o domínio público (ex: `https://chat.macuti.pt`) — vais precisar
dele para configurar os webhooks de cada canal.

⚠️ A base de dados é um único ficheiro SQLite (`macuti-chatbot.db`), guardado no disco do
servidor. No Railway, garante que ligas um **volume persistente** ao serviço, ou os dados
perdem-se a cada deploy.

## 3. Ligar o WhatsApp (QR code do telemóvel)

Isto usa a **Evolution API** — precisas de a teres também instalada (não vem incluída
neste projeto; é um serviço à parte, self-hosted, ex: via template do Railway).

1. No `.env`, define `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE_NAME`.
2. Cria a instância uma única vez, apontando o webhook para o teu servidor:
   ```js
   // executar uma vez, ex: num ficheiro scripts/setup-whatsapp.js
   require('dotenv').config();
   const whatsapp = require('./server/channels/whatsapp');
   whatsapp.createInstance('https://chat.macuti.pt/api/whatsapp/webhook');
   ```
3. Abre o painel (`/admin.html`) → botão **"Ligar WhatsApp"** → aparece o QR code.
4. No telemóvel da Macuti: WhatsApp → Definições → Dispositivos ligados → Ligar dispositivo
   → ler o código.
5. O estado muda para "WhatsApp ligado" assim que o telemóvel confirma a ligação.

Nota: este método (Baileys) depende do telemóvel manter-se ligado à internet. Se preferires
mais tarde a API oficial da Meta (mais estável, mas exige verificação de negócio), a troca
faz-se só do lado da Evolution API — o resto do sistema não muda.

## 4. Ligar o Telegram

1. Cria um bot com o [@BotFather](https://t.me/BotFather) e copia o token para
   `TELEGRAM_BOT_TOKEN` no `.env`.
2. Regista o webhook (uma vez, após o deploy):
   ```js
   require('dotenv').config();
   const telegram = require('./server/channels/telegram');
   telegram.setWebhook('https://chat.macuti.pt/api/telegram/webhook');
   ```
3. Envia uma mensagem de teste ao bot — deve aparecer no painel.

## 5. Ligar Instagram e Facebook Messenger

1. Cria uma app em [Meta for Developers](https://developers.facebook.com), com os produtos
   **Messenger** e **Instagram** ativados.
2. Liga a página de Facebook da Macuti à conta de Instagram profissional.
3. Define no `.env`:
   - `META_VERIFY_TOKEN` — uma frase à tua escolha, usada só na verificação do webhook
   - `META_PAGE_ACCESS_TOKEN` — gerado na configuração da app, para a página da Macuti
4. Na configuração de webhooks da app, aponta para
   `https://chat.macuti.pt/api/meta/webhook`, usando o mesmo `META_VERIFY_TOKEN`.
5. Subscreve os campos `messages` para Messenger e Instagram.

## 6. Embutir o webchat no macuti.pt

Cola isto antes do `</body>` nas páginas do site (mantendo o HTML/CSS/JS puro existente):

```html
<script>
  window.MACUTI_CHAT_URL = "https://chat.macuti.pt";
</script>
<script src="https://chat.macuti.pt/widget/macuti-webchat-widget.js"></script>
```

O widget já vem com as cores navy/copper do site. Para ajustar tons ou posição, edita as
variáveis no topo do bloco `injectStyles()` em `widget/macuti-webchat-widget.js`.

## Limitações atuais (para próximas iterações)

- Autenticação do painel é por token único (uma password para todos) — para vários agentes,
  precisa de evoluir para contas/sessões separadas
- Anexos (imagens, áudio, documentos) ainda não são tratados — só texto
- Sem relatórios/métricas — pode ser adicionado como uma nova página no painel, lendo da
  mesma base de dados SQLite
- O nome de contacto do Instagram/Messenger não é preenchido automaticamente (exigiria uma
  chamada extra à Graph API `GET /{user-id}` com o token da página)
