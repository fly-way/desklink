const assert = require('node:assert/strict');
const test = require('node:test');
const {
  UNITY_CAPABILITY_DEFINITIONS,
  UNITY_CORE_TOOL_NAMES,
  UNITY_INTERNAL_TOOL_NAMES,
  selectUnityTools
} = require('../dist/main/providers/unity/unity-capabilities.js');

const upstream = [
  'manage_scene',
  'manage_gameobject',
  'manage_animation',
  'run_tests',
  'get_test_job',
  'manage_build',
  'manage_profiler',
  'unity_reflect'
].map(name => ({
  name,
  description: name,
  inputSchema: { type: 'object', properties: {} }
}));

function modes(overrides = {}) {
  return capability => overrides[capability.id] || 'off';
}

function names(tools) {
  return tools.map(tool => tool.name);
}
test('all optional capabilities off exposes only core tools', () => {
  const exposed = selectUnityTools(upstream, modes());
  assert.deepEqual(names(exposed), ['manage_scene', 'manage_gameobject']);
});

test('one on capability exposes its real tool without discovery', () => {
  const exposed = selectUnityTools(upstream, modes({ animation: 'on' }));
  assert.deepEqual(names(exposed), ['manage_scene', 'manage_gameobject', 'manage_animation']);
  assert.equal(names(exposed).includes('unity_capabilities'), false);
});

test('ask keeps real tools hidden and exposes only discoverable ask ids', () => {
  const exposed = selectUnityTools(upstream, modes({ animation: 'ask', testing: 'ask' }));
  assert.equal(names(exposed).includes('manage_animation'), false);
  assert.equal(names(exposed).includes('run_tests'), false);
  const discovery = exposed.find(tool => tool.name === 'unity_capabilities');
  assert.ok(discovery);
  assert.deepEqual(discovery.inputSchema.properties.capability.enum, ['animation', 'testing']);
});

test('temporary grant exposes an ask capability without persisting on', () => {
  const temporary = new Set(['animation']);
  const exposed = selectUnityTools(upstream, modes({ animation: 'ask' }), temporary);
  assert.equal(names(exposed).includes('manage_animation'), true);
  assert.equal(names(exposed).includes('unity_capabilities'), false);
});
test('raw on exposes every upstream tool and suppresses discovery', () => {
  const exposed = selectUnityTools(upstream, modes({ raw: 'on', animation: 'ask' }));
  assert.deepEqual(names(exposed), names(upstream));
});

test('capability ids remain unique', () => {
  const ids = UNITY_CAPABILITY_DEFINITIONS.map(capability => capability.id);
  assert.equal(new Set(ids).size, ids.length);
});
const pinnedUpstreamNames = [
  'batch_execute', 'debug_request_context', 'execute_code', 'execute_menu_item',
  'find_gameobjects', 'find_in_file', 'generate_audio', 'generate_image',
  'generate_model', 'import_model', 'import_model_file', 'manage_animation',
  'manage_asset', 'manage_build', 'manage_camera', 'manage_components',
  'manage_editor', 'manage_gameobject', 'manage_graphics', 'manage_material',
  'manage_packages', 'manage_physics', 'manage_prefabs', 'manage_probuilder',
  'manage_profiler', 'manage_scene', 'refresh_unity', 'apply_text_edits',
  'create_script', 'delete_script', 'validate_script', 'manage_script',
  'manage_script_capabilities', 'get_sha', 'manage_scriptable_object',
  'manage_shader', 'manage_texture', 'manage_tools', 'manage_ui', 'manage_vfx',
  'read_console', 'run_tests', 'get_test_job', 'script_apply_edits',
  'set_active_instance', 'unity_docs', 'unity_reflect'
];

test('pinned MCP for Unity 10.2.0 tools are intentionally classified', () => {
  const classified = new Set([
    ...UNITY_CORE_TOOL_NAMES,
    ...UNITY_INTERNAL_TOOL_NAMES,
    ...UNITY_CAPABILITY_DEFINITIONS.flatMap(capability => capability.toolNames)
  ]);
  assert.equal(pinnedUpstreamNames.length, 47);
  assert.deepEqual(pinnedUpstreamNames.filter(name => !classified.has(name)), []);
});