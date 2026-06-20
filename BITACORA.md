# Bitácora — Sistema Multiagente WhatsApp

## Estado actual (20/06/2026)

Stack funcionando con 3 contenedores en podman-compose:
- `openwa-api` (OpenWA gateway, puerto 8002)
- `openwa-dashboard` (OpenWA dashboard, puerto 2886)
- `whatsapp-backend` (backend Node.js + frontend SPA, puerto 5000)

WhatsApp conectado, sesión `6ae6bce3-cf1a-4bbd-aa61-9292a7985116`, número `584129520171`.

## Funcionalidades operativas

- Webhook recibe mensajes entrantes (`message.received`), los guarda en SQLite y los emite por socket a la interfaz.
- Agentes pueden responder desde el frontend y el mensaje se envía por OpenWA a WhatsApp.
- 4 operadores precargados: carlos, maria, juan, ana (password: operador123).
- Sincronización de grupos desde OpenWA (18 grupos visibles).
- Sincronización de mensajes históricos de grupos (se llama `POST /api/chats/:id/sync-messages` al abrir un chat sin mensajes locales).
- Interfaz con Tailwind CSS, colores verde WhatsApp, fuente Plus Jakarta Sans.

## Pendientes para mañana

### 1. Reconocimiento de nombres de contactos en grupos
Al sincronizar mensajes históricos, algunos contactos aparecen como "Desconocido" porque OpenWA no tiene `contact.pushName` para todos los participantes. Revisar el formato del objeto `msg.contact` en la respuesta de `GET /api/sessions/{id}/messages/{chatId}/history` y mejorar la resolución de nombres. Posible alternativa: usar el remitente del mensaje (`msg.author`) como clave para buscar en la tabla de contactos o extraer el nombre del JID.

### 2. Scroll automático al último mensaje
Al abrir un chat (especialmente un grupo con muchos mensajes sincronizados), la vista debe posicionarse automáticamente en el mensaje más reciente (scroll al fondo), sin obligar al usuario a hacer scroll hacia arriba — o hacia abajo — manualmente.

### 3. Navegación desde el área de chat
La conversación del grupo se carga, pero el usuario debe hacer scroll largo hacia arriba para volver a la parte principal de la interfaz (lista de chats, botones). Revisar el layout: el panel de mensajes debería tener altura fija con scroll interno, sin empujar el resto de la interfaz fuera de la ventana. Asegurar que los botones superiores y la lista de chats permanezcan siempre visibles.

### 4. Producción
- Mover `API_MASTER_KEY`, `OPENWA_TOKEN` y `JWT_SECRET` a variables de entorno fuera del código.
- Mover contraseñas de operadores desde `seed.js` a variables de entorno.
- Evaluar si `QUEUE_ENABLED=false` puede causar pérdida de webhooks bajo carga.
