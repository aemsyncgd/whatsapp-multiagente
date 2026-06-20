#!/bin/bash
set -e

echo "=============================================="
echo "  Setup - Sistema Multiagente WhatsApp"
echo "=============================================="
echo ""

# Colores
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

# Verificar API Key
API_KEY="owa_master_key_cambiar_en_produccion"

echo "1. Verificando que el stack esté levantado..."
if ! podman ps --format "{{.Names}}" 2>/dev/null | grep -q openwa-api; then
  echo -e "${YELLOW}El stack no está corriendo. Ejecutando podman-compose up -d --build...${NC}"
  podman-compose up -d --build
  echo "Esperando a que OpenWA API esté lista..."
  for i in $(seq 1 30); do
    sleep 2
    if curl -sf http://localhost:8002/api/health/ready -H "X-API-Key: $API_KEY" > /dev/null 2>&1; then
      break
    fi
  done
fi

echo "2. Verificando API Key..."
VALID=$(curl -sf -X POST http://localhost:8002/api/auth/validate \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('valid', False))" 2>/dev/null || echo "false")
if [ "$VALID" != "true" ]; then
  echo -e "${RED}API Key inválida. Verifica API_MASTER_KEY en docker-compose.yml${NC}"
  exit 1
fi
echo -e "${GREEN}API Key válida${NC}"

echo ""
echo "3. Creando sesión WhatsApp..."
SESSION_JSON=$(curl -sf -X POST http://localhost:8002/api/sessions \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"whatsapp-principal"}')
SESSION_ID=$(echo "$SESSION_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
echo "  Sesión creada: $SESSION_ID"

echo ""
echo "4. Iniciando sesión..."
curl -sf -X POST "http://localhost:8002/api/sessions/${SESSION_ID}/start" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" > /dev/null

echo "Esperando QR..."
sleep 5

echo ""
echo "5. Obteniendo código QR..."
QR_DATA=$(curl -sf "http://localhost:8002/api/sessions/${SESSION_ID}/qr" \
  -H "X-API-Key: $API_KEY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('qrCode',''))" 2>/dev/null)

if [ -n "$QR_DATA" ]; then
  echo "$QR_DATA" | sed 's/^data:image\/png;base64,//' | base64 -d > /tmp/whatsapp-qr.png 2>/dev/null
  echo -e "  QR guardado en: ${YELLOW}/tmp/whatsapp-qr.png${NC}"
  echo -e "  ${YELLOW}Ábrelo con cualquier visor de imágenes y escanéalo con WhatsApp${NC}"
  echo -e "  O abre ${YELLOW}http://localhost:2886${NC} e ingresa la API Key para verlo"
else
  echo -e "${RED}No se pudo obtener el QR${NC}"
fi

echo ""
echo "6. Registrando webhook..."
curl -sf -X POST "http://localhost:8002/api/sessions/${SESSION_ID}/webhooks" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://backend:5000/webhook/message",
    "events": ["message.received","session.status","session.qr"]
  }' > /dev/null
echo -e "${GREEN}Webhook registrado${NC}"

echo ""
echo "=============================================="
echo "  ESPERANDO CONEXIÓN WHATSAPP"
echo "=============================================="
echo "Escanea el QR con WhatsApp en tu teléfono."
echo ""

for i in $(seq 1 60); do
  sleep 3
  STATUS=$(curl -sf "http://localhost:8002/api/sessions/${SESSION_ID}" \
    -H "X-API-Key: $API_KEY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  echo -n "  Estado: $STATUS"
  if [ "$STATUS" = "ready" ]; then
    PHONE=$(curl -sf "http://localhost:8002/api/sessions/${SESSION_ID}" \
      -H "X-API-Key: $API_KEY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('phone',''))" 2>/dev/null)
    echo -e "\n${GREEN}¡Conectado! Teléfono: $PHONE${NC}"
    break
  fi
  echo -ne "\r"
done

echo ""
echo "=============================================="
echo "  PARA TERMINAR LA CONFIGURACIÓN:"
echo "=============================================="
echo ""
echo "1. Edita docker-compose.yml y cambia:"
echo "   - API_MASTER_KEY (clave del dashboard)"
echo "   - JWT_SECRET (clave de sesión de operadores)"
echo "   - OPENWA_TOKEN (debe coincidir con API_MASTER_KEY)"
echo "   - OPENWA_SESSION_ID=$SESSION_ID"
echo ""
echo "2. Reinicia el backend:"
echo "   podman-compose down && podman-compose up -d"
echo ""
echo "3. Los operadores inician sesión en http://localhost:5000"
echo "   Usuarios: carlos, maria, juan, ana | Pass: operador123"
echo "   (cambia las contraseñas en backend/prisma/seed.js)"
echo ""
