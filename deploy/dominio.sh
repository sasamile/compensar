#!/bin/bash
# Cambia el dominio público de la plataforma sin recompilar (unos segundos de pausa).
# Uso en la instancia:  bash /opt/fomento/deploy/dominio.sh compensar.factoryim.co
# Requiere un registro A del dominio apuntando a la IP pública de la instancia.
# La dirección <ip>.sslip.io sigue respondiendo como alternativa.
set -euo pipefail
DOMAIN="${1:?Indica el dominio, p. ej. compensar.factoryim.co}"
ENVF=/etc/fomento.env

TOKEN=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
IP=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || curl -fsS https://checkip.amazonaws.com)
ALT="${IP//./-}.sslip.io"

RES=$(getent ahostsv4 "$DOMAIN" | awk '{print $1; exit}' || true)
[ "$RES" != "$IP" ] && echo "⚠ $DOMAIN resuelve a '${RES:-nada}', no a $IP. Puede que el DNS aún esté propagando."

sudo sed -i "s#^APP_URL=.*#APP_URL=https://$DOMAIN#" "$ENVF"
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$DOMAIN, $ALT {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3100
}
EOF
sudo systemctl reload caddy || sudo systemctl restart caddy
sudo systemctl restart fomento
for i in $(seq 1 30); do curl -fs -o /dev/null http://127.0.0.1:3100/login && break; sleep 2; done
echo "✓ Dominio configurado: https://$DOMAIN (alterno: https://$ALT)"
echo "  El certificado HTTPS se emite en el primer acceso (hasta 1 minuto)."
