/**
 * Widget de webchat da Macuti.
 *
 * Como usar no macuti.pt — colar antes de </body>:
 *
 *   <script>
 *     window.MACUTI_CHAT_URL = "https://chat.macuti.pt"; // domínio do servidor
 *   </script>
 *   <script src="https://chat.macuti.pt/widget/macuti-webchat-widget.js"></script>
 *
 * Autocontido: não depende de nenhuma framework, só do socket.io client
 * servido pelo próprio servidor do chat.
 */
(function () {
  const SERVER_URL = window.MACUTI_CHAT_URL || '';
  if (!SERVER_URL) {
    console.warn('[Macuti Chat] Define window.MACUTI_CHAT_URL antes de carregar o widget.');
    return;
  }

  const VISITOR_KEY = 'macuti_chat_visitor_id';
  let visitorId = localStorage.getItem(VISITOR_KEY);
  if (!visitorId) {
    visitorId = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(VISITOR_KEY, visitorId);
  }

  injectStyles();
  const ui = buildUI();
  document.body.appendChild(ui.root);

  loadSocketIoThen(() => {
    const socket = io(SERVER_URL);
    socket.emit('join_webchat', visitorId);
    socket.on('agent_reply', ({ text }) => appendBubble(ui, text, 'in'));
  });

  loadHistory();

  ui.bubbleBtn.addEventListener('click', () => {
    ui.panel.classList.toggle('macuti-chat-open');
  });

  ui.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = ui.input.value.trim();
    if (!text) return;
    ui.input.value = '';
    appendBubble(ui, text, 'out');
    await fetch(`${SERVER_URL}/api/webchat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitor_id: visitorId, text }),
    });
  });

  async function loadHistory() {
    try {
      const res = await fetch(`${SERVER_URL}/api/webchat/history/${visitorId}`);
      const data = await res.json();
      for (const msg of data.messages || []) {
        appendBubble(ui, msg.body, msg.direction === 'in' ? 'in' : 'out');
      }
    } catch {
      /* histórico indisponível — começa uma conversa nova em silêncio */
    }
  }

  function appendBubble(ui, text, direction) {
    const bubble = document.createElement('div');
    bubble.className = `macuti-chat-msg macuti-chat-${direction}`;
    bubble.textContent = text;
    ui.messages.appendChild(bubble);
    ui.messages.scrollTop = ui.messages.scrollHeight;
  }

  function buildUI() {
    const root = document.createElement('div');
    root.className = 'macuti-chat-root';

    const bubbleBtn = document.createElement('button');
    bubbleBtn.className = 'macuti-chat-bubble';
    bubbleBtn.setAttribute('aria-label', 'Abrir o chat da Macuti');
    bubbleBtn.textContent = '💬';

    const panel = document.createElement('div');
    panel.className = 'macuti-chat-panel';
    panel.innerHTML = `
      <div class="macuti-chat-header">Fale com a Macuti</div>
      <div class="macuti-chat-messages"></div>
      <form class="macuti-chat-form">
        <input type="text" placeholder="Escreve a tua mensagem…" autocomplete="off" />
        <button type="submit">Enviar</button>
      </form>
    `;

    root.appendChild(panel);
    root.appendChild(bubbleBtn);

    return {
      root,
      bubbleBtn,
      panel,
      messages: panel.querySelector('.macuti-chat-messages'),
      form: panel.querySelector('.macuti-chat-form'),
      input: panel.querySelector('input'),
    };
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .macuti-chat-root { position: fixed; bottom: 20px; right: 20px; z-index: 999999; font-family: 'Inter', sans-serif; }
      .macuti-chat-bubble {
        width: 56px; height: 56px; border-radius: 50%; border: none;
        background: #c97c4a; color: white; font-size: 22px; cursor: pointer;
        box-shadow: 0 4px 14px rgba(0,0,0,0.25);
      }
      .macuti-chat-panel {
        display: none; flex-direction: column;
        position: absolute; bottom: 72px; right: 0;
        width: 320px; height: 420px;
        background: #0f1c2c; border: 1px solid #1c3350; border-radius: 12px;
        overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.35);
      }
      .macuti-chat-panel.macuti-chat-open { display: flex; }
      .macuti-chat-header {
        padding: 14px 16px; background: #14263b; color: white;
        font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 15px;
      }
      .macuti-chat-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
      .macuti-chat-msg { max-width: 80%; padding: 8px 12px; border-radius: 8px; font-size: 13px; line-height: 1.4; }
      .macuti-chat-in { align-self: flex-start; background: #14263b; color: #c7d4de; }
      .macuti-chat-out { align-self: flex-end; background: #c97c4a; color: #0a1420; }
      .macuti-chat-form { display: flex; border-top: 1px solid #1c3350; }
      .macuti-chat-form input {
        flex: 1; border: none; padding: 12px; background: #0f1c2c; color: #c7d4de; font-family: 'Inter', sans-serif;
      }
      .macuti-chat-form input:focus { outline: none; }
      .macuti-chat-form button {
        border: none; background: #c97c4a; color: #0a1420; padding: 0 16px; font-weight: 600; cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function loadSocketIoThen(callback) {
    if (window.io) return callback();
    const script = document.createElement('script');
    script.src = `${SERVER_URL}/socket.io/socket.io.js`;
    script.onload = callback;
    document.head.appendChild(script);
  }
})();
