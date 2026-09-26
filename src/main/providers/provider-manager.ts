import type {
  CallToolResult,
  ListResourcesRequest,
  ListResourcesResult,
  ReadResourceRequestParams,
  ReadResourceResult,
  Tool
} from '@modelcontextprotocol/server';
import type { McpProvider, ProviderStatus } from './provider.js';

type ToolRoute = { provider: McpProvider; upstreamName: string };
type ResourceRoute = { provider: McpProvider; uri: string };

/** Aggregates local MCP providers behind one stable DeskLink endpoint. */
export class ProviderManager {
  private readonly providers = new Map<string, McpProvider>();
  private readonly toolRoutes = new Map<string, ToolRoute>();
  private readonly resourceRoutes = new Map<string, ResourceRoute>();

  constructor(
    initialProviders: McpProvider[],
    private readonly onChange: (providers: ProviderStatus[]) => void,
    private readonly onLog: (line: string) => void
  ) {
    for (const provider of initialProviders) this.attach(provider);
    this.rebuildTools();
  }

  register(provider: McpProvider): void {
    if (this.providers.has(provider.id)) throw new Error(`MCP provider already registered: ${provider.id}`);
    this.attach(provider);
    this.rebuildTools();
    this.emit();
  }

  async unregister(id: string): Promise<void> {
    const provider = this.providers.get(id);
    if (!provider) return;
    await provider.stop().catch(error => {
      this.onLog(`Provider ${provider.name} stop failed: ${String(error?.message ?? error)}\n`);
    });
    provider.setChangeHandler?.(() => {});
    this.providers.delete(id);
    this.rebuildTools();
    this.emit();
  }

  async start(): Promise<void> {
    for (const provider of this.providers.values()) {
      if (provider.mode === 'disabled' || provider.mode === 'manual') continue;
      try {
        await this.startProvider(provider.id);
      } catch (error: any) {
        this.onLog(`Provider ${provider.name} start failed: ${String(error?.message ?? error)}\n`);
      }
    }
  }

  async stop(): Promise<void> {
    for (const provider of [...this.providers.values()].reverse()) {
      await provider.stop().catch(error => {
        this.onLog(`Provider ${provider.name} stop failed: ${String(error?.message ?? error)}\n`);
      });
    }
    this.rebuildTools();
    this.emit();
  }

  async startProvider(id: string): Promise<void> {
    const provider = this.requireProvider(id);
    try {
      await provider.start();
    } finally {
      this.rebuildTools();
      this.emit();
    }
  }

  async stopProvider(id: string): Promise<void> {
    const provider = this.requireProvider(id);
    try {
      await provider.stop();
    } finally {
      this.rebuildTools();
      this.emit();
    }
  }
  statuses(): ProviderStatus[] {
    return [...this.providers.values()].map(provider => provider.getStatus());
  }

  provider<T extends McpProvider = McpProvider>(id: string): T | undefined {
    return this.providers.get(id) as T | undefined;
  }

  listTools(): Tool[] {
    const tools: Tool[] = [];
    for (const [publicName, route] of this.toolRoutes) {
      const tool = route.provider.listTools().find(candidate => candidate.name === route.upstreamName);
      if (!tool) continue;
      tools.push({ ...tool, name: publicName });
    }
    return tools;
  }

  async callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<CallToolResult> {
    const route = this.toolRoutes.get(params.name);
    if (!route) throw new Error(`Unknown MCP tool: ${params.name}`);
    return route.provider.callTool({ ...params, name: route.upstreamName });
  }

  hasResources(): boolean {
    return [...this.providers.values()].some(provider =>
      provider.getStatus().phase === 'ready' && provider.listResources && provider.readResource
    );
  }

  async listResources(params?: ListResourcesRequest['params']): Promise<ListResourcesResult> {
    const resources = [] as ListResourcesResult['resources'];
    this.resourceRoutes.clear();
    for (const provider of this.providers.values()) {
      if (provider.getStatus().phase !== 'ready' || !provider.listResources || !provider.readResource) continue;
      const listed = await provider.listResources(params);
      for (const resource of listed.resources) {
        const uri = String(resource.uri);
        if (this.resourceRoutes.has(uri)) {
          this.onLog(`Skipping duplicate MCP resource URI ${uri} from ${provider.name}.\n`);
          continue;
        }
        this.resourceRoutes.set(uri, { provider, uri });
        resources.push(resource);
      }
    }
    return { resources };
  }

  async readResource(params: ReadResourceRequestParams): Promise<ReadResourceResult> {
    let route = this.resourceRoutes.get(params.uri);
    if (!route) {
      await this.listResources();
      route = this.resourceRoutes.get(params.uri);
    }
    if (!route?.provider.readResource) throw new Error(`Unknown MCP resource: ${params.uri}`);
    return route.provider.readResource(params);
  }

  private rebuildTools(): void {
    this.toolRoutes.clear();
    for (const provider of this.providers.values()) {
      if (provider.getStatus().phase !== 'ready') continue;
      for (const tool of provider.listTools()) {
        let publicName = tool.name;
        if (this.toolRoutes.has(publicName)) {
          const base = `${provider.id}__${tool.name}`;
          publicName = base;
          let suffix = 2;
          while (this.toolRoutes.has(publicName)) publicName = `${base}__${suffix++}`;
          this.onLog(`MCP tool collision for ${tool.name}; exposed ${provider.name} as ${publicName}.\n`);
        }
        this.toolRoutes.set(publicName, { provider, upstreamName: tool.name });
      }
    }
  }

  private attach(provider: McpProvider): void {
    this.providers.set(provider.id, provider);
    provider.setChangeHandler?.(() => {
      this.rebuildTools();
      this.emit();
    });
  }

  private requireProvider(id: string): McpProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unknown MCP provider: ${id}`);
    return provider;
  }

  private emit(): void {
    this.onChange(this.statuses());
  }
}
