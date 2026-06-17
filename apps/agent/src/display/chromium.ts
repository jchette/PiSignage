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
export class ChromiumDisplay implements Display {
  private child: ChildProcess | null = null;
  private currentContent: Content | null = null;

  async show(content: Content): Promise<void> {
    this.currentContent = content;
    if (content.type === 'blank') {
      this.kill();
      return;
    }
    this.launchUrl(content.url);
  }

  async refresh(): Promise<void> {
    if (this.currentContent?.type === 'url') {
      this.launchUrl(this.currentContent.url);
    }
  }

  async showPairingCode(code: string, serverUrl: string): Promise<void> {
    const file = this.writePairingPage(code, serverUrl);
    this.launchUrl(`file://${file}`);
  }

  private launchUrl(url: string): void {
    this.kill();
    const cmd = config.kioskCmd.replace('{url}', url);
    // Launch via shell (so the command template works as written) and detached,
    // which puts chromium in its own process group we can kill wholesale.
    this.child = spawn(cmd, { shell: true, detached: true, stdio: 'inherit' });
    this.child.on('exit', (code) => {
      if (code && code !== 0) {
        console.error(`[kiosk] browser exited with code ${code}`);
      }
    });
  }

  private kill(): void {
    if (this.child?.pid) {
      try {
        // Negative pid signals the whole process group (shell + chromium tree).
        process.kill(-this.child.pid, 'SIGTERM');
      } catch {
        try {
          this.child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      }
      this.child = null;
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
