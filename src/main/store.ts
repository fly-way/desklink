import fs from 'node:fs';
import path from 'node:path';
import { protectSecret, unprotectSecret } from './secrets.js';
import type { UnityCapabilityId, UnityCapabilityMode } from '../shared/types.js';

export type UnityProjectMode = 'auto' | 'manual' | 'disabled';

export type UnityProjectPreference = {
  mode: UnityProjectMode;
  installationApproved: boolean;
  packageVersion?: string;
};

export type AppConfig = {
  tunnelId: string;
  mcpPort: number;
  healthPort: number;
  /** Optional outbound proxy for tunnel-client, e.g. "7897" or "http://127.0.0.1:7897". */
  proxy?: string;
  unityProjects?: Record<string, UnityProjectPreference>;
  unityCapabilities?: Partial<Record<UnityCapabilityId, UnityCapabilityMode>>;
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

  getUnityProjectPreference(projectPath: string): UnityProjectPreference | undefined {
    return this.config.unityProjects?.[this.unityProjectKey(projectPath)];
  }

  saveUnityProjectPreference(projectPath: string, value: Partial<UnityProjectPreference>): UnityProjectPreference {
    const key = this.unityProjectKey(projectPath);
    const current = this.getUnityProjectPreference(projectPath) ?? { mode: 'auto', installationApproved: false };
    const next = { ...current, ...value };
    this.saveConfig({ unityProjects: { ...(this.config.unityProjects ?? {}), [key]: next } });
    return next;
  }

  getUnityCapabilityMode(id: UnityCapabilityId): UnityCapabilityMode | undefined {
    return this.config.unityCapabilities?.[id];
  }

  saveUnityCapabilityMode(id: UnityCapabilityId, mode: UnityCapabilityMode): void {
    this.saveConfig({ unityCapabilities: { ...(this.config.unityCapabilities ?? {}), [id]: mode } });
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

  private unityProjectKey(projectPath: string): string {
    const normalized = path.resolve(projectPath).replace(/[\\/]+$/, '');
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  }
}
