# PiSignage

Cloud-controlled Raspberry Pi digital signage. Each Pi drives a TV (currently a
URL per screen), controlled from a web dashboard — with device grouping,
scheduling, HDMI-CEC TV power, per-device health monitoring, per-TV zoom, and
opt-in agent auto-update.

## Architecture

```
 React Dashboard  ──HTTPS──▶  Cloud Control Plane  ◀──WSS──  Pi Agent ──▶ Chromium kiosk
 (browser)        ◀──SSE───   (Node/Fastify + Turso)  cmds            │   libcec ──▶ TV
```

- **Devices sit behind NAT/firewall.** Each Pi holds one persistent **outbound**
  WebSocket to the cloud; commands are pushed down it. No port forwarding.
- **Single-instance** today (in-memory device registry + SSE fan-out). Scaling
  horizontally later means backing those with Redis pub/sub.

### Monorepo layout

| Path | What it is |
| --- | --- |
| `packages/shared` | Wire-protocol types + zod schemas shared by server and agent |
| `apps/server` | Fastify API, WebSocket device gateway, SSE, Turso/Drizzle DB |
| `apps/dashboard` | React + Vite admin dashboard |
| `apps/agent` | Node agent that runs on each Pi (pairing, kiosk, CEC, heartbeat) |

## Tech choices

- **Node/TypeScript** end to end, **React** dashboard.
- **Turso (libSQL/SQLite)** via **Drizzle** — local dev is a plain file, prod is
  Turso cloud (same `@libsql/client` driver, different `DATABASE_URL`).
- **Fastify** + `@fastify/websocket`; SSE for dashboard live updates.
- Hosting: **Railway** runs the server, which also serves the built React
  dashboard from the same origin (one deploy, no CORS).

## Local development

Prereqs: Node 20+ (uses npm workspaces — no pnpm/Docker needed).

```bash
npm install

# 1. Server
cd apps/server
cp .env.example .env          # default DATABASE_URL is a local sqlite file
npm run db:push               # create tables
npm run db:seed               # create org + admin (admin@example.com / changeme)
npm run dev                   # http://localhost:4000

# 2. Dashboard (new terminal)
cd apps/dashboard
npm run dev                   # http://localhost:5173  (proxies /api to the server)

# 3. Agent (new terminal) — runs in "console display" mode on non-Linux
cd apps/agent
cp .env.example .env
npm run dev                   # prints a pairing code to the console
```

Then open the dashboard, sign in, click **Add device**, and enter the pairing
code the agent printed. Set a URL on the device card and watch the agent receive
it. On a real Pi the agent auto-detects Linux and drives a Chromium kiosk instead
of logging.

### Handy root scripts

```bash
npm run dev:server      # run a single workspace
npm run dev:dashboard
npm run dev:agent
npm run build           # build all workspaces
```

## Deploying the agent to a Pi

Use **Raspberry Pi OS (64-bit, _with desktop_)** on a Pi plugged into the TV (any
HDMI port — CEC is auto-detected). There are two ways to provision; both end with
a pairing code on the TV that you claim in the dashboard. Full walkthrough:
[PROVISIONING.md](PROVISIONING.md).

### Quick install (on a running Pi)

Boot to the desktop, get on the network, open a **Terminal as the `pi` user**
(**not** `sudo`), and run:

```bash
curl -fsSL https://raw.githubusercontent.com/jchette/PiSignage/main/apps/agent/deploy/install.sh | bash
```

You'll be prompted for the sudo password once (apt packages + autologin + linger);
everything else stays user-local. When it finishes, **reboot once** (`sudo reboot`)
so autologin and the hidden cursor take effect. **Re-running the same command
updates the agent** to the latest build.

The installer keeps a clean, user-local footprint (no `/opt`, no system service):

- installs **Node 22** at `~/.local/node` and clones the repo to `~/pisignage`
- builds and runs the agent as a **systemd _user_ service** that comes up at boot
  (Desktop Autologin + linger)
- installs `git`, Chromium, and `v4l-utils` (CEC via `cec-ctl`) only if missing
- disables screen blanking, hides the cursor for kiosk use, and persists logs

Logs: `systemctl --user status pisignage-agent` /
`journalctl --user -u pisignage-agent -f`.

### Flash-and-go (auto-install on first boot)

No SSH or typing on the Pi: Raspberry Pi Imager sets up the OS + network, and a
first-boot hook runs the installer for you. Imager username **must** be `pi`. See
[PROVISIONING.md](PROVISIONING.md) → _Method 2_.

> The kiosk launch command (`PISIGNAGE_KIOSK_CMD`), the CEC device, and the
> server URL (`PISIGNAGE_SERVER`) are all auto-detected/defaulted and overridable
> via env vars.

## Roadmap

- **Phase 0 ✅** Monorepo scaffold, shared protocol, local dev loop.
- **Phase 1 ✅** Pair a Pi, push a URL, live online status — end to end.
- **Phase 2 ✅** HDMI-CEC TV on/off + reboot (validated on a Pi 5 → Samsung TV).
- **Phase 3 ✅** Device groups + scheduler (content changes + TV power windows).
- **Health monitoring ✅** Per-device CPU temp, uptime, memory, disk, and
  undervoltage/throttle, surfaced on the dashboard.
- **Provisioning ✅** Hardened `curl | bash` installer + flash-and-go first-boot
  setup (see [PROVISIONING.md](PROVISIONING.md)).
- **Per-TV zoom ✅** Chromium device-scale-factor per device — fixes tiny
  content on 4K panels.
- **Agent auto-update ✅** Opt-in per device from the dashboard; the agent
  periodically pulls, rebuilds, and restarts itself (off by default).
- **Next** Email offline alerting and optional digital media content
  (images/video/playlists).

## The wire protocol

Defined in `packages/shared/src/protocol.ts`. Device→server events: `hello`,
`heartbeat`, `ack`. Server→device commands: `set_content` (carries `zoom`),
`tv_power`, `reboot`, `refresh`, `ping`, `set_auto_update`. Pairing is plain
HTTPS (the device has no token yet).
