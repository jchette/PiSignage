# PiSignage

Cloud-controlled Raspberry Pi digital signage. Each Pi drives a TV (currently a
URL per screen), controlled from a web dashboard, with grouping, scheduling, and
HDMI-CEC TV power on the roadmap.

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
- Hosting target: managed PaaS (Render/Railway).

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

## Deploying the agent to a Pi (Phase 1 — tuned live on hardware)

```bash
# On the Pi (Raspberry Pi OS Bookworm):
curl -fsSL <server>/install.sh | sudo PISIGNAGE_SERVER=https://your-server bash
```

Installs Node + Chromium + `cec-utils` + `cage`, deploys the agent to
`/opt/pisignage-agent`, writes config to `/etc/pisignage`, and runs it as a
systemd service. A pairing code appears on the TV. See
`apps/agent/deploy/` for the unit file and installer.

> The exact kiosk launch command (`PISIGNAGE_KIOSK_CMD`) and the CEC invocation
> are finalized against a real Pi 5 — both are configurable via env.

## Roadmap

- **Phase 0 ✅** Monorepo scaffold, shared protocol, local dev loop.
- **Phase 1 ✅** Pair a Pi, push a URL, live online status — end to end.
- **Phase 2** HDMI-CEC TV on/off, reboot, screenshot-on-demand (validated on Pi 5).
- **Phase 3** Device groups + scheduler (content changes + TV power windows).
- **Phase 4** Agent self-update, `curl | bash` hardening, flashable SD image.
- **Phase 5** Digital media content (images/video/playlists) with local cache.

## The wire protocol

Defined in `packages/shared/src/protocol.ts`. Device→server events: `hello`,
`heartbeat`, `ack`. Server→device commands: `set_content`, `tv_power`, `reboot`,
`refresh`, `ping`. Pairing is plain HTTPS (the device has no token yet).
