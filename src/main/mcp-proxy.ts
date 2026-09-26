import express from 'express';
import type { Server as HttpServer } from 'node:http';
import type { CommanderRuntime } from './commander.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { McpHttpHandler, Tool } from '@modelcontextprotocol/server';
import { createDeskLinkMcpHandler } from './mcp-handler.js';
import { tm } from './i18n.js';
import { ProxyStatus, ToolSummary } from '../shared/types.js';



/**
 * DeskLink owns no capabilities of its own. It starts Desktop Commander over stdio, mirrors its
 * tool list, and forwards every tool call verbatim to the local loopback endpoint so the
 * OpenAI tunnel-client can reach it.
 */
export class McpProxy {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private http: HttpServer | null = null;
  private mcpHandler: McpHttpHandler | null = null;
  // Full tool definitions (name, description, inputSchema, …) passed through to the tunnel.
  private tools: Tool[] = [];
  private proxiesResources = false;
  private commanderVersion = '';
  private commanderLatest = '';
  private phase: ProxyStatus['phase'] = 'idle';
  private detail = '';

  constructor(
    private readonly port: number,
    private readonly commander: CommanderRuntime,
    private readonly onChange: (status: ProxyStatus) => void,
    private readonly onLog: (line: string) => void
  ) {}

  async start(): Promise<void> {
    if (this.client) return;
    this.emit('starting', this.commander.installedVersion ? tm('statusStartingCommander') : tm('statusPreparingCommander'));

    await this.commander.ensureInstalled();
    this.emit('starting', tm('statusStartingCommander'));
    const { command, args } = this.commander.prepare();
    this.transport = new StdioClientTransport({
      command,
      args,
      stderr: 'pipe',
      env: { ...process.env } as Record<string, string>
    });
    this.transport.stderr?.on('data', chunk => this.onLog(String(chunk)));

    const client = new Client({ name: 'desklink', version: '0.1.0' });
    try {
      await client.connect(this.transport);
      const listed = await client.listTools();
      // Mirror the full tool definitions. ChatGPT's MCP validation requires an inputSchema
      // on every tool, so preserve it (and synthesize an empty one if a tool omits it).
      this.tools = listed.tools.map(tool => ({
        ...tool,
        inputSchema: (tool as any).inputSchema ?? { type: 'object', properties: {} }
      }));
      this.proxiesResources = Boolean(client.getServerCapabilities()?.resources);
      this.client = client;
      // The MCP handshake reports the exact server implementation that answered.
      const info = client.getServerVersion();
      this.commanderVersion = String(info?.version ?? '');
      this.onLog(`Desktop Commander ${this.commanderVersion || '(version unknown)'} ready with ${this.tools.length} tools.\n`);
    } catch (error: any) {
      this.emit('error', String(error?.message ?? error));
      await this.stop();
      return;
    }

    try {
      await this.listen();
    } catch (error: any) {
      this.emit('error', `${tm('errListenFailed', { port: this.port })} — ${String(error?.message ?? error)}`);
      return;
    }
    this.emit('ready', '');
    void this.checkLatest();
  }

  /** Resolves what `latest` currently points at, so the UI can show whether an update will upgrade. */
  async checkLatest(): Promise<string> {
    try {
      const value = this.commander.latestVersion();
      if (/^\d+\.\d+\.\d+/.test(value)) this.commanderLatest = value;
    } catch {
      /* offline or npm unavailable — keep the previous value */
    }
    this.emit(this.phase, this.detail);
    return this.commanderLatest;
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
    if (this.client) await this.client.close().catch(() => {});
    this.client = null;
    this.transport = null;
    this.proxiesResources = false;
    this.emit('idle', '');
  }

  listTools(): ToolSummary[] {
    return this.tools.map(t => ({ name: t.name, description: (t.description ?? '') as string }));
  }

  /** Re-emits the current status, e.g. so cached text is re-rendered after a language switch. */
  pushStatus(): void {
    this.emit(this.phase, this.detail);
  }

  private async listen(): Promise<void> {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '8mb' }));

    this.mcpHandler = createDeskLinkMcpHandler({
      getTools: () => this.tools,
      callTool: async params => {
        if (!this.client) throw new Error('Desktop Commander is not running.');
        return await this.client.callTool(params as any) as any;
      },
      ...(this.proxiesResources ? {
        listResources: async (params: any) => {
          if (!this.client) throw new Error('Desktop Commander is not running.');
          return await this.client.listResources(params) as any;
        },
        readResource: async (params: any) => {
          if (!this.client) throw new Error('Desktop Commander is not running.');
          return await this.client.readResource(params) as any;
        }
      } : {}),
      onError: error => this.onLog(`MCP request error: ${error.message}\n`)
    });
    const handleMcpRequest = toNodeHandler(this.mcpHandler, {
      maxRequestBodySize: 8 * 1024 * 1024,
      onerror: error => this.onLog(`MCP HTTP error: ${error.message}\n`)
    });

    app.all('/mcp', async (req, res) => {
      const hosts = [`127.0.0.1:${this.port}`, `localhost:${this.port}`];
      if (!req.headers.host || !hosts.includes(req.headers.host)) return res.status(403).json({ error: 'Loopback only.' });
      await handleMcpRequest(req, res, req.body);
    });

    // tunnel-client probes OAuth metadata during startup. Without this it receives Express'
    // HTML 404 page and logs 'invalid character "<"'; a JSON 404 cleanly means "no OAuth here".
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
    this.onChange({
      phase,
      detail,
      toolCount: this.tools.length,
      endpoint: phase === 'ready' ? `http://127.0.0.1:${this.port}/mcp` : '',
      commanderVersion: this.commanderVersion,
      commanderLatest: this.commanderLatest
    });
  }
}
