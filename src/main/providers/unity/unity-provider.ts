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
import type { Store, UnityProjectMode } from '../../store.js';
import type { UnityCapabilityId, UnityCapabilityMode } from '../../../shared/types.js';
import type { McpProvider, ProviderStatus } from '../provider.js';
import { discoverUnityProjects, type UnityProjectInfo } from './unity-discovery.js';
import { applyUnityMcpCompatibilityPatches, inspectUnityMcpPackage, installUnityMcpPackage, type UnityMcpPackageStatus } from './unity-package.js';
import {
  UNITY_MCP_INSTANCES_URI,
  UNITY_MCP_PYPI_SPEC,
  UNITY_MCP_VERSION
} from './unity-constants.js';
import {
  inspectDeskLinkUnityBootstrap,
  installDeskLinkUnityBootstrap,
  requestDeskLinkUnityResolve,
  writeDeskLinkUnityConfig
} from './unity-bootstrap.js';
import { UvRuntime } from './uv-runtime.js';
import {
  UNITY_CAPABILITY_DEFINITIONS,
  UNITY_CORE_CAPABILITY_DEFINITIONS,
  UNITY_CORE_TOOL_NAMES,
  findUnityCapability,
  selectUnityTools,
  type UnityCapabilityDecision,
  type UnityCapabilityDefinition,
  type UnityCapabilityRequest
} from './unity-capabilities.js';

const DISCOVERY_INTERVAL_MS = 5000;
const BRIDGE_RECONNECT_MISSES = 3;
const BRIDGE_READY_WAIT_MS = 15000;
const BRIDGE_READY_POLL_MS = 250;
function samePath(a: string, b: string): boolean {
  const normalize = (value: string) => {
    const cleaned = value.replace(/[\\/]+$/, '');
    return process.platform === 'win32' ? cleaned.toLowerCase() : cleaned;
  };
  return normalize(a) === normalize(b);
}

export class UnityProvider implements McpProvider {
  readonly id = 'unity';
  readonly name = 'Unity MCP';
  readonly mode = 'auto' as const;

  private readonly uv: UvRuntime;
  private phase: ProviderStatus['phase'] = 'idle';
  private detail = '';
  private tools: Tool[] = [];
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private proxiesResources = false;
  private activeProject: UnityProjectInfo | null = null;
  private packageStatus: UnityMcpPackageStatus | null = null;
  private bridgeConnected = false;
  private bridgeMisses = 0;
  private activeInstanceId = '';
  private timer: NodeJS.Timeout | null = null;
  private refreshing = false;
  private connecting = false;
  private generation = 0;
  private readonly resolveRequestedProjects = new Set<string>();
  private readonly temporaryCapabilities = new Set<UnityCapabilityId>();
  private onChange: () => void = () => {};

  constructor(
    private readonly store: Store,
    private readonly onLog: (line: string) => void,
    private readonly requestCapability?: (request: UnityCapabilityRequest) => Promise<UnityCapabilityDecision>
  ) {
    this.uv = new UvRuntime(store, onLog);
  }

  setChangeHandler(handler: () => void): void {
    this.onChange = handler;
  }

