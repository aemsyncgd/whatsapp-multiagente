#!/bin/bash
set -e

echo "=============================================="
echo "  Setup - Sistema Multiagente WhatsApp"
echo "=============================================="
echo ""

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
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
echo -e "${GREEN}OpenWA API lista${NC}"

echo ""
echo "2. Verificando que no haya sesión activa..."
EXISTING=$(curl -sf http://localhost:8002/api/sessions -H "X-API-Key: $API_KEY" | python3 -c "import sys,json; s=json.load(sys.stdin); print(s[0]['id'] if s else '')" 2>/dev/null)
if [ -n "$EXISTING" ]; then
  echo -e "${YELLOW}Ya existe una sesión ($EXISTING). Eliminándola para crear una nueva...${NC}"
  curl -sf -X DELETE "http://localhost:8002/api/sessions/$EXISTING" -H "X-API-Key: $API_KEY"
  sleep 2
fi

echo ""
echo "3. Creando sesión WhatsApp..."
SESSION_JSON=$(curl -sf -X POST http://localhost:8002/api/sessions \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"whatsapp-principal"}')
SESSION_ID=$(echo "$SESSION_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
echo -e "  Sesión creada: ${GREEN}$SESSION_ID${NC}"

echo ""
echo "4. Iniciando sesión..."
curl -sf -X POST "http://localhost:8002/api/sessions/${SESSION_ID}/start" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" -d '{}' > /dev/null
echo "  Esperando QR..."
sleep 8

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
  echo -e "${RED}No se pudo obtener el QR. Puede que la sesión ya esté autenticada.${NC}"
fi

echo ""
echo "=============================================="
echo "  ESPERANDO CONEXIÓN WHATSAPP"
echo "=============================================="
echo ""

for i in $(seq 1 60); do
  sleep 3
  STATUS=$(curl -sf "http://localhost:8002/api/sessions/${SESSION_ID}" \
    -H "X-API-Key: $API_KEY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  echo -ne "  Estado: $STATUS  \r"
  if [ "$STATUS" = "ready" ]; then
    PHONE=$(curl -sf "http://localhost:8002/api/sessions/${SESSION_ID}" \
      -H "X-API-Key: $API_KEY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('phone',''))" 2>/dev/null)
    echo -e "\n${GREEN}¡Conectado! Teléfono: $PHONE${NC}"
    break
  fi
done

echo ""
echo "6. Configurando OPENWA_SESSION_ID en docker-compose.yml..."
if [ -f docker-compose.yml ]; then
  if grep -q "OPENWA_SESSION_ID=" docker-compose.yml; then
    sed -i "s/OPENWA_SESSION_ID=[a-f0-9-]*/OPENWA_SESSION_ID=$SESSION_ID/" docker-compose.yml
    echo -e "${GREEN}OPENWA_SESSION_ID actualizado en docker-compose.yml${NC}"
  else
    echo -e "${YELLOW}No se encontró OPENWA_SESSION_ID en docker-compose.yml. Agrégala manualmente.${NC}"
  fi
fi

echo ""
echo "7. El backend registrará el webhook automáticamente al iniciar."
echo "   Si ya está corriendo, reinícialo:"
echo "   podman-compose down && podman-compose up -d"
echo ""

echo "=============================================="
echo -e "${GREEN}  CONFIGURACIÓN COMPLETADA${NC}"
echo "=============================================="
echo ""
echo "  Frontend:    http://localhost:5000"
echo "  OpenWA:      http://localhost:8002"
echo "  Dashboard:   http://localhost:2886"
echo ""
echo "  Operadores:  carlos, maria, juan, ana"
echo "  Contraseña:  operador123"
echo ""
