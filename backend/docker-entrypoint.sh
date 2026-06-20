#!/bin/sh
set -e

echo "[Entrypoint] Inicializando base de datos..."
mkdir -p /app/data
npx prisma migrate deploy 2>&1 || true

echo "[Entrypoint] Sembrando datos iniciales..."
node prisma/seed.js 2>&1 || true

echo "[Entrypoint] Iniciando servidor..."
exec "$@"
