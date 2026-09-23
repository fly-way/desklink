import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { NodeRuntime } from './node.js';
import type { Store } from './store.js';

const PACKAGE = '@wonderwhy-er/desktop-commander';
const SPEC = `${PACKAGE}@latest`;

/**
 * Installs Desktop Commander into the app data directory and runs it directly with Node.
 * Falls back to `npx` when no usable Node runtime is present yet.
 */
export class CommanderRuntime {
  constructor(
    private readonly store: Store,
    private readonly node: NodeRuntime,
    private readonly onLog: (line: string) => void
  ) {}

  get installDir(): string {
    return path.join(this.store.dir, 'commander');
  }

  get installedVersion(): string {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(this.installDir, 'node_modules', PACKAGE, 'package.json'), 'utf8'));
      return String(pkg.version ?? '');
    } catch {
      return '';
    }
  }

  /** Resolves the package entry point from its own package.json. */
  entry(): string {
    const base = path.join(this.installDir, 'node_modules', PACKAGE);
    const manifest = path.join(base, 'package.json');
    if (!fs.existsSync(manifest)) return '';
    const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const bin = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin ?? {})[0];
    const main = pkg.main ?? 'dist/index.js';
    const relative = String(bin ?? main).replace(/^\.\//, '');
    return path.join(base, relative);
  }

  prepare(): { command: string; args: string[] } {
    const node = this.node.status();
    const entry = this.entry();
    if (node.satisfies && fs.existsSync(entry)) return { command: node.executable, args: [entry] };
    // No Node yet: let npx resolve it from PATH.
    return { command: process.platform === 'win32' ? 'npx.cmd' : 'npx', args: ['-y', SPEC] };
  }

  async ensureInstalled(): Promise<boolean> {
    const node = this.node.status();
    if (!node.satisfies || !node.npmCli) return false;
    if (fs.existsSync(this.entry())) return true;

    fs.mkdirSync(this.installDir, { recursive: true });
    this.onLog(`正在安装 Desktop Commander（${SPEC}）…\n`);
    const result = spawnSync(node.executable, [node.npmCli, 'install', SPEC, '--no-audit', '--no-fund', '--loglevel', 'error'], {
      cwd: this.installDir,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 300000
    });
    if (result.status !== 0) {
      this.onLog(`Desktop Commander 安装失败：${String(result.stderr || result.stdout || '').trim().slice(0, 400)}\n`);
      return false;
    }
    this.onLog(`Desktop Commander ${this.installedVersion} 已安装。\n`);
    return true;
  }

  /** Reinstalls at `latest`, used by the "restart to apply update" action. */
  async update(): Promise<boolean> {
    fs.rmSync(path.join(this.installDir, 'node_modules'), { recursive: true, force: true });
    return this.ensureInstalled();
  }

  latestVersion(): string {
    const node = this.node.status();
    if (node.satisfies && node.npmCli) {
      const result = spawnSync(node.executable, [node.npmCli, 'view', PACKAGE, 'version'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 30000
      });
      const value = String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
      if (/^\d+\.\d+\.\d+/.test(value)) return value;
    }
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npm, ['view', PACKAGE, 'version'], { encoding: 'utf8', windowsHide: true, timeout: 30000, shell: true });
    return String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
  }
}
