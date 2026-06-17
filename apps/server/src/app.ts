import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { deviceRoutes } from './routes/devices.js';
import { pairingRoutes } from './routes/pairing.js';
import { registerDeviceGateway } from './ws/gateway.js';

export async function buildApp() {
  const app = Fastify({
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

  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  await app.register(authRoutes);
  await app.register(pairingRoutes);
  await app.register(deviceRoutes);
  await app.register(registerDeviceGateway);

  return app;
}
