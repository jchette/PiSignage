import WebSocket from 'ws';
import { parseServerMessage, type Content, type DeviceMessage, type TvState } from '@pisignage/shared';
import { setTvPower } from './cec.js';
import { config, wsUrl } from './config.js';
import type { Display } from './display/index.js';

/**
 * Maintains the persistent outbound WebSocket to the cloud: sends hello +
 * heartbeats, executes commands on the display/CEC, and reconnects with
 * exponential backoff so a Pi rides out network blips unattended.
 */
export class Agent {
  private ws: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 1000;
  private currentContent: Content | null = null;
  private tvState: TvState = 'unknown';
  private stopped = false;

  constructor(
    private readonly token: string,
    private readonly display: Display,
  ) {}

  start(): void {
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearHeartbeat();
    this.ws?.close();
  }

  private connect(): void {
    if (this.stopped) return;
    console.log(`[agent] connecting to ${config.server} …`);
    const ws = new WebSocket(wsUrl(this.token));
    this.ws = ws;

    ws.on('open', () => {
      console.log('[agent] connected');
      this.reconnectDelay = 1000;
      this.send({
        t: 'hello',
        protocol: 1,
        agentVersion: config.agentVersion,
        model: process.env.PISIGNAGE_MODEL,
        os: process.platform,
      });
      this.sendHeartbeat();
      this.startHeartbeat();
    });

    ws.on('message', (raw) => this.onMessage(raw.toString()));
    ws.on('close', () => this.onClose());
    ws.on('error', (err) => console.error(`[agent] ws error: ${err.message}`));
  }

  private onClose(): void {
    this.clearHeartbeat();
    if (this.stopped) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    console.log(`[agent] disconnected; reconnecting in ${delay}ms`);
    setTimeout(() => this.connect(), delay);
  }

  private async onMessage(raw: string): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    const msg = parseServerMessage(json);
    if (!msg) return;

    switch (msg.t) {
      case 'set_content':
        this.currentContent = msg.content;
        await this.display.show(msg.content);
        if (msg.commandId !== 'initial') this.ack(msg.commandId, true);
        break;
      case 'refresh':
        await this.display.refresh();
        this.ack(msg.commandId, true);
        break;
      case 'tv_power':
        this.tvState = await setTvPower(msg.on);
        this.ack(msg.commandId, true);
        this.sendHeartbeat();
        break;
      case 'reboot':
        this.ack(msg.commandId, true);
        this.reboot();
        break;
      case 'ping':
        this.sendHeartbeat();
        break;
    }
  }

  private reboot(): void {
    if (process.platform !== 'linux') {
      console.log('[agent] (dev) would reboot now');
      return;
    }
    import('node:child_process').then(({ exec }) => exec('sudo reboot'));
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), config.heartbeatMs);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendHeartbeat(): void {
    this.send({
      t: 'heartbeat',
      currentContent: this.currentContent,
      tvState: this.tvState,
      uptimeSec: Math.round(process.uptime()),
      agentVersion: config.agentVersion,
    });
  }

  private ack(commandId: string, ok: boolean, error?: string): void {
    this.send({ t: 'ack', commandId, ok, error });
  }

  private send(msg: DeviceMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
