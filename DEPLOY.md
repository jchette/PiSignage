# Deploying PiSignage to the cloud (Railway + Turso)

This deploys the **server** (Fastify) to Railway. The server also serves the built
**React dashboard** from the same origin, so there's one URL and one deploy — no CORS,
no separate static host. Devices (Pis) hold a persistent outbound `wss://` connection
to the same domain at `/ws/device`.

Prerequisites: a [Railway](https://railway.app) account, a [Turso](https://turso.tech)
account, the [Turso CLI](https://docs.turso.tech/cli/installation), and this repo pushed
to GitHub (already at `github.com/jchette/PiSignage`).

---

## 1. Create the Turso production database

```bash
turso auth login
turso db create pisignage          # pick a name; region near your business
turso db show pisignage --url      # -> libsql://pisignage-<org>.turso.io   (DATABASE_URL)
turso db tokens create pisignage   # -> long token string                  (DATABASE_AUTH_TOKEN)
```

Keep the URL and token handy for steps 2 and 3.

## 2. Push the schema + seed the admin (run once, from your machine)

Drizzle reads `DATABASE_URL` / `DATABASE_AUTH_TOKEN` from the environment, so point them
at Turso for these two commands. The seed also needs `JWT_SECRET`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `ORG_NAME` set (any value for the secret here — the real one lives on
Railway).

PowerShell (from the repo root):

```powershell
$env:DATABASE_URL="libsql://pisignage-<org>.turso.io"
$env:DATABASE_AUTH_TOKEN="<token>"
$env:JWT_SECRET="temp-for-seeding"
$env:ADMIN_EMAIL="you@yourbusiness.com"
$env:ADMIN_PASSWORD="<a-real-password>"
$env:ORG_NAME="Your Business"

npm run db:push  -w @pisignage/server   # create tables in Turso
npm run db:seed  -w @pisignage/server   # create org + admin user
```

(Re-running `db:seed` later just updates the admin password — safe.)

## 3. Create the Railway service

1. Railway → **New Project** → **Deploy from GitHub repo** → pick `jchette/PiSignage`.
2. Railway reads `railway.toml` automatically (Nixpacks build, `/health` healthcheck,
   start = the server). No Dockerfile needed.
3. **Variables** → add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `libsql://pisignage-<org>.turso.io` |
   | `DATABASE_AUTH_TOKEN` | `<token from step 1>` |
   | `JWT_SECRET` | a long random string (e.g. `openssl rand -hex 32`) |
   | `ADMIN_EMAIL` | same as you seeded |
   | `ADMIN_PASSWORD` | same as you seeded |
   | `ORG_NAME` | your org name |
   | `NODE_ENV` | `production` |
   | `PUBLIC_BASE_URL` | the Railway URL (fill after step 4) |

   `PORT` is injected by Railway automatically — don't set it. `CORS_ORIGINS` is not
   needed while the dashboard is same-origin.

4. **Settings → Networking → Generate Domain**. You get e.g.
   `https://pisignage-production.up.railway.app`. Put that into `PUBLIC_BASE_URL` and
   redeploy.

## 4. Verify the deploy

```bash
curl https://<your-app>.up.railway.app/health        # {"ok":true,...}
```

Open `https://<your-app>.up.railway.app/` in a browser → the dashboard loads → log in
with the seeded admin credentials.

## 5. Repoint the Pi agent at the cloud

On the test Pi (`pisignage-01`, 192.168.1.82), edit the agent env so it connects to the
cloud over `wss://` instead of the LAN dev server. The agent turns `https://…` into
`wss://…/ws/device` automatically.

```bash
# in ~/pisignage/apps/agent/.env on the Pi
PISIGNAGE_SERVER=https://<your-app>.up.railway.app
```

Then restart the user service and watch it reconnect:

```bash
systemctl --user restart pisignage-agent
journalctl --user -u pisignage-agent -f
```

The Pi was already claimed in the dev DB, but this is a **fresh Turso DB**, so it will
need to pair again: the agent shows an on-screen pairing code → claim it in the cloud
dashboard → push a URL → confirm fullscreen Chromium. After a reboot it should auto-
restore unattended, same as on the LAN.

---

## Notes

- **Cold starts**: Railway has no sleep on its paid usage plan, so the WS stays up. (If
  you ever move to a free/idling tier, the Pi's reconnect loop handles drops anyway.)
- **Node version**: `.nvmrc` pins Node 22 for the Railway build (production parity with
  the Pi).
- **Redeploys**: every push to `main` triggers a Railway build. The schema is managed
  separately via `db:push` (step 2) — re-run it after any schema change.
