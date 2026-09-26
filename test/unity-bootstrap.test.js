const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  inspectDeskLinkUnityBootstrap,
  installDeskLinkUnityBootstrap,
  requestDeskLinkUnityResolve,
  writeDeskLinkUnityConfig
} = require('../dist/main/providers/unity/unity-bootstrap.js');

function makeProject(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desklink-unity-bootstrap-'));
  fs.mkdirSync(path.join(root, 'Assets'), { recursive: true });
  fs.mkdirSync(path.join(root, 'ProjectSettings'), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('installs the project-scoped DeskLink Unity bootstrap', t => {
  const root = makeProject(t);
  assert.equal(inspectDeskLinkUnityBootstrap(root).installed, false);

  const status = installDeskLinkUnityBootstrap(root);
  const script = fs.readFileSync(status.bootstrapPath, 'utf8');

  assert.equal(status.installed, true);
  assert.match(script, /MCPServiceLocator/);
  assert.match(script, /TransportMode/);
  assert.match(script, /"Stdio"/);
  assert.match(script, /DeskLinkUnityMcp\.json/);
  assert.match(script, /Client\.Resolve\(\)/);
  assert.match(script, /DeskLinkUnityMcpResolve\.request/);
  assert.match(script, /UnityEngine\.Debug\.Log/);
  assert.doesNotMatch(script, /using MCPForUnity/);
});

test('writes project-local auto, manual and disabled configuration', t => {
  const root = makeProject(t);
  installDeskLinkUnityBootstrap(root);

  writeDeskLinkUnityConfig(root, 'manual', 4321);
  let config = JSON.parse(fs.readFileSync(
    path.join(root, 'ProjectSettings', 'DeskLinkUnityMcp.json'), 'utf8'
  ));
  assert.deepEqual(config, { mode: 'manual', manualPid: 4321 });

  writeDeskLinkUnityConfig(root, 'auto');
  config = JSON.parse(fs.readFileSync(
    path.join(root, 'ProjectSettings', 'DeskLinkUnityMcp.json'), 'utf8'
  ));
  assert.deepEqual(config, { mode: 'auto', manualPid: 0 });

  writeDeskLinkUnityConfig(root, 'disabled');
  config = JSON.parse(fs.readFileSync(
    path.join(root, 'ProjectSettings', 'DeskLinkUnityMcp.json'), 'utf8'
  ));
  assert.deepEqual(config, { mode: 'disabled', manualPid: 0 });
});

test('creates a one-shot Unity Package Manager resolve request', t => {
  const root = makeProject(t);
  requestDeskLinkUnityResolve(root);
  const request = path.join(root, 'ProjectSettings', 'DeskLinkUnityMcpResolve.request');

  assert.equal(fs.existsSync(request), true);
  assert.match(fs.readFileSync(request, 'utf8'), /^\d+$/);
});
