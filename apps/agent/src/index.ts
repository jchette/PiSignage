import { Agent } from './agent.js';
import { config } from './config.js';
import { createDisplay } from './display/index.js';
import { runPairing } from './pairing.js';
import { loadState } from './state.js';

async function main(): Promise<void> {
  console.log(`[agent] PiSignage agent v${config.agentVersion}`);
  console.log(`[agent] server: ${config.server}`);
  console.log(`[agent] state dir: ${config.stateDir}`);

  const display = createDisplay();

  // Pair on first run (no saved token), then connect.
  let state = loadState();
  if (!state) {
    console.log('[agent] no saved device token — starting pairing');
    state = await runPairing(display);
  } else {
    console.log(`[agent] resuming as device ${state.deviceId}`);
  }

  const agent = new Agent(state.deviceToken, display);
  agent.start();

  const shutdown = () => {
    console.log('\n[agent] shutting down');
    agent.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[agent] fatal:', err);
  process.exit(1);
});
