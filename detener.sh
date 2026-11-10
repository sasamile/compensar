#!/bin/bash
# Detiene el servidor de la plataforma y el túnel de ngrok.
pkill -f "ngrok http 3100" 2>/dev/null
lsof -ti tcp:3100 | xargs kill 2>/dev/null
echo "✓ Plataforma y túnel detenidos"
