import { state, on, emit, setState } from './store.js';
import { login, logout, fetchChats, fetchMessages, assignChat, releaseChat, sendMessage, fetchUnassignedCount, fetchOpenWaStatus, syncChats, syncChatMessages } from './api.js';
import { connect, disconnect, showToast } from './socket.js';

let chatListPolling = null;

document.addEventListener('DOMContentLoaded', init);

function init() {
  const token = localStorage.getItem('token');
  if (token) {
    setState({ token });
    fetchCurrentUser(token);
  }
  bindLoginForm();
  bindLogout();
  bindSidebarNav();
  bindChatActions();
  bindSendMessage();
  bindSyncButton();
  subscribeToEvents();
}

async function fetchCurrentUser(token) {
  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Token inválido');
    const { user } = await res.json();
    setState({ user, token });
    enterApp();
  } catch {
    setState({ user: null, token: null });
    localStorage.removeItem('token');
  }
}

// ---- Auth ------------------------------------------------------------

function bindLoginForm() {
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errEl = document.getElementById('loginError');

    try {
      errEl.classList.add('hidden');
      await login(username, password);
      enterApp();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

function bindLogout() {
  document.getElementById('logoutBtn').addEventListener('click', () => {
    logout();
    disconnect();
    document.getElementById('app').style.display = 'none';
    document.getElementById('login').style.display = 'flex';
    if (chatListPolling) clearInterval(chatListPolling);
  });
}

function enterApp() {
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  const u = state.user;
  document.getElementById('userDisplayName').textContent = u.displayName;
  document.getElementById('userAvatar').textContent = u.displayName.charAt(0).toUpperCase();

  connect(state.token);
  loadTab('my');
  loadUnassignedCount();
  checkOpenWaStatus();

  // Auto-sync grupos desde OpenWA al iniciar
  doSyncChats();

  chatListPolling = setInterval(() => {
    loadTab(state.currentTab, true);
    loadUnassignedCount();
  }, 5000);
}

async function doSyncChats(silent = true) {
  try {
    const result = await syncChats();
    if (!silent) showToast(`Sincronizados ${result.synced} chats`, 'success');
    loadTab(state.currentTab);
    return result;
  } catch (err) {
    if (!silent) showToast('Error al sincronizar: ' + err.message, 'error');
  }
}

// ---- Navegación ------------------------------------------------------

function bindSidebarNav() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-active'));
      btn.classList.add('tab-active');
      const tab = btn.dataset.tab;
      setState({ currentTab: tab });
      document.getElementById('chatListTitle').textContent = btn.querySelector('span').textContent;
      loadTab(tab);
    });
  });
}

async function loadTab(tab, silent = false) {
  try {
    const chats = await fetchChats(tab);
    const key = `chats.${tab}`;
    setState({ [key]: chats });
    renderChatList(chats, tab);
  } catch (err) {
    if (!silent) showToast('Error al cargar chats', 'error');
  }
}

async function loadUnassignedCount() {
  try {
    const { count } = await fetchUnassignedCount();
    setState({ unassignedCount: count });
    document.getElementById('unassignedCount').textContent = count;
  } catch {}
}

async function checkOpenWaStatus() {
  try {
    const { connected } = await fetchOpenWaStatus();
    setState({ openwaConnected: connected });
    updateOpenWaStatusUI();
  } catch {
    updateOpenWaStatusUI();
  }
}

function updateOpenWaStatusUI() {
  const el = document.getElementById('openwaStatus');
  if (state.openwaConnected) {
    el.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500 inline-block"></span><span class="text-green-600 text-xs">WhatsApp Conectado</span>';
  } else {
    el.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500 inline-block animate-pulse"></span><span class="text-red-500 text-xs">WhatsApp Desconectado</span>';
  }
}

// ---- Render: Lista de Chats -----------------------------------------

