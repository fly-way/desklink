export type ProxyPhase = 'idle' | 'starting' | 'ready' | 'error';

export type ProxyStatus = {
  phase: ProxyPhase;
  detail: string;
  toolCount: number;
  endpoint: string;
  commanderVersion: string;
  commanderLatest: string;
};

export type ToolSummary = {
  name: string;
  description: string;
};

export type ProviderMode = 'always' | 'auto' | 'manual' | 'disabled';
export type ProviderPhase = 'idle' | 'starting' | 'ready' | 'error';

export type ProviderSummary = {
  id: string;
  name: string;
  phase: ProviderPhase;
  mode: ProviderMode;
  detail: string;
  toolCount: number;
  version?: string;
  transport?: string;
  meta?: Record<string, unknown>;
};

export type NodeStatus = {
  available: boolean;
  source: 'bundled' | 'system' | 'none';
  executable: string;
  npmCli: string;
  version: string;
  satisfies: boolean;
};

export type TunnelStatus = {
  installed: boolean;
  version: string;
  running: boolean;
  /** /healthz: the local daemon process answers. */
  live: boolean;
  /** /readyz: local startup gates passed (OAuth discovery + MCP probe). Says nothing about credentials. */
  ready: boolean;
  /** A control-plane poll actually succeeded, i.e. the Runtime API Key was accepted. */
  connected: boolean;
  /** Live result of the control-plane poll probe, surfaced to the UI for real-time feedback. */
  controlPlane: { ok: boolean; detail: string; at: number };
  /** Outbound proxy configured for tunnel-client, surfaced so the form can prefill it. */
  proxy: string;
  /** Epoch ms when the current tunnel-client process was spawned (0 when not running). */
  startedAt: number;
  tunnelId: string;
  hasKey: boolean;
  lastError: string;
  installing: boolean;
  message: string;
};
