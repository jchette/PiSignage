import { buildApp } from './app.js';
import { config } from './config.js';
import { startScheduler } from './scheduler.js';

const app = await buildApp();

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  startScheduler();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