  async start(): Promise<void> {
    if (this.timer) return;
    this.detail = 'Watching for Unity Editor projects.';
    this.onChange();
    await this.refresh();
    this.timer = setInterval(() => { void this.refresh(); }, DISCOVERY_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.generation++;
    await this.closeRuntime();
    this.activeProject = null;
    this.packageStatus = null;
    this.bridgeConnected = false;
    this.temporaryCapabilities.clear();
    this.phase = 'idle';
    this.detail = '';
    this.onChange();
  }

  getStatus(): ProviderStatus {
    const preference = this.activeProject
      ? this.store.getUnityProjectPreference(this.activeProject.projectPath)
      : undefined;
    const uv = this.uv.status();
    const bootstrap = this.activeProject
      ? inspectDeskLinkUnityBootstrap(this.activeProject.projectPath)
      : { installed: false, bootstrapPath: '', configPath: '' };
    return {
      id: this.id,
      name: this.name,
      phase: this.phase,
      mode: this.mode,
      detail: this.detail,
      toolCount: this.listTools().length,
      version: this.client ? UNITY_MCP_VERSION : '',
      transport: 'stdio',
      meta: {
        projectPath: this.activeProject?.projectPath ?? '',
        projectName: this.activeProject?.projectName ?? '',
        unityVersion: this.activeProject?.unityVersion ?? '',
        unityPid: this.activeProject?.pid ?? 0,
        packageInstalled: this.packageStatus?.installed ?? false,
        packageDeclared: this.packageStatus?.declared ?? false,
        packageResolved: this.packageStatus?.resolved ?? false,
        packageVersion: this.packageStatus?.version ?? '',
        packageSpec: this.packageStatus?.spec ?? '',
        packageTargetVersion: UNITY_MCP_VERSION,
        packageCompatible: Boolean(this.packageStatus?.installed && this.packageStatus.version === UNITY_MCP_VERSION),
        installationApproved: preference?.installationApproved ?? false,
        projectMode: preference?.mode ?? 'auto',
        integrationInstalled: bootstrap.installed,
        bridgeConnected: this.bridgeConnected,
        activeInstanceId: this.activeInstanceId,
        uvAvailable: uv.available,
        uvVersion: uv.version,
        uvSource: uv.source,
        upstreamToolCount: this.tools.length,
        coreToolCount: this.tools.filter(tool => (UNITY_CORE_TOOL_NAMES as readonly string[]).includes(tool.name)).length,
        coreCapabilities: UNITY_CORE_CAPABILITY_DEFINITIONS.map(capability => ({
          id: capability.id,
          label: capability.label,
          description: capability.description,
          toolCount: this.tools.filter(tool => capability.toolNames.includes(tool.name)).length
        })),
        capabilities: UNITY_CAPABILITY_DEFINITIONS.map(capability => ({
          id: capability.id,
          label: capability.label,
          description: capability.description,
          mode: this.capabilityMode(capability),
          temporary: this.temporaryCapabilities.has(capability.id),
          toolCount: capability.id === 'raw'
            ? this.tools.length
            : this.tools.filter(tool => capability.toolNames.includes(tool.name)).length
        }))
      }
    };
  }

  listTools(): Tool[] {
    const selected = selectUnityTools(
      this.tools,
      capability => this.capabilityMode(capability),
      this.temporaryCapabilities
    );
    return selected.map(tool => {
      if (tool.name !== 'manage_ui' || !tool.description) return tool;
      const description = tool.description
        .replace(
          /- In play mode: first call queues a WaitForEndOfFrame screen capture and returns pending=true;\s*call render_ui a second time to retrieve the saved PNG \(hasContent will be true\)\./,
          '- In play mode: render_ui completes in one call and saves the composited frame (hasContent=true).'
        )
        .replace(
          '- In editor mode: assigns a RenderTexture to PanelSettings (best-effort; may stay blank).',
          '- In editor mode: the first call may prime a temporary RenderTexture and a second call can read it; the original PanelSettings targetTexture is restored and temporary assets are cleaned up.'
        );
      return { ...tool, description };
    });
  }

  async callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<CallToolResult> {
    if (!this.client || this.phase !== 'ready') throw new Error('Unity MCP is not ready.');
    if (params.name === 'unity_capabilities') return this.requestOptionalCapability(params.arguments);

    const prepared = params;
    if (this.activeProject) {
      const bridgeReady = await this.ensureBridgeReady(this.activeProject);
      if (!bridgeReady || !this.client || this.phase !== 'ready') {
        throw new Error('Unity MCP Editor bridge is not ready.');
      }
    }

    const client = this.client;
    try {
      const result = await client.callTool(prepared as any) as any;
      const retryable = this.hasMissingEditorInstanceSignal(result)
        || (this.canRetryTransientToolCall(prepared) && this.hasTransientEditorBridgeSignal(result));
      if (!this.activeProject || !retryable) return this.postprocessToolResult(prepared, result);
      if (!await this.ensureBridgeReady(this.activeProject) || !this.client) {
        return this.postprocessToolResult(prepared, result);
      }
      const retried = await this.client.callTool(prepared as any) as any;
      return this.postprocessToolResult(prepared, retried);
    } catch (error) {
      const retryable = this.hasMissingEditorInstanceSignal(error)
        || (this.canRetryTransientToolCall(prepared) && this.hasTransientEditorBridgeSignal(error));
      if (!this.activeProject || !retryable) throw error;
      if (!await this.ensureBridgeReady(this.activeProject) || !this.client) throw error;
      const retried = await this.client.callTool(prepared as any) as any;
      return this.postprocessToolResult(prepared, retried);
    }
  }

  private async ensureBridgeReady(
    project: UnityProjectInfo,
    timeoutMs = BRIDGE_READY_WAIT_MS,
    pollMs = BRIDGE_READY_POLL_MS
  ): Promise<boolean> {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (true) {
      if (await this.probeBridge(project)) return true;
      if (Date.now() >= deadline) return false;
      await new Promise<void>(resolve => setTimeout(resolve, Math.max(10, pollMs)));
    }
  }

  private hasMissingEditorInstanceSignal(value: unknown): boolean {
    const needle = 'No Unity Editor instances found';
    if (value instanceof Error) return value.message.includes(needle);
    try {
      return JSON.stringify(value).includes(needle);
    } catch {
      return false;
    }
  }

  private hasTransientEditorBridgeSignal(value: unknown): boolean {
    const needles = [
      'Connection closed before reading expected bytes',
      'Read timed out',
      'ECONNRESET',
      'socket hang up',
      'broken pipe'
    ];
    const text = value instanceof Error
      ? value.message
      : (() => {
          try { return JSON.stringify(value); } catch { return ''; }
        })();
    return needles.some(needle => text.toLowerCase().includes(needle.toLowerCase()));
  }

  private canRetryTransientToolCall(params: { name: string; arguments?: Record<string, unknown> }): boolean {
    if (params.name !== 'manage_ui') return false;
    const action = String(params.arguments?.action ?? '').toLowerCase();
    return ['ping', 'read', 'list', 'get_visual_tree', 'link_stylesheet'].includes(action);
  }

  private postprocessToolResult(
    params: { name: string; arguments?: Record<string, unknown> },
    result: any
  ): any {
    if (params.name !== 'manage_ui') return result;
    const action = String(params.arguments?.action ?? '').toLowerCase();
    if (action !== 'list') return result;

    const assets = result?.structuredContent?.data?.assets;
    if (!Array.isArray(assets)) return result;

    const filtered = assets.filter((asset: any) => {
      const type = String(asset?.type ?? '').toLowerCase();
      const assetPath = String(asset?.path ?? '').toLowerCase();
      if (type === 'uss') return assetPath.endsWith('.uss');
      if (type === 'uxml') return assetPath.endsWith('.uxml');
      return true;
    });
    const removed = assets.length - filtered.length;
    result.structuredContent.data.assets = filtered;
    if (removed > 0 && typeof result.structuredContent.data.total === 'number') {
      result.structuredContent.data.total = Math.max(0, result.structuredContent.data.total - removed);
    }
    return result;
  }

  setCapabilityMode(id: UnityCapabilityId, mode: UnityCapabilityMode): ProviderStatus {
    if (!findUnityCapability(id)) throw new Error(`Unknown Unity capability: ${id}`);
    if (!['on', 'ask', 'off'].includes(mode)) throw new Error(`Invalid Unity capability mode: ${mode}`);
    this.store.saveUnityCapabilityMode(id, mode);
    this.temporaryCapabilities.delete(id);
    this.onChange();
    return this.getStatus();
  }

  async listResources(params?: ListResourcesRequest['params']): Promise<ListResourcesResult> {
    if (!this.client || !this.proxiesResources) return { resources: [] };
    return await this.client.listResources(params) as any;
  }

  async readResource(params: ReadResourceRequestParams): Promise<ReadResourceResult> {
    if (!this.client || !this.proxiesResources) throw new Error('Unity MCP resources are not available.');
    return await this.client.readResource(params) as any;
  }

  async installCurrentProject(projectPath?: string): Promise<ProviderStatus> {
    const project = this.requireActiveProject(projectPath);
    const existing = inspectUnityMcpPackage(project.projectPath);
    this.packageStatus = existing.declared && existing.version === UNITY_MCP_VERSION
      ? existing
      : installUnityMcpPackage(project.projectPath);

    installDeskLinkUnityBootstrap(project.projectPath);
    writeDeskLinkUnityConfig(project.projectPath, 'auto');
    requestDeskLinkUnityResolve(project.projectPath);
    this.resolveRequestedProjects.add(project.projectPath.toLowerCase());
    this.store.saveUnityProjectPreference(project.projectPath, {
      mode: 'auto',
      installationApproved: true,
      packageVersion: UNITY_MCP_VERSION
    });

    this.generation++;
    await this.closeRuntime();
    this.phase = 'starting';
    this.detail = 'Requested Unity Package Manager resolve; waiting for MCP for Unity to be imported.';
    this.onChange();
    return this.getStatus();
  }

  async setProjectMode(mode: UnityProjectMode, projectPath?: string): Promise<ProviderStatus> {
    const project = this.requireActiveProject(projectPath);
    this.store.saveUnityProjectPreference(project.projectPath, { mode });
    if (inspectDeskLinkUnityBootstrap(project.projectPath).installed) {
      writeDeskLinkUnityConfig(project.projectPath, mode, 0);
    }
    if (mode === 'disabled' || mode === 'manual') {
      this.generation++;
      await this.closeRuntime();
      this.phase = 'idle';
      this.detail = mode === 'disabled' ? 'Unity MCP is disabled for this project.' : 'Unity MCP is in manual mode.';
      this.onChange();
    } else if (this.packageStatus?.installed && this.packageStatus.version === UNITY_MCP_VERSION) {
      void this.connectProject(project);
    }
    return this.getStatus();
  }

  async startCurrentProject(projectPath?: string): Promise<ProviderStatus> {
    const project = this.requireActiveProject(projectPath);
    if (!this.packageStatus?.installed) throw new Error('MCP for Unity is not installed in the current project.');
    if (this.packageStatus.version !== UNITY_MCP_VERSION) {
      throw new Error(`MCP for Unity ${UNITY_MCP_VERSION} is required for this DeskLink integration.`);
    }
    if (!inspectDeskLinkUnityBootstrap(project.projectPath).installed) {
      throw new Error('DeskLink Unity bootstrap is not installed in the current project.');
    }
    writeDeskLinkUnityConfig(project.projectPath, 'manual', project.pid);
    void this.connectProject(project);
    return this.getStatus();
  }

  async refreshNow(): Promise<ProviderStatus> {
    await this.refresh();
    return this.getStatus();
  }

  private capabilityMode(capability: UnityCapabilityDefinition): UnityCapabilityMode {
    return this.store.getUnityCapabilityMode(capability.id) ?? capability.defaultMode;
  }

  private capabilityEnabled(id: UnityCapabilityId): boolean {
    const capability = findUnityCapability(id);
    return Boolean(capability && (this.temporaryCapabilities.has(id) || this.capabilityMode(capability) === 'on'));
  }

  private askCapabilities(): UnityCapabilityDefinition[] {
    if (this.capabilityEnabled('raw')) return [];
    return UNITY_CAPABILITY_DEFINITIONS.filter(capability =>
      !this.temporaryCapabilities.has(capability.id) && this.capabilityMode(capability) === 'ask'
    );
  }

  private async requestOptionalCapability(args?: Record<string, unknown>): Promise<CallToolResult> {
    const id = String(args?.capability ?? '') as UnityCapabilityId;
    const capability = findUnityCapability(id);
    if (!capability || !this.askCapabilities().some(candidate => candidate.id === id)) {
      return this.capabilityResult(false, id, 'unavailable', 'That capability is not currently available in Ask mode.');
    }

    const toolNames = capability.id === 'raw' ? this.tools.map(tool => tool.name) : [...capability.toolNames];
    const decision = this.requestCapability
      ? await this.requestCapability({
          id, label: capability.label, description: capability.description, toolNames,
          projectName: this.activeProject?.projectName ?? 'Unity'
        })
      : 'deny';

    if (decision === 'always') this.store.saveUnityCapabilityMode(id, 'on');
    else if (decision === 'once') this.temporaryCapabilities.add(id);
    else return this.capabilityResult(false, id, 'denied', `Unity ${capability.label} was not enabled.`);

    this.onChange();
    const scope = decision === 'always' ? 'always' : 'session';
    return this.capabilityResult(true, id, scope, `Unity ${capability.label} is now enabled (${scope}).`);
  }

  private capabilityResult(success: boolean, capability: string, status: string, message: string): CallToolResult {
    return {
      content: [{ type: 'text', text: message }],
      structuredContent: { success, capability, status, message }
    } as CallToolResult;
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const projects = await discoverUnityProjects();
      const next = projects[0] ?? null;
      if (!next) {
        if (this.activeProject) {
          this.generation++;
          await this.closeRuntime();
        }
        this.activeProject = null;
        this.packageStatus = null;
        this.bridgeConnected = false;
        this.temporaryCapabilities.clear();
        this.phase = 'idle';
        this.detail = 'No running Unity project detected.';
        this.onChange();
        return;
      }

      if (!this.activeProject || !samePath(this.activeProject.projectPath, next.projectPath)) {
        this.generation++;
        await this.closeRuntime();
        this.temporaryCapabilities.clear();
        this.activeProject = next;
      } else {
        this.activeProject = next;
      }

      this.packageStatus = inspectUnityMcpPackage(next.projectPath);
      const preference = this.store.getUnityProjectPreference(next.projectPath);
      const projectMode = preference?.mode ?? 'auto';
      const resolveKey = next.projectPath.toLowerCase();
      if (this.packageStatus.installed) this.resolveRequestedProjects.delete(resolveKey);

      if (!this.packageStatus.installed) {
        if (this.client) await this.closeRuntime();
        this.bridgeConnected = false;

        if (this.packageStatus.declared) {
          const integration = inspectDeskLinkUnityBootstrap(next.projectPath);
          if (preference?.installationApproved && integration.installed
              && !this.resolveRequestedProjects.has(resolveKey)) {
            requestDeskLinkUnityResolve(next.projectPath);
            this.resolveRequestedProjects.add(resolveKey);
          }
          this.phase = 'starting';
          this.detail = this.packageStatus.resolved
            ? 'MCP for Unity is resolved; waiting for Unity to import the package.'
            : 'MCP for Unity dependency is declared; waiting for Unity Package Manager resolve.';
        } else {
          if (inspectDeskLinkUnityBootstrap(next.projectPath).installed) {
            writeDeskLinkUnityConfig(next.projectPath, 'disabled');
          }
          this.phase = 'idle';
          this.detail = preference?.installationApproved
            ? 'MCP for Unity was removed from this project.'
            : 'MCP for Unity is not installed in this project.';
        }
        this.onChange();
        return;
      }

      if (this.packageStatus.version !== UNITY_MCP_VERSION) {
        if (this.client) await this.closeRuntime();
        if (inspectDeskLinkUnityBootstrap(next.projectPath).installed) {
          writeDeskLinkUnityConfig(next.projectPath, 'disabled');
        }
        this.phase = 'idle';
        this.bridgeConnected = false;
        this.detail = this.packageStatus.version
          ? `MCP for Unity ${this.packageStatus.version} is installed; DeskLink requires ${UNITY_MCP_VERSION}.`
          : `MCP for Unity version could not be verified; DeskLink requires ${UNITY_MCP_VERSION}.`;
        this.onChange();
        return;
      }

      try {
        const compatibilityPatch = applyUnityMcpCompatibilityPatches(this.packageStatus);
        if (compatibilityPatch.changed) {
          this.onLog('Applied DeskLink manage_ui compatibility patch to MCP for Unity.\n');
          this.generation++;
          await this.closeRuntime();
          this.phase = 'starting';
          this.detail = 'Applied Unity manage_ui compatibility patch; waiting for Unity to reload.';
          this.onChange();
          return;
        }
      } catch (error: any) {
        this.onLog(`Unity manage_ui compatibility patch failed: ${String(error?.message ?? error)}\n`);
      }

      const integration = inspectDeskLinkUnityBootstrap(next.projectPath);
      if (!integration.installed) {
        if (this.client) await this.closeRuntime();
        this.phase = 'idle';
        this.bridgeConnected = false;
        this.detail = 'MCP for Unity is installed; enable the DeskLink project integration to continue.';
        this.onChange();
        return;
      }

      const manualPid = projectMode === 'manual' && (this.client || this.connecting) ? next.pid : 0;
      writeDeskLinkUnityConfig(next.projectPath, projectMode, manualPid);

      if (projectMode === 'disabled') {
        if (this.client) await this.closeRuntime();
        this.phase = 'idle';
        this.detail = 'Unity MCP is disabled for this project.';
        this.onChange();
        return;
      }

      if (this.client) {
        const wasReady = this.phase === 'ready';
        const connected = await this.probeBridge(next);
        this.bridgeMisses = connected ? 0 : this.bridgeMisses + 1;

        if (connected) {
          const changed = !this.bridgeConnected || this.phase !== 'ready' || this.detail !== '';
          this.bridgeConnected = true;
          this.phase = 'ready';
          this.detail = '';
          if (changed) this.onChange();
          return;
        }

        this.bridgeConnected = false;
        if (this.bridgeMisses >= BRIDGE_RECONNECT_MISSES) {
          this.onLog('Unity MCP Editor bridge was lost; restarting the stdio provider.\n');
          this.bridgeMisses = 0;
          this.generation++;
          await this.closeRuntime();
          this.phase = 'starting';
          this.detail = 'Reconnecting Unity MCP after the Editor bridge changed…';
          this.onChange();
          void this.connectProject(next);
          return;
        }

        const detail = wasReady
          ? `Unity Editor bridge probe missed (${this.bridgeMisses}/${BRIDGE_RECONNECT_MISSES}); keeping existing tool routes while retrying.`
          : 'Unity MCP server is ready; waiting for the Editor bridge.';
        const phase = wasReady ? 'ready' : 'starting';
        if (this.phase !== phase || this.detail !== detail) {
          this.phase = phase;
          this.detail = detail;
          this.onChange();
        }
        return;
      }

      if (projectMode === 'auto' && !this.connecting) void this.connectProject(next);
      else {
        this.phase = 'idle';
        this.detail = 'Unity MCP is installed and waiting for manual start.';
        this.onChange();
      }
    } finally {
      this.refreshing = false;
    }
  }

