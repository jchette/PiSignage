#!/usr/bin/env bash
#
# PiSignage agent one-line installer.
#
#   curl -fsSL https://raw.githubusercontent.com/jchette/PiSignage/main/apps/agent/deploy/install.sh | bash
#
# Run it as the normal desktop user (the 'pi' user) on stock Raspberry Pi OS
# (Trixie, 64-bit, with desktop). DO NOT prefix with sudo — the script keeps Node
# and the agent fully user-local and only calls sudo for the few things that truly
# need it (apt packages, autologin, linger). You'll be prompted for the sudo
# password if those steps run.
#
# This mirrors the setup validated on real hardware (Pi 5 -> Samsung TV):
#   - Node 22 installed user-local at ~/.local/node (no system Node, no sudo)
#   - repo cloned to ~/pisignage, @pisignage/shared + agent built on-device
#   - agent runs as a systemd USER service (inherits the Wayland session)
#   - Desktop Autologin + linger so it all comes up unattended at boot
#
# Config via env vars (all optional):
#   PISIGNAGE_SERVER   cloud control plane URL (default: the production Railway URL)
#   PISIGNAGE_REPO     git repo to clone (default: the public GitHub repo)
#
set -euo pipefail

SERVER="${PISIGNAGE_SERVER:-https://pisignageserver-production.up.railway.app}"
REPO_URL="${PISIGNAGE_REPO:-https://github.com/jchette/PiSignage.git}"
REPO_DIR="$HOME/pisignage"
NODE_DIR="$HOME/.local/node"
RUNTIME_DIR="/run/user/$(id -u)"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [ "$(id -u)" -eq 0 ]; then
  echo "Please run as the desktop user (e.g. 'pi'), NOT as root / with sudo." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. System packages (sudo): git, CEC tooling (cec-ctl ships in v4l-utils),
#    and Chromium. Only touch apt if something is actually missing.
# ---------------------------------------------------------------------------
need=()
command -v git     >/dev/null 2>&1 || need+=(git)
command -v cec-ctl >/dev/null 2>&1 || need+=(v4l-utils)
command -v chromium >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1 || need+=(chromium)
if [ "${#need[@]}" -gt 0 ]; then
  say "Installing system packages: ${need[*]} (sudo)"
  sudo apt-get update
  # 'chromium' is the package name on Trixie; older images use 'chromium-browser'.
  sudo apt-get install -y "${need[@]}" || {
    need=("${need[@]/chromium/chromium-browser}")
    sudo apt-get install -y "${need[@]}"
  }
fi

# ---------------------------------------------------------------------------
# 2. Node 22, user-local at ~/.local/node (no sudo).
# ---------------------------------------------------------------------------
if ! "$NODE_DIR/bin/node" --version 2>/dev/null | grep -q '^v22\.'; then
  case "$(uname -m)" in
    aarch64|arm64) narch=arm64 ;;
    armv7l)        narch=armv7l ;;
    x86_64)        narch=x64 ;;
    *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
  esac
  say "Installing Node 22 ($narch) to $NODE_DIR"
  fname=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/ \
          | grep -oE "node-v22\.[0-9.]+-linux-$narch\.tar\.xz" | head -1)
  [ -n "$fname" ] || { echo "Could not determine the Node 22 download." >&2; exit 1; }
  tmp=$(mktemp -d)
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$fname" -o "$tmp/node.tar.xz"
  rm -rf "$NODE_DIR"; mkdir -p "$NODE_DIR"
  tar -xJf "$tmp/node.tar.xz" -C "$NODE_DIR" --strip-components=1
  rm -rf "$tmp"
fi
export PATH="$NODE_DIR/bin:$PATH"
# Persist on PATH for future logins (interactive shells + the user service env).
pathline='export PATH="$HOME/.local/node/bin:$PATH"'
grep -qsF "$pathline" "$HOME/.profile" 2>/dev/null || echo "$pathline" >> "$HOME/.profile"

# ---------------------------------------------------------------------------
# 3. Clone (or update) the repo and build shared + agent on-device.
# ---------------------------------------------------------------------------
if [ -d "$REPO_DIR/.git" ]; then
  say "Updating existing checkout at $REPO_DIR"
  git -C "$REPO_DIR" pull --ff-only
else
  say "Cloning $REPO_URL -> $REPO_DIR"
  git clone --depth 1 "$REPO_URL" "$REPO_DIR"
fi
say "Installing dependencies and building (this takes a couple of minutes)"
cd "$REPO_DIR"
npm install
npm run build -w @pisignage/shared
npm run build -w @pisignage/agent

