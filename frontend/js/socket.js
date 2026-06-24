import { state, setState, emit } from './store.js';

let socket = null;

function connect(token) {
  if (socket?.connected) return;

  socket = io({
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Conectado');
    showToast('Conectado al servidor en tiempo real', 'success');
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Desconectado:', reason);
    showToast('Conexión perdida, reconectando...', 'warning');
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Error de conexión:', err.message);
  });

  socket.on('message:received', (message) => {
    emit('message:received', message);
  });

  socket.on('chat:assigned', (chat) => {
    emit('chat:assigned', chat);
  });

  socket.on('chat:released', (chat) => {
    emit('chat:released', chat);
  });

  socket.on('chat:updated', (chat) => {
    emit('chat:updated', chat);
  });

  socket.on('stats:update', (count) => {
    setState({ unassignedCount: count });
  });

  socket.on('openwa:qr', ({ qr }) => {
    setState({ qrCode: qr });
    emit('qr:received', qr);
  });

  socket.on('openwa:connected', () => {
    setState({ openwaConnected: true });
    emit('openwa:status', true);
  });

  socket.on('openwa:disconnected', () => {
    setState({ openwaConnected: false });
    emit('openwa:status', false);
  });
}

function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const colors = {
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
    info: 'bg-gray-700',
  };
  const toast = document.createElement('div');
  toast.className = `${colors[type] || colors.info} text-white px-4 py-2 rounded-lg shadow-lg text-sm flex items-center gap-2 animate-bounce-in`;
  toast.style.animation = 'slideIn 0.3s ease';
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

export { connect, disconnect, showToast };
