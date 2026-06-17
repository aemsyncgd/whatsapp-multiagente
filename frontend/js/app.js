import { state, on, emit, setState } from './store.js';
import { login, logout, fetchChats, fetchMessages, assignChat, releaseChat, sendMessage, fetchUnassignedCount, fetchOpenWaStatus } from './api.js';
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

  chatListPolling = setInterval(() => {
    loadTab(state.currentTab, true);
    loadUnassignedCount();
  }, 5000);
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
    el.innerHTML = '<span class="w-2 h-2 rounded-full bg-green-500"></span><span class="text-green-600">WhatsApp Conectado</span>';
  } else {
    el.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span><span class="text-red-500">WhatsApp Desconectado</span>';
  }
}

// ---- Render: Lista de Chats -----------------------------------------

function renderChatList(chats, tab) {
  const container = document.getElementById('chatList');

  if (!chats || chats.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-gray-400 p-6">
        <i class="fa-regular fa-face-smile text-4xl mb-3"></i>
        <p class="text-sm">No hay chats aquí</p>
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
      badge = '<span class="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-600 font-medium">Grupo</span>';
    } else if (assignedName) {
      badge = `<span class="text-xs px-1.5 py-0.5 rounded font-medium ${isMine ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}">${isMine ? 'Tuyo' : assignedName}</span>`;
    } else {
      badge = '<span class="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 font-medium">Libre</span>';
    }

    return `
      <div class="px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${isActive ? 'chat-card-active' : ''}"
           data-chat-id="${chat.id}" data-chat-type="${chat.type}" data-unassigned="${isUnassigned}">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold
            ${chat.type === 'group' ? 'bg-green-500' : (assignedName ? 'bg-blue-500' : 'bg-orange-500')}">
            ${chat.type === 'group' ? '<i class="fa-solid fa-users text-xs"></i>' : escapeHtml(chat.name.charAt(0).toUpperCase())}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium text-gray-800 truncate">${escapeHtml(chat.name)}</p>
              <span class="text-xs text-gray-400 flex-shrink-0 ml-1">${lastTime}</span>
            </div>
            <p class="text-xs text-gray-500 truncate mt-0.5">${escapeHtml(lastMsg.substring(0, 80))}</p>
            <div class="mt-1.5 flex items-center gap-2">
              ${badge}
              ${isUnassigned ? `<button onclick="window.tomarChat(event, ${chat.id})" class="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"><i class="fa-solid fa-hand-pointer mr-1"></i>Tomar Chat</button>` : ''}
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
    const messages = await fetchMessages(chatId);
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
      <div class="flex flex-col items-center justify-center h-full text-gray-400">
        <i class="fa-regular fa-comment-dots text-4xl mb-2"></i>
        <p class="text-sm">No hay mensajes aún. Envía el primero.</p>
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
        <div class="message-agent rounded-lg p-3 max-w-[80%] ml-auto">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-semibold text-blue-700">
              <i class="fa-solid fa-headset mr-1"></i>${escapeHtml(agentName)}
            </span>
            <span class="text-[10px] text-gray-400">${date} ${time}</span>
          </div>
          <p class="text-sm text-gray-800">${escapeHtml(msg.body)}</p>
        </div>`;
    }

    return `
      <div class="message-technician rounded-lg p-3 max-w-[80%]">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs font-semibold text-gray-600">
            <i class="fa-brands fa-whatsapp mr-1 text-green-500"></i>${escapeHtml(msg.senderName || 'Técnico')}
          </span>
          <span class="text-[10px] text-gray-400">${date} ${time}</span>
        </div>
        <p class="text-sm text-gray-800">${escapeHtml(msg.body)}</p>
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
      const msg = await sendMessage(chatId, body);
      state.messages.push(msg);
      renderMessages(state.messages);
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
      state.messages.push(message);
      renderMessages(state.messages);
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
