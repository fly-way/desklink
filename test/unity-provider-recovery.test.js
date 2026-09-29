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


test('retries safe manage_ui actions once after a transient bridge read failure', async () => {
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
        content: [{ type: 'text', text: 'Connection closed before reading expected bytes' }],
        structuredContent: { success: false, error: 'Connection closed before reading expected bytes' }
      };
    }
    return { content: [], structuredContent: { success: true } };
  });

  const result = await provider.callTool({
    name: 'manage_ui',
    arguments: { action: 'link_stylesheet' }
  });

  assert.equal(operations, 2);
  assert.equal(selections, 2);
  assert.equal(result.structuredContent.success, true);
});

test('does not retry non-idempotent manage_ui actions after a transient bridge failure', async () => {
  const provider = createProvider();
  let operations = 0;
  attachFakeClient(provider, async params => {
    if (params.name === 'set_active_instance') return { content: [] };
    operations++;
    return {
      content: [{ type: 'text', text: 'Connection closed before reading expected bytes' }],
      structuredContent: { success: false, error: 'Connection closed before reading expected bytes' }
    };
  });

  const result = await provider.callTool({
    name: 'manage_ui',
    arguments: { action: 'create' }
  });

  assert.equal(operations, 1);
  assert.equal(result.structuredContent.success, false);
});

test('filters mislabeled UI list items', () => {
  const provider = createProvider();

  const result = provider.postprocessToolResult(
    { name: 'manage_ui', arguments: { action: 'list' } },
    {
      structuredContent: {
        success: true,
        data: {
          total: 3,
          assets: [
            { path: 'Assets/A.uxml', type: 'uxml' },
            { path: 'Assets/A.uxml', type: 'uss' },
            { path: 'Assets/A.uss', type: 'uss' }
          ]
        }
      }
    }
  );

  assert.equal(result.structuredContent.data.total, 2);
  assert.deepEqual(result.structuredContent.data.assets.map(asset => asset.path), [
    'Assets/A.uxml',
    'Assets/A.uss'
  ]);
});

test('forwards manage_ui screenshot_file_name without injecting unsupported arguments', async () => {
  const provider = createProvider();
  let forwarded;
  attachFakeClient(provider, async params => {
    if (params.name === 'set_active_instance') return { content: [] };
    forwarded = params;
    return { content: [], structuredContent: { success: true } };
  });

  await provider.callTool({
    name: 'manage_ui',
    arguments: {
      action: 'render_ui',
      screenshot_file_name: 'probe.png',
      output_folder: 'Assets/Probe'
    }
  });

  assert.equal(forwarded.arguments.screenshot_file_name, 'probe.png');
  assert.equal(Object.hasOwn(forwarded.arguments, 'file_name'), false);
});

test('updates manage_ui render_ui workflow description for the patched behavior', () => {
  const provider = createProvider();
  provider.capabilityMode = () => 'on';
  provider.tools = [{
    name: 'manage_ui',
    description: [
      'UI Toolkit workflow:',
      '8. Use render_ui to capture a visual preview for self-evaluation',
      '   - In play mode: first call queues a WaitForEndOfFrame screen capture and returns pending=true;',
      '     call render_ui a second time to retrieve the saved PNG (hasContent will be true).',
      '   - In editor mode: assigns a RenderTexture to PanelSettings (best-effort; may stay blank).'
    ].join('\n'),
    inputSchema: { type: 'object', properties: {} }
  }];

  const tool = provider.listTools().find(tool => tool.name === 'manage_ui');

  assert.ok(tool);
  assert.match(tool.description, /play mode: render_ui completes in one call/);
  assert.doesNotMatch(tool.description, /pending=true/);
  assert.match(tool.description, /original PanelSettings targetTexture is restored/);
});