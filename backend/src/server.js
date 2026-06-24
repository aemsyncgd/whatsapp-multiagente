const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const config = require('./config');
const apiRoutes = require('./routes/api');
const { setupSocket, emitToAll } = require('./services/socket');
const chatService = require('./services/chat');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 5e6,
});

app.set('io', io);

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

app.use('/api', apiRoutes);

app.use(express.static(path.join(__dirname, '../frontend')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

function renderMediaPreview(type, caption) {
  const icons = {
    image: '📷 Foto',
    video: '🎥 Video',
    audio: '🎵 Audio',
    voice: '🎤 Nota de voz',
    document: '📄 Documento',
    sticker: '🖼️ Sticker',
    location: '📍 Ubicación',
    contact: '👤 Contacto',
    revoked: '🚫 Mensaje eliminado',
  };
  const prefix = icons[type] || `📎 ${type}`;
  return caption ? `${prefix}: ${caption}` : prefix;
}

app.post('/webhook/message', async (req, res) => {
  try {
    const payload = req.body;
    const event = payload.event || '';

    if (event === 'message.received' || event === 'onMessage') {
      const msg = payload.data || payload;
      if (!msg.chatId && !msg.from) return res.json({ ok: true });

      const rawChatId = msg.chatId || msg.from || '';
      // Skip ghost/system chats
      if (rawChatId === '0@c.us' || rawChatId.endsWith('@broadcast') || rawChatId.endsWith('@newsletter')) return res.json({ ok: true });

      const chatId = rawChatId;
      const contact = msg.contact || {};
      const senderName = contact.name || contact.pushName || (msg.fromMe ? 'Tú' : 'Desconocido');
      const body = msg.body || msg.message || msg.caption || '';
      const msgType = msg.type || 'text';
      const isGroup = chatId.includes('@g.us');
      const senderJid = msg.author || msg.from || '';

      const chat = await chatService.upsertChat(
        chatId,
        senderName,
        isGroup ? 'group' : 'direct'
      );

      // If we have a real contact name, retroactively update unknown names in DB
      if (senderName && senderName !== 'Desconocido' && senderJid) {
        try {
          await prisma.message.updateMany({
            where: { senderWhatsappId: senderJid, senderName: 'Desconocido' },
            data: { senderName },
          });
        } catch {}
      }

      // Media handling
      const media = msg.media || {};
      const mediaData = media.data ? {
        mediaUrl: media.data,
        mediaMimeType: media.mimetype || null,
        mediaFilename: media.filename || null,
        mediaSize: media.filesize ? parseInt(media.filesize) : null,
      } : {};

      const savedMessage = await chatService.saveMessage({
        chatId: chat.id,
        senderWhatsappId: senderJid,
        senderName,
        body,
        isFromAgent: false,
        messageType: msgType,
        ...mediaData,
      });

      // Build display text for last message
      const displayText = msgType === 'text' ? body : renderMediaPreview(msgType, body);

      await chatService.updateChatLastMessage(chat.id, displayText);

      const unassignedCount = await chatService.getUnassignedCount();

      emitToAll(io, 'message:received', savedMessage);
      emitToAll(io, 'chat:updated', {
        ...chat,
        lastMessage: displayText,
        lastMessageAt: new Date().toISOString(),
        messages: [{ body }],
      });
      emitToAll(io, 'stats:update', unassignedCount);

      res.json({ ok: true });
    } else if (event === 'session.qr' || event === 'onQrCode') {
      const qr = payload.data?.qr || payload.qr || '';
      if (qr) emitToAll(io, 'openwa:qr', { qr });
      res.json({ ok: true });
    } else if (event === 'session.status') {
      const status = payload.data?.status || '';
      if (status === 'ready' || status === 'connected') {
        emitToAll(io, 'openwa:connected', { connected: true });
        // Trigger sync when session becomes ready
        try {
          const { syncChats, fetchChatHistory, ensureWebhook, resetSessionId } = require('./services/openwa');
          const chatService = require('./services/chat');
          resetSessionId();
          await ensureWebhook();
          const result = await syncChats(chatService);
          console.log(`[Webhook] Sync post-conexión: ${result.synced} chats`);
        } catch (e) {
          console.error('[Webhook] Error en sync post-conexión:', e.message);
        }
      } else if (status === 'disconnected') {
        emitToAll(io, 'openwa:disconnected', { connected: false });
      }
      res.json({ ok: true });
    } else if (event === 'onConnected') {
      emitToAll(io, 'openwa:connected', { connected: true });
      res.json({ ok: true });
    } else if (event === 'onDisconnected') {
      emitToAll(io, 'openwa:disconnected', { connected: false });
      res.json({ ok: true });
    } else {
      res.json({ ok: true, ignored: true });
    }
  } catch (err) {
    console.error('[Webhook] Error procesando mensaje:', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
});

setupSocket(io);

server.listen(config.port, '0.0.0.0', async () => {
  console.log(`\n============================================`);
  console.log(`  Sistema Multiagente WhatsApp`);
  console.log(`  Backend corriendo en puerto ${config.port}`);
  console.log(`  Webhook: http://0.0.0.0:${config.port}/webhook/message`);
  console.log(`  Frontend: http://0.0.0.0:${config.port}`);
  console.log(`============================================\n`);

  // Auto-sync chats and messages from OpenWA (with retries)
  async function autoSync(attempt = 1) {
    const { syncChats, fetchChatHistory, checkConnection } = require('./services/openwa');
    const chatService = require('./services/chat');

    const { connected } = await checkConnection();
    if (!connected) {
      console.log(`[Server] OpenWA no conectado (intento ${attempt}/5). Reintentando en 10s...`);
      if (attempt < 5) setTimeout(() => autoSync(attempt + 1), 10000);
      return;
    }

    // Ensure webhook is registered
    const { ensureWebhook, resetSessionId } = require('./services/openwa');
    resetSessionId();
    await ensureWebhook();

    console.log('[Server] Sincronizando chats desde OpenWA...');
    const result = await syncChats(chatService);
    console.log(`[Server] Sincronización completada: ${result.synced} chats`);

    // Sync recent messages for each chat
    const allChats = await chatService.getAllChats();
    let totalMessages = 0;
    for (const chat of allChats) {
      try {
        const messages = await fetchChatHistory(chat.whatsappId, 5);
        if (!Array.isArray(messages) || messages.length === 0) continue;
        for (const msg of messages) {
          const contact = msg.contact || {};
          const authorJid = msg.author || msg.from || '';
          let senderName = contact.name || contact.pushName || '';
          if (!senderName) {
            if (msg.fromMe) {
              senderName = 'Tú';
            } else {
              const match = authorJid.match(/^(\d+)@/);
              senderName = match ? (match[1].length > 8 ? '...' + match[1].slice(-4) : match[1]) : 'Desconocido';
            }
          }
          const body = msg.body || '';
          const msgType = msg.type || 'text';
          const media = msg.media || {};
          const mediaData = media.data ? {
            mediaUrl: media.data,
            mediaMimeType: media.mimetype || null,
            mediaFilename: media.filename || null,
            mediaSize: media.filesize ? parseInt(media.filesize) : null,
          } : {};
          await chatService.saveMessage({
            chatId: chat.id,
            senderWhatsappId: authorJid,
            senderName,
            body,
            messageType: msgType,
            ...mediaData,
          });
          totalMessages++;
        }
        const lastMsg = messages[0];
        if (lastMsg) {
          const lastBody = lastMsg.body || '';
          const lastType = lastMsg.type || 'text';
          const displayText = lastType === 'text' ? lastBody : renderMediaPreview(lastType, lastBody);
          if (displayText) await chatService.updateChatLastMessage(chat.id, displayText);
        }
      } catch (e) {
        // skip individual chat errors
      }
    }
    console.log(`[Server] Mensajes sincronizados: ${totalMessages}`);
  }
  setTimeout(() => autoSync(), 5000);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  server.close();
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error('[Server] Error no manejado:', err);
});
