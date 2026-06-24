const axios = require('axios');
const config = require('../config');

const api = axios.create({
  baseURL: config.openwa.apiUrl,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': config.openwa.token,
  },
});

let activeSessionId = null;

async function resolveSessionId() {
  if (activeSessionId) return activeSessionId;
  try {
    const res = await api.get('/api/sessions');
    const sessions = res.data;
    if (Array.isArray(sessions)) {
      const ready = sessions.find(s => s.status === 'ready' || s.status === 'connected');
      if (ready) {
        activeSessionId = ready.id;
        return activeSessionId;
      }
    }
  } catch (err) {
    console.error('[OpenWA] Error descubriendo sesión:', err.message);
  }
  // fallback al env var
  if (config.openwa.sessionId) {
    activeSessionId = config.openwa.sessionId;
    return activeSessionId;
  }
  return null;
}

async function fetchChatHistory(chatId, limit = 50) {
  const sid = await resolveSessionId();
  if (!sid) return [];
  try {
    const encodedChatId = encodeURIComponent(chatId);
    const response = await api.get(`/api/sessions/${sid}/messages/${encodedChatId}/history?limit=${limit}`);
    return response.data;
  } catch (err) {
    console.error(`[OpenWA] Error obteniendo historial de ${chatId}:`, err.message);
    return [];
  }
}

async function sendMessage(to, body) {
  const sid = await resolveSessionId();
  if (!sid) throw new Error('No hay sesión activa de WhatsApp');
  try {
    const response = await api.post(`/api/sessions/${sid}/messages/send-text`, {
      chatId: to,
      text: body,
    });
    return response.data;
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error(`[OpenWA] Error enviando mensaje a ${to}:`, JSON.stringify(detail));
    throw new Error(`Error al enviar mensaje: ${JSON.stringify(detail)}`);
  }
}

async function syncChats(chatService) {
  const sid = await resolveSessionId();
  if (!sid) {
    console.log('[OpenWA] No hay sesión activa para sincronizar chats');
    return { synced: 0 };
  }
  try {
    const res = await api.get(`/api/sessions/${sid}/chats`);
    const chats = res.data;
    if (!Array.isArray(chats)) {
      console.log('[OpenWA] No se pudieron obtener chats (formato inesperado)');
      return { synced: 0 };
    }

    for (const chat of chats) {
      const id = chat.id || '';
      const name = chat.name || chat.id || 'Chat';
      const isGroup = id.endsWith('@g.us');
      const isLid = id.endsWith('@lid');
      if (isLid) continue; // skip privacy IDs
      await chatService.createOrUpdateChat(id, name, isGroup ? 'group' : 'direct');
    }

    console.log(`[OpenWA] Sincronizados ${chats.length} chats`);
    return { synced: chats.length };
  } catch (err) {
    console.error('[OpenWA] Error sincronizando chats:', err.message);
    return { synced: 0 };
  }
}

async function checkConnection() {
  try {
    const health = await api.get('/api/health/ready');
    if (health.data?.status !== 'ok') return { connected: false };

    const sessions = await api.get('/api/sessions');
    let session = null;
    if (config.openwa.sessionId) {
      session = sessions.data?.find(s => s.id === config.openwa.sessionId);
    }
    if (!session || session.status !== 'ready') {
      // find any ready session
      session = sessions.data?.find(s => s.status === 'ready' || s.status === 'connected');
    }
    const connected = session?.status === 'connected' || session?.status === 'ready';

    if (!connected) {
      console.log(`[OpenWA] Sin sesión activa. Sesiones encontradas: ${(sessions.data || []).map(s => `${s.id.substring(0,8)}...:${s.status}`).join(', ') || 'ninguna'}`);
    }

    return { connected, status: session?.status, sessionId: session?.id };
  } catch (err) {
    console.error('[OpenWA] Error de conexión:', err.message);
    return { connected: false };
  }
}

module.exports = { sendMessage, checkConnection, syncChats, fetchChatHistory, resolveSessionId };
