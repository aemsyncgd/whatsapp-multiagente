# OpenWA patched Dockerfile
# Wraps the upstream OpenWA with local patches

FROM docker.io/node:22-slim AS builder

WORKDIR /app
COPY OpenWA/package*.json ./
RUN npm ci
COPY OpenWA/ .
RUN npm run build

FROM docker.io/node:22-slim AS production

RUN apt-get update && apt-get install -y \
    chromium fonts-liberation \
    libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 \
    libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 \
    libxrandr2 xdg-utils dumb-init gosu curl \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN groupadd -r openwa && useradd -r -g openwa openwa

WORKDIR /app
COPY OpenWA/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist

# Patch @IsUrl to allow hostnames without TLD (e.g. "backend")
RUN sed -i 's/(0, class_validator_1.IsUrl)()/(0, class_validator_1.IsUrl)({ require_tld: false })/g' /app/dist/modules/webhook/dto/webhook.dto.js

# Patch sendAudioMessage to pass sendAudioAsVoice=true (WhatsApp voice note format)
COPY patch_openwa_adapter.sh /tmp/patch_openwa_adapter.sh
RUN chmod +x /tmp/patch_openwa_adapter.sh && /tmp/patch_openwa_adapter.sh && rm /tmp/patch_openwa_adapter.sh

RUN mkdir -p ./data/sessions ./data/media && chown -R openwa:openwa /app

ENV HOME=/app/data
ENV XDG_CONFIG_HOME=/tmp/.config
ENV XDG_CACHE_HOME=/tmp/.cache

COPY OpenWA/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 2785

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:2785/api/health/ready || exit 1

ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
