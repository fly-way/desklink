import type {
  CallToolResult,
  ListResourcesRequest,
  ListResourcesResult,
  ReadResourceRequestParams,
  ReadResourceResult,
  Tool
} from '@modelcontextprotocol/server';
import type { ProviderMode, ProviderSummary } from '../../shared/types.js';

export type ProviderStatus = ProviderSummary;

export interface McpProvider {
  readonly id: string;
  readonly name: string;
  readonly mode: ProviderMode;

  setChangeHandler?(handler: () => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): ProviderStatus;
  listTools(): Tool[];
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<CallToolResult>;
  listResources?(params?: ListResourcesRequest['params']): Promise<ListResourcesResult>;
  readResource?(params: ReadResourceRequestParams): Promise<ReadResourceResult>;
}
