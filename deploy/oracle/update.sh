#!/usr/bin/env bash
# Pulls the latest code and restarts the ThinkWise game server. Restarting ends any game in progress.
# Run on the VM:  sudo bash /opt/thinkwise/deploy/oracle/update.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Please run with sudo:  sudo bash /opt/thinkwise/deploy/oracle/update.sh"
  exit 1
fi

APP_DIR="/opt/thinkwise"
APP_USER="thinkwise"

read -rp "This restarts the game server and ends any live game. Continue? [y/N] " answer
[[ "$answer" =~ ^[Yy]$ ]] || exit 0

sudo -u "$APP_USER" -H git -C "$APP_DIR" fetch --depth 1 origin main
sudo -u "$APP_USER" -H git -C "$APP_DIR" reset --hard origin/main
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && npm ci --workspace @thinkwise/server --workspace @thinkwise/shared --no-audit --no-fund"
systemctl restart thinkwise-realtime
sleep 3
curl -fsS http://127.0.0.1:4000/health && echo && echo "Updated to $(git -C "$APP_DIR" log -1 --format='%h %s')"
