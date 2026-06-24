import { state, on, emit, setState } from './store.js';
import { login, logout, fetchChats, fetchMessages, assignChat, releaseChat, sendMessage, sendAudio, fetchUnassignedCount, fetchOpenWaStatus, syncChats, syncChatMessages, syncAllMessages } from './api.js';
import { connect, disconnect, showToast } from './socket.js';

let chatListPolling = null;

// Theme management
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const icon = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (theme === 'dark') {
    icon.className = 'fa-solid fa-moon w-5 text-center';
    label.textContent = 'Modo Oscuro';
  } else {
    icon.className = 'fa-solid fa-sun w-5 text-center';
    label.textContent = 'Modo Claro';
  }
}

document.addEventListener('DOMContentLoaded', init);

function init() {
  // Theme: default dark, restore saved
  const savedTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(savedTheme);
  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

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
    // Switch to 'unassigned' tab so newly synced chats are visible
    switchTab('unassigned');
    return result;
  } catch (err) {
    if (!silent) showToast('Error al sincronizar: ' + err.message, 'error');
  }
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-active'));
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (btn) {
    btn.classList.add('tab-active');
    setState({ currentTab: tab });
    document.getElementById('chatListTitle').textContent = btn.querySelector('span').textContent;
    loadTab(tab);
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
    el.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:var(--success);display:inline-block;"></span><span style="font-size:0.75rem;color:var(--success);">WhatsApp Conectado</span>';
  } else {
    el.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:var(--error);display:inline-block;animation:pulse 2s infinite;"></span><span style="font-size:0.75rem;color:var(--error);">WhatsApp Desconectado</span>';
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
      badge = '<span style="font-size:0.75rem;padding:0.125rem 0.5rem;border-radius:999px;font-weight:600;background:var(--badge-mine-bg);color:var(--badge-mine-text);">Grupo</span>';
    } else if (assignedName) {
      const bg = isMine ? 'var(--badge-mine-bg)' : 'var(--badge-other-bg)';
      const color = isMine ? 'var(--badge-mine-text)' : 'var(--text-secondary)';
      badge = `<span style="font-size:0.75rem;padding:0.125rem 0.5rem;border-radius:999px;font-weight:600;background:${bg};color:${color};">${isMine ? 'Tuyo' : escapeHtml(assignedName)}</span>`;
    } else {
      badge = '<span style="font-size:0.75rem;padding:0.125rem 0.5rem;border-radius:999px;font-weight:600;background:var(--badge-free-bg);color:var(--badge-free-text);">Libre</span>';
    }

    const avatarBg = chat.type === 'group' ? 'var(--primary)' : (assignedName ? 'var(--primary)' : 'var(--badge-free-text)');

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
    // Always sync latest messages from OpenWA when opening a chat
    await syncChatMessages(chatId);
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
    const bodyContent = renderMessageBody(msg);

    if (isAgent) {
      return `
        <div class="animate-slide-in" style="padding:0.75rem;max-width:80%;margin-left:auto;">
          <div class="message-agent" style="padding:0.75rem;">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">
              <span style="font-size:0.75rem;font-weight:700;color:var(--primary);">
                <i class="fa-solid fa-headset mr-1"></i>${escapeHtml(agentName)}
              </span>
              <span style="font-size:0.625rem;color:var(--text-muted);">${date} ${time}</span>
            </div>
            ${bodyContent}
          </div>
        </div>`;
    }

    return `
      <div class="animate-slide-in" style="padding:0.75rem;max-width:80%;">
        <div class="message-received" style="padding:0.75rem;">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">
            <span style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);">
              <i class="fa-brands fa-whatsapp mr-1" style="color:var(--primary);"></i>${escapeHtml(msg.senderName || 'Desconocido')}
            </span>
            <span style="font-size:0.625rem;color:var(--text-muted);">${date} ${time}</span>
          </div>
          ${bodyContent}
        </div>
      </div>`;
  }).join('');

  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function baseMimeType(mime) {
  if (!mime) return '';
  return mime.split(';')[0].trim();
}