  private async connectProject(project: UnityProjectInfo): Promise<void> {
    if (this.connecting || this.client) return;
    this.connecting = true;
    const generation = ++this.generation;
    this.phase = 'starting';
    this.detail = 'Starting Unity MCP stdio server…';
    this.onChange();

    try {
      const uv = await this.uv.ensureInstalled();
      if (generation !== this.generation) return;

      const transport = new StdioClientTransport({
        command: uv.executable,
        args: ['--from', UNITY_MCP_PYPI_SPEC, 'mcp-for-unity', '--transport', 'stdio'],
        stderr: 'pipe',
        env: { ...process.env, ...this.uv.environment() } as Record<string, string>
      });
      transport.stderr?.on('data', chunk => this.onLog(`[Unity MCP] ${String(chunk)}`));

      const client = new Client({ name: 'desklink-unity', version: '0.2.0' });
      this.transport = transport;
      this.client = client;
      await client.connect(transport);

      if (generation !== this.generation) {
        await client.close().catch(() => {});
        return;
      }

      const listed = await client.listTools();
      this.tools = listed.tools.map(tool => ({
        ...tool,
        inputSchema: (tool as any).inputSchema ?? { type: 'object', properties: {} }
      }));
      this.proxiesResources = Boolean(client.getServerCapabilities()?.resources);
      this.bridgeConnected = await this.probeBridge(project);
      this.bridgeMisses = 0;
      this.phase = this.bridgeConnected ? 'ready' : 'starting';
      this.detail = this.bridgeConnected ? '' : 'Unity MCP server is ready; waiting for the Editor bridge.';
      this.onLog(`Unity MCP ${UNITY_MCP_VERSION} stdio ready with ${this.tools.length} tools.\n`);
      this.onChange();
    } catch (error: any) {
      if (generation === this.generation) {
        await this.closeRuntime();
        this.phase = 'error';
        this.detail = String(error?.message ?? error);
        this.onChange();
      }
    } finally {
      this.connecting = false;
    }
  }

