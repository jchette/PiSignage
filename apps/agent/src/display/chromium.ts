import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Content } from '@pisignage/shared';
import { config } from '../config.js';
import type { Display } from './index.js';

/**
 * Pi kiosk backend. Launches the configured kiosk command (Chromium under
 * Wayland, optionally wrapped in `cage`) pointed at a URL. Swapping content
 * relaunches the browser — simple and robust for Phase 1; we can move to
 * remote-debugging-port navigation later to avoid the flash.
 *
 * NOTE: the exact kiosk command is tuned live on the Pi 5 (PISIGNAGE_KIOSK_CMD).
 */
/** Delay before relaunching a crashed kiosk browser (mild throttle vs. hot-loop). */
const RESPAWN_DELAY_MS = 3000;

export class ChromiumDisplay implements Display {
  private child: ChildProcess | null = null;
  private currentContent: Content | null = null;
  private currentZoom = 1;

  async show(content: Content, zoom = 1): Promise<void> {
    this.currentContent = content;
    this.currentZoom = zoom;
    if (content.type === 'blank') {
      this.kill();
      return;
    }
    this.launchUrl(content.url, zoom);
  }

  async refresh(): Promise<void> {
    if (this.currentContent?.type === 'url') {
      this.launchUrl(this.currentContent.url, this.currentZoom);
    }
  }

  async showPairingCode(code: string, serverUrl: string): Promise<void> {
    const file = this.writePairingPage(code, serverUrl);
    this.launchUrl(`file://${file}`, 1);
  }

  private launchUrl(url: string, zoom: number): void {
    this.kill();
    // A device-scale-factor other than 1 goes in as a Chromium flag ahead of the
    // URL — valid anywhere before the trailing positional URL argument, so it
    // works regardless of how a custom PISIGNAGE_KIOSK_CMD orders its flags.
    const target = zoom !== 1 ? `--force-device-scale-factor=${zoom} ${url}` : url;
    const cmd = config.kioskCmd.replace('{url}', target);
    // Launch via shell (so the command template works as written) and detached,
    // which puts chromium in its own process group we can kill wholesale.
    const child = spawn(cmd, { shell: true, detached: true, stdio: 'inherit' });
    this.child = child;
    child.on('exit', (code, signal) => {
      // If we've already moved on (relaunch/kill cleared or replaced this.child),
      // this exit was intentional — ignore it.
      if (this.child !== child) return;
      this.child = null;
      console.error(`[kiosk] browser exited unexpectedly (code=${code} signal=${signal})`);
      // 24/7 signage: respawn so a browser crash doesn't leave a black screen.
      if (this.currentContent?.type === 'url') {
        const respawnUrl = this.currentContent.url;
        const respawnZoom = this.currentZoom;
        setTimeout(() => {
          if (this.currentContent?.type === 'url' && this.currentContent.url === respawnUrl) {
            console.error('[kiosk] respawning browser');
            this.launchUrl(respawnUrl, respawnZoom);
          }
        }, RESPAWN_DELAY_MS);
      }
    });
  }

  private kill(): void {
    const child = this.child;
    const pid = child?.pid;
    if (child && pid) {
      // Clear the reference first so the exit handler treats this as intentional.
      this.child = null;
      try {
        // Negative pid signals the whole process group (shell + chromium tree).
        process.kill(-pid, 'SIGTERM');
      } catch {
        try {
          child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      }
    }
  }

  private writePairingPage(code: string, serverUrl: string): string {
    const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{height:100%;margin:0;background:#0b0f17;color:#e6ebf2;
    font-family:system-ui,sans-serif;display:grid;place-items:center}
  .box{text-align:center}
  .label{color:#8a97a8;font-size:2vw;margin-bottom:1vh}
  .code{font-size:14vw;font-weight:800;letter-spacing:0.1em;color:#4f8cff}
  .srv{color:#8a97a8;font-size:1.4vw;margin-top:3vh}
</style></head><body><div class="box">
  <div class="label">Enter this code in your PiSignage dashboard</div>
  <div class="code">${code}</div>
  <div class="srv">${serverUrl}</div>
</div></body></html>`;
    const file = path.join(config.stateDir, 'pairing.html');
    fs.mkdirSync(config.stateDir, { recursive: true });
    fs.writeFileSync(file, html);
    return file;
  }
}
