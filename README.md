<div align="center">

# 🤖 WhatsApp Multiagente

### Sistema de Soporte Técnico Interno en Tiempo Real

[![Node.js](https://img.shields.io/badge/Node.js-22_LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8-010101?logo=socket.io)](https://socket.io)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma)](https://prisma.io)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite)](https://sqlite.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss)](https://tailwindcss.com)
[![OpenWA](https://img.shields.io/badge/OpenWA-Gateway-25D366?logo=whatsapp)](https://github.com/rmyndharis/OpenWA)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

**4 operadores · 1 número de WhatsApp · Tiempo real · Sin límites**

</div>

## 📋 Tabla de Contenidos

- [Descripción](#-descripción)
- [Arquitectura](#-arquitectura)
- [Capturas de Pantalla](#-capturas-de-pantalla)
- [Requisitos](#-requisitos)
- [Instalación Rápida](#-instalación-rápida)
- [Configuración Detallada](#-configuración-detallada)
- [Uso del Sistema](#-uso-del-sistema)
- [API REST](#-api-rest)
- [Solución de Problemas](#-solución-de-problemas)
- [Estructura del Proyecto](#-estructura-del-proyecto)

---

## 🎯 Descripción

Sistema **multiagente auto-alojado** que elimina la necesidad de un teléfono físico en la sala de monitoreo. Cuatro operadores pueden leer, escribir y gestionar conversaciones de WhatsApp **simultáneamente** sin interrumpirse, con control total de quién atiende a quién.

### ✨ Funcionalidades clave

| Funcionalidad | Detalle |
|---|---|
| 🧑‍💼 **4 Operadores** | Sesiones independientes con JWT |
| ⚡ **Tiempo Real** | WebSockets (Socket.io) para actualizaciones instantáneas |
| 🔄 **Asignación de Chats** | Tomar/Liberar chats con bloqueo concurrente |
| 👥 **Grupos WhatsApp** | Chats grupales visibles para todos los operadores |
| 📱 **Multi-sesión** | Soporte para múltiples números vía OpenWA |
| 🔌 **API REST** | Endpoints completos para integraciones |
| 🗄️ **Persistencia** | SQLite con Prisma ORM (fácil migración a PostgreSQL) |
| 🔐 **Seguro** | Autenticación JWT, Webhook validado |

---

## 🏗 Arquitectura

```
┌──────────────────────────────────────────────────────────────────┐
│                     RED DOCKER: whatsapp-net                      │
│                                                                  │
│  📱 WhatsApp (Teléfono del técnico)                              │
│      ↓                                                    ↑      │
│  ┌──────────────────┐  webhook   ┌────────────────────┐  │      │
│  │  openwa-api:2785 │───────────▶│ backend:5000       │──┤      │
│  │  · QR + Engine   │            │ · Express           │  │      │
│  │  · Sesiones      │◀─◀─ API ──│ · Socket.io         │  │      │
│  │  · Webhooks      │  send-text│ · Prisma (SQLite)   │  │      │
│  └──────────────────┘            └─────────┬──────────┘  │      │
│                                            │ WS          │      │
│                            ┌───────────────▼────────┐     │      │
│                            │  Navegador Web         │     │      │
│                            │  localhost:5000        │─────┘      │
│                            │  Frontend SPA          │            │
│                            └────────────────────────┘            │
│                                                                  │
│  ┌──────────────────────┐                                        │
│  │ openwa-dashboard:80  │                                        │
│  │ localhost:2886       │                                        │
│  └──────────────────────┘                                        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📸 Capturas de Pantalla

> *(Agrega aquí capturas de tu instancia funcionando)*

| Pantalla | Descripción |
|---|---|
| 🖼️ **Login** | Pantalla de inicio con credenciales JWT |
| 🖼️ **Dashboard** | 3 columnas: sidebar, lista de chats, ventana activa |
| 🖼️ **Chat Activo** | Mensajes con etiquetas de operador, campo de envío |

---

## 📋 Requisitos

| Requisito | Versión | Instalación |
|---|---|---|
| [Node.js](https://nodejs.org) | ≥ 18 LTS | `nvm install 22` |
| [Podman](https://podman.io) | ≥ 4.x | `sudo apt install podman podman-compose` |
| [Git](https://git-scm.com) | ≥ 2.x | `sudo apt install git` |
| Navegador | Moderno | Chrome, Firefox, Edge |

> **Alternativa:** Puedes usar Docker en lugar de Podman. Todos los comandos son equivalentes.

---

## 🚀 Instalación Rápida

### 1️⃣ Clonar el repositorio

```bash
git clone https://github.com/aemsyncgd/whatsapp-multiagente.git
cd whatsapp-multiagente
```

### 2️⃣ Clonar OpenWA (si no está presente)

```bash
git clone https://github.com/rmyndharis/OpenWA.git
```

### 3️⃣ ¡Levantar todo con un solo comando!

```bash
podman-compose up -d --build
```

Este comando construye y arranca **los 3 servicios** simultáneamente:

| Servicio | Puertos | Descripción |
|---|---|---|
| `openwa-api` | `localhost:8002` | Gateway WhatsApp (API + engine) |
| `openwa-dashboard` | `localhost:2886` | UI web para gestionar sesiones |
| `whatsapp-backend` | `localhost:5000` | API REST + WebSocket + Frontend SPA |

### 4️⃣ Vincular WhatsApp

1. Abrir Dashboard → `http://localhost:2886`
2. Autenticar con la API Key:
   ```bash
   podman exec openwa-api cat /app/data/.api-key
   ```
3. Ir a **Sessions** → **Create Session** → nombre: `mi-whatsapp`
4. Click **Start** → escanear QR con tu WhatsApp
5. Copiar el Session ID y configurarlo en el backend:
   ```bash
   # Obtener el ID de la sesión
   curl http://localhost:8002/api/sessions -H "X-API-Key: $(podman exec openwa-api cat /app/data/.api-key)"
   
   # Configurarlo en el backend (requiere reinicio del contenedor)
   podman stop whatsapp-backend
   podman rm whatsapp-backend
   # Editar OPENWA_SESSION_ID en docker-compose.yml
   podman-compose up -d --build backend
   ```

### 5️⃣ Abrir la aplicación

```
http://localhost:5000
```

| Usuario | Contraseña |
|---|---|
| `carlos` | `operador123` |
| `maria` | `operador123` |
| `juan` | `operador123` |
| `ana` | `operador123` |

---

## 🔧 Configuración Detallada

### 📁 Variables de Entorno (`backend/.env`)

```env
# Puerto del servidor backend
PORT=5000

# URL base de la API de OpenWA
OPENWA_API_URL=http://localhost:8002
OPENWA_TOKEN=tu_api_key_de_openwa_aqui
OPENWA_SESSION_ID=id_de_tu_sesion_whatsapp

# JWT Secret (CAMBIA ESTO en producción)
JWT_SECRET=genera_un_secreto_aleatorio_seguro

# Base de datos SQLite
DATABASE_URL="file:./dev.db"
```

### 🔑 Obtener la API Key de OpenWA

```bash
# La API Key se genera automáticamente al iniciar OpenWA
podman logs openwa-api 2>&1 | grep "API Key"

# O directamente del archivo
cat OpenWA/data/.api-key
```

### 📱 Vincular WhatsApp

1. Abrir Dashboard: `http://localhost:2886`
2. Ingresar la **API Key** en el campo de autenticación
3. Ir a **Sessions** → **Create Session** → nombre: `mi-whatsapp`
4. Click **Start** → escanear el **código QR** con tu WhatsApp
5. Estado debe cambiar a `connected`

### 🔗 Configurar Webhook

El webhook se configura automáticamente si se usa el `docker-compose.yml` del proyecto. Si usas el `docker-compose.dev.yml` de OpenWA:

```bash
API_KEY="tu_api_key"
SESSION_ID="id_de_tu_sesion"

curl -X POST "http://localhost:8002/api/sessions/$SESSION_ID/webhooks" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://host.containers.internal:5000/webhook/message",
    "events": ["message.received", "session.status"]
  }'
```

> ⚠️ **Nota sobre Podman:** La IP del host desde el contenedor puede variar. Si `host.containers.internal` no funciona, verifica con `podman exec openwa-api ip route` y usa la IP del gateway.

---

## 🎮 Uso del Sistema

### 👤 Operadores por Defecto

| Usuario | Contraseña | Rol |
|---|---|---|
| `carlos` | `operador123` | Operador |
| `maria` | `operador123` | Operador |
| `juan` | `operador123` | Operador |
| `ana` | `operador123` | Operador |

### 🖥️ Interfaz de 3 Columnas

```
┌──────────────┬──────────────────┬──────────────────────────────┐
│   SIDEBAR    │   LISTA CHATS    │      VENTANA DE CHAT          │
│              │                  │                              │
│  👤 Perfil   │  📋 Tarjetas     │  📝 Encabezado + Acciones    │
│  📊 Contador │  · Nombre        │  💬 Mensajes en tiempo real  │
│              │  · Último msg    │  · Técnico ← (WhatsApp)      │
│  📂 Pestañas │  · Hora          │  · Operador → [Enviado por:] │
│  · Mis chats │  · Badge estado  │                              │
│  · Bandeja   │                  │  📥 Caja de texto + Enter    │
│  · Grupos    │                  │                              │
│  · Historial │                  │                              │
└──────────────┴──────────────────┴──────────────────────────────┘
```

### 🔄 Flujo de Trabajo

1. **Llega un mensaje** → Aparece en la **Bandeja General** de todos
2. **Operador toma el chat** → Click "Tomar Chat" → Se asigna y bloquea para otros
3. **Operador responde** → Escribe y presiona Enter → El mensaje se envía vía OpenWA
4. **Liberar chat** → Click "Liberar" → Vuelve a la bandeja general
5. **Grupos** → Todos ven y responden sin asignación individual

---

## 📡 API REST

### Autenticación

```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"carlos","password":"operador123"}'
# → { "token": "eyJ...", "user": {...} }

# Verificar token
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

### Chats

```bash
# Obtener chats (type: my | unassigned | groups | all)
curl 'http://localhost:5000/api/chats?type=unassigned' \
  -H "Authorization: Bearer <token>"

# Asignar chat a mí
curl -X POST http://localhost:5000/api/chats/1/assign \
  -H "Authorization: Bearer <token>"

# Liberar chat
curl -X POST http://localhost:5000/api/chats/1/release \
  -H "Authorization: Bearer <token>"

# Enviar mensaje
curl -X POST http://localhost:5000/api/chats/1/send \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"body": "Hola, ¿cómo puedo ayudarte?"}'
```

### Simular mensaje entrante (pruebas sin WhatsApp real)

```bash
curl -X POST http://localhost:5000/webhook/message \
  -H "Content-Type: application/json" \
  -d '{
    "event": "onMessage",
    "data": {
      "chatId": "521234567890@c.us",
      "sender": {"name": "Luis Técnico"},
      "body": "Hola, necesito soporte con el sistema"
    }
  }'
```

---

## 🐛 Solución de Problemas

### 🔴 La sesión de WhatsApp no conecta

| Síntoma | Causa | Solución |
|---|---|---|
| El QR se genera pero no conecta | Versión incompatible de WhatsApp Web | Fijar `WWEBJS_WEB_VERSION` en docker-compose |
| Error "authenticating" permanente | whatsapp-web.js desactualizado | Actualizar a ≥ 1.37 o usar engine Baileys |
| QR no se muestra | Chromium no arranca | Verificar PUPPETEER_ARGS y memoria |

**Solución recomendada:** Editar `docker-compose.yml` y cambiar la variable `WWEBJS_WEB_VERSION` por una versión compatible. Ya viene preconfigurada con `2.3000.1017314725`, pero si falla, prueba con:

```yaml
- WWEBJS_WEB_VERSION=2.3000.1015901306
```

Luego reconstruir:

```bash
podman-compose up -d --build openwa-api
```

### 🔴 El webhook no recibe mensajes

```bash
# Verificar que OpenWA puede alcanzar el backend (dentro de Docker)
podman exec openwa-api sh -c "curl -s http://backend:5000/ || echo 'No reachable'"

# Revisar logs
podman logs openwa-api 2>&1 | grep -i webhook
```

### 🔴 Error de puerto en uso

```bash
# Verificar qué está usando el puerto
fuser 5000/tcp

# Matar proceso
fuser -k 5000/tcp
```

### 🔴 La base de datos no se inicializa

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name init
node prisma/seed.js
```

---

## 📁 Estructura del Proyecto

```
whatsapp-multiagente/
├── docker-compose.yml           # 🐳 ORQUESTACIÓN ÚNICA (3 servicios)
├── BITACORA_PROYECTO.txt        # Bitácora completa del proyecto
├── .gitignore
│
├── backend/
│   ├── Dockerfile               # Imagen Docker del backend
│   ├── docker-entrypoint.sh     # Script de arranque
│   ├── .env.example             # Variables de entorno (ejemplo)
│   ├── package.json             # Dependencias
│   ├── prisma/
│   │   ├── schema.prisma        # Modelos: User, Chat, Message
│   │   ├── seed.js              # Datos iniciales (4 operadores)
│   │   └── migrations/          # Migraciones SQLite
│   └── src/
│       ├── server.js            # Entry point (Express + Socket.io)
│       ├── config.js            # Carga de configuración
│       ├── middleware/
│       │   └── auth.js          # JWT
│       ├── routes/
│       │   └── api.js           # API REST
│       └── services/
│           ├── chat.js          # Lógica de negocio
│           ├── openwa.js        # Cliente OpenWA
│           └── socket.js        # Eventos WebSocket
│
├── frontend/
│   ├── index.html               # SPA (Tailwind CSS)
│   └── js/
│       ├── store.js             # Estado reactivo
│       ├── api.js               # Cliente HTTP
│       ├── socket.js            # Cliente WebSocket
│       └── app.js              # UI y lógica
│
├── OpenWA/                      # ⚡ Clon de github.com/rmyndharis/OpenWA
│   ├── Dockerfile
│   ├── docker-compose.dev.yml
│   └── dashboard/               # Frontend React del Dashboard
```

---

## 🛣️ Roadmap

- [x] Arquitectura base con OpenWA
- [x] Backend REST + WebSocket
- [x] Frontend SPA con 3 columnas
- [x] Asignación/Liberación de chats concurrente
- [x] Autenticación JWT
- [x] Soporte de grupos de WhatsApp
- [ ] Soporte para múltiples sesiones OpenWA
- [ ] Modo oscuro
- [ ] Historial de mensajes con búsqueda
- [ ] Dashboard de métricas
- [ ] Integración con PostgreSQL
- [ ] Notificaciones sonoras
- [ ] API Key management desde el frontend

---

## 🤝 Contribuir

1. Fork el proyecto
2. Crea tu rama (`git checkout -b feature/mejora`)
3. Commit (`git commit -m 'feat: agrega X'`)
4. Push (`git push origin feature/mejora`)
5. Abre un Pull Request

---

## 📄 Licencia

MIT © 2026 — [aemsyncgd](https://github.com/aemsyncgd)

---

<div align="center">

**Hecho con ❤️ para equipos de soporte técnico**

[Reportar Bug](https://github.com/aemsyncgd/whatsapp-multiagente/issues) · [Solicitar Feature](https://github.com/aemsyncgd/whatsapp-multiagente/issues)

</div>
