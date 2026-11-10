#!/bin/bash
# Actualiza la plataforma en el servidor con la última versión de GitHub (rama main).
# Uso en la instancia:  bash /opt/fomento/deploy/actualizar.sh
# Conserva la base de datos (data/), los archivos (storage/) y la configuración (/etc/fomento.env).
set -euo pipefail
cd /opt/fomento
echo "› Descargando cambios…"
git pull --ff-only
echo "› Instalando dependencias…"
npm ci --no-audit --no-fund --loglevel=error
echo "› Compilando (la plataforma queda en pausa unos minutos)…"
sudo systemctl stop fomento
NEXT_DIST_DIR=.next JOBS_DISABLED=1 NODE_OPTIONS=--max-old-space-size=2048 npx next build
sudo systemctl start fomento
for i in $(seq 1 60); do curl -fs -o /dev/null http://127.0.0.1:3100/login && break; sleep 2; done
curl -fs -o /dev/null http://127.0.0.1:3100/login && echo "✓ Actualizada: $(git log -1 --format='%h %s')" || { echo "✗ No respondió. Revisa: sudo journalctl -u fomento -n 80"; exit 1; }