function renderChatList(chats, tab) {
  const container = document.getElementById('chatList');

  if (!chats || chats.length === 0) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:1.5rem;color:var(--text-muted);">
        <i class="fa-regular fa-face-smile" style="font-size:2rem;margin-bottom:0.75rem;"></i>
        <p style="font-size:0.875rem;">No hay chats aquí</p>
      </div>`;
    return;
  }

  container.innerHTML = chats.map(chat => {
    const isActive = state.activeChatId === chat.id;
    const lastMsg = chat.lastMessage || chat.messages?.[0]?.body || '';
    const lastTime = chat.lastMessageAt ? formatTime(chat.lastMessageAt) : '';
    const assignedName = chat.assignedToUser?.displayName || null;
    const isMine = assignedName && state.user && chat.assignedToUser?.id === state.user.id;
    const isUnassigned = tab === 'unassigned' && !assignedName;

    let badge = '';
    if (chat.type === 'group') {
      badge = '<span style="font-size:0.75rem;padding:0.125rem 0.5rem;border-radius:999px;font-weight:600;background:#e8f5e9;color:#2e7d32;">Grupo</span>';
    } else if (assignedName) {
      const bg = isMine ? '#e8f5e9' : '#f1f5f9';
      const color = isMine ? '#2e7d32' : 'var(--text-secondary)';
      badge = `<span style="font-size:0.75rem;padding:0.125rem 0.5rem;border-radius:999px;font-weight:600;background:${bg};color:${color};">${isMine ? 'Tuyo' : escapeHtml(assignedName)}</span>`;
    } else {
      badge = '<span style="font-size:0.75rem;padding:0.125rem 0.5rem;border-radius:999px;font-weight:600;background:#fef3c7;color:#d97706;">Libre</span>';
    }

    const avatarBg = chat.type === 'group' ? 'var(--primary)' : (assignedName ? 'var(--primary)' : '#d97706');

    return `
      <div class="chat-card" style="padding:0.75rem 1rem;border-bottom:1px solid var(--border);cursor:pointer;${isActive ? 'background:var(--primary-light);border-left-color:var(--primary);' : ''}"
           data-chat-id="${chat.id}" data-chat-type="${chat.type}" data-unassigned="${isUnassigned}">
        <div style="display:flex;gap:0.75rem;align-items:flex-start;">
          <div style="width:40px;height:40px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:white;font-size:0.875rem;font-weight:700;background:${avatarBg};">
            ${chat.type === 'group' ? '<i class="fa-solid fa-users" style="font-size:0.75rem;"></i>' : escapeHtml(chat.name.charAt(0).toUpperCase())}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <p style="font-size:0.875rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(chat.name)}</p>
              <span style="font-size:0.75rem;color:var(--text-muted);flex-shrink:0;margin-left:0.5rem;">${lastTime}</span>
            </div>
            <p style="font-size:0.8125rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:0.125rem;">${escapeHtml(lastMsg.substring(0, 80))}</p>
            <div style="margin-top:0.375rem;display:flex;align-items:center;gap:0.5rem;">
              ${badge}
              ${isUnassigned ? `<button onclick="window.tomarChat(event, ${chat.id})" class="btn-primary" style="font-size:0.75rem;padding:0.25rem 0.625rem;"><i class="fa-solid fa-hand-pointer mr-1"></i>Tomar Chat</button>` : ''}
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('[data-chat-id]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const chatId = parseInt(el.dataset.chatId);
      const chatType = el.dataset.chatType;
      const isUnassigned = el.dataset.unassigned === 'true';
      if (isUnassigned) return;
      openChat(chatId, chatType);
    });
  });
}

// ---- Render: Ventana de Chat ----------------------------------------

