import { buildApp } from './app.js';
import { config } from './config.js';
import { startScheduler } from './scheduler.js';
import { nowInTz } from './time.js';

const app = await buildApp();

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  startScheduler();
  startRestartTimer();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Checked once a minute rather than computed as a one-shot delay so DST
// transitions in `config.restartTimezone` are handled for free.
function startRestartTimer(): void {
  setInterval(() => {
    if (nowInTz(config.restartTimezone).hhmm !== config.restartAtLocalTime) return;
    app.log.info('scheduled restart: closing and exiting for Railway to restart');
    app
      .close()
      .catch((err) => app.log.error(err, 'error during scheduled-restart shutdown'))
      .finally(() => process.exit(0));
  }, 60_000).unref();
}
