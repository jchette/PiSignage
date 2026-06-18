import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { deviceRoutes } from './routes/devices.js';
import { groupRoutes } from './routes/groups.js';
import { orgRoutes } from './routes/org.js';
import { pairingRoutes } from './routes/pairing.js';
import { scheduleRoutes } from './routes/schedules.js';
import { userRoutes } from './routes/users.js';
import { registerDeviceGateway } from './ws/gateway.js';

// Built dashboard lives at apps/dashboard/dist; this file runs from apps/server/dist.
const dashboardDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../dashboard/dist');

export async function buildApp() {
  const app = Fastify({
    // Behind Railway's proxy req.ip is the proxy unless we trust X-Forwarded-For;
    // without this the rate limiter would bucket every client together.
    trustProxy: true,
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    },
  });

  await app.register(cors, { origin: config.corsOrigins, credentials: true });
  await app.register(websocket);
  // Opt-in only: routes enable throttling via `config.rateLimit` (see auth routes).
  // Global stays off so device WS/SSE and dashboard polling aren't throttled.
  await app.register(rateLimit, { global: false });

  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  await app.register(authRoutes);
  await app.register(pairingRoutes);
  await app.register(deviceRoutes);
  await app.register(groupRoutes);
  await app.register(scheduleRoutes);
  await app.register(userRoutes);
  await app.register(orgRoutes);
  await app.register(registerDeviceGateway);

  // Serve the built React dashboard from the same origin (no CORS, single deploy).
  // Skipped in local dev when the dashboard hasn't been built (Vite serves it on :5173).
  if (existsSync(dashboardDist)) {
    await app.register(fastifyStatic, { root: dashboardDist });

    // SPA fallback: any non-API/non-WS GET that didn't match a file returns index.html
    // so client-side routing works on deep links / refresh.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/ws')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not_found' });
    });
    app.log.info(`Serving dashboard from ${dashboardDist}`);
  } else {
    app.log.warn(`Dashboard build not found at ${dashboardDist}; static UI disabled`);
  }

  return app;
}
