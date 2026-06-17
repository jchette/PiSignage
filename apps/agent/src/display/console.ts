import type { Content } from '@pisignage/shared';
import type { Display } from './index.js';

/** Dev backend: prints what a real screen would show. Lets us test the agent
 *  on a laptop without a Pi or a browser. */
export class ConsoleDisplay implements Display {
  private current: Content | null = null;

  async show(content: Content): Promise<void> {
    this.current = content;
    if (content.type === 'url') {
      console.log(`\n[DISPLAY] ▶ showing URL: ${content.url}\n`);
    } else {
      console.log(`\n[DISPLAY] ▶ blank screen\n`);
    }
  }

  async refresh(): Promise<void> {
    console.log(`[DISPLAY] ⟳ refresh (${this.current?.type === 'url' ? this.current.url : 'blank'})`);
  }

  async showPairingCode(code: string, serverUrl: string): Promise<void> {
    console.log('\n========================================');
    console.log('  PAIRING REQUIRED');
    console.log(`  Server: ${serverUrl}`);
    console.log(`  Enter this code in the dashboard:`);
    console.log(`\n        >>>  ${code}  <<<\n`);
    console.log('========================================\n');
  }
}
