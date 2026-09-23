const assert = require('node:assert/strict');
const test = require('node:test');
const { createDeskLinkMcpHandler } = require('../dist/main/mcp-handler.js');

const protocolVersion = '2026-07-28';
const tools = [{
  name: 'echo',
  description: 'Echoes text.',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text']
  }
}];

function modernRequest(method, params = {}) {
  const headers = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    'mcp-method': method,
    'mcp-protocol-version': protocolVersion
  };
  if (method === 'tools/call') headers['mcp-name'] = params.name;

  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': protocolVersion,
          'io.modelcontextprotocol/clientInfo': { name: 'desklink-test', version: '1.0.0' },
          'io.modelcontextprotocol/clientCapabilities': {}
        }
      }
    })
  });
}

test('serves MCP 2026 discovery, tools/list, and tools/call', async t => {
  let callParams;
  const handler = createDeskLinkMcpHandler({
    getTools: () => tools,
    callTool: async params => {
      callParams = params;
      return { content: [{ type: 'text', text: params.arguments.text }] };
    }
  });
  t.after(() => handler.close());

  const discoverResponse = await handler.fetch(modernRequest('server/discover'));
  assert.equal(discoverResponse.status, 200);
  const discover = await discoverResponse.json();
  assert.deepEqual(discover.result.supportedVersions, [protocolVersion]);
  assert.deepEqual(discover.result.capabilities, { tools: {} });
  assert.equal(discover.result.resultType, 'complete');
  assert.equal(discover.result.ttlMs, 0);
  assert.equal(discover.result.cacheScope, 'private');
  assert.deepEqual(discover.result._meta['io.modelcontextprotocol/serverInfo'], {
    name: 'desklink',
    version: '0.1.0'
  });

  const listResponse = await handler.fetch(modernRequest('tools/list'));
  assert.equal(listResponse.status, 200);
  const listed = await listResponse.json();
  assert.deepEqual(listed.result.tools, tools);
  assert.equal(listed.result.resultType, 'complete');

  const callResponse = await handler.fetch(modernRequest('tools/call', {
    name: 'echo',
    arguments: { text: 'hello' }
  }));
  assert.equal(callResponse.status, 200);
  const called = await callResponse.json();
  assert.deepEqual(callParams, { name: 'echo', arguments: { text: 'hello' } });
  assert.deepEqual(called.result.content, [{ type: 'text', text: 'hello' }]);
  assert.equal(called.result.resultType, 'complete');
});

test('keeps the stateless MCP 2025 initialize flow working', async t => {
  const handler = createDeskLinkMcpHandler({
    getTools: () => tools,
    callTool: async () => ({ content: [] })
  });
  t.after(() => handler.close());

  const response = await handler.fetch(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'legacy-test', version: '1.0.0' }
      }
    })
  }));

  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /"protocolVersion":"2025-11-25"/);
  assert.match(body, /"serverInfo":\{"name":"desklink","version":"0.1.0"\}/);
});
