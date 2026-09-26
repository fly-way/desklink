const assert = require('node:assert/strict');
const test = require('node:test');
const { ProviderManager } = require('../dist/main/providers/provider-manager.js');

function provider(id, toolNames, calls, resources = []) {
  let phase = 'ready';
  return {
    id,
    name: id,
    mode: 'always',
    async start() { phase = 'ready'; },
    async stop() { phase = 'idle'; },
    getStatus() {
      return { id, name: id, phase, mode: 'always', detail: '', toolCount: toolNames.length };
    },
    listTools() {
      return toolNames.map(name => ({
        name,
        description: `${id}:${name}`,
        inputSchema: { type: 'object', properties: {} }
      }));
    },
    async callTool(params) {
      calls.push({ id, params });
      return { content: [{ type: 'text', text: `${id}:${params.name}` }] };
    },
    async listResources() { return { resources }; },
    async readResource(params) {
      calls.push({ id, resource: params.uri });
      return { contents: [{ uri: params.uri, text: id }] };
    }
  };
}

test('aggregates tools and routes collisions to the owning provider', async () => {
  const calls = [];
  const logs = [];
  const manager = new ProviderManager([
    provider('alpha', ['echo', 'read'], calls),
    provider('beta', ['echo', 'write'], calls)
  ], () => {}, line => logs.push(line));

  assert.deepEqual(
    manager.listTools().map(tool => tool.name),
    ['echo', 'read', 'beta__echo', 'write']
  );

  await manager.callTool({ name: 'echo', arguments: { value: 1 } });
  await manager.callTool({ name: 'beta__echo', arguments: { value: 2 } });

  assert.equal(calls[0].id, 'alpha');
  assert.equal(calls[0].params.name, 'echo');
  assert.equal(calls[1].id, 'beta');
  assert.equal(calls[1].params.name, 'echo');
  assert.match(logs.join(''), /tool collision/i);
});
test('merges resources and routes reads by URI', async () => {
  const calls = [];
  const manager = new ProviderManager([
    provider('alpha', [], calls, [{ uri: 'ui://alpha/view', name: 'Alpha' }]),
    provider('beta', [], calls, [{ uri: 'ui://beta/view', name: 'Beta' }])
  ], () => {}, () => {});

  const listed = await manager.listResources();
  assert.deepEqual(listed.resources.map(resource => resource.uri), [
    'ui://alpha/view',
    'ui://beta/view'
  ]);

  const read = await manager.readResource({ uri: 'ui://beta/view' });
  assert.equal(read.contents[0].text, 'beta');
  assert.deepEqual(calls.at(-1), { id: 'beta', resource: 'ui://beta/view' });
});

test('keeps healthy providers available when another provider fails to start', async () => {
  const logs = [];
  const healthyCalls = [];
  const broken = provider('broken', ['bad'], []);
  broken.start = async () => {
    broken.getStatus = () => ({
      id: 'broken', name: 'broken', phase: 'error', mode: 'always', detail: 'boom', toolCount: 0
    });
    throw new Error('boom');
  };
  const healthy = provider('healthy', ['ok'], healthyCalls);
  const manager = new ProviderManager([broken, healthy], () => {}, line => logs.push(line));

  await manager.start();

  assert.deepEqual(manager.listTools().map(tool => tool.name), ['ok']);
  assert.match(logs.join(''), /broken start failed/i);
  await manager.callTool({ name: 'ok' });
  assert.equal(healthyCalls.at(-1).id, 'healthy');
});
