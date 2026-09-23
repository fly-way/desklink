import {
  createMcpHandler,
  Server,
  type CallToolResult,
  type ListResourcesRequest,
  type ListResourcesResult,
  type McpHttpHandler,
  type ReadResourceRequestParams,
  type ReadResourceResult,
  type Tool
} from '@modelcontextprotocol/server';

export interface DeskLinkMcpHandlerOptions {
  getTools: () => Tool[];
  callTool: (params: { name: string; arguments?: Record<string, unknown> }) => Promise<CallToolResult>;
  listResources?: (params?: ListResourcesRequest['params']) => Promise<ListResourcesResult>;
  readResource?: (params: ReadResourceRequestParams) => Promise<ReadResourceResult>;
  onError?: (error: Error) => void;
}

/**
 * Builds one request-isolated MCP endpoint for both protocol generations:
 * modern clients use `server/discover` and the 2026-07-28 request envelope,
 * while older clients continue through the SDK's stateless `initialize` path.
 */
export function createDeskLinkMcpHandler(options: DeskLinkMcpHandlerOptions): McpHttpHandler {
  return createMcpHandler(() => {
    const proxiesResources = Boolean(options.listResources && options.readResource);
    const server = new Server(
      { name: 'desklink', version: '0.1.0' },
      {
        capabilities: {
          tools: {},
          ...(proxiesResources ? { resources: {} } : {})
        }
      }
    );

    server.setRequestHandler('tools/list', async () => ({ tools: options.getTools() }));
    server.setRequestHandler('tools/call', async request => {
      const result = await options.callTool(request.params);
      const tool = options.getTools().find(candidate => candidate.name === request.params.name);
      return server.projectCallToolResult(result, tool?.outputSchema);
    });

    // Desktop Commander attaches UI resource URIs to several tool descriptors. Mirror the
    // corresponding resource methods as well; otherwise ChatGPT discovers the URI and then
    // fails connector creation when its follow-up resources/read request receives a 404.
    if (options.listResources && options.readResource) {
      server.setRequestHandler('resources/list', async request => options.listResources!(request.params));
      server.setRequestHandler('resources/read', async request => options.readResource!(request.params));
    }

    return server;
  }, {
    onerror: options.onError
  });
}
