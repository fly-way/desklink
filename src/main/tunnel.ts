import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Store } from './store.js';
import type { TunnelStatus } from '../shared/types.js';

const REPO = 'openai/tunnel-client';
const ASSET = /^tunnel-client-v[0-9][^"]*-windows-amd64\.zip$/;

function powershell(script: string): string {
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(String(result.stderr || 'PowerShell failed.').trim().slice(0, 300));
  return result.stdout;
}

/** Downloads, verifies and supervises the official OpenAI tunnel-client. */
export class TunnelRuntime {
  private child: ChildProcess | null = null;
  private installing = false;
  private message = '';
  /** Last credential rejection reported by the daemon, if any. */
  private authError = '';
  /** Cached result of the (expensive) control-plane poll probe. */
  private probe: { at: number; value: boolean } = { at: 0, value: false };
  /** Guards against overlapping start() calls while waiting for the upstream. */
  private starting = false;
  /** When the current daemon was spawned, used to flag a stalled control-plane handshake. */
  private startedAt = 0;

  constructor(
    private readonly store: Store,
    private readonly onChange: (status: TunnelStatus) => void,
    private readonly onLog: (line: string) => void
  ) {}

  get executable(): string {
    return path.join(this.store.toolsDir, 'tunnel-client.exe');
  }

  isInstalled(): boolean {
    return fs.existsSync(this.executable);
  }

  async install(force = false): Promise<string> {
    if (process.platform !== 'win32') throw new Error('tunnel-client auto-install currently supports Windows.');
    if (!force && this.isInstalled()) return this.version();

    this.installing = true;
    this.message = '正在安装 tunnel-client…';
    await this.emit();
    try {
      return await this.downloadAndInstall();
    } finally {
      this.installing = false;
      this.message = '';
      await this.emit();
    }
  }

  private async downloadAndInstall(): Promise<string> {
    const release = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { 'User-Agent': 'desklink', Accept: 'application/vnd.github+json' }
    }).then(response => response.json() as any);
    const tag = String(release?.tag_name ?? '');
    const asset = (release?.assets ?? []).find((item: any) => ASSET.test(String(item?.name ?? '')));
    if (!tag || !asset) throw new Error('No Windows tunnel-client release asset was found.');

    const base = `https://github.com/${REPO}/releases/download/${tag}`;
    const zipPath = path.join(this.store.toolsDir, asset.name);
    this.log(`Downloading ${asset.name} (${tag})…\n`);

    const download = await fetch(asset.browser_download_url);
    const zip = Buffer.from((await download.arrayBuffer()) as ArrayBuffer);
    const sums = await fetch(`${base}/SHA256SUMS.txt`).then(response => response.text());
    const expected = sums.split(/\r?\n/)
      .map(line => line.trim().split(/\s+/))
      .find(([hash, name]) => name && (name === asset.name || name.endsWith(asset.name)))?.[0];
    const actual = createHash('sha256').update(zip).digest('hex');
    if (expected && expected.toLowerCase() !== actual) throw new Error('SHA-256 mismatch for the downloaded tunnel-client.');
    if (!expected) this.log('SHA256SUMS.txt did not list this asset; skipped checksum verification.\n');

    fs.writeFileSync(zipPath, zip);
    fs.rmSync(this.executable, { force: true });
    powershell(`Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${this.store.toolsDir}' -Force`);
    fs.rmSync(zipPath, { force: true });
    this.log(`tunnel-client ${tag} installed.\n`);
    return tag;
  }

  version(): string {
    if (!this.isInstalled()) return '';
    try {
      return spawnSync(this.executable, ['--version'], { encoding: 'utf8', windowsHide: true }).stdout.trim().split(/\r?\n/)[0] ?? '';
    } catch {
      return '';
    }
  }

  async configure(tunnelId: string, apiKey: string): Promise<void> {
    this.store.saveConfig({ tunnelId: tunnelId.trim() });
    if (apiKey) this.store.setApiKey(apiKey.trim());
    this.emit('凭据已保存。');
  }

  async start(): Promise<void> {
    if (this.child || this.starting) return;
    this.starting = true;
    try {
      if (!this.isInstalled()) await this.install();
      this.authError = '';
      this.probe = { at: 0, value: false };
      const apiKey = this.store.getApiKey();
      const tunnelId = this.store.tunnelId;
      if (!tunnelId) throw new Error('Tunnel ID 未配置。');
      if (!apiKey) throw new Error('Runtime API Key 未配置。');

      await this.waitForUpstream();

      const target = `http://127.0.0.1:${this.store.config.mcpPort}/mcp`;
      const child = spawn(this.executable, [
        'run',
        '--mcp.server-url', target,
        '--health.listen-addr', `127.0.0.1:${this.store.config.healthPort}`
      ], {
        env: { ...process.env, CONTROL_PLANE_API_KEY: apiKey, CONTROL_PLANE_TUNNEL_ID: tunnelId },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      this.child = child;
      this.startedAt = Date.now();
      child.stdout?.on('data', chunk => this.ingest(String(chunk)));
      child.stderr?.on('data', chunk => this.ingest(String(chunk)));
      child.on('exit', code => {
        this.log(`tunnel-client exited (${code}).\n`);
        this.child = null;
        this.emit();
      });
      this.log(`tunnel-client started, target ${target}\n`);
      this.emit();
    } finally {
      this.starting = false;
    }
  }

  /**
   * tunnel-client probes its MCP upstream once during startup and latches the outcome:
   * starting before Desktop Commander listens leaves /readyz stuck at 503 for the whole
   * process lifetime. Wait until the loopback MCP endpoint answers before spawning.
   */
  private async waitForUpstream(timeoutMs = 120000): Promise<void> {
    const port = this.store.config.mcpPort;
    const deadline = Date.now() + timeoutMs;
    let announced = false;
    while (Date.now() < deadline) {
      if (this.child) return;
      try {
        await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
          signal: AbortSignal.timeout(2000)
        });
        return;
      } catch {
        if (!announced) {
          this.log(`等待 Desktop Commander 在 127.0.0.1:${port} 就绪…\n`);
          announced = true;
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    throw new Error('Desktop Commander 尚未就绪，已取消启动 tunnel-client。请稍后重试。');
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.authError = '';
    this.startedAt = 0;
    this.probe = { at: 0, value: false };
    if (!child) return;
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      child.kill();
    }
    this.log('tunnel-client stopped.\n');
    this.emit();
  }

  async status(): Promise<TunnelStatus> {
    const health = this.store.config.healthPort;
    let live = false;
    let ready = false;
    try {
      const response = await fetch(`http://127.0.0.1:${health}/healthz`, { signal: AbortSignal.timeout(1500) });
      live = response.ok;
    } catch {}
    try {
      const response = await fetch(`http://127.0.0.1:${health}/readyz`, { signal: AbortSignal.timeout(1500) });
      ready = response.ok;
    } catch {}

    // /readyz only proves the local daemon came up: a wrong Runtime API Key still
    // returns 200 there. Ask the daemon explicitly for one successful control-plane poll.
    const connected = ready && this.controlPlaneConnected();
    if (connected) this.authError = '';
    // Local gates can pass while the control plane keeps rejecting the key. Surface that
    // instead of leaving the operator with a silent, misleading "ready".
    const stalled = !connected && ready && this.startedAt > 0 && Date.now() - this.startedAt > 25000;

    return {
      installed: this.isInstalled(),
      version: this.isInstalled() ? this.version() : '',
      running: !!this.child,
      live,
      ready,
      connected,
      tunnelId: this.store.tunnelId,
      hasKey: this.store.hasApiKey(),
      lastError: this.authError || (stalled ? '控制面尚未连接：请确认 Runtime API Key 有效，且该 Tunnel 已启用。' : ''),
      installing: this.installing,
      message: this.message
    };
  }

  /** `tunnel-client health --require-control-plane-poll` exits 0 only after an authenticated poll. */
  private controlPlaneConnected(): boolean {
    if (!this.child) return false;
    const now = Date.now();
    if (now - this.probe.at < 2000) return this.probe.value;
    let value = false;
    try {
      const result = spawnSync(this.executable, [
        'health',
        '--port', String(this.store.config.healthPort),
        '--require-control-plane-poll'
      ], { encoding: 'utf8', windowsHide: true, timeout: 2500 });
      value = result.status === 0;
    } catch {
      value = false;
    }
    this.probe = { at: now, value };
    return value;
  }

  /** Daemon output goes to the log view and is scanned for credential rejections. */
  private ingest(chunk: string): void {
    this.log(chunk);
    // A valid key makes the control plane return the tunnel metadata; with an invalid one
    // the daemon logs "tunnel meta hasn't fetched" rather than an HTTP status.
    if (/tunnel meta hasn't fetched/i.test(chunk)) {
      this.authError = '控制面未能识别该 Tunnel：Runtime API Key 无效或已撤销，或该 Tunnel 不属于此 Key。';
      return;
    }
    if (/(401|403|unauthorized|forbidden)/i.test(chunk) && /control[ -]?plane|api[ _-]?key|token|auth/i.test(chunk)) {
      this.authError = '控制面拒绝了凭据（401/403）：Runtime API Key 无效或已撤销。';
    }
  }

  private async emit(detail = ''): Promise<void> {
    const status = await this.status();
    this.onChange({ ...status, lastError: detail || status.lastError });
  }

  private log(line: string): void {
    this.onLog(line);
  }
}
