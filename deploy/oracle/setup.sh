#!/usr/bin/env bash
# One-time setup of the ThinkWise game server on an Oracle Cloud Ubuntu VM (Always Free).
# Run on the VM:  curl -fsSL https://raw.githubusercontent.com/chetak-dev/thinkwise/main/deploy/oracle/setup.sh -o setup.sh && sudo bash setup.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Please run with sudo:  sudo bash setup.sh"
  exit 1
fi

REPO_URL="https://github.com/chetak-dev/thinkwise.git"
APP_DIR="/opt/thinkwise"
APP_USER="thinkwise"
ENV_DIR="/etc/thinkwise"
ENV_FILE="$ENV_DIR/realtime.env"
DEFAULT_ORIGINS="https://quiz.iskconbrahmapur.org,https://thinkwise-ecru.vercel.app"
DEFAULT_RESULTS="https://thinkwise-ecru.vercel.app/api/internal/game-results"

echo "== ThinkWise game server setup =="
read -rp "Game server address (e.g. live.iskconbrahmapur.org): " DOMAIN
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN%/}"
[[ -n "$DOMAIN" ]] || { echo "An address is required."; exit 1; }
read -rp "Website addresses allowed to connect [$DEFAULT_ORIGINS]: " ORIGINS
ORIGINS="${ORIGINS:-$DEFAULT_ORIGINS}"
read -rp "Results URL [$DEFAULT_RESULTS]: " RESULTS
RESULTS="${RESULTS:-$DEFAULT_RESULTS}"
read -rsp "REALTIME_SECRET (same value as on Vercel; typing is hidden): " SECRET
echo
[[ -n "$SECRET" ]] || { echo "REALTIME_SECRET is required."; exit 1; }

echo "== Installing system packages =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  echo "== Installing Node.js 22 =="
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  echo "== Installing Caddy (automatic https) =="
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "== Fetching the code =="
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch --depth 1 origin main
  git -C "$APP_DIR" reset --hard origin/main
else
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm ci --workspace @thinkwise/server --workspace @thinkwise/shared --no-audit --no-fund"

echo "== Saving settings =="
mkdir -p "$ENV_DIR"
umask 077
{
  echo "NODE_ENV=production"
  echo "PORT=4000"
  echo "TRUST_PROXY=1"
  echo "ALLOWED_ORIGINS=$ORIGINS"
  echo "RESULTS_URL=$RESULTS"
  echo "REALTIME_SECRET=$SECRET"
} > "$ENV_FILE"
chown root:"$APP_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"
umask 022

echo "== Creating the service =="
cat > /etc/systemd/system/thinkwise-realtime.service <<EOF
[Unit]
Description=ThinkWise realtime game server
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR/apps/server
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node --import tsx src/index.ts
Restart=always
RestartSec=2
LimitNOFILE=65535
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now thinkwise-realtime
systemctl restart thinkwise-realtime

echo "== Configuring https for $DOMAIN =="
[[ -f /etc/caddy/Caddyfile && ! -f /etc/caddy/Caddyfile.orig ]] && cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.orig
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:4000
}
EOF
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

echo "== Opening ports 80 and 443 in the VM firewall =="
for port in 80 443; do
  if ! iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null; then
    reject_line=$(iptables -L INPUT --line-numbers | awk '/REJECT/ {print $1; exit}')
    if [[ -n "$reject_line" ]]; then
      iptables -I INPUT "$reject_line" -p tcp -m state --state NEW --dport "$port" -j ACCEPT
    else
      iptables -A INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT
    fi
  fi
done
command -v netfilter-persistent >/dev/null && netfilter-persistent save

echo "== Checking =="
sleep 3
if curl -fsS http://127.0.0.1:4000/health; then
  echo
  echo "Game server is running."
else
  echo "The game server did not answer. See: journalctl -u thinkwise-realtime -n 50"
  exit 1
fi
echo
echo "Next: open https://$DOMAIN/health in a browser. The first visit can take a minute while the https certificate is issued."
echo "If it fails, check the DNS record and the Oracle security list (ports 80 and 443), then: journalctl -u caddy -n 50"