async function openChat(chatId, chatType) {
  setState({ activeChatId: chatId });
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('activeChat').classList.remove('hidden');

  const currentChat = findChatInState(chatId);
  const name = currentChat?.name || 'Chat';
  const isGroup = chatType === 'group' || currentChat?.type === 'group';

  document.getElementById('activeChatName').textContent = name;

  const assignedName = currentChat?.assignedToUser?.displayName || null;
  const assignedBadge = document.getElementById('chatAssignedBadge');
  const releaseBtn = document.getElementById('releaseChatBtn');
  const takeBtn = document.getElementById('takeChatBtn');

  assignedBadge.classList.add('hidden');
  releaseBtn.classList.remove('hidden');
  releaseBtn.disabled = true;
  takeBtn.classList.add('hidden');

  if (isGroup) {
    releaseBtn.classList.add('hidden');
    document.getElementById('activeChatMeta').textContent = 'Grupo de soporte — visible para todos';
  } else if (assignedName) {
    const isMine = state.user && currentChat?.assignedToUser?.id === state.user.id;
    if (!isMine) {
      assignedBadge.textContent = `Atendido por: ${assignedName}`;
      assignedBadge.className = 'text-xs px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-600';
      assignedBadge.classList.remove('hidden');
      document.getElementById('activeChatMeta').textContent = `Atendido por ${assignedName}`;
    } else {
      releaseBtn.disabled = false;
      document.getElementById('activeChatMeta').textContent = 'Asignado a ti';
    }
  } else {
    takeBtn.classList.remove('hidden');
    takeBtn.onclick = () => tomarChat(null, chatId);
    document.getElementById('activeChatMeta').textContent = 'Chat sin asignar — tómalo para responder';
  }

  try {
    let messages = await fetchMessages(chatId);
    // If no messages (new chat), try syncing from OpenWA history
    if (messages.length === 0) {
      const result = await syncChatMessages(chatId);
      if (result.synced > 0) {
        messages = await fetchMessages(chatId);
      }
    }
    setState({ messages });
    renderMessages(messages);
  } catch {
    showToast('Error al cargar mensajes', 'error');
  }

  highlightActiveChat(chatId);
  document.getElementById('messageInput').focus();
}

