const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function upsertChat(whatsappId, name, type) {
  return prisma.chat.upsert({
    where: { whatsappId },
    update: { updatedAt: new Date() },
    create: {
      whatsappId,
      name,
      type,
      status: type === 'group' ? 'active' : 'unassigned',
    },
  });
}

async function createOrUpdateChat(whatsappId, name, type) {
  return prisma.chat.upsert({
    where: { whatsappId },
    update: { name, type, updatedAt: new Date() },
    create: {
      whatsappId,
      name,
      type,
      status: type === 'group' ? 'active' : 'unassigned',
    },
  });
}

async function saveMessage({ chatId, senderWhatsappId, senderName, body, agentId, isFromAgent, messageType, mediaUrl, mediaMimeType, mediaFilename, mediaSize }) {
  return prisma.message.create({
    data: {
      chatId,
      senderWhatsappId: senderWhatsappId || '',
      senderName: senderName || '',
      body: body || '',
      agentId: agentId || null,
      isFromAgent: isFromAgent || false,
      messageType: messageType || 'text',
      mediaUrl: mediaUrl || null,
      mediaMimeType: mediaMimeType || null,
      mediaFilename: mediaFilename || null,
      mediaSize: mediaSize || null,
    },
    include: { agent: { select: { id: true, displayName: true, username: true } } },
  });
}

async function updateChatLastMessage(chatId, body) {
  return prisma.chat.update({
    where: { id: chatId },
    data: {
      lastMessage: body,
      lastMessageAt: new Date(),
      ...(body ? { unreadCount: { increment: 1 } } : {}),
    },
  });
}

async function assignChat(chatId, userId) {
  return prisma.chat.update({
    where: { id: chatId },
    data: {
      assignedTo: userId,
      status: 'active',
    },
    include: {
      assignedToUser: { select: { id: true, displayName: true, username: true } },
    },
  });
}

async function releaseChat(chatId) {
  return prisma.chat.update({
    where: { id: chatId },
    data: {
      assignedTo: null,
      status: 'unassigned',
    },
  });
}

async function resolveChat(chatId) {
  return prisma.chat.update({
    where: { id: chatId },
    data: {
      assignedTo: null,
      status: 'resolved',
    },
  });
}

async function getChatsByType(type, userId) {
  const where = type === 'unassigned'
    ? { type: 'direct', status: 'unassigned' }
    : type === 'my'
      ? { assignedTo: userId, status: 'active' }
      : type === 'groups'
        ? { type: 'group' }
        : {};

  return prisma.chat.findMany({
    where,
    include: {
      assignedToUser: { select: { id: true, displayName: true } },
      messages: { orderBy: { timestamp: 'desc' }, take: 1 },
    },
    orderBy: { lastMessageAt: 'desc' },
  });
}

async function getChatMessages(chatId) {
  return prisma.message.findMany({
    where: { chatId },
    include: { agent: { select: { id: true, displayName: true } } },
    orderBy: { timestamp: 'asc' },
  });
}

async function getChatById(chatId) {
  return prisma.chat.findUnique({
    where: { id: chatId },
    include: { assignedToUser: { select: { id: true, displayName: true } } },
  });
}

async function getUnassignedCount() {
  return prisma.chat.count({
    where: { type: 'direct', status: 'unassigned' },
  });
}

async function getAllChats() {
  return prisma.chat.findMany({
    include: { assignedToUser: { select: { id: true, displayName: true } } },
    orderBy: { lastMessageAt: 'desc' },
  });
}

module.exports = {
  upsertChat,
  createOrUpdateChat,
  saveMessage,
  updateChatLastMessage,
  assignChat,
  releaseChat,
  resolveChat,
  getChatsByType,
  getChatMessages,
  getChatById,
  getUnassignedCount,
  getAllChats,
};
