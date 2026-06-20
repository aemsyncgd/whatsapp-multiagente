FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY prisma/ ./prisma/
RUN npx prisma generate

COPY src/ ./src/
COPY .env ./
COPY docker-entrypoint.sh /usr/local/bin/

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
