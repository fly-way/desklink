import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Store } from '../../store.js';

export type UvStatus = {
  available: boolean;
  source: 'bundled' | 'system' | 'none';
  executable: string;
  version: string;
};

const UV_RELEASE_API = 'https://api.github.com/repos/astral-sh/uv/releases/latest';
const UV_WINDOWS_ASSET = 'uv-x86_64-pc-windows-msvc.zip';

function findFile(root: string, fileName: string): string {
  if (!fs.existsSync(root)) return '';
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) return full;
    if (entry.isDirectory()) {
      const nested = findFile(full, fileName);
      if (nested) return nested;
    }
  }
  return '';
}
function runPowerShell(script: string): void {
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60000
  });
  if (result.status !== 0) throw new Error(String(result.stderr || 'PowerShell failed.').trim().slice(0, 500));
}

function psLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export class UvRuntime {
  constructor(
    private readonly store: Store,
    private readonly onLog: (line: string) => void
  ) {}

  get bundledExecutable(): string {
    return path.join(this.store.toolsDir, 'uv', 'uvx.exe');
  }

  environment(): Record<string, string> {
    return {
      UV_CACHE_DIR: path.join(this.store.dir, 'uv-cache'),
      UV_PYTHON_INSTALL_DIR: path.join(this.store.toolsDir, 'python')
    };
  }
  status(): UvStatus {
    const bundled = this.versionOf(this.bundledExecutable);
    if (bundled) return { available: true, source: 'bundled', executable: this.bundledExecutable, version: bundled };

    const system = this.systemExecutable();
    const systemVersion = this.versionOf(system);
    if (systemVersion) return { available: true, source: 'system', executable: system, version: systemVersion };
    return { available: false, source: 'none', executable: '', version: '' };
  }

  async ensureInstalled(): Promise<UvStatus> {
    const current = this.status();
    if (current.available) return current;
    return this.install();
  }

  async install(): Promise<UvStatus> {
    if (process.platform !== 'win32') throw new Error('Automatic uv installation currently supports Windows only.');
    this.onLog('Preparing uv for Unity MCP…\n');

    const releaseResponse = await fetch(UV_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DeskLink' }
    });
    if (!releaseResponse.ok) throw new Error(`Could not resolve uv release (${releaseResponse.status}).`);
    const release: any = await releaseResponse.json();
    const asset = (release?.assets ?? []).find((item: any) => item?.name === UV_WINDOWS_ASSET);
    if (!asset?.browser_download_url) throw new Error(`uv release asset ${UV_WINDOWS_ASSET} was not found.`);
    const zipResponse = await fetch(String(asset.browser_download_url));
    if (!zipResponse.ok) throw new Error(`Could not download uv (${zipResponse.status}).`);
    const zip = Buffer.from(await zipResponse.arrayBuffer());
    const digest = String(asset.digest ?? '');
    if (digest.startsWith('sha256:')) {
      const actual = createHash('sha256').update(zip).digest('hex');
      if (actual.toLowerCase() !== digest.slice(7).toLowerCase()) {
        throw new Error('uv release SHA-256 verification failed.');
      }
    }

    const target = path.join(this.store.toolsDir, 'uv');
    const temp = path.join(this.store.toolsDir, 'uv-download');
    const zipPath = path.join(this.store.toolsDir, UV_WINDOWS_ASSET);
    fs.rmSync(temp, { recursive: true, force: true });
    fs.mkdirSync(temp, { recursive: true });
    fs.writeFileSync(zipPath, zip);

    try {
      runPowerShell(`Expand-Archive -LiteralPath ${psLiteral(zipPath)} -DestinationPath ${psLiteral(temp)} -Force`);
      const uvx = findFile(temp, 'uvx.exe');
      const uv = findFile(temp, 'uv.exe');
      if (!uvx || !uv) throw new Error('Downloaded uv archive did not contain uv.exe and uvx.exe.');

      fs.rmSync(target, { recursive: true, force: true });
      fs.mkdirSync(target, { recursive: true });
      fs.copyFileSync(uvx, path.join(target, 'uvx.exe'));
      fs.copyFileSync(uv, path.join(target, 'uv.exe'));
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
      fs.rmSync(zipPath, { force: true });
    }

    const installed = this.status();
    if (!installed.available) throw new Error('uv was downloaded but is not runnable.');
    this.onLog(`uv ${installed.version} ready for Unity MCP.\n`);
    return installed;
  }
  private systemExecutable(): string {
    try {
      const result = spawnSync('where.exe', ['uvx'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000
      });
      return String(result.stdout || '').split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? '';
    } catch {
      return '';
    }
  }

  private versionOf(executable: string): string {
    if (!executable || !fs.existsSync(executable)) return '';
    try {
      const result = spawnSync(executable, ['--version'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000
      });
      if (result.status !== 0) return '';
      return String(result.stdout || '').trim().replace(/^uvx?\s*/i, '');
    } catch {
      return '';
    }
  }
}
