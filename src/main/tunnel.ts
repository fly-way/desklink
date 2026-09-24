import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Store } from './store.js';
import { tm } from './i18n.js';
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
  /** i18n key of the last credential rejection reported by the daemon, if any. */
  private authErrorKey = '';
  /** i18n key of the last network-unreachable signal, as opposed to a credential rejection. */
  private netErrorKey = '';
  /** Cached result of the (expensive) control-plane poll probe. */
  private probe: { at: number; value: { ok: boolean; detail: string } } = { at: 0, value: { ok: false, detail: '' } };
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
    this.message = tm('logInstallingTunnel');
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

  async configure(tunnelId: string, apiKey: string, proxy?: string): Promise<void> {
    this.store.saveConfig({ tunnelId: tunnelId.trim(), proxy: proxy?.trim() || undefined });
    if (apiKey) this.store.setApiKey(apiKey.trim());
    this.emit(tm('msgCredsSaved'));
  }

  async start(): Promise<void> {
    if (this.child || this.starting) return;
    this.starting = true;
    try {
      if (!this.isInstalled()) await this.install();
      this.authErrorKey = '';
      this.netErrorKey = '';
      this.probe = { at: 0, value: { ok: false, detail: '' } };
      const apiKey = this.store.getApiKey();
      const tunnelId = this.store.tunnelId;
      if (!tunnelId) throw new Error(tm('errTunnelIdMissing'));
      if (!apiKey) throw new Error(tm('errApiKeyMissing'));

      await this.waitForUpstream();

      const target = `http://127.0.0.1:${this.store.config.mcpPort}/mcp`;
      const proxy = this.normalizeProxy(this.store.config.proxy);
      const args = [
        'run',
        '--mcp.server-url', target,
        '--health.listen-addr', `127.0.0.1:${this.store.config.healthPort}`
      ];
      const env: NodeJS.ProcessEnv = { ...process.env, CONTROL_PLANE_API_KEY: apiKey, CONTROL_PLANE_TUNNEL_ID: tunnelId };
      if (proxy) {
        args.push('--http-proxy', proxy);
        env.HTTP_PROXY = proxy;
        env.HTTPS_PROXY = proxy;
        env.CONTROL_PLANE_HTTP_PROXY = proxy;
        this.log(`using outbound proxy ${proxy}\n`);
      }
      const child = spawn(this.executable, args, {
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      this.child = child;
      this.startedAt = Date.now();
      child.stdout?.on('data', chunk => this.ingest(String(chunk)));
      child.stderr?.on('data', chunk => this.ingest(String(chunk)));
      child.on('exit', code => {
        this.log(`tunnel-client exited (${code}).\n`);
        // Only clear the handle if this process is still the current one; a stop()+start()
        // cycle can deliver the old process's exit event after a new one has been spawned.
        if (this.child === child) this.child = null;
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
          this.log(tm('logWaitCommander', { port }) + '\n');
          announced = true;
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    throw new Error(tm('errCommanderNotReady'));
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.authErrorKey = '';
    this.netErrorKey = '';
    this.startedAt = 0;
    this.probe = { at: 0, value: { ok: false, detail: '' } };
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
    const cp = this.controlPlaneProbe();
    const connected = ready && cp.ok;
    if (connected) this.authErrorKey = '';
    // Local gates can pass while the control plane keeps rejecting the key. Surface that
    // instead of leaving the operator with a silent, misleading "ready".
    const stalled = !connected && ready && this.startedAt > 0 && Date.now() - this.startedAt > 120000;

    return {
      installed: this.isInstalled(),
      version: this.isInstalled() ? this.version() : '',
      running: !!this.child,
      live,
      ready,
      connected,
      controlPlane: { ok: cp.ok, detail: cp.detail, at: this.probe.at },
      proxy: this.store.config.proxy || '',
      startedAt: this.startedAt,
      tunnelId: this.store.tunnelId,
      hasKey: this.store.hasApiKey(),
      lastError: (this.authErrorKey && tm(this.authErrorKey)) || (this.netErrorKey && tm(this.netErrorKey)) || (stalled ? tm('errControlPlaneStalled') : ''),
      installing: this.installing,
      message: this.message
    };
  }

  /**
   * Runs `tunnel-client health --require-control-plane-poll` and returns both the pass/fail
   * and the daemon's own poll line, so the UI can show live progress instead of a static label.
   */
  private controlPlaneProbe(): { ok: boolean; detail: string } {
    if (!this.child) return { ok: false, detail: '' };
    const now = Date.now();
    if (now - this.probe.at < 2000) return this.probe.value;
    let ok = false;
    let detail = '';
    try {
      const result = spawnSync(this.executable, [
        'health',
        '--port', String(this.store.config.healthPort),
        '--require-control-plane-poll'
      ], { encoding: 'utf8', windowsHide: true, timeout: 2500 });
      ok = result.status === 0;
      const line = (result.stdout || result.stderr || '')
        .split('\n')
        .find(l => /control-plane poll/i.test(l));
      detail = line ? line.trim() : (ok ? 'Control-plane poll: PASS' : 'Control-plane poll: FAIL');
    } catch {
      ok = false;
      detail = tm('errProbeFailed');
    }
    this.probe = { at: now, value: { ok, detail } };
    return this.probe.value;
  }

  /** Accepts "7897", "127.0.0.1:7897" or a full "http://host:port"; always returns a URL or "". */
  private normalizeProxy(raw?: string): string {
    const v = (raw ?? '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    if (/^\d+$/.test(v)) return `http://127.0.0.1:${v}`;
    if (/^[\w.-]+:\d+$/.test(v)) return `http://${v}`;
    return v;
  }

  /** Daemon output goes to the log view and is scanned to tell credential rejections apart
   * from plain network unreachability (no proxy / DNS / firewall). */
  private ingest(chunk: string): void {
    this.log(chunk);
    // Explicit auth failure: the control plane refused the key.
    if (/(401|403|unauthorized|forbidden)/i.test(chunk) && /control[ -]?plane|api[ _-]?key|token|auth/i.test(chunk)) {
      this.authErrorKey = 'errAuthRejected';
      return;
    }
    // Plain network failure: cannot even reach the control plane. Almost always a missing proxy.
    if (/dial tcp|connection attempt failed|no such host|i\/o timeout|connectex|connection refused|network is unreachable|TLS handshake/i.test(chunk)) {
      this.netErrorKey = 'errNetUnreachable';
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
