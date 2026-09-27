const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DESKTOP_COMMANDER_CAPABILITIES,
  summarizeDesktopCommanderCapabilities
} = require('../dist/main/providers/desktop-commander-capabilities.js');

const currentTools = [
  'get_config', 'set_config_value', 'read_file', 'read_multiple_files',
  'write_file', 'write_pdf', 'create_directory', 'list_directory', 'move_file',
  'start_search', 'get_more_search_results', 'stop_search', 'list_searches',
  'get_file_info', 'edit_block', 'start_process', 'read_process_output',
  'interact_with_process', 'force_terminate', 'list_sessions', 'list_processes',
  'kill_process', 'get_usage_stats', 'get_recent_tool_calls',
  'give_feedback_to_desktop_commander', 'get_prompts'
];

test('current Desktop Commander tools are grouped without duplication', () => {
  const classified = DESKTOP_COMMANDER_CAPABILITIES.flatMap(capability => capability.toolNames);
  assert.equal(new Set(classified).size, classified.length);
  assert.deepEqual(currentTools.filter(name => !classified.includes(name)), []);
});

test('summarizes available Desktop Commander capabilities by group', () => {
  const result = summarizeDesktopCommanderCapabilities(currentTools);
  assert.deepEqual(result.map(item => item.id), [
    'files', 'search', 'terminal', 'processes', 'configuration', 'history', 'assistance'
  ]);
  assert.equal(result.reduce((sum, item) => sum + item.toolCount, 0), currentTools.length);
});

test('unknown future tools are surfaced as other capability', () => {
  const result = summarizeDesktopCommanderCapabilities(['read_file', 'future_tool']);
  assert.deepEqual(result, [
    { id: 'files', toolCount: 1 },
    { id: 'other', toolCount: 1 }
  ]);
});