  private async probeBridge(project: UnityProjectInfo): Promise<boolean> {
    if (!this.client || !this.proxiesResources) return false;
    try {
      const result = await this.client.readResource({ uri: UNITY_MCP_INSTANCES_URI });
      const instances: any[] = [];
      for (const content of result.contents ?? []) {
        if (!('text' in content) || typeof content.text !== 'string') continue;
        try {
          const body = JSON.parse(content.text);
          if (Array.isArray(body?.instances)) instances.push(...body.instances);
        } catch {}
      }

      const normalizedPath = project.projectPath.replace(/\\/g, '/').toLowerCase();
      const match = instances.find(instance => {
        const name = String(instance?.name ?? instance?.project ?? '').toLowerCase();
        const instancePath = String(instance?.path ?? '').replace(/\\/g, '/').toLowerCase();
        return name === project.projectName.toLowerCase()
          || (instancePath && instancePath === normalizedPath);
      });

      const instanceId = String(match?.id ?? '');
      if (!instanceId) {
        this.activeInstanceId = '';
        return false;
      }

      if (this.tools.some(tool => tool.name === 'set_active_instance')) {
        await this.client.callTool({
          name: 'set_active_instance',
          arguments: { instance: instanceId }
        } as any);
      }
      this.activeInstanceId = instanceId;
      return true;
    } catch {
      this.activeInstanceId = '';
      return false;
    }
  }

  private requireActiveProject(projectPath?: string): UnityProjectInfo {
    if (!this.activeProject) throw new Error('No running Unity project is detected.');
    if (projectPath && !samePath(projectPath, this.activeProject.projectPath)) {
      throw new Error('The requested Unity project is not the active detected project.');
    }
    return this.activeProject;
  }

  private async closeRuntime(): Promise<void> {
    if (this.client) await this.client.close().catch(() => {});
    this.client = null;
    this.transport = null;
    this.tools = [];
    this.proxiesResources = false;
    this.bridgeConnected = false;
    this.bridgeMisses = 0;
    this.activeInstanceId = '';
  }
}
