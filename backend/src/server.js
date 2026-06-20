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

app.post('/webhook/message', async (req, res) => {
  try {
    const payload = req.body;
    const event = payload.event || '';

    if (event === 'message.received' || event === 'onMessage') {
      const msg = payload.data || payload;
      const chatId = msg.chatId || msg.from || '';
      const contact = msg.contact || {};
      const senderName = contact.name || contact.pushName || 'Desconocido';
      const body = msg.body || msg.message || msg.caption || '';
      const isGroup = chatId.includes('@g.us');

      const chat = await chatService.upsertChat(
        chatId,
        senderName,
        isGroup ? 'group' : 'direct'
      );

      const savedMessage = await chatService.saveMessage({
        chatId: chat.id,
        senderWhatsappId: msg.author || msg.from || '',
        senderName,
        body,
        isFromAgent: false,
        messageType: 'text',
      });

      await chatService.updateChatLastMessage(chat.id, body);

      const unassignedCount = await chatService.getUnassignedCount();

      emitToAll(io, 'message:new', savedMessage);
      emitToAll(io, 'chat:updated', {
        ...chat,
        lastMessage: body,
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

  // Auto-sync chats from OpenWA
  setTimeout(async () => {
    const { syncChats } = require('./services/openwa');
    const chatService = require('./services/chat');
    console.log('[Server] Sincronizando chats desde OpenWA...');
    const result = await syncChats(chatService);
    console.log(`[Server] Sincronización completada: ${result.synced} chats`);
  }, 5000);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  server.close();
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error('[Server] Error no manejado:', err);
});
