export type DesktopCommanderCapabilityDefinition = {
  id: string;
  toolNames: readonly string[];
};

export const DESKTOP_COMMANDER_CAPABILITIES: readonly DesktopCommanderCapabilityDefinition[] = [
  {
    id: 'files',
    toolNames: ['read_file', 'read_multiple_files', 'write_file', 'write_pdf', 'create_directory', 'list_directory', 'move_file', 'get_file_info', 'edit_block']
  },
  {
    id: 'search',
    toolNames: ['start_search', 'get_more_search_results', 'stop_search', 'list_searches']
  },
  {
    id: 'terminal',
    toolNames: ['start_process', 'read_process_output', 'interact_with_process', 'force_terminate', 'list_sessions']
  },
  {
    id: 'processes',
    toolNames: ['list_processes', 'kill_process']
  },
  {
    id: 'configuration',
    toolNames: ['get_config', 'set_config_value']
  },
  {
    id: 'history',
    toolNames: ['get_usage_stats', 'get_recent_tool_calls']
  },
  {
    id: 'assistance',
    toolNames: ['get_prompts', 'give_feedback_to_desktop_commander']
  }
];

export function summarizeDesktopCommanderCapabilities(toolNames: readonly string[]) {
  const available = new Set(toolNames);
  const classified = new Set(DESKTOP_COMMANDER_CAPABILITIES.flatMap(capability => capability.toolNames));
  const capabilities = DESKTOP_COMMANDER_CAPABILITIES.map(capability => ({
    id: capability.id,
    toolCount: capability.toolNames.filter(name => available.has(name)).length
  })).filter(capability => capability.toolCount > 0);
  const otherToolCount = toolNames.filter(name => !classified.has(name)).length;
  if (otherToolCount > 0) capabilities.push({ id: 'other', toolCount: otherToolCount });
  return capabilities;
}