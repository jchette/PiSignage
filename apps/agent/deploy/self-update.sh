#!/usr/bin/env bash
#
# Self-update check, run by the agent process itself (see ../src/self-update.ts)
# when a device has auto-update enabled. Mirrors the "update an existing checkout"
# steps from install.sh: force-sync to origin/main, reinstall, rebuild.
#
# Exit codes (the agent reads these, not stdout):
#   0 — already at origin/main tip, nothing done, no restart needed
#   2 — pulled a new commit and rebuilt successfully; agent should restart
#   1 (or any other set -e failure) — something went wrong; old build keeps running
#
set -euo pipefail

REPO_DIR="$HOME/pisignage"
NODE_DIR="$HOME/.local/node"
export PATH="$NODE_DIR/bin:$PATH"

cd "$REPO_DIR"

before=$(git rev-parse HEAD)
git fetch --depth 1 origin main
git reset --hard FETCH_HEAD
after=$(git rev-parse HEAD)

if [ "$before" = "$after" ]; then
  echo "[self-update] already at $after"
  exit 0
fi

echo "[self-update] $before -> $after"
npm install
npm run build -w @pisignage/shared
npm run build -w @pisignage/agent
echo "[self-update] build ok, exiting for restart"
exit 2
