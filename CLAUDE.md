# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

npm workspaces monorepo (Node >=20, no pnpm/Docker). `packages/shared` must be
built before `apps/agent` or `apps/server` will typecheck/build — they import
its compiled `dist/`, not the TS source, via a workspace symlink:

```bash
npm install
npm run build:shared            # required before building/typechecking agent or server
npm run build                   # build all workspaces
npm run lint                    # eslint . --ext .ts,.tsx (root-level, whole repo)
npm run format                  # prettier --write across the repo
```

Per-workspace dev servers (each needs its own `.env`, copied from `.env.example`):

```bash
npm run dev:server      # apps/server   -> http://localhost:4000
npm run dev:dashboard   # apps/dashboard -> http://localhost:5173 (proxies /api)
npm run dev:agent       # apps/agent    -> console-logs instead of launching Chromium on non-Linux
```

Database (`apps/server`, Turso/libSQL via Drizzle):

```bash
npm run db:push -w @pisignage/server   # applies schema.ts directly — NO committed migration files
npm run db:seed -w @pisignage/server   # creates org + admin user
```

**No test suite exists in this repo.** There's nothing to run for tests.

### Gotchas specific to this repo's environment

- `apps/server/.env` defaults `DATABASE_URL` to a local SQLite file
  (`file:./local.db`). Running `db:push` without overriding `DATABASE_URL`
  (and `DATABASE_AUTH_TOKEN`) targets that local file, **not** the production
  Turso database — "No changes detected" from a `db:push` you expected to
  change something is a strong sign it just hit the wrong DB. To push
  production schema changes, set both env vars inline for that one command
  (values live in Railway's dashboard → server service → Variables) or use
  `railway run npm run db:push -w @pisignage/server`.
- If this working copy lives inside a cloud-synced folder (e.g. Synology
  Drive), git operations can transiently fail with `unable to append to
  '.git/logs/...'` because the sync client briefly locks the file. Just retry
  the command — don't change git config to work around it.
- Railway (hosting) has **Watch Paths** configured on the service, so a push
  only auto-deploys if it touches `apps/server/**`, `apps/dashboard/**`, or
  `packages/shared/**`. A push that only touches `apps/agent/**` or root docs
  (README, CLAUDE.md) gets silently skipped — Railway shows "no changes to
  watched files" on the deployment if you check. That's expected, not a
  problem to fix, since none of those paths affect what `railway.toml`
  builds/runs. If a deploy is unexpectedly skipped despite touching a watched
  path, or you need to force one, use the dashboard's manual deploy trigger.

## Architecture

```
 React Dashboard  ──HTTPS──▶  Cloud Control Plane  ◀──WSS──  Pi Agent ──▶ Chromium kiosk
 (browser)        ◀──SSE───   (Node/Fastify + Turso)  cmds            │   libcec ──▶ TV
```

Four workspaces: `packages/shared` (wire-protocol Zod schemas/types, used by
both `apps/server` and `apps/agent`), `apps/server` (Fastify API + WS device
gateway + SSE + DB), `apps/dashboard` (React/Vite admin UI, no router, no
state library — just `useState`/`useEffect` in `Dashboard.tsx`), `apps/agent`
(runs on each Pi).

**Devices are behind NAT.** Each Pi holds one persistent *outbound* WebSocket
to the server (`apps/agent/src/agent.ts` ↔ `apps/server/src/ws/gateway.ts`);
all control flows down that socket, nothing is pushed in from outside. The
server is single-instance (in-memory device registry in `ws/registry.ts` +
SSE fan-out in `events.ts`) — horizontal scaling later means backing those
with Redis pub/sub.

**Wire protocol** (`packages/shared/src/protocol.ts`) is the contract both
sides parse against with `safeParse` — unknown fields are silently dropped,
not rejected, which matters when agent and server are on different commits
(e.g. mid-rollout, one side may not know about a field the other sends).
Device→server: `hello`, `heartbeat` (health metrics + current content),
`ack`. Server→device: `set_content`, `tv_power`, `tv_volume`, `reboot`,
`refresh`, `ping`, `set_auto_update`.

**Server-side device control** funnels through `apps/server/src/services/control.ts`
(`applyContent`, `applyZoom`, `applyTvPower`, etc.) — shared by both the REST
routes (`routes/devices.ts`, `routes/groups.ts`) and `scheduler.ts` (an
edge-triggered ticker that fires `schedules` DB rows at their configured
time/weekday, deduped by `lastFiredKey`). All of these write the desired
state to the `devices` row *and* push a WS command if the device is
connected — the row is the source of truth; the WS message is best-effort
delivery, backed by the fact that `gateway.ts` replays the device's current
`content`/`autoUpdate` on every socket reconnect.

**Agent-side display** (`apps/agent/src/display/chromium.ts`) launches
Chromium in `--kiosk` mode as a detached child process it can kill as a
group. `ChromiumDisplay.show()` intentionally *skips* the kill+relaunch when
the requested URL/zoom already match what's running — added because a WS
reconnect replays `set_content` unconditionally (see above), and without the
skip that flashes the kiosk and resets any client-side state the loaded page
was keeping. A crashed Chromium process is auto-respawned after a fixed
delay (`RESPAWN_DELAY_MS`). `showPairingCode`/`refresh` bypass the skip
logic deliberately — they're explicit actions that should always reload.

**Fleet lifecycle has two independent update mechanisms**, don't conflate
them:
- *App-level*: `apps/agent/src/self-update.ts` + `deploy/self-update.sh` —
  opt-in per device (`autoUpdate` column/`set_auto_update` command), git
  force-syncs to `origin/main`, rebuilds, exits for systemd to restart.
- *OS-level*: `unattended-upgrades`, configured by `install.sh` from the
  config shipped at `apps/agent/deploy/52pisignage-unattended-upgrades` —
  security-only patches, daily check, synchronized 3 AM reboot across the
  fleet (not staggered — see README § Security updates for why). Agent
  reports `osUpdateCheckedAt`/`rebootPending` (probed from
  `/var/lib/apt/periodic/update-success-stamp` and `/run/reboot-required` in
  `apps/agent/src/metrics.ts`) up through the heartbeat.

**Provisioning** (`apps/agent/deploy/install.sh`) is the single source of
truth for setting up a Pi — idempotent, safe to re-run to update. It's driven
either manually (curl one-liner) or via `firstrun-pisignage.sh`, which just
installs a one-shot systemd unit that runs the same installer on first boot.
Full walkthrough in `PROVISIONING.md`.

**Dashboard types are hand-mirrored, not shared.** `apps/dashboard/src/api.ts`
defines `Device`/`DeviceMetrics` by hand to match
`apps/server/src/serialize.ts`'s `serializeDevice` output — there's no
generated/shared type between server and dashboard, so a new field on one
side needs a matching manual edit on the other. Live updates use SSE
(`events.ts` → `openEventStream`) purely as a refetch trigger — the dashboard
never inspects the event payload, it just re-calls `listDevices()`.
