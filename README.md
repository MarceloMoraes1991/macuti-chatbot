# Macuti Chatbot — plataforma de atendimento à medida

Servidor Node.js feito à medida (sem Chatwoot) que centraliza WhatsApp (QR code do
telemóvel), Telegram, Instagram, Facebook Messenger e o webchat do site macuti.pt numa
única caixa de entrada — com contas por funcionário, departamentos, fila de atendimento,
fluxo de encaminhamento visual e relatórios.

## O que já está feito

- **Login por utilizador** — cada funcionário entra com o seu próprio username/password
- **4 departamentos**: Call Center, Vendas, Financeiro, SAC
- **Criação de utilizadores** (só administrador) — escolhe o papel (agente/admin) e a que
  departamentos cada agente pertence
- **Atendimento ao cliente** — fila de conversas por atender no(s) departamento(s) do
  agente, com "Assumir" e "Transferir" (para outro departamento)
- **Fluxo de chamada visual** (só administrador edita) — construtor de blocos e setas que
  decide para que departamento cada conversa nova é encaminhada, antes de chegar a um
  agente humano
- **Canais de atendimento** (só administrador) — adicionar/gerir as credenciais de cada
  canal (WhatsApp, Telegram, Instagram, Messenger) diretamente no painel, sem editar
  ficheiros
- **Relatórios** (só administrador) — conversas por departamento e por canal

## Estrutura

```
macuti-chatbot/
├── server/
│   ├── index.js              # servidor Express + Socket.IO + bootstrap do 1º admin
│   ├── db.js                 # SQLite: utilizadores, sessões, conversas, fluxos, canais
│   ├── auth.js                # hashing de password + middlewares de sessão/permissão
│   ├── flow-engine.js         # interpreta o fluxo visual e decide o departamento
│   ├── flow-integration.js    # liga cada canal ao motor de fluxo
│   ├── channels/               # um adaptador por canal (fala com a API externa)
│   └── routes/                 # endpoints HTTP: auth, webhooks, admin
├── public/                     # painel (admin.html/css/js) — sem frameworks
├── widget/                      # script a embutir no macuti.pt
└── .env.example
```

## 1. Instalar e correr localmente

```bash
npm install
cp .env.example .env
# define ADMIN_USERNAME e ADMIN_PASSWORD no .env
npm start
```

Abre `http://localhost:3000/admin.html` e entra com esse utilizador/password — é criado
automaticamente na primeira vez que o servidor arranca (só nessa vez).

## 2. Criar mais utilizadores (agentes)

Como administrador, no separador **Utilizadores**: cria um login para cada funcionário,
escolhe se é agente ou administrador, e marca a que departamento(s) pode atender —
**Call Center, Vendas, Financeiro e/ou SAC**. Um agente só vê e recebe conversas dos
departamentos marcados.

## 3. Configurar o fluxo de chamada

No separador **Fluxo de Chamada** (só visível para o administrador):

1. Já existe sempre um bloco **Início**.
2. Adiciona um bloco **Menu** com o texto que o cliente vai ler primeiro
   (ex: "Escreve 1 para Vendas, 2 para Suporte, 3 para Financeiro…").
3. Adiciona um bloco **Departamento** para cada opção do menu.
4. Clica em **"Ligar →"** no bloco Início, depois clica no bloco Menu — cria a seta.
5. Clica em **"Ligar →"** no bloco Menu, depois no bloco Departamento — vai perguntar
   qual é a opção que o cliente escreve para seguir por ali (ex: `1`).
6. Repete para as outras opções, e clica em **Guardar fluxo**.

A partir daí, qualquer conversa nova em qualquer canal passa primeiro por este fluxo
automático, antes de cair na fila de um departamento.

⚠️ Sem fluxo guardado, as conversas ficam sem departamento e não aparecem em nenhuma fila —
configura o fluxo antes de ligar os canais a sério.

## 4. Configurar os canais de atendimento

No separador **Canais** (só administrador), em vez de editar o `.env`:

- **WhatsApp**: escolhe "WhatsApp (Evolution API)", preenche a URL e a API key da tua
  instância Evolution API (ver secção 5), guarda, e usa o botão **"Ligar WhatsApp"** para
  ler o QR code com o telemóvel da Macuti.
- **Telegram**: cola o token dado pelo [@BotFather](https://t.me/BotFather).
- **Instagram / Messenger**: cola o Page Access Token gerado no
  [Meta for Developers](https://developers.facebook.com).

## 5. Publicar (Railway, Render ou Oracle Cloud)

É um Node.js normal — `npm install` + `npm start`. A base de dados é um único ficheiro
SQLite (`macuti-chatbot.db`); garante que o serviço tem **disco persistente** ligado, ou
os dados (e a sessão do WhatsApp) perdem-se a cada reinício. Ver o guia de deploy à parte
para o passo a passo na Oracle Cloud (opção gratuita e sempre ligada).

Depois do deploy, ainda faltam estes passos únicos:

- **WhatsApp**: precisas de ter a Evolution API a correr também (serviço à parte,
  self-hosted), e criar a instância uma vez apontando o webhook para
  `https://<o-teu-domínio>/api/whatsapp/webhook`.
- **Telegram**: regista o webhook uma vez:
  ```js
  require('dotenv').config();
  const telegram = require('./server/channels/telegram');
  telegram.setWebhook('https://<o-teu-domínio>/api/telegram/webhook');
  ```
- **Instagram/Messenger**: na configuração de webhooks da app Meta, aponta para
  `https://<o-teu-domínio>/api/meta/webhook`, com o `META_VERIFY_TOKEN` definido no `.env`.

## 6. Embutir o webchat no macuti.pt

```html
<script>
  window.MACUTI_CHAT_URL = "https://<o-teu-domínio>";
</script>
<script src="https://<o-teu-domínio>/widget/macuti-webchat-widget.js"></script>
```

## Limitações atuais (para próximas iterações)

- Anexos (imagem, áudio, documento) ainda não são tratados — só texto
- O fluxo visual só suporta menus de texto (sem áudio/botões interativos do WhatsApp)
- O nome de contacto do Instagram/Messenger não é preenchido automaticamente
- Sem histórico/paginação para conversas muito longas — carrega tudo de uma vez
