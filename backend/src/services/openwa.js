const axios = require('axios');
const config = require('../config');

const api = axios.create({
  baseURL: config.openwa.apiUrl,
  timeout: 30000,
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
  // fallback al env var — but verify it actually exists
  if (config.openwa.sessionId) {
    try {
      const s = await api.get(`/api/sessions/${config.openwa.sessionId}`);
      if (s.data?.status === 'ready' || s.data?.status === 'connected') {
        activeSessionId = config.openwa.sessionId;
        return activeSessionId;
      }
    } catch {
      // fallback ID doesn't exist or not ready
    }
  }
  return null;
}

async function fetchChatHistory(chatId, limit = 50) {
  const sid = await resolveSessionId();
  if (!sid) return [];
  const maxRetries = 4;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const encodedChatId = encodeURIComponent(chatId);
      const response = await api.get(`/api/sessions/${sid}/messages/${encodedChatId}/history?limit=${limit}`);
      return response.data;
    } catch (err) {
      if (err.response?.status === 429 && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.log(`[OpenWA] Rate limited (429) en ${chatId}, reintento ${attempt+1}/${maxRetries} en ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      console.error(`[OpenWA] Error obteniendo historial de ${chatId}:`, err.message);
      return [];
    }
  }
  return [];
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
      if (id.endsWith('@lid') || id.endsWith('@newsletter') || id.endsWith('@broadcast')) continue;
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

    await resolveSessionId();
    const sid = activeSessionId;
    if (!sid) {
      const sessions = await api.get('/api/sessions');
      console.log(`[OpenWA] Sin sesión activa. Sesiones: ${(sessions.data || []).map(s => `${s.id.substring(0,8)}...:${s.status}`).join(', ') || 'ninguna'}`);
      return { connected: false };
    }
    return { connected: true, status: 'ready', sessionId: sid };
  } catch (err) {
    console.error('[OpenWA] Error de conexión:', err.message);
    return { connected: false };
  }
}

async function ensureWebhook() {
  const sid = await resolveSessionId();
  if (!sid) return false;
  try {
    const res = await api.get(`/api/sessions/${sid}/webhooks`);
    const webhooks = res.data;
    if (Array.isArray(webhooks) && webhooks.some(w => w.url?.includes('/webhook/message'))) {
      return true; // already exists
    }

    const webhookUrl = process.env.WEBHOOK_URL || `http://backend:5000/webhook/message`;
    await api.post(`/api/sessions/${sid}/webhooks`, {
      url: webhookUrl,
      events: ['message.received', 'session.status', 'session.qr'],
      active: true,
    });
    console.log(`[OpenWA] Webhook registrado: ${webhookUrl}`);
    return true;
  } catch (err) {
    console.error('[OpenWA] Error registrando webhook:', err.message);
    return false;
  }
}

function resetSessionId() {
  activeSessionId = null;
}

module.exports = { sendMessage, checkConnection, syncChats, fetchChatHistory, resolveSessionId, ensureWebhook, resetSessionId };
