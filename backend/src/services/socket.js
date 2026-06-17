const jwt = require('jsonwebtoken');
const config = require('../config');

function setupSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Token requerido'));
    try {
      socket.user = jwt.verify(token, config.jwtSecret);
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`[Socket] ${user.displayName} conectado (socket: ${socket.id})`);

    socket.join(`user:${user.id}`);

    socket.on('disconnect', () => {
      console.log(`[Socket] ${user.displayName} desconectado`);
    });
  });
}

function emitToAll(io, event, data) {
  io.emit(event, data);
}

function emitToUser(io, userId, event, data) {
  io.to(`user:${userId}`).emit(event, data);
}

module.exports = { setupSocket, emitToAll, emitToUser };
