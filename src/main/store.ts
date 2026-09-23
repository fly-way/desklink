import fs from 'node:fs';
import path from 'node:path';
import { protectSecret, unprotectSecret } from './secrets.js';

export type AppConfig = {
  tunnelId: string;
  mcpPort: number;
  healthPort: number;
  /** Optional outbound proxy for tunnel-client, e.g. "7897" or "http://127.0.0.1:7897". */
  proxy?: string;
};

// 47933/47934 keep DeskLink clear of the 47831-47834 range used by RDC-X.
const DEFAULTS: AppConfig = { tunnelId: '', mcpPort: 47933, healthPort: 47934 };

/** Private runtime state lives in <root>/.desklink and is never sent anywhere. */
export class Store {
  readonly dir: string;
  readonly toolsDir: string;

  constructor(private readonly root: string) {
    this.dir = path.join(root, '.desklink');
    this.toolsDir = path.join(root, 'tools');
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(this.toolsDir, { recursive: true });
  }

  private file(name: string): string {
    return path.join(this.dir, name);
  }

  get config(): AppConfig {
    try {
      return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(this.file('config.json'), 'utf8')) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  saveConfig(value: Partial<AppConfig>): AppConfig {
    const next = { ...this.config, ...value };
    fs.writeFileSync(this.file('config.json'), JSON.stringify(next, null, 2), { mode: 0o600 });
    return next;
  }

  get tunnelId(): string {
    return this.config.tunnelId;
  }

  hasApiKey(): boolean {
    return fs.existsSync(this.file('tunnel-key.dpapi'));
  }

  setApiKey(value: string): void {
    fs.writeFileSync(this.file('tunnel-key.dpapi'), protectSecret(value), { mode: 0o600 });
  }

  getApiKey(): string {
    if (!this.hasApiKey()) return '';
    return unprotectSecret(fs.readFileSync(this.file('tunnel-key.dpapi'), 'utf8'));
  }

  clearApiKey(): void {
    fs.rmSync(this.file('tunnel-key.dpapi'), { force: true });
  }
}
