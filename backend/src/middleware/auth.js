const jwt = require('jsonwebtoken');
const config = require('../config');

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    config.jwtSecret,
    { expiresIn: '24h' }
  );
}

function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = { generateToken, verifyToken };
