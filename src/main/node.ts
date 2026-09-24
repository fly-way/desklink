import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Store } from './store.js';
import { tm } from './i18n.js';
import type { NodeStatus } from '../shared/types.js';

const MIN_MAJOR = 18; // Desktop Commander declares engines.node >= 18
const DIST_INDEX = 'https://nodejs.org/dist/latest-v22.x/';

function powershell(script: string): void {
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(String(result.stderr || 'PowerShell failed.').trim().slice(0, 300));
}

/** Provides the Node runtime Desktop Commander needs, downloading an official build on request. */
export class NodeRuntime {
  constructor(private readonly store: Store) {}

  /** Bundled runtime directory, e.g. <userData>\tools\node\node.exe */
  get bundledExecutable(): string {
    return path.join(this.store.toolsDir, 'node', 'node.exe');
  }

  get bundledNpmCli(): string {
    return path.join(this.store.toolsDir, 'node', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  }

  private readVersion(executable: string): string {
    if (!fs.existsSync(executable)) return '';
    try {
      const result = spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
      return String(result.stdout || '').trim().replace(/^v/, '');
    } catch {
      return '';
    }
  }

  private systemCandidates(): string[] {
    try {
      const result = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['node'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000
      });
      return String(result.stdout || '')
        .trim().split(/\r?\n/).map(line => line.trim())
        .filter(line => line && fs.existsSync(line));
    } catch {
      return [];
    }
  }

  /** Many tools ship their own node.exe without npm; prefer one that actually has npm. */
  private systemExecutable(): string {
    const candidates = this.systemCandidates();
    if (!candidates.length) return '';
    return candidates.find(candidate => fs.existsSync(this.npmCliNear(candidate))) ?? candidates[0];
  }

  private npmCliNear(executable: string): string {
    const candidate = path.join(path.dirname(executable), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    return fs.existsSync(candidate) ? candidate : '';
  }

  status(): NodeStatus {
    const bundled = this.bundledExecutable;
    const bundledVersion = this.readVersion(bundled);
    if (bundledVersion) {
      return {
        available: true,
        source: 'bundled',
        executable: bundled,
        npmCli: this.bundledNpmCli,
        version: bundledVersion,
        satisfies: Number(bundledVersion.split('.')[0]) >= MIN_MAJOR
      };
    }

    const systemPath = this.systemExecutable();
    const systemVersion = systemPath ? this.readVersion(systemPath) : '';
    if (systemVersion) {
      return {
        available: true,
        source: 'system',
        executable: systemPath,
        npmCli: this.npmCliNear(systemPath),
        version: systemVersion,
        satisfies: Number(systemVersion.split('.')[0]) >= MIN_MAJOR
      };
    }

    return { available: false, source: 'none', executable: '', npmCli: '', version: '', satisfies: false };
  }

  /** Downloads the official Windows x64 build into <userData>\tools\node. */
  async install(onLog: (line: string) => void = () => {}): Promise<NodeStatus> {
    if (process.platform !== 'win32') throw new Error(tm('errNodeWindowsOnly'));

    const listing = await fetch(DIST_INDEX).then(response => response.text());
    const match = /node-v(\d+\.\d+\.\d+)-win-x64\.zip/.exec(listing);
    if (!match) throw new Error(tm('errNodeResolveFailed'));
    const zipName = match[0];
    const version = match[1];

    onLog(tm('logDownloadNode', { version }) + '\n');
    const zip = Buffer.from(await fetch(`${DIST_INDEX}${zipName}`).then(response => response.arrayBuffer()) as ArrayBuffer);
    const sums = await fetch(`${DIST_INDEX}SHASUMS256.txt`).then(response => response.text());
    const expected = sums.split(/\r?\n/)
      .map(line => line.trim().split(/\s+/))
      .find(([, name]) => name === zipName)?.[0];
    const actual = createHash('sha256').update(zip).digest('hex');
    if (expected && expected.toLowerCase() !== actual) throw new Error(tm('errNodeChecksum'));

    const zipPath = path.join(this.store.toolsDir, zipName);
    fs.writeFileSync(zipPath, zip);

    const target = path.join(this.store.toolsDir, 'node');
    fs.rmSync(target, { recursive: true, force: true });
    powershell(`Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${this.store.toolsDir}' -Force`);
    fs.rmSync(zipPath, { force: true });

    const extracted = path.join(this.store.toolsDir, `node-v${version}-win-x64`);
    if (fs.existsSync(extracted)) fs.renameSync(extracted, target);

    const installed = this.status();
    if (!installed.available) throw new Error(tm('errNodeUnusable'));
    onLog(tm('logNodeReady', { version: installed.version }) + '\n');
    return installed;
  }
}
