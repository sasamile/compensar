#!/bin/bash
# Activa la plataforma para pruebas: servidor (puerto 3100) + túnel público de ngrok.
# Uso:  ./activar.sh            → arranca con la compilación existente
#       ./activar.sh --compilar → vuelve a compilar antes de arrancar (tras cambios en el código)
cd "$(dirname "$0")"
mkdir -p logs

echo "› Deteniendo instancias anteriores…"
pkill -f "ngrok http 3100" 2>/dev/null
lsof -ti tcp:3100 | xargs kill 2>/dev/null
sleep 1

if [ "$1" = "--compilar" ] || [ ! -f .next/BUILD_ID ]; then
  echo "› Compilando (2–4 min)…"
  NEXT_DIST_DIR=.next JOBS_DISABLED=1 npx next build > logs/build.log 2>&1 || { echo "✗ Falló la compilación. Revisa logs/build.log"; exit 1; }
fi

echo "› Abriendo túnel ngrok…"
nohup ngrok http 3100 --log=stdout > logs/ngrok.log 2>&1 < /dev/null & disown
URL=""
for i in $(seq 1 30); do
  URL=$(curl -s localhost:4040/api/tunnels 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const t=JSON.parse(s).tunnels.find(t=>t.public_url.startsWith("https"));console.log(t?t.public_url:"")}catch{console.log("")}})')
  [ -n "$URL" ] && break
  sleep 1
done
[ -z "$URL" ] && { echo "✗ ngrok no respondió. Revisa logs/ngrok.log (¿authtoken configurado?)"; exit 1; }

echo "› Arrancando servidor…"
nohup caffeinate -dims ./start-demo.sh "$URL" > logs/server.log 2>&1 < /dev/null & disown
for i in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/login)" = "200" ] && break
  sleep 1
done
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "ngrok-skip-browser-warning: 1" "$URL/login")

echo ""
if [ "$CODE" = "200" ]; then
  echo "✓ Plataforma activa"
  echo "  Enlace para probadores: $URL"
  echo "  Local:                  http://localhost:3100"
  echo "  Para detenerla:         ./detener.sh"
  echo "  (Deja el Mac encendido y conectado; si se apaga o duerme, el enlace deja de funcionar.)"
else
  echo "✗ El enlace respondió $CODE. Revisa logs/server.log y logs/ngrok.log"
  exit 1
fi
