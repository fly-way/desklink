import type { Tool } from '@modelcontextprotocol/server';
import type { UnityCapabilityId, UnityCapabilityMode } from '../../../shared/types.js';

export type UnityCoreCapabilityDefinition = {
  id: string;
  label: string;
  description: string;
  toolNames: readonly string[];
};

export type UnityCapabilityDefinition = {
  id: UnityCapabilityId;
  label: string;
  description: string;
  toolNames: readonly string[];
  defaultMode: UnityCapabilityMode;
};

export type UnityCapabilityDecision = 'once' | 'always' | 'deny';
export type UnityCapabilityRequest = {
  id: UnityCapabilityId;
  label: string;
  description: string;
  toolNames: string[];
  projectName: string;
};

export const UNITY_CORE_CAPABILITY_DEFINITIONS: readonly UnityCoreCapabilityDefinition[] = [
  { id: 'scene', label: 'Scene', description: 'Create, inspect, open, and save Unity scenes.', toolNames: ['manage_scene'] },
  { id: 'gameobjects', label: 'GameObjects', description: 'Find, create, duplicate, transform, parent, and delete GameObjects.', toolNames: ['find_gameobjects', 'manage_gameobject'] },
  { id: 'components', label: 'Components', description: 'Add, remove, inspect, and configure components on GameObjects.', toolNames: ['manage_components'] },
  { id: 'assets', label: 'Assets & Materials', description: 'Create, inspect, move, and manage project assets and materials.', toolNames: ['manage_asset', 'manage_material'] },
  { id: 'prefabs', label: 'Prefabs', description: 'Create, inspect, update, and instantiate prefabs.', toolNames: ['manage_prefabs'] },
  { id: 'editor', label: 'Editor & Console', description: 'Control Editor state, refresh Unity, and read Console output.', toolNames: ['manage_editor', 'read_console', 'refresh_unity'] },
  { id: 'physics', label: 'Physics', description: 'Configure Unity physics-related objects and settings.', toolNames: ['manage_physics'] },
  { id: 'camera', label: 'Camera', description: 'Create, inspect, and configure Unity cameras.', toolNames: ['manage_camera'] },
  { id: 'scriptable_objects', label: 'ScriptableObjects', description: 'Create and manage ScriptableObject assets.', toolNames: ['manage_scriptable_object'] },
  { id: 'automation', label: 'Automation', description: 'Batch Unity operations and execute temporary Editor/runtime C# for automation and diagnostics.', toolNames: ['batch_execute', 'execute_code'] }
];

export const UNITY_CORE_TOOL_NAMES = UNITY_CORE_CAPABILITY_DEFINITIONS.flatMap(capability => capability.toolNames);

export const UNITY_INTERNAL_TOOL_NAMES = ['set_active_instance'] as const;

export const UNITY_CAPABILITY_DEFINITIONS: readonly UnityCapabilityDefinition[] = [
  { id: 'animation', label: 'Animation', description: 'Animator, clips, states, and transitions.', toolNames: ['manage_animation'], defaultMode: 'ask' },
  { id: 'testing', label: 'Testing', description: 'Run Unity tests and inspect asynchronous test jobs.', toolNames: ['run_tests', 'get_test_job'], defaultMode: 'ask' },
  { id: 'build', label: 'Build', description: 'Build targets and player build operations.', toolNames: ['manage_build'], defaultMode: 'ask' },
  { id: 'profiler', label: 'Profiler', description: 'Unity profiler capture and inspection.', toolNames: ['manage_profiler'], defaultMode: 'ask' },
  { id: 'graphics', label: 'Graphics', description: 'Graphics, shaders, and textures.', toolNames: ['manage_graphics', 'manage_shader', 'manage_texture'], defaultMode: 'ask' },
  { id: 'ui', label: 'UI', description: 'Unity UI authoring operations.', toolNames: ['manage_ui'], defaultMode: 'ask' },
  { id: 'vfx', label: 'VFX', description: 'Visual effects operations.', toolNames: ['manage_vfx'], defaultMode: 'ask' },
  { id: 'probuilder', label: 'ProBuilder', description: 'ProBuilder mesh authoring operations.', toolNames: ['manage_probuilder'], defaultMode: 'ask' },
  { id: 'packages', label: 'Packages', description: 'Unity Package Manager operations.', toolNames: ['manage_packages'], defaultMode: 'ask' },
  {
    id: 'scripting', label: 'Scripting', description: 'Unity script creation, validation, and structured text edits.', defaultMode: 'ask',
    toolNames: ['find_in_file', 'apply_text_edits', 'create_script', 'delete_script', 'validate_script', 'manage_script', 'manage_script_capabilities', 'get_sha', 'script_apply_edits']
  },
  {
    id: 'generative', label: 'Generative', description: 'Generate or import image, audio, and model assets.', defaultMode: 'ask',
    toolNames: ['generate_audio', 'generate_image', 'generate_model', 'import_model', 'import_model_file']
  },  {
    id: 'advanced', label: 'Advanced', description: 'Menus, reflection, docs, custom tools, and request diagnostics.', defaultMode: 'ask',
    toolNames: ['debug_request_context', 'execute_menu_item', 'manage_tools', 'unity_docs', 'unity_reflect']
  },
  { id: 'raw', label: 'Raw MCP', description: 'Expose every upstream MCP for Unity tool without filtering.', toolNames: [], defaultMode: 'off' }
];

export function findUnityCapability(id: string): UnityCapabilityDefinition | undefined {
  return UNITY_CAPABILITY_DEFINITIONS.find(capability => capability.id === id);
}

export function selectUnityTools(
  upstream: readonly Tool[],
  modeFor: (capability: UnityCapabilityDefinition) => UnityCapabilityMode,
  temporary: ReadonlySet<UnityCapabilityId> = new Set()
): Tool[] {
  const enabled = (capability: UnityCapabilityDefinition) =>
    temporary.has(capability.id) || modeFor(capability) === 'on';
  const raw = findUnityCapability('raw');
  if (raw && enabled(raw)) return [...upstream];

  const visibleNames = new Set<string>(UNITY_CORE_TOOL_NAMES);
  for (const capability of UNITY_CAPABILITY_DEFINITIONS) {
    if (capability.id === 'raw' || !enabled(capability)) continue;
    for (const name of capability.toolNames) visibleNames.add(name);
  }

  const visible = upstream.filter(tool => visibleNames.has(tool.name));
  const ask = UNITY_CAPABILITY_DEFINITIONS.filter(capability =>
    !temporary.has(capability.id) && modeFor(capability) === 'ask'
  );
  if (ask.length) visible.push(createUnityCapabilitiesTool(ask));
  return visible;
}

export function createUnityCapabilitiesTool(capabilities: readonly UnityCapabilityDefinition[]): Tool {
  const labels = capabilities.map(capability => capability.label).join(', ');
  return {
    name: 'unity_capabilities',
    description: `Request an optional Unity capability that is currently hidden in Ask mode. Available: ${labels}. Do not use this tool for Unity operations that already have an exposed tool.`,
    inputSchema: {
      type: 'object',
      properties: {
        capability: {
          type: 'string',
          enum: capabilities.map(capability => capability.id),
          description: 'Optional capability to request for the current Unity session.'
        }
      },      required: ['capability'],
      additionalProperties: false
    }
  } as Tool;
}