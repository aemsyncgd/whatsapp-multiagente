const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { generateToken, verifyToken } = require('../middleware/auth');
const chatService = require('../services/chat');
const openwa = require('../services/openwa');

const prisma = new PrismaClient();
const router = Router();

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

router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    });
  } catch (err) {
    console.error('[API] Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/auth/me', verifyToken, (req, res) => {
  res.json({ user: req.user });
});

router.post('/auth/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: 'Contraseña actual incorrecta' });

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: hash } });

    res.json({ message: 'Contraseña actualizada' });
  } catch (err) {
    console.error('[API] Error cambiando contraseña:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/chats', verifyToken, async (req, res) => {
  try {
    const { type } = req.query;
    const chats = await chatService.getChatsByType(type || 'all', req.user.id);
    res.json(chats);
  } catch (err) {
    console.error('[API] Error obteniendo chats:', err);
    res.status(500).json({ error: 'Error al obtener chats' });
  }
});

router.get('/chats/:id/messages', verifyToken, async (req, res) => {
  try {
    const messages = await chatService.getChatMessages(parseInt(req.params.id));
    res.json(messages);
  } catch (err) {
    console.error('[API] Error obteniendo mensajes:', err);
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

router.post('/chats/:id/assign', verifyToken, async (req, res) => {
  try {
    const chatId = parseInt(req.params.id);
    const chat = await chatService.getChatById(chatId);
    if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });
    if (chat.assignedTo) return res.status(409).json({ error: 'El chat ya está asignado' });

    const updated = await chatService.assignChat(chatId, req.user.id);

    const io = req.app.get('io');
    if (io) {
      io.emit('chat:assigned', updated);
      io.emit('stats:update', await chatService.getUnassignedCount());
    }

    res.json(updated);
  } catch (err) {
    console.error('[API] Error asignando chat:', err);
    res.status(500).json({ error: 'Error al asignar chat' });
  }
});

router.post('/chats/:id/release', verifyToken, async (req, res) => {
  try {
    const chatId = parseInt(req.params.id);
    const chat = await chatService.getChatById(chatId);
    if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });

    if (chat.type === 'group') {
      return res.status(400).json({ error: 'Los grupos no pueden ser liberados' });
    }

    if (chat.assignedTo !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'No tienes este chat asignado' });
    }

    const updated = await chatService.releaseChat(chatId);

    const io = req.app.get('io');
    if (io) {
      io.emit('chat:released', updated);
      io.emit('stats:update', await chatService.getUnassignedCount());
    }

    res.json(updated);
  } catch (err) {
    console.error('[API] Error liberando chat:', err);
    res.status(500).json({ error: 'Error al liberar chat' });
  }
});

router.post('/chats/:id/resolve', verifyToken, async (req, res) => {
  try {
    const chatId = parseInt(req.params.id);
    const updated = await chatService.resolveChat(chatId);

    const io = req.app.get('io');
    if (io) {
      io.emit('chat:released', updated);
      io.emit('stats:update', await chatService.getUnassignedCount());
    }

    res.json(updated);
  } catch (err) {
    console.error('[API] Error resolviendo chat:', err);
    res.status(500).json({ error: 'Error al resolver chat' });
  }
});

router.post('/chats/:id/send', verifyToken, async (req, res) => {
  try {
    const chatId = parseInt(req.params.id);
    const { body } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
    }

    const chat = await chatService.getChatById(chatId);
    if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });

    const message = await chatService.saveMessage({
      chatId,
      senderWhatsappId: `agent:${req.user.id}`,
      senderName: req.user.displayName,
      body: body.trim(),
      agentId: req.user.id,
      isFromAgent: true,
    });

    await chatService.updateChatLastMessage(chatId, body.trim());

    const io = req.app.get('io');
    if (io) {
      io.emit('message:received', message);
    }

    try {
      await openwa.sendMessage(chat.whatsappId, body.trim());
    } catch (err) {
      console.error('[API] Error enviando a OpenWA (el mensaje se guardó igual):', err.message);
    }

    res.json(message);
  } catch (err) {
    console.error('[API] Error enviando mensaje:', err);
    res.status(500).json({ error: 'Error al enviar mensaje' });
  }
});

router.post('/chats/:id/send-audio', verifyToken, async (req, res) => {
  try {
    const chatId = parseInt(req.params.id);
    const { base64, mimetype } = req.body;

    if (!base64) {
      return res.status(400).json({ error: 'Datos de audio requeridos' });
    }

    const chat = await chatService.getChatById(chatId);
    if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });

    const message = await chatService.saveMessage({
      chatId,
      senderWhatsappId: `agent:${req.user.id}`,
      senderName: req.user.displayName,
      body: '🎤 Nota de voz',
      agentId: req.user.id,
      isFromAgent: true,
      messageType: 'voice',
      mediaUrl: base64,
      mediaMimeType: mimetype || 'audio/ogg',
    });

    await chatService.updateChatLastMessage(chatId, '🎤 Nota de voz');

    const io = req.app.get('io');
    if (io) {
      io.emit('message:received', message);
    }

    try {
      await openwa.sendAudioMessage(chat.whatsappId, base64, mimetype);
    } catch (err) {
      console.error('[API] Error enviando audio a OpenWA (el mensaje se guardó igual):', err.message);
    }

    res.json(message);
  } catch (err) {
    console.error('[API] Error enviando audio:', err);
    res.status(500).json({ error: 'Error al enviar audio' });
  }
});