function renderMessageBody(msg) {
  const type = msg.messageType || 'text';
  const body = escapeHtml(msg.body || '');
  const rawMime = msg.mediaMimeType || '';
  const baseMime = baseMimeType(rawMime);
  const url = msg.mediaUrl || '';

  switch (type) {
    case 'image':
      if (url && baseMime.startsWith('image/')) {
        return `<img src="data:${baseMime};base64,${url}" style="max-width:100%;border-radius:8px;display:block;margin-bottom:0.25rem;" loading="lazy" />${body ? `<p style="font-size:0.875rem;color:var(--text-primary);margin-top:0.25rem;">${body}</p>` : ''}`;
      }
      return `<p style="font-size:0.875rem;color:var(--text-primary);">📷 Foto${body ? `: ${body}` : ''}</p>`;

    case 'video':
      if (url && baseMime.startsWith('video/')) {
        return `<video controls style="max-width:100%;border-radius:8px;display:block;" preload="metadata"><source src="data:${baseMime};base64,${url}" type="${rawMime || baseMime}" /></video>${body ? `<p style="font-size:0.875rem;color:var(--text-primary);margin-top:0.25rem;">${body}</p>` : ''}`;
      }
      return `<p style="font-size:0.875rem;color:var(--text-primary);">🎥 Video${body ? `: ${body}` : ''}</p>`;

    case 'audio':
    case 'voice':
      if (url) {
        const audioType = type === 'voice' ? '🎤 Nota de voz' : '🎵 Audio';
        const effectiveMime = baseMime || 'audio/ogg';
        const fallbackId = `audio-fb-${Date.now()}`;
        return `<audio controls style="width:100%;" preload="none" onerror="document.getElementById('${fallbackId}').style.display='block';this.style.display='none'"><source src="data:${effectiveMime};base64,${url}" type="${rawMime || effectiveMime}" /></audio><p id="${fallbackId}" style="display:none;font-size:0.8125rem;color:var(--text-muted);padding:0.5rem;background:var(--bg-light);border-radius:8px;">${audioType} <span style="font-size:0.75rem;opacity:0.7;">(no disponible en este navegador)</span></p><p style="font-size:0.75rem;color:var(--text-muted);margin-top:0.125rem;">${audioType}</p>`;
      }
      return `<p style="font-size:0.875rem;color:var(--text-primary);">${type === 'voice' ? '🎤' : '🎵'} ${type === 'voice' ? 'Nota de voz' : 'Audio'}${body ? `: ${body}` : ''}</p>`;

    case 'document':
      if (url) {
        const filename = escapeHtml(msg.mediaFilename || 'documento');
        return `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;background:var(--bg-light);border-radius:8px;"><i class="fa-solid fa-file" style="color:var(--primary);font-size:1.25rem;"></i><div style="flex:1;min-width:0;"><p style="font-size:0.8125rem;color:var(--text-primary);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${filename}</p><p style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(baseMime || rawMime || 'Documento')}</p></div></div>`;
      }
      return `<p style="font-size:0.875rem;color:var(--text-primary);">📄 Documento${body ? `: ${body}` : ''}</p>`;

    case 'sticker':
      if (url && baseMime.startsWith('image/')) {
        return `<img src="data:${baseMime};base64,${url}" style="max-width:160px;border-radius:8px;display:block;" loading="lazy" />`;
      }
      return `<p style="font-size:0.875rem;color:var(--text-primary);">🖼️ Sticker</p>`;

    case 'location':
      return `<p style="font-size:0.875rem;color:var(--text-primary);">📍 ${body || 'Ubicación'}</p>`;

    case 'contact':
      return `<p style="font-size:0.875rem;color:var(--text-primary);">👤 Contacto: ${body || 'Compartido'}</p>`;

    case 'revoked':
      return `<p style="font-size:0.8125rem;color:var(--text-muted);font-style:italic;">🚫 Mensaje eliminado</p>`;

    default:
      return `<p style="font-size:0.875rem;color:var(--text-primary);">${body}</p>`;
  }
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
  const audioBtn = document.getElementById('audioBtn');
  const attachBtn = document.getElementById('attachBtn');

  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;

  function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }

  function updateButtons() {
    const hasText = input.value.trim().length > 0;
    audioBtn.classList.toggle('hidden', hasText);
    sendBtn.classList.toggle('hidden', !hasText);
  }

  async function doSend() {
    const chatId = state.activeChatId;
    const body = input.value.trim();
    if (!chatId || !body) return;

    input.value = '';
    autoResize();
    updateButtons();
    input.disabled = true;
    sendBtn.disabled = true;

    try {
      const sent = await sendMessage(chatId, body);
      if (sent && sent.id) {
        const exists = state.messages.some(m => m.id === sent.id);
        if (!exists) {
          state.messages.push(sent);
          renderMessages(state.messages);
        }
      }
      loadTab(state.currentTab, true);
    } catch (err) {
      showToast('Error al enviar: ' + err.message, 'error');
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('Grabación de audio no soportada en este navegador', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
        if (blob.size === 0) return;
        await sendAudioMessage(blob);
      };
      mediaRecorder.start();
      isRecording = true;
      audioBtn.innerHTML = '<i class="fa-solid fa-stop text-lg" style="color:var(--error);"></i>';
      audioBtn.title = 'Detener grabación';
      showToast('Grabando...', 'success');
    } catch (err) {
      showToast('Error al acceder al micrófono: ' + err.message, 'error');
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording = false;
    audioBtn.innerHTML = '<i class="fa-solid fa-microphone text-lg"></i>';
    audioBtn.title = 'Grabar nota de voz';
  }

  async function sendAudioMessage(blob) {
    const chatId = state.activeChatId;
    if (!chatId) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(',')[1];
      audioBtn.disabled = true;
      try {
        const sent = await sendAudio(chatId, base64, blob.type);
        if (sent && sent.id) {
          const exists = state.messages.some(m => m.id === sent.id);
          if (!exists) {
            state.messages.push(sent);
            renderMessages(state.messages);
          }
        }
        loadTab(state.currentTab, true);
        showToast('🎤 Nota de voz enviada', 'success');
      } catch (err) {
        showToast('Error al enviar audio: ' + err.message, 'error');
      } finally {
        audioBtn.disabled = false;
      }
    };
    reader.readAsDataURL(blob);
  }

  input.addEventListener('input', () => {
    autoResize();
    updateButtons();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Enter: insert new line
        const start = input.selectionStart;
        input.value = input.value.substring(0, start) + '\n' + input.value.substring(input.selectionEnd);
        input.selectionStart = input.selectionEnd = start + 1;
        autoResize();
        return;
      }
      // Enter alone: send
      e.preventDefault();
      doSend();
    }
  });

  sendBtn.addEventListener('click', doSend);

  audioBtn.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  attachBtn.addEventListener('click', () => {
    showToast('Adjuntar archivos próximamente', 'info');
  });
}

function bindSyncButton() {
  document.getElementById('syncBtn').addEventListener('click', () => {
    doSyncChats(false);
  });

  document.getElementById('syncAllBtn').addEventListener('click', async () => {
    const btn = document.getElementById('syncAllBtn');
    btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin text-xs"></i>';
    btn.style.pointerEvents = 'none';
    try {
      const result = await syncAllMessages(100);
      showToast(`Sincronizados ${result.synced} mensajes de ${result.chatsProcessed} chats`, 'success');
      loadTab(state.currentTab);
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down text-xs"></i>';
      btn.style.pointerEvents = 'auto';
    }
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
