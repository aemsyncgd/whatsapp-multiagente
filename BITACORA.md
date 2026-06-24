# Bitácora — Sistema Multiagente WhatsApp

## Estado actual (24/06/2026)

Stack funcionando con 3 contenedores en podman-compose:
- `openwa-api` (OpenWA gateway, puerto 8002)
- `openwa-dashboard` (OpenWA dashboard, puerto 2886)
- `whatsapp-backend` (backend Node.js + frontend SPA, puerto 5000)

WhatsApp conectado, sesión `3f1cac78-bf08-4738-b23d-3783c9eaaa4a` (número `584129520171`, pushName `aemsyncgd`).

**89 chats** (71 `@lid` direct + 18 `@g.us` grupos). Envío y recepción de texto, imágenes, documentos y audio funcional.

## Funcionalidades operativas

- Webhook recibe mensajes entrantes (texto, imagen, video, audio, voz, documento, sticker, ubicación, contacto), guarda en SQLite y emite por socket.
- Agentes responden desde el frontend (texto y audio grabado).
- 4 operadores precargados: carlos, maria, juan, ana (password: operador123).
- Sincronización automática de chats y últimos mensajes al iniciar el backend.
- Auto-descubrimiento del session ID de OpenWA (no hardcodeado).
- Sincronización automática cuando OpenWA reporta `ready` vía webhook.
- Retry de sincronización al iniciar (hasta 5 intentos si OpenWA no está listo).
- Exponential backoff (4 reintentos, 1s→2s→4s→8s) en history API para 429.
- Nombre de remitente: últimos 4 dígitos del JID si no hay pushName.
- Pantalla oscura por defecto (`data-theme="dark"`), toggle luna/sol persistente en localStorage.
- Interfaz tipo WhatsApp Web: sidebar, lista de chats, panel de mensajes scrollable.
- Input tipo textarea con auto-resize (Enter envía, Ctrl+Enter nueva línea).
- Grabación de audio vía MediaRecorder (`audio/webm;codecs=opus`).
- Botón de adjuntar archivos (placeholder).
- Sincronización masiva de todos los chats (`POST /chats/sync-messages-all`).
- Reasignación de operadores entre chats.
- Recepción de medios: imágenes inline, video con controls, audio con reproductor y fallback.
- Etiquetado visual de mensajes como texto, foto, video, audio, documento, sticker, etc.

## Cambios realizados

### Audio — envío (workaround WA Web roto)
- **Causa raíz**: WhatsApp Web interno (`prepRawMedia`) se rompe para mimetypes `audio/ogg`, `audio/wav`, `audio/mpeg` con error `t: t` desde Puppeteer.
- **Solución**: convertir WebM Opus (grabación del navegador) a AAC/MP4 vía ffmpeg en el backend, luego enviar con `send-audio` y `mimetype: 'audio/mp4'`. Este mimetype NO dispara el procesamiento roto.
- El audio llega al destinatario como mensaje de audio reproducible (no BIN, no documento).
- `backend/Dockerfile`: se agregó `ffmpeg`.
- `backend/src/services/openwa.js`: `convertAudioToAac()` + `sendAudioMessage()` actualizado.

### Audio — recepción (frontend)
- MIME type con parámetros (`audio/ogg; codecs=opus`) se sanitiza a solo `audio/ogg` para la data URI.
- `<audio>` incluye `onerror` que muestra fallback si el navegador no soporta el formato.
- `backend/src/server.js`: `maxHttpBufferSize` de Socket.IO aumentado a 5MB.

### Parche a OpenWA adapter
- `sendDocumentMessage` ahora pasa `sendMediaAsDocument: true` a WhatsApp Web (antes no lo hacía, causando que documentos con mimetype `audio/*` intentaran procesarse como audio y fallaran).
- `sendMediaMessage` acepta parámetro `asDocument`.
- `patch_openwa_adapter.sh` actualizado, imagen OpenWA reconstruida.

### Prisma — migración media
- Nuevos campos en Message: `mediaUrl`, `mediaMimeType`, `mediaFilename`, `mediaSize`.
- Migración `20260624151722_add_media_fields` aplicada.

### Filtro de chats fantasma
- Se excluyen `0@c.us`, `@newsletter`, `@broadcast`.
- `@lid` ya no se filtra (son contactos individuales reales).

### Webhook
- Preserva `msg.type` original en `messageType` (no hardcodea `'text'`).
- Maneja `media.data`, `media.mimetype`, `media.filename`, `media.filesize`.
- Renderiza `renderMediaPreview()` para mostrar íconos según tipo en la lista de chats.

### Endpoints nuevos
- `POST /api/chats/sync-messages-all`: itera todos los chats, trae hasta 500 mensajes cada uno.
- `POST /api/chats/:id/send-audio`: recibe base64 + mimetype, guarda, envía a WhatsApp.
- `POST /api/chats/:id/reassign`: reasigna operador a un chat.

### Frontend (app.js)
- `renderMessageBody()` maneja `image/video/audio/voice/document/sticker/location/contact/revoked`.
- `bindSendMessage()`: textarea con Enter/Ctrl+Enter, grabación de audio, botón adjuntar.
- `doSyncChats()` cambia a pestaña "Sin asignar" después de sync.
- `sendAudioMessage()`: lee blob del MediaRecorder, envía base64 al backend.
- `switchTab()` con filtro por tipo de chat.
- Toggle dark mode con persistencia localStorage.

### Frontend (api.js)
- Exporta `sendMessage`, `sendAudio`, `syncAllMessages`, `fetchChatHistory`.

### openwa-dashboard
- Puerto `2886`, sirve frontend OpenWA para gestionar sesiones.

## Pendientes

### 1. Notas de voz PTT verdaderas
El workaround actual envía audio como mensaje de audio reproducible (AAC/MP4), no como nota de voz PTT (con forma de onda azul). Para PTT se necesita que `sendAudioAsVoice: true` funcione con `audio/ogg`, lo cual está roto en esta versión de WA Web. Solución: actualizar `whatsapp-web.js` o esperar una versión de OpenWA que incluya el fix.

### 2. Adjuntar archivos desde el frontend
Botón de adjuntar muestra toast "Próximamente". Implementar `input[type=file]` para imágenes, videos, documentos.

### 3. Caché de nombres de contacto
OpenWA no proporciona `contact.pushName` en respuestas del history API. El sync histórico muestra últimos 4 dígitos del JID. Considerar endpoint `/contacts/{jid}` de OpenWA para resolver nombres durante sync.

### 4. Producción
- Mover `API_MASTER_KEY`, `OPENWA_TOKEN` y `JWT_SECRET` a variables de entorno reales.
- Mover contraseñas de operadores desde `seed.js` a variables de entorno.
- Evaluar si `QUEUE_ENABLED=false` puede causar pérdida de webhooks bajo carga.
- Agregar proxy reverso (Caddy/Nginx) con TLS para producción.

### 5. Restart de OpenWA
Después de reiniciar el contenedor, la sesión queda `disconnected`. Requiere `POST /sessions/{id}/start` manual o restart del backend. A veces el webhook `session.status = ready` no se dispara automáticamente.