router.get('/unassigned-count', verifyToken, async (req, res) => {
  try {
    const count = await chatService.getUnassignedCount();
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener conteo' });
  }
});

router.post('/chats/sync', verifyToken, async (req, res) => {
  try {
    const result = await openwa.syncChats(chatService);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Error al sincronizar chats' });
  }
});

router.post('/chats/sync-messages-all', verifyToken, async (req, res) => {
  try {
    const allChats = await chatService.getAllChats();
    let total = 0;
    let processed = 0;
    const errors = [];
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 5), 500);

    for (const chat of allChats) {
      try {
        const messages = await openwa.fetchChatHistory(chat.whatsappId, limit);
        if (!Array.isArray(messages) || messages.length === 0) continue;
        let synced = 0;
        for (const msg of messages) {
          try {
            const contact = msg.contact || {};
            const authorJid = msg.author || msg.from || '';
            let senderName = contact.name || contact.pushName || '';
            if (!senderName) {
              if (msg.fromMe) senderName = 'Tú';
              else {
                const match = authorJid.match(/^(\d+)@/);
                senderName = match ? (match[1].length > 8 ? '...' + match[1].slice(-4) : match[1]) : 'Desconocido';
              }
            }
            const body = msg.body || '';
            const timestamp = msg.timestamp ? new Date(msg.timestamp * 1000) : new Date();
            const existing = await prisma.message.findFirst({ where: { chatId: chat.id, body, timestamp } });
            if (existing) continue;
            const msgType = msg.type || 'text';
            const media = msg.media || {};
            const mediaData = media.data ? {
              mediaUrl: media.data,
              mediaMimeType: media.mimetype || null,
              mediaFilename: media.filename || null,
              mediaSize: media.filesize ? parseInt(media.filesize) : null,
            } : {};
            await prisma.message.create({
              data: {
                chatId: chat.id,
                senderWhatsappId: authorJid,
                senderName,
                body,
                timestamp,
                isFromAgent: msg.fromMe || false,
                messageType: msgType,
                ...mediaData,
              },
            });
            synced++;
          } catch {}
        }
        if (synced > 0) {
          const lastMsg = messages[0];
          const displayText = lastMsg?.type === 'text' ? (lastMsg.body || '') : renderMediaPreview(lastMsg?.type, lastMsg?.body);
          if (displayText) await chatService.updateChatLastMessage(chat.id, displayText);
        }
        total += synced;
        processed++;
      } catch (e) {
        errors.push({ chat: chat.name, error: e.message });
      }
    }

    res.json({ synced: total, chatsProcessed: processed, totalChats: allChats.length, errors: errors.length ? errors : undefined });
  } catch (err) {
    console.error('[API] Error sincronizando todos los mensajes:', err.message);
    res.status(500).json({ error: 'Error al sincronizar todos los mensajes' });
  }
});

router.post('/chats/:id/sync-messages', verifyToken, async (req, res) => {
  try {
    const chatId = parseInt(req.params.id);
    const chat = await chatService.getChatById(chatId);
    if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });

    const messages = await openwa.fetchChatHistory(chat.whatsappId, 100);
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.json({ synced: 0 });
    }

    let synced = 0;
    for (const msg of messages) {
      try {
        const contact = msg.contact || {};
        const authorJid = msg.author || msg.from || '';
        let senderName = contact.name || contact.pushName || '';
        if (!senderName) {
          if (msg.fromMe) {
            senderName = 'Tú';
          } else {
            // Try to extract a readable identifier from the JID
            const match = authorJid.match(/^(\d+)@/);
            if (match) {
              const num = match[1];
              // Show last digits for phone numbers
              senderName = num.length > 8 ? '...' + num.slice(-4) : num;
            } else {
              senderName = 'Desconocido';
            }
          }
        }
        const body = msg.body || '';
        const msgType = msg.type || 'text';
        const timestamp = msg.timestamp ? new Date(msg.timestamp * 1000) : new Date();

        // Dedup by body + timestamp
        const existing = await prisma.message.findFirst({
          where: { chatId, body, timestamp },
        });
        if (existing) continue;

        const media = msg.media || {};
        const mediaData = media.data ? {
          mediaUrl: media.data,
          mediaMimeType: media.mimetype || null,
          mediaFilename: media.filename || null,
          mediaSize: media.filesize ? parseInt(media.filesize) : null,
        } : {};

        await prisma.message.create({
          data: {
            chatId,
            senderWhatsappId: authorJid,
            senderName,
            body,
            timestamp,
            isFromAgent: msg.fromMe || false,
            messageType: msgType,
            ...mediaData,
          },
        });
        synced++;
      } catch (msgErr) {
        // skip individual message errors
      }
    }

    // Update last message on the chat
    if (synced > 0 && messages[0]) {
      const lastMsg = messages[0];
      const displayText = lastMsg.type === 'text' ? (lastMsg.body || '') : renderMediaPreview(lastMsg.type, lastMsg.body);
      if (displayText) await chatService.updateChatLastMessage(chatId, displayText);
    }

    res.json({ synced });
  } catch (err) {
    console.error('[API] Error sincronizando mensajes:', err.message);
    res.status(500).json({ error: 'Error al sincronizar mensajes' });
  }
});

router.get('/openwa/status', verifyToken, async (req, res) => {
  try {
    const status = await openwa.checkConnection();
    res.json(status);
  } catch {
    res.json({ connected: false });
  }
});

module.exports = router;
