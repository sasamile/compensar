#!/bin/bash
# Arranca la plataforma en modo producción (puerto 3100). Uso: ./start-demo.sh [URL_PUBLICA_NGROK]
cd "$(dirname "$0")"
export NODE_ENV=production
export APP_URL="${1:-}"
export DEMO_MODE=1
exec npx next start -p 3100
