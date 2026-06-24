FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./
RUN npm install --production

COPY backend/prisma/ ./prisma/
RUN npx prisma generate

COPY backend/src/ ./src/
COPY backend/.env ./
COPY frontend/ ./frontend/
COPY backend/docker-entrypoint.sh /usr/local/bin/

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
