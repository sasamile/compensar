#!/bin/bash
# Sube los cambios locales a GitHub (sasamile/compensar, rama main).
# Uso:  ./subir-cambios.sh "Descripción del cambio"
# Luego, en la consola de la instancia EC2:  bash /opt/fomento/deploy/actualizar.sh
set -e
cd "$(dirname "$0")"
MSG="${1:-Actualización $(date '+%Y-%m-%d %H:%M')}"
git add -A
if git diff --cached --quiet; then echo "No hay cambios para subir."; else git commit -m "$MSG"; fi
git push origin main
echo "✓ Subido a GitHub. Ahora en la instancia ejecuta: bash /opt/fomento/deploy/actualizar.sh"