# ---------------------------------------------------------------------------
# 4. Agent config. CEC device + kiosk command are auto-detected/defaulted by the
#    agent, so we only need the server URL and the Wayland session env.
# ---------------------------------------------------------------------------
say "Writing agent config (server: $SERVER)"
cat > "$REPO_DIR/apps/agent/.env" <<EOF
PISIGNAGE_SERVER=$SERVER
PISIGNAGE_DISPLAY=auto
WAYLAND_DISPLAY=wayland-0
XDG_RUNTIME_DIR=$RUNTIME_DIR
EOF

# ---------------------------------------------------------------------------
# 5. Signage display hygiene: make sure screen blanking is OFF. On labwc this is
#    driven by a swayidle line in the user autostart; ensure it's not present.
# ---------------------------------------------------------------------------
autostart="$HOME/.config/labwc/autostart"
if [ -f "$autostart" ] && grep -q 'swayidle' "$autostart"; then
  say "Disabling screen blanking (removing swayidle from labwc autostart)"
  sed -i '/swayidle/d' "$autostart"
fi

# Hide the mouse cursor. labwc parks a pointer at screen-centre on session start
# even with no mouse attached, so it sits over the kiosk. Point the cursor theme
# at a fully-transparent one (validated on hardware). Takes effect next session.
if command -v python3 >/dev/null 2>&1; then
  say "Installing transparent cursor (hides the pointer for signage)"
  cursors="$HOME/.local/share/icons/blank/cursors"
  mkdir -p "$cursors"
  cat > "$HOME/.local/share/icons/blank/index.theme" <<'EOF'
[Icon Theme]
Name=blank
Comment=Fully transparent cursor for signage kiosks
EOF
  python3 - "$cursors/left_ptr" <<'PY'
import struct, sys
p = sys.argv[1]; w = h = size = 24; xhot = yhot = delay = 0
img = struct.pack("<IIIIIIIII", 36, 0xfffd0002, size, 1, w, h, xhot, yhot, delay) + b"\x00" * (w * h * 4)
open(p, "wb").write(b"Xcur" + struct.pack("<III", 16, 0x10000, 1) + struct.pack("<III", 0xfffd0002, size, 28) + img)
PY
  ( cd "$cursors" && for n in default arrow top_left_arrow pointer hand1 hand2 text xterm ptr left_ptr_watch watch; do
      [ -e "$n" ] || ln -s left_ptr "$n"
    done )
  env_file="$HOME/.config/labwc/environment"
  mkdir -p "$(dirname "$env_file")"
  if grep -q '^XCURSOR_THEME=' "$env_file" 2>/dev/null; then
    sed -i 's/^XCURSOR_THEME=.*/XCURSOR_THEME=blank/' "$env_file"
  else
    echo 'XCURSOR_THEME=blank' >> "$env_file"
  fi
fi

# ---------------------------------------------------------------------------
# 6. Boot behaviour (sudo): Desktop Autologin so the Wayland session — and thus
#    the kiosk — exists at boot; linger so the user service starts unattended.
# ---------------------------------------------------------------------------
if command -v raspi-config >/dev/null 2>&1 \
   && [ "$(raspi-config nonint get_autologin 2>/dev/null || echo 1)" != "0" ]; then
  say "Enabling Desktop Autologin (sudo)"
  sudo raspi-config nonint do_boot_behaviour B4 || true
fi
if ! loginctl show-user "$USER" 2>/dev/null | grep -q 'Linger=yes'; then
  say "Enabling linger for $USER (sudo)"
  sudo loginctl enable-linger "$USER"
fi
# Persist the journal so `journalctl --user -u pisignage-agent` survives reboots
# (the default volatile journal is wiped on boot, which makes remote debugging hard).
if [ ! -d /var/log/journal ]; then
  say "Enabling persistent journal logs (sudo)"
  sudo mkdir -p /var/log/journal && sudo systemctl restart systemd-journald || true
fi

# ---------------------------------------------------------------------------
# 7. Install + start the systemd USER service.
# ---------------------------------------------------------------------------
say "Installing systemd user service"
mkdir -p "$HOME/.config/systemd/user"
sed "s|/home/pi|$HOME|g" \
  "$REPO_DIR/apps/agent/deploy/pisignage-agent.user.service" \
  > "$HOME/.config/systemd/user/pisignage-agent.service"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-$RUNTIME_DIR}"
systemctl --user daemon-reload
systemctl --user enable pisignage-agent
# restart (not just start) so re-running the installer to update picks up the new build.
systemctl --user restart pisignage-agent

say "Done."
cat <<EOF

PiSignage agent is installed and running.
  - A 6-digit pairing code will appear on the TV (and in the logs).
  - Claim it in the dashboard at: $SERVER
  - Logs:  systemctl --user status pisignage-agent
           journalctl --user -u pisignage-agent -f   (if user journal is persisted)

Reboot once to apply autologin + the transparent cursor (they take effect on the
next graphical session):  sudo reboot

If the TV is on a different HDMI port later, CEC is auto-detected — no change needed.
EOF
