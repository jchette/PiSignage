import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

interface AgentState {
  deviceToken: string;
  deviceId: string;
}

const stateFile = path.join(config.stateDir, 'device.json');

export function loadState(): AgentState | null {
  try {
    const raw = fs.readFileSync(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.deviceToken && parsed.deviceId) return parsed as AgentState;
    return null;
  } catch {
    return null;
  }
}

export function saveState(state: AgentState): void {
  fs.mkdirSync(config.stateDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
}
