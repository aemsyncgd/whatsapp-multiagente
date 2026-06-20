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

async function fetchChatHistory(chatId, limit = 50) {
  try {
    const encodedChatId = encodeURIComponent(chatId);
    const response = await api.get(`/api/sessions/${config.openwa.sessionId}/messages/${encodedChatId}/history?limit=${limit}`);
    return response.data;
  } catch (err) {
    console.error(`[OpenWA] Error obteniendo historial de ${chatId}:`, err.message);
    return [];
  }
}

async function sendMessage(to, body) {
  try {
    const response = await api.post(`/api/sessions/${config.openwa.sessionId}/messages/send-text`, {
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
  try {
    const res = await api.get(`/api/sessions/${config.openwa.sessionId}/chats`);
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
    // Verificar salud del API y estado de la sesión
    const health = await api.get('/api/health/ready');
    if (health.data?.status !== 'ok') return { connected: false };

    const sessions = await api.get('/api/sessions');
    const session = sessions.data?.find(s => s.id === config.openwa.sessionId);
    const connected = session?.status === 'connected' || session?.status === 'ready';

    if (!connected) {
      console.log(`[OpenWA] Sesión "${config.openwa.sessionId}" estado: ${session?.status || 'desconocido'}`);
    }

    return { connected, status: session?.status };
  } catch (err) {
    console.error('[OpenWA] Error de conexión:', err.message);
    return { connected: false };
  }
}

module.exports = { sendMessage, checkConnection, syncChats, fetchChatHistory };
