# Bitácora — Sistema Multiagente WhatsApp

## Estado actual (24/06/2026)

Stack funcionando con 3 contenedores en podman-compose:
- `openwa-api` (OpenWA gateway, puerto 8002)
- `openwa-dashboard` (OpenWA dashboard, puerto 2886)
- `whatsapp-backend` (backend Node.js + frontend SPA, puerto 5000)

WhatsApp conectado, sesión `fd940466-59cb-4547-8b7b-0439074d4397`, número `584129520171`.

## Funcionalidades operativas

- Webhook recibe mensajes entrantes, guarda en SQLite y emite por socket.
- Agentes pueden responder desde el frontend.
- 4 operadores precargados: carlos, maria, juan, ana (password: operador123).
- Sincronización automática de chats (90 chats) al iniciar el backend.
- Sincronización de últimos mensajes (5 por chat) al iniciar.
- Auto-descubrimiento del session ID de OpenWA (ya no está hardcodeado).
- Sincronización automática cuando OpenWA reporta estado `ready` vía webhook.
- Retry de sincronización al iniciar (hasta 5 intentos si OpenWA no está listo).
- Interfaz rediseñada con paleta de colores personalizada (verde WhatsApp #25d366).
- Layout con panel de mensajes de altura fija (scroll interno, botones siempre visibles).
- Sincronización de mensajes de grupo al abrir un chat sin mensajes locales.

## Cambios realizados

### openwa.js
- `resolveSessionId()`: descubre automáticamente la sesión activa desde OpenWA.
- Fallback al `OPENWA_SESSION_ID` del env si no hay sesión activa.
- Todas las funciones (`fetchChatHistory`, `sendMessage`, `syncChats`, `checkConnection`) usan `resolveSessionId()`.
- `checkConnection()` busca cualquier sesión `ready`/`connected` si la hardcodeada no funciona.

### server.js
- `autoSync()` con retry (5 intentos, 10s de espera) para sincronizar chats/mensajes al iniciar.
- Webhook `session.status = ready` también dispara `syncChats()`.

### chat.js
- Nueva función `getAllChats()` exportada.

### index.html
- Rediseñado con paleta exacta proporcionada por el usuario.
- CSS personalizado (sin Tailwind utility classes en HTML).
- Layout corregido: sidebar fija, chat list fija, panel de mensajes con `flex-1 overflow-y-auto`.
- Animaciones slide-in para mensajes nuevos.

### app.js
- Actualizado `renderMessages()` con clases CSS personalizadas.
- `updateOpenWaStatusUI()` usa variables CSS en vez de Tailwind.

## Pendientes para mañana

### 1. Nombres de contactos en grupos
Al sincronizar mensajes históricos, algunos contactos aparecen como "Desconocido" porque OpenWA no tiene `contact.pushName` para todos. Revisar si se puede resolver el nombre a partir del JID vía la API de OpenWA.

### 2. Scroll al último mensaje
Ya se hace con `requestAnimationFrame` → `scrollTop = scrollHeight`. Probar si funciona correctamente al abrir un grupo con muchos mensajes.

### 3. Rate limiting (429)
OpenWA devuelve 429 Too Many Requests al sincronizar muchos chats seguidos. Evaluar si es necesario añadir un delay entre peticiones.

### 4. Producción
- Mover `API_MASTER_KEY`, `OPENWA_TOKEN` y `JWT_SECRET` a variables de entorno.
- Mover contraseñas de operadores desde `seed.js` a variables de entorno.
- Evaluar si `QUEUE_ENABLED=false` puede causar pérdida de webhooks bajo carga.

### 5. Sesión QR en frontend
El modal QR está en el HTML pero no se ha visto el flujo completo de reconexión desde el frontend multiusuario. Probar y pulir si es necesario.
