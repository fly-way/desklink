const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  inspectUnityMcpPackage,
  installUnityMcpPackage
} = require('../dist/main/providers/unity/unity-package.js');
const {
  UNITY_MCP_PACKAGE,
  UNITY_MCP_PACKAGE_URL,
  UNITY_MCP_VERSION
} = require('../dist/main/providers/unity/unity-constants.js');

function makeProject(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desklink-unity-'));
  const packages = path.join(root, 'Packages');
  fs.mkdirSync(packages, { recursive: true });
  fs.mkdirSync(path.join(root, 'Assets'));
  fs.mkdirSync(path.join(root, 'ProjectSettings'));
  fs.writeFileSync(path.join(packages, 'manifest.json'), JSON.stringify({
    dependencies: { 'com.unity.test-framework': '1.1.31' }
  }, null, 2) + '\n');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
test('inspects a Unity project without modifying it', t => {
  const root = makeProject(t);
  const manifest = path.join(root, 'Packages', 'manifest.json');
  const before = fs.readFileSync(manifest, 'utf8');

  const status = inspectUnityMcpPackage(root);

  assert.equal(status.installed, false);
  assert.equal(status.version, '');
  assert.equal(fs.readFileSync(manifest, 'utf8'), before);
  assert.equal(fs.existsSync(manifest + '.desklink.bak'), false);
});

test('installs the pinned MCP for Unity package and keeps a backup', t => {
  const root = makeProject(t);
  const manifest = path.join(root, 'Packages', 'manifest.json');
  const before = fs.readFileSync(manifest, 'utf8');

  const installed = installUnityMcpPackage(root);
  const json = JSON.parse(fs.readFileSync(manifest, 'utf8'));

  assert.equal(installed.installed, false);
  assert.equal(installed.declared, true);
  assert.equal(installed.resolved, false);
  assert.equal(installed.version, UNITY_MCP_VERSION);
  assert.equal(json.dependencies[UNITY_MCP_PACKAGE], UNITY_MCP_PACKAGE_URL);
  assert.equal(fs.readFileSync(manifest + '.desklink.bak', 'utf8'), before);

  const inspected = inspectUnityMcpPackage(root);
  assert.equal(inspected.installed, false);
  assert.equal(inspected.declared, true);
  assert.equal(inspected.version, UNITY_MCP_VERSION);
});

test('reports installed only after Unity resolves and imports the package', t => {
  const root = makeProject(t);
  installUnityMcpPackage(root);

  fs.writeFileSync(path.join(root, 'Packages', 'packages-lock.json'), JSON.stringify({
    dependencies: {
      [UNITY_MCP_PACKAGE]: { version: UNITY_MCP_PACKAGE_URL, depth: 0, source: 'git' }
    }
  }, null, 2));

  const cache = path.join(root, 'Library', 'PackageCache', UNITY_MCP_PACKAGE + '@abc123');
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, 'package.json'), JSON.stringify({
    name: UNITY_MCP_PACKAGE,
    version: UNITY_MCP_VERSION
  }));

  const status = inspectUnityMcpPackage(root);
  assert.equal(status.declared, true);
  assert.equal(status.resolved, true);
  assert.equal(status.installed, true);
  assert.equal(status.version, UNITY_MCP_VERSION);
  assert.equal(status.packagePath, cache);
});
