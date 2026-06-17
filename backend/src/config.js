require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  openwa: {
    apiUrl: process.env.OPENWA_API_URL || 'http://localhost:2785',
    token: process.env.OPENWA_TOKEN || '',
    sessionId: process.env.OPENWA_SESSION_ID || '',
  },
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
};
