import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  CallToolResult,
  ListResourcesRequest,
  ListResourcesResult,
  ReadResourceRequestParams,
  ReadResourceResult,
  Tool
} from '@modelcontextprotocol/server';
import type { CommanderRuntime } from '../commander.js';
import { tm } from '../i18n.js';
import type { McpProvider, ProviderStatus } from './provider.js';
import { summarizeDesktopCommanderCapabilities } from './desktop-commander-capabilities.js';

export class DesktopCommanderProvider implements McpProvider {
  readonly id = 'desktop-commander';
  readonly name = 'Desktop Commander';
  readonly mode = 'always' as const;

  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private tools: Tool[] = [];
  private proxiesResources = false;
  private phase: ProviderStatus['phase'] = 'idle';
  private detail = '';
  private version = '';
  private latest = '';
  private onChange: () => void = () => {};

  constructor(
    private readonly commander: CommanderRuntime,
    private readonly onLog: (line: string) => void
  ) {}

  setChangeHandler(handler: () => void): void {
    this.onChange = handler;
  }

  async start(): Promise<void> {
    if (this.client) return;
    this.phase = 'starting';
    this.detail = this.commander.installedVersion ? tm('statusStartingCommander') : tm('statusPreparingCommander');
    this.onChange();

    await this.commander.ensureInstalled();
    this.detail = tm('statusStartingCommander');
    const { command, args } = this.commander.prepare();
    this.transport = new StdioClientTransport({
      command,
      args,
      stderr: 'pipe',
      env: { ...process.env } as Record<string, string>
    });
    this.transport.stderr?.on('data', chunk => this.onLog(String(chunk)));

    const client = new Client({ name: 'desklink', version: '0.2.0' });
    this.client = client;
    try {
      await client.connect(this.transport);
      const listed = await client.listTools();
      this.tools = listed.tools.map(tool => ({
        ...tool,
        inputSchema: (tool as any).inputSchema ?? { type: 'object', properties: {} }
      }));
      this.proxiesResources = Boolean(client.getServerCapabilities()?.resources);
      this.client = client;
      this.version = String(client.getServerVersion()?.version ?? '');
      this.phase = 'ready';
      this.detail = '';
      this.onChange();
      this.onLog(`Desktop Commander ${this.version || '(version unknown)'} ready with ${this.tools.length} tools.\n`);
    } catch (error: any) {
      this.phase = 'error';
      this.detail = String(error?.message ?? error);
      this.onChange();
      await this.closeClient();
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.closeClient();
    this.tools = [];
    this.proxiesResources = false;
    this.phase = 'idle';
    this.detail = '';
    this.onChange();
  }

  getStatus(): ProviderStatus {
    return {
      id: this.id,
      name: this.name,
      phase: this.phase,
      mode: this.mode,
      detail: this.detail,
      toolCount: this.tools.length,
      version: this.version,
      transport: 'stdio',
      meta: {
        latestVersion: this.latest,
        capabilities: summarizeDesktopCommanderCapabilities(this.tools.map(tool => tool.name))
      }
    };
  }

  listTools(): Tool[] {
    return this.tools;
  }
  async callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<CallToolResult> {
    if (!this.client) throw new Error('Desktop Commander is not running.');
    return await this.client.callTool(params as any) as any;
  }

  async listResources(params?: ListResourcesRequest['params']): Promise<ListResourcesResult> {
    if (!this.client || !this.proxiesResources) return { resources: [] };
    return await this.client.listResources(params) as any;
  }

  async readResource(params: ReadResourceRequestParams): Promise<ReadResourceResult> {
    if (!this.client || !this.proxiesResources) throw new Error('Desktop Commander resources are not available.');
    return await this.client.readResource(params) as any;
  }

  async checkLatest(): Promise<string> {
    try {
      const value = this.commander.latestVersion();
      if (/^\d+\.\d+\.\d+/.test(value)) {
        this.latest = value;
        this.onChange();
      }
    } catch {
      // Offline or npm unavailable: retain the previous known value.
    }
    return this.latest;
  }

  get latestVersion(): string {
    return this.latest;
  }

  private async closeClient(): Promise<void> {
    if (this.client) await this.client.close().catch(() => {});
    this.client = null;
    this.transport = null;
  }
}
