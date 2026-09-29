const assert = require('node:assert/strict');
const test = require('node:test');
const { UnityProvider } = require('../dist/main/providers/unity/unity-provider.js');

function createProvider() {
  return new UnityProvider({
    dir: 'F:\\desklink\\.test',
    toolsDir: 'F:\\desklink\\.test\\tools'
  }, () => {});
}

function attachFakeClient(provider, callTool) {
  provider.phase = 'ready';
  provider.proxiesResources = true;
  provider.activeProject = {
    projectPath: 'F:\\UnityProject\\AIFarm',
    projectName: 'AIFarm',
    unityVersion: '2021.3.45f1c2',
    pid: 1234
  };
  provider.tools = [{
    name: 'set_active_instance',
    description: '',
    inputSchema: { type: 'object', properties: {} }
  }];
  provider.client = {
    callTool,
    readResource: async () => ({
      contents: [{
        text: JSON.stringify({
          instances: [{ id: 'aifarm-instance', name: 'AIFarm', path: 'F:/UnityProject/AIFarm' }]
        })
      }]
    })
  };
}

test('reselects the active Unity instance even when the instance id is unchanged', async () => {
  const provider = createProvider();
  let selections = 0;
  attachFakeClient(provider, async params => {
    if (params.name === 'set_active_instance') selections++;
    return { content: [] };
  });
  provider.activeInstanceId = 'aifarm-instance';

  const connected = await provider.probeBridge(provider.activeProject);

  assert.equal(connected, true);
  assert.equal(selections, 1);
});

test('retries a tool once after the upstream loses its active Unity instance', async () => {
  const provider = createProvider();
  let selections = 0;
  let operations = 0;
  attachFakeClient(provider, async params => {
    if (params.name === 'set_active_instance') {
      selections++;
      return { content: [] };
    }
    operations++;
    if (operations === 1) {
      return {
        content: [{ type: 'text', text: 'No Unity Editor instances found. Please ensure Unity is running.' }],
        structuredContent: { success: false }
      };
    }
    return { content: [], structuredContent: { success: true } };
  });
  provider.activeInstanceId = 'aifarm-instance';

  const result = await provider.callTool({ name: 'manage_components', arguments: {} });

  assert.equal(operations, 2);
  assert.equal(selections, 2);
  assert.equal(result.structuredContent.success, true);
});

test('keeps tool routes available during transient bridge probe misses', async t => {
  const discovery = require('../dist/main/providers/unity/unity-discovery.js');
  const unityPackage = require('../dist/main/providers/unity/unity-package.js');
  const bootstrap = require('../dist/main/providers/unity/unity-bootstrap.js');
  const project = {
    projectPath: 'F:\\UnityProject\\AIFarm',
    projectName: 'AIFarm',
    unityVersion: '2021.3.45f1c2',
    pid: 1234
  };
  const originals = {
    discover: discovery.discoverUnityProjects,
    inspectPackage: unityPackage.inspectUnityMcpPackage,
    inspectBootstrap: bootstrap.inspectDeskLinkUnityBootstrap,
    writeConfig: bootstrap.writeDeskLinkUnityConfig
  };
  t.after(() => {
    discovery.discoverUnityProjects = originals.discover;
    unityPackage.inspectUnityMcpPackage = originals.inspectPackage;
    bootstrap.inspectDeskLinkUnityBootstrap = originals.inspectBootstrap;
    bootstrap.writeDeskLinkUnityConfig = originals.writeConfig;
  });
  discovery.discoverUnityProjects = async () => [project];
  unityPackage.inspectUnityMcpPackage = () => ({
    installed: true, declared: true, resolved: true, version: '10.2.0', spec: ''
  });
  bootstrap.inspectDeskLinkUnityBootstrap = () => ({ installed: true });
  bootstrap.writeDeskLinkUnityConfig = () => {};

  const provider = new UnityProvider({
    dir: 'F:\\desklink\\.test',
    toolsDir: 'F:\\desklink\\.test\\tools',
    getUnityProjectPreference: () => ({ mode: 'auto', installationApproved: true }),
    getUnityCapabilityMode: () => 'off'
  }, () => {});
  provider.activeProject = project;
  provider.packageStatus = unityPackage.inspectUnityMcpPackage();
  provider.client = {};
  provider.phase = 'ready';
  provider.bridgeConnected = true;
  provider.tools = [{
    name: 'manage_scene',
    description: '',
    inputSchema: { type: 'object', properties: {} }
  }];
  provider.probeBridge = async () => false;

  await provider.refresh();

  assert.equal(provider.phase, 'ready');
  assert.equal(provider.bridgeMisses, 1);
  assert.equal(provider.bridgeConnected, false);
  assert.match(provider.detail, /keeping existing tool routes/);
  assert.deepEqual(provider.listTools().map(tool => tool.name), ['manage_scene']);
});


test('ensures the active Unity instance immediately before every tool call', async () => {
  const provider = createProvider();
  const calls = [];
  attachFakeClient(provider, async params => {
    calls.push(params.name);
    if (params.name === 'set_active_instance') return { content: [] };
    return { content: [], structuredContent: { success: true } };
  });

  const result = await provider.callTool({ name: 'manage_scene', arguments: { action: 'get_active' } });

  assert.deepEqual(calls, ['set_active_instance', 'manage_scene']);
  assert.equal(result.structuredContent.success, true);
});


test('waits through transient Unity bridge loss before allowing a tool call', async () => {
  const provider = createProvider();
  const calls = [];
  attachFakeClient(provider, async params => {
    calls.push(params.name);
    return { content: [], structuredContent: { success: true } };
  });

  let probes = 0;
  provider.probeBridge = async () => {
    probes++;
    return probes >= 3;
  };

  const ready = await provider.ensureBridgeReady(provider.activeProject, 100, 1);

  assert.equal(ready, true);
  assert.equal(probes, 3);
  assert.deepEqual(calls, []);
});
