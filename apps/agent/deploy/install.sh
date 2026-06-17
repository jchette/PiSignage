#!/usr/bin/env bash
#
# PiSignage agent installer (Phase 1 — refined live on the Pi 5).
# Usage:  curl -fsSL <server>/install.sh | sudo PISIGNAGE_SERVER=https://your-server bash
#
set -euo pipefail

SERVER="${PISIGNAGE_SERVER:-http://localhost:4000}"
INSTALL_DIR=/opt/pisignage-agent
STATE_DIR=/etc/pisignage
RUN_USER="${SUDO_USER:-pi}"

echo "==> Installing PiSignage agent (server: $SERVER)"

# 1. Dependencies: Node 22 + Chromium + CEC tooling (cec-ctl ships in v4l-utils).
#    On Raspberry Pi OS desktop, chromium is usually already present.
if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js 22.x"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y chromium v4l-utils || apt-get install -y chromium-browser v4l-utils

# 2. Fetch + build the agent. (Phase 4 will replace this with a prebuilt artifact / image.)
echo "==> Deploying agent to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
# Assumes this script is run from a checkout, or that the tarball was extracted here.
cp -r "$(dirname "$0")/../"* "$INSTALL_DIR/" 2>/dev/null || true
cd "$INSTALL_DIR"
npm install --omit=dev || npm install
npm run build

# 3. Config + state dir.
mkdir -p "$STATE_DIR"
cat > "$STATE_DIR/agent.env" <<EOF
PISIGNAGE_SERVER=$SERVER
PISIGNAGE_DISPLAY=auto
EOF
chown -R "$RUN_USER" "$STATE_DIR"

# 4. systemd service.
echo "==> Installing systemd service"
sed "s/^User=pi/User=$RUN_USER/" "$INSTALL_DIR/deploy/pisignage-agent.service" \
  > /etc/systemd/system/pisignage-agent.service
systemctl daemon-reload
systemctl enable --now pisignage-agent

echo "==> Done. Watch logs with:  journalctl -u pisignage-agent -f"
echo "==> A pairing code will appear on the TV; enter it in the dashboard."
