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

async function checkConnection() {
  try {
    // Verificar salud del API y estado de la sesión
    const health = await api.get('/api/health/ready');
    if (health.data?.status !== 'ok') return { connected: false };

    const sessions = await api.get('/api/sessions');
    const session = sessions.data?.find(s => s.id === config.openwa.sessionId);
    const connected = session?.status === 'connected';

    if (!connected) {
      console.log(`[OpenWA] Sesión "${config.openwa.sessionId}" estado: ${session?.status || 'desconocido'}`);
    }

    return { connected, status: session?.status };
  } catch (err) {
    console.error('[OpenWA] Error de conexión:', err.message);
    return { connected: false };
  }
}

module.exports = { sendMessage, checkConnection };
