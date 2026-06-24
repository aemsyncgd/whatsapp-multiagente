# Bitácora — Sistema Multiagente WhatsApp

## Estado actual (24/06/2026)

Stack funcionando con 3 contenedores en podman-compose:
- `openwa-api` (OpenWA gateway, puerto 8002)
- `openwa-dashboard` (OpenWA dashboard, puerto 2886)
- `whatsapp-backend` (backend Node.js + frontend SPA, puerto 5000)

WhatsApp conectado, sesión `e3c87c44-a6d8-4054-bb33-77d780773aff` (número `584129520171`).

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
- Sincronización de mensajes de grupo al abrir un chat (siempre, no solo cuando está vacío).
- Nombre de remitente mejorado: muestra últimos 4 dígitos del JID en vez de "Desconocido".

## Cambios realizados

### openwa.js
- `resolveSessionId()`: descubre automáticamente la sesión activa desde OpenWA.
- Fallback al `OPENWA_SESSION_ID` del env si no hay sesión activa.
- Todas las funciones (`fetchChatHistory`, `sendMessage`, `syncChats`, `checkConnection`) usan `resolveSessionId()`.
- `checkConnection()` busca cualquier sesión `ready`/`connected` si la hardcodeada no funciona.
- `fetchChatHistory()` con exponential backoff (4 reintentos, delay 1s→2s→4s→8s) para 429.

### server.js
- `autoSync()` con retry (5 intentos, 10s de espera) para sincronizar chats/mensajes al iniciar.
- Webhook `session.status = ready` también dispara `syncChats()`.
- Webhook handler actualiza retroactivamente nombres de contactos "Desconocido" cuando recibe un mensaje con nombre real.

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
- Toggle de tema (oscuro/claro) con persistencia en localStorage.

### index.html
- Modo oscuro por defecto con `data-theme="dark"`.
- Botón de cambio de tema (luna/sol) en la sidebar.
- Variables CSS para burbujas (`--msg-outgoing`, `--msg-incoming`), badges (`--badge-*`) que se adaptan al tema.
- Animación pulse para estado desconectado.
- Focus ring verde en inputs.
- Transiciones suaves en cambios de tema.

## Pendientes para mañana

### 1. Caché de nombres de contacto
OpenWA no proporciona `contact.pushName` en respuestas del history API. Aunque el webhook tiene contacto real, el sync histórico muestra últimos 4 dígitos del JID. Considerar endpoint `/contacts/{jid}` de OpenWA para resolver nombres durante sync.

### 2. Send a WhatsApp
El endpoint `POST /chats/:id/send` guarda el mensaje localmente e intenta enviar a OpenWA. Verificar que `sendMessage()` funciona correctamente (puede fallar silenciosamente).

### 3. Producción
- Mover `API_MASTER_KEY`, `OPENWA_TOKEN` y `JWT_SECRET` a variables de entorno.
- Mover contraseñas de operadores desde `seed.js` a variables de entorno.
- Evaluar si `QUEUE_ENABLED=false` puede causar pérdida de webhooks bajo carga.

### 4. Restart de OpenWA
Después de reiniciar el contenedor, la sesión queda `disconnected`. El backend reintenta pero necesita detectar cambio de estado vía webhook `session.status = ready`. A veces el webhook no se dispara automáticamente.

### 5. Caché de nombres de contacto
OpenWA no proporciona `contact.pushName` en respuestas del history API. Aunque el webhook tiene contacto real, el sync histórico muestra últimos 4 dígitos del JID. Considerar endpoint `/contacts/{jid}` de OpenWA para resolver nombres durante sync.
