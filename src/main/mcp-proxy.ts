import express from 'express';
import type { Server as HttpServer } from 'node:http';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { createDeskLinkMcpHandler } from './mcp-handler.js';
import { tm } from './i18n.js';
import type { ProxyStatus, ToolSummary } from '../shared/types.js';
import type { ProviderManager } from './providers/provider-manager.js';
import type { DesktopCommanderProvider } from './providers/desktop-commander-provider.js';

/**
 * Loopback MCP gateway exposed to tunnel-client. Capabilities are supplied by local providers
 * (Desktop Commander today; Unity and other MCP servers can be added without changing this layer).
 */
export class McpProxy {
  private http: HttpServer | null = null;
  private mcpHandler: McpHttpHandler | null = null;
  private phase: ProxyStatus['phase'] = 'idle';
  private detail = '';

  constructor(
    private readonly port: number,
    private readonly providers: ProviderManager,
    private readonly desktopCommander: DesktopCommanderProvider,
    private readonly onChange: (status: ProxyStatus) => void,
    private readonly onLog: (line: string) => void
  ) {}

  async start(): Promise<void> {
    if (this.http || this.phase === 'starting') return;
    this.emit('starting', tm('statusPreparingCommander'));

    try {
      await this.providers.start();
    } catch (error: any) {
      this.emit('error', String(error?.message ?? error));
      await this.providers.stop();
      return;
    }

    try {
      await this.listen();
    } catch (error: any) {
      this.emit('error', `${tm('errListenFailed', { port: this.port })} — ${String(error?.message ?? error)}`);
      await this.providers.stop();
      return;
    }

    const readyProviders = this.providers.statuses().filter(provider => provider.phase === 'ready');
    if (readyProviders.length) {
      this.emit('ready', '');
      void this.checkLatest();
    } else {
      const failed = this.providers.statuses().find(provider => provider.phase === 'error');
      this.emit('error', failed?.detail || 'No MCP providers are ready.');
    }
  }

  async checkLatest(): Promise<string> {
    const latest = await this.desktopCommander.checkLatest();
    this.emit(this.phase, this.detail);
    return latest;
  }

  async stop(): Promise<void> {
    await new Promise<void>(resolve => {
      if (!this.http) return resolve();
      this.http.close(() => resolve());
      this.http.closeAllConnections?.();
    });
    this.http = null;

    if (this.mcpHandler) await this.mcpHandler.close().catch(() => {});
    this.mcpHandler = null;
    await this.providers.stop();
    this.emit('idle', '');
  }

  listTools(): ToolSummary[] {
    return this.providers.listTools().map(tool => ({
      name: tool.name,
      description: (tool.description ?? '') as string
    }));
  }

  pushStatus(): void {
    this.emit(this.phase, this.detail);
  }

  private async listen(): Promise<void> {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '8mb' }));

    this.mcpHandler = createDeskLinkMcpHandler({
      getTools: () => this.providers.listTools(),
      callTool: params => this.providers.callTool(params),
      listResources: params => this.providers.listResources(params),
      readResource: params => this.providers.readResource(params),
      onError: error => this.onLog(`MCP request error: ${error.message}\n`)
    });
    const handleMcpRequest = toNodeHandler(this.mcpHandler, {
      maxRequestBodySize: 8 * 1024 * 1024,
      onerror: error => this.onLog(`MCP HTTP error: ${error.message}\n`)
    });

    app.all('/mcp', async (req, res) => {
      const hosts = [`127.0.0.1:${this.port}`, `localhost:${this.port}`];
      if (!req.headers.host || !hosts.includes(req.headers.host)) {
        return res.status(403).json({ error: 'Loopback only.' });
      }
      await handleMcpRequest(req, res, req.body);
    });

    // tunnel-client probes OAuth metadata during startup. JSON 404 cleanly means no OAuth here.
    app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

    await new Promise<void>((resolve, reject) => {
      const http = app.listen(this.port, '127.0.0.1', () => resolve());
      http.on('error', reject);
      this.http = http;
    });
  }

  private emit(phase: ProxyStatus['phase'], detail: string): void {
    this.phase = phase;
    this.detail = detail;
    const commander = this.desktopCommander.getStatus();
    this.onChange({
      phase,
      detail,
      toolCount: this.providers.listTools().length,
      endpoint: phase === 'ready' ? `http://127.0.0.1:${this.port}/mcp` : '',
      commanderVersion: commander.version ?? '',
      commanderLatest: this.desktopCommander.latestVersion
    });
  }
}