function renderMessages(messages) {
  const container = document.getElementById('messagesContainer');

  if (!messages || messages.length === 0) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);">
        <i class="fa-regular fa-comment-dots" style="font-size:2rem;margin-bottom:0.5rem;"></i>
        <p style="font-size:0.875rem;">No hay mensajes aún. Envía el primero.</p>
      </div>`;
    return;
  }

  container.innerHTML = messages.map(msg => {
    const isAgent = msg.isFromAgent;
    const agentName = msg.agent?.displayName || '';
    const time = formatTime(msg.timestamp);
    const date = formatDate(msg.timestamp);

    if (isAgent) {
      return `
        <div class="message-agent" style="padding:0.75rem;max-width:80%;margin-left:auto;">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">
            <span style="font-size:0.75rem;font-weight:700;color:var(--primary);">
              <i class="fa-solid fa-headset mr-1"></i>${escapeHtml(agentName)}
            </span>
            <span style="font-size:0.625rem;color:var(--text-muted);">${date} ${time}</span>
          </div>
          <p style="font-size:0.875rem;color:var(--text-primary);">${escapeHtml(msg.body)}</p>
        </div>`;
    }

    return `
      <div class="message-technician" style="padding:0.75rem;max-width:80%;">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">
          <span style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);">
            <i class="fa-brands fa-whatsapp mr-1" style="color:var(--primary);"></i>${escapeHtml(msg.senderName || 'Técnico')}
          </span>
          <span style="font-size:0.625rem;color:var(--text-muted);">${date} ${time}</span>
        </div>
        <p style="font-size:0.875rem;color:var(--text-primary);">${escapeHtml(msg.body)}</p>
      </div>`;
  }).join('');

  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function highlightActiveChat(chatId) {
  document.querySelectorAll('#chatList [data-chat-id]').forEach(el => {
    el.classList.toggle('chat-card-active', parseInt(el.dataset.chatId) === chatId);
  });
}

function findChatInState(chatId) {
  for (const key of ['my', 'unassigned', 'groups', 'all']) {
    const found = (state.chats[key] || []).find(c => c.id === chatId);
    if (found) return found;
  }
  return null;
}

// ---- Acciones: Tomar / Liberar / Enviar -----------------------------

window.tomarChat = async function(event, chatId) {
  if (event) event.stopPropagation();
  try {
    const chat = await assignChat(chatId);
    showToast('Chat asignado correctamente', 'success');
    loadTab(state.currentTab);
    loadUnassignedCount();
    openChat(chatId, 'direct');
  } catch (err) {
    showToast(err.message, 'error');
    loadTab(state.currentTab);
  }
};

function bindChatActions() {
  document.getElementById('releaseChatBtn').addEventListener('click', async () => {
    const chatId = state.activeChatId;
    if (!chatId) return;

    try {
      await releaseChat(chatId);
      showToast('Chat liberado — disponible para otros operadores', 'success');
      loadTab(state.currentTab);
      loadUnassignedCount();
      closeChatWindow();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function bindSendMessage() {
  const input = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');

  async function doSend() {
    const chatId = state.activeChatId;
    const body = input.value.trim();
    if (!chatId || !body) return;

    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    try {
      await sendMessage(chatId, body);
      loadTab(state.currentTab, true);
    } catch (err) {
      showToast('Error al enviar: ' + err.message, 'error');
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });
  sendBtn.addEventListener('click', doSend);
}

function bindSyncButton() {
  document.getElementById('syncBtn').addEventListener('click', () => {
    doSyncChats(false);
  });
}

function closeChatWindow() {
  setState({ activeChatId: null });
  document.getElementById('emptyState').classList.remove('hidden');
  document.getElementById('activeChat').classList.add('hidden');
  document.getElementById('messageInput').value = '';
}

// ---- Eventos en tiempo real (Socket.io) -----------------------------

function subscribeToEvents() {
  on('message:received', (message) => {
    if (state.activeChatId === message.chatId) {
      const exists = state.messages.some(m => m.id === message.id);
      if (!exists) {
        state.messages.push(message);
        renderMessages(state.messages);
      }
    }
    loadTab(state.currentTab, true);
  });

  on('chat:assigned', (chat) => {
    updateChatInState(chat);
    loadTab(state.currentTab, true);
    loadUnassignedCount();

    if (state.activeChatId === chat.id) {
      const isMine = chat.assignedToUser?.id === state.user.id;
      document.getElementById('takeChatBtn').classList.add('hidden');
      if (isMine) {
        document.getElementById('releaseChatBtn').disabled = false;
        document.getElementById('activeChatMeta').textContent = 'Asignado a ti';
      } else {
        document.getElementById('releaseChatBtn').disabled = true;
        document.getElementById('activeChatMeta').textContent = `Atendido por ${chat.assignedToUser?.displayName || 'otro operador'}`;
      }
    }
  });

  on('chat:released', (chat) => {
    updateChatInState(chat);
    loadTab(state.currentTab, true);
    loadUnassignedCount();

    if (state.activeChatId === chat.id) {
      const isGroup = chat.type === 'group';
      if (!isGroup) {
        document.getElementById('takeChatBtn').classList.remove('hidden');
        document.getElementById('takeChatBtn').onclick = () => tomarChat(null, chat.id);
        document.getElementById('activeChatMeta').textContent = 'Chat sin asignar — tómalo para responder';
      }
      document.getElementById('releaseChatBtn').disabled = true;
    }
  });

  on('chat:updated', () => {
    loadTab(state.currentTab, true);
  });

  on('openwa:status', (connected) => {
    updateOpenWaStatusUI();
    if (!connected) {
      showToast('WhatsApp desconectado — revisa la conexión', 'warning');
    } else {
      showToast('WhatsApp conectado nuevamente', 'success');
    }
  });

  on('qr:received', () => {
    document.getElementById('qrModal').classList.remove('hidden');
  });

  document.getElementById('closeQrBtn').addEventListener('click', () => {
    document.getElementById('qrModal').classList.add('hidden');
  });
}

function updateChatInState(chat) {
  for (const key of ['my', 'unassigned', 'groups', 'all']) {
    const arr = state.chats[key] || [];
    const idx = arr.findIndex(c => c.id === chat.id);
    if (idx !== -1) {
      arr[idx] = { ...arr[idx], ...chat };
      break;
    }
  }
}

// ---- Utils ----------------------------------------------------------

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (now - d) / (1000 * 60 * 60 * 24);
  if (diff < 1) return '';
  if (diff < 2) return 'Ayer';
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
