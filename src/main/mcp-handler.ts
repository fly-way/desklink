import {
  createMcpHandler,
  Server,
  type CallToolResult,
  type McpHttpHandler,
  type Tool
} from '@modelcontextprotocol/server';

export interface DeskLinkMcpHandlerOptions {
  getTools: () => Tool[];
  callTool: (params: { name: string; arguments?: Record<string, unknown> }) => Promise<CallToolResult>;
  onError?: (error: Error) => void;
}

/**
 * Builds one request-isolated MCP endpoint for both protocol generations:
 * modern clients use `server/discover` and the 2026-07-28 request envelope,
 * while older clients continue through the SDK's stateless `initialize` path.
 */
export function createDeskLinkMcpHandler(options: DeskLinkMcpHandlerOptions): McpHttpHandler {
  return createMcpHandler(() => {
    const server = new Server(
      { name: 'desklink', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler('tools/list', async () => ({ tools: options.getTools() }));
    server.setRequestHandler('tools/call', async request => {
      const result = await options.callTool(request.params);
      const tool = options.getTools().find(candidate => candidate.name === request.params.name);
      return server.projectCallToolResult(result, tool?.outputSchema);
    });

    return server;
  }, {
    onerror: options.onError
  });
}
