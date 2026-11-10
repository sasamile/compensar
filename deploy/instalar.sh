#!/bin/bash
# Instala o actualiza la plataforma en un servidor Linux (Amazon Linux 2023 / Ubuntu) con HTTPS automático.
#
#   Primera vez (en la instancia):
#     curl -fsSLO https://raw.githubusercontent.com/sasamile/compensar/main/deploy/instalar.sh && bash instalar.sh
#   Con dominio propio (después de crear el registro A apuntando a la IP de la instancia):
#     bash /opt/fomento/deploy/instalar.sh fomento.midominio.com
#
# Sin dominio usa <ip-con-guiones>.sslip.io, que resuelve a la IP pública y permite certificado HTTPS.
set -euo pipefail

REPO="https://github.com/sasamile/compensar.git"
APP="/opt/fomento"
ENVF="/etc/fomento.env"
RUN_USER="$(id -un)"
DOMAIN="${1:-}"
say() { printf "\n\033[1m› %s\033[0m\n" "$*"; }

say "Paquetes base"
if command -v dnf >/dev/null; then sudo dnf install -y -q git tar xz openssl libatomic >/dev/null
elif command -v apt-get >/dev/null; then sudo apt-get update -qq && sudo apt-get install -y -qq git tar xz-utils openssl curl libatomic1 >/dev/null
fi

# La compilación de Next.js necesita ~2 GB de RAM; en instancias pequeñas se agrega memoria de intercambio.
MEM=$(free -m | awk '/Mem:/{print $2}')
if [ "$MEM" -lt 3500 ] && ! sudo swapon --show | grep -q /swapfile; then
  say "Agregando 2 GB de swap (RAM: ${MEM} MB)"
  sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q /swapfile /etc/fstab || echo "/swapfile swap swap defaults 0 0" | sudo tee -a /etc/fstab >/dev/null
fi

case "$(uname -m)" in x86_64) NARCH=x64; CARCH=amd64 ;; aarch64|arm64) NARCH=arm64; CARCH=arm64 ;; *) echo "Arquitectura no soportada"; exit 1 ;; esac

if ! node -v 2>/dev/null | grep -q '^v26\.'; then
  say "Instalando Node.js 26 (oficial, verificado con SHA-256)"
  BASE="https://nodejs.org/dist/latest-v26.x"
  FILE=$(curl -fsSL "$BASE/SHASUMS256.txt" | grep -oE "node-v[0-9.]+-linux-$NARCH\.tar\.xz" | head -1)
  curl -fsSL "$BASE/$FILE" -o "/tmp/$FILE"
  (cd /tmp && curl -fsSL "$BASE/SHASUMS256.txt" | grep " $FILE\$" | sha256sum -c -)
  sudo tar -xJf "/tmp/$FILE" -C /usr/local --strip-components=1
  rm -f "/tmp/$FILE"
fi
node -v >/dev/null || { echo "✗ Node no arranca"; exit 1; }; echo "Node $(node -v)"

if ! command -v caddy >/dev/null; then
  say "Instalando Caddy (proxy con HTTPS automático)"
  curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=$CARCH" -o /tmp/caddy
  sudo install -m 755 /tmp/caddy /usr/local/bin/caddy && rm -f /tmp/caddy
fi

say "Código fuente"
if [ -d "$APP/.git" ]; then git -C "$APP" pull --ff-only
else sudo mkdir -p "$APP" && sudo chown "$RUN_USER" "$APP" && git clone "$REPO" "$APP"
fi

if [ -z "$DOMAIN" ]; then
  DOMAIN=$(sudo grep -s '^APP_URL=' "$ENVF" | sed 's#APP_URL=https://##' || true)
  if [ -z "$DOMAIN" ]; then
    TOKEN=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
    IP=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || curl -fsS https://checkip.amazonaws.com)
    DOMAIN="${IP//./-}.sslip.io"
  fi
fi

say "Configuración ($ENVF)"
KEY=$(sudo grep -s '^STORAGE_KEY=' "$ENVF" | cut -d= -f2- || true)
[ -z "$KEY" ] && KEY=$(openssl rand -hex 32)
sudo tee "$ENVF" >/dev/null <<EOF
NODE_ENV=production
APP_URL=https://$DOMAIN
DEMO_MODE=1
STORAGE_KEY=$KEY
EOF
sudo chmod 600 "$ENVF"

say "Compilando (3–8 min según la instancia)"
sudo systemctl stop fomento 2>/dev/null || true
cd "$APP"
npm ci --no-audit --no-fund --loglevel=error
NEXT_DIST_DIR=.next JOBS_DISABLED=1 NODE_OPTIONS=--max-old-space-size=2048 npx next build

say "Servicios"
sudo tee /etc/systemd/system/fomento.service >/dev/null <<EOF
[Unit]
Description=Plataforma de Fomento Empresarial
After=network.target

[Service]
User=$RUN_USER
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=/usr/local/bin/node $APP/node_modules/next/dist/bin/next start -p 3100 -H 127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo mkdir -p /etc/caddy /var/lib/caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3100
}
EOF
sudo tee /etc/systemd/system/caddy.service >/dev/null <<EOF
[Unit]
Description=Caddy
After=network-online.target
Wants=network-online.target

[Service]
Environment=XDG_DATA_HOME=/var/lib XDG_CONFIG_HOME=/etc
ExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now fomento >/dev/null 2>&1
sudo systemctl restart fomento
sudo systemctl enable caddy >/dev/null 2>&1
sudo systemctl restart caddy

for i in $(seq 1 60); do curl -fs -o /dev/null http://127.0.0.1:3100/login && break; sleep 2; done
echo
if curl -fs -o /dev/null http://127.0.0.1:3100/login; then
  echo "✓ Plataforma activa en https://$DOMAIN"
  echo "  (El certificado HTTPS se emite en el primer acceso; requiere los puertos 80 y 443 abiertos en el Security Group.)"
else
  echo "✗ La aplicación no respondió. Revisa: sudo journalctl -u fomento -n 80"
  exit 1
fi
