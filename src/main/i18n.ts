import { app } from 'electron';

/**
 * Main-process copy. The renderer owns the UI dictionary, but these strings are produced
 * outside the UI layer (log lines, thrown errors, tunnel status hints) and cannot be
 * translated after the fact, so the main process needs its own table. The renderer pushes
 * its active language here (Settings → Language) so both sides agree, including when the
 * operator overrides the system language.
 */
export type MainLocale = 'zh-CN' | 'en-US';

const zh: Record<string, string> = {
  // Log lines
  logTunnelPreparing: 'tunnel-client 未安装，正在准备…',
  logStartingWithCreds: '已保存凭据，正在启动 tunnel-client…',
  logPrepareFailed: 'tunnel 准备失败：{message}',
  logInstallingTunnel: '正在安装 tunnel-client…',
  logWaitCommander: '等待 Desktop Commander 在 127.0.0.1:{port} 就绪…',
  logDownloadNode: '下载 Node.js v{version}…',
  logNodeReady: 'Node.js v{version} 已就绪。',
  logInstallCommander: '正在安装 Desktop Commander（{spec}）…',
  logCommanderInstallFailed: 'Desktop Commander 安装失败：{detail}',
  logCommanderInstalled: 'Desktop Commander {version} 已安装。',

  // Errors / status
  errListenFailed: '无法监听 127.0.0.1:{port}',
  errTunnelIdMissing: 'Tunnel ID 未配置。',
  errApiKeyMissing: 'Runtime API Key 未配置。',
  errCommanderNotReady: 'Desktop Commander 尚未就绪，已取消启动 tunnel-client。请稍后重试。',
  errControlPlaneStalled: '控制面尚未连接：请确认 Tunnel ID 与 Runtime API Key 正确，且本组织已启用 Secure MCP Tunnel；若网络需代理，请在凭据下方填写代理端口。',
  errProbeFailed: 'Control-plane poll: 探测异常',
  errAuthRejected: '控制面拒绝了凭据（401/403）：Runtime API Key 无效或已撤销。',
  errNetUnreachable: '无法连接控制面（网络不可达）。若你的网络需要代理，请在凭据下方填写代理端口（如 7897）。',
  errNodeWindowsOnly: '自动下载 Node 目前仅支持 Windows。',
  errNodeResolveFailed: '未能从 nodejs.org 解析 Windows x64 包。',
  errNodeChecksum: 'Node.js 安装包 SHA-256 校验失败。',
  errNodeUnusable: 'Node.js 解压后不可用，请重试。',
  statusPreparingCommander: '首次启动可能需要下载依赖，正在准备 Desktop Commander…',
  statusStartingCommander: '正在启动 Desktop Commander…',
  trayOpen: '打开 DeskLink',
  trayQuit: '退出 DeskLink',
  msgCredsSaved: '凭据已保存。',
  unityPromptTitle: '检测到 Unity 项目',
  unityPromptMessage: '是否为 {project} 安装并启用 Unity MCP？',
  unityPromptDetail: 'DeskLink 检测到正在运行的 Unity 项目：\n{path}\n\n启用后，ChatGPT 可以通过 MCP 操作 Scene、GameObject、Prefab、Console 等 Unity Editor 能力。\n\n选择“暂不处理”后，本次 Unity 会话不再重复提醒；下次重新打开项目时会再次提示。',
  unityPromptInstall: '安装并启用',
  unityPromptCancel: '暂不处理',
  unityPromptBalloon: '检测到 Unity 项目 {project}，需要确认是否启用 Unity MCP。',
  unityCapabilityRequestTitle: 'Unity 能力请求',
  unityCapabilityRequestMessage: 'ChatGPT 请求使用 Unity {capability}',
  unityCapabilityRequestDetail: '项目：{project}\n{description}\n\n该能力包含 {count} 个当前未暴露的 MCP 工具。',
  unityCapabilityAllowOnce: '本次允许',
  unityCapabilityAlwaysAllow: '始终允许',
  unityCapabilityDeny: '拒绝',
  unityToolsRefreshTitle: '需要刷新 ChatGPT 工具',
  unityToolsRefreshMessage: 'Unity MCP 工具数量已发生变化',
  unityToolsRefreshDetail: 'Unity MCP 工具数量从 {previous} 变为 {current}。\n\n请前往 ChatGPT 插件设置刷新 DeskLink 工具，以便 ChatGPT 使用最新的工具列表。',
  unityToolsRefreshOpen: '前往 ChatGPT 刷新工具',
  unityToolsRefreshLater: '稍后处理',
  unityCapability_animation: 'Animation',
  unityCapabilityDesc_animation: '管理 Animator、Animation Clip、状态机、参数和过渡。',
  unityCapability_testing: 'Testing',
  unityCapabilityDesc_testing: '运行 Unity Test Runner，并查询异步测试任务和结果。',
  unityCapability_build: 'Build',
  unityCapabilityDesc_build: '处理构建目标和 Player Build 等构建操作。',
  unityCapability_profiler: 'Profiler',
  unityCapabilityDesc_profiler: '捕获和读取 Unity Profiler 数据，用于性能分析。',
  unityCapability_graphics: 'Graphics',
  unityCapabilityDesc_graphics: '处理图形设置、Shader 和 Texture 等渲染相关资源。',
  unityCapability_ui: 'UI',
  unityCapabilityDesc_ui: '创建和编辑 Unity UI 相关对象与配置。',
  unityCapability_vfx: 'VFX',
  unityCapabilityDesc_vfx: '处理 Visual Effect / VFX 相关对象与资源。',
  unityCapability_probuilder: 'ProBuilder',
  unityCapabilityDesc_probuilder: '使用 ProBuilder 创建和编辑关卡几何与网格。',
  unityCapability_packages: 'Packages',
  unityCapabilityDesc_packages: '查询、安装、更新和移除 Unity Package。',
  unityCapability_scripting: 'Scripting',
  unityCapabilityDesc_scripting: '在 Unity 语义层创建、验证和结构化编辑 C# 脚本。',
  unityCapability_generative: 'Generative',
  unityCapabilityDesc_generative: '生成或导入图片、音频和 3D 模型资源。',
  unityCapability_advanced: 'Advanced',
  unityCapabilityDesc_advanced: '执行 Editor 菜单、反射、文档查询、自定义工具和请求诊断。',
  unityCapability_raw: 'Raw MCP',
  unityCapabilityDesc_raw: '直接暴露 MCP for Unity 的完整原始工具面，主要用于调试和兼容性检查。'
};

const en: Record<string, string> = {
  // Log lines
  logTunnelPreparing: 'tunnel-client is not installed; preparing…',
  logStartingWithCreds: 'Saved credentials found; starting tunnel-client…',
  logPrepareFailed: 'Tunnel preparation failed: {message}',
  logInstallingTunnel: 'Installing tunnel-client…',
  logWaitCommander: 'Waiting for Desktop Commander on 127.0.0.1:{port}…',
  logDownloadNode: 'Downloading Node.js v{version}…',
  logNodeReady: 'Node.js v{version} is ready.',
  logInstallCommander: 'Installing Desktop Commander ({spec})…',
  logCommanderInstallFailed: 'Desktop Commander installation failed: {detail}',
  logCommanderInstalled: 'Desktop Commander {version} installed.',

  // Errors / status
  errListenFailed: 'Failed to listen on 127.0.0.1:{port}',
  errTunnelIdMissing: 'Tunnel ID is not configured.',
  errApiKeyMissing: 'Runtime API Key is not configured.',
  errCommanderNotReady: 'Desktop Commander is not ready yet; starting tunnel-client was cancelled. Please retry later.',
  errControlPlaneStalled: 'Control plane not connected yet: verify the Tunnel ID and Runtime API Key, and that Secure MCP Tunnel is enabled for your organization; if a proxy is required, set the proxy port below the credentials.',
  errProbeFailed: 'Control-plane poll: probe error',
  errAuthRejected: 'Control plane rejected the credentials (401/403): the Runtime API Key is invalid or revoked.',
  errNetUnreachable: 'Cannot reach the control plane (network unreachable). If your network requires a proxy, set the proxy port (e.g. 7897) below the credentials.',
  errNodeWindowsOnly: 'Automatic Node.js download currently supports Windows only.',
  errNodeResolveFailed: 'Could not resolve the Windows x64 package from nodejs.org.',
  errNodeChecksum: 'Node.js installer SHA-256 checksum failed.',
  errNodeUnusable: 'Node.js is unusable after extraction; please retry.',
  statusPreparingCommander: 'First launch may need to download dependencies; preparing Desktop Commander…',
  statusStartingCommander: 'Starting Desktop Commander…',
  trayOpen: 'Open DeskLink',
  trayQuit: 'Quit DeskLink',
  msgCredsSaved: 'Credentials saved.',
  unityPromptTitle: 'Unity Project Detected',
  unityPromptMessage: 'Install and enable Unity MCP for {project}?',
  unityPromptDetail: 'DeskLink detected a running Unity project:\n{path}\n\nAfter enabling it, ChatGPT can use MCP to work with Unity Editor capabilities such as scenes, GameObjects, prefabs, and the Console.\n\nChoosing “Not Now” will suppress this prompt for the current Unity session; it will appear again the next time the project is opened.',
  unityPromptInstall: 'Install & Enable',
  unityPromptCancel: 'Not Now',
  unityPromptBalloon: 'Unity project {project} was detected and needs confirmation to enable Unity MCP.',
  unityCapabilityRequestTitle: 'Unity Capability Request',
  unityCapabilityRequestMessage: 'ChatGPT wants to use Unity {capability}',
  unityCapabilityRequestDetail: 'Project: {project}\n{description}\n\nThis capability contains {count} MCP tools that are currently hidden.',
  unityCapabilityAllowOnce: 'Allow Once',
  unityCapabilityAlwaysAllow: 'Always Allow',
  unityCapabilityDeny: 'Deny',
  unityToolsRefreshTitle: 'Refresh ChatGPT Tools',
  unityToolsRefreshMessage: 'The Unity MCP tool count changed',
  unityToolsRefreshDetail: 'The Unity MCP tool count changed from {previous} to {current}.\n\nOpen ChatGPT plugin settings and refresh DeskLink tools so ChatGPT uses the latest tool list.',
  unityToolsRefreshOpen: 'Open ChatGPT & Refresh',
  unityToolsRefreshLater: 'Later',
  unityCapability_animation: 'Animation',
  unityCapabilityDesc_animation: 'Manage Animator controllers, animation clips, state machines, parameters, and transitions.',
  unityCapability_testing: 'Testing',
  unityCapabilityDesc_testing: 'Run Unity Test Runner jobs and inspect asynchronous test results.',
  unityCapability_build: 'Build',
  unityCapabilityDesc_build: 'Work with build targets and Player build operations.',
  unityCapability_profiler: 'Profiler',
  unityCapabilityDesc_profiler: 'Capture and inspect Unity Profiler data for performance analysis.',
  unityCapability_graphics: 'Graphics',
  unityCapabilityDesc_graphics: 'Work with graphics settings, shaders, textures, and rendering-related assets.',
  unityCapability_ui: 'UI',
  unityCapabilityDesc_ui: 'Create and edit Unity UI objects and configuration.',
  unityCapability_vfx: 'VFX',
  unityCapabilityDesc_vfx: 'Work with Visual Effect / VFX objects and assets.',
  unityCapability_probuilder: 'ProBuilder',
  unityCapabilityDesc_probuilder: 'Create and edit level geometry and meshes with ProBuilder.',
  unityCapability_packages: 'Packages',
  unityCapabilityDesc_packages: 'Inspect, install, update, and remove Unity packages.',
  unityCapability_scripting: 'Scripting',
  unityCapabilityDesc_scripting: 'Create, validate, and structurally edit C# scripts through Unity-aware operations.',
  unityCapability_generative: 'Generative',
  unityCapabilityDesc_generative: 'Generate or import image, audio, and 3D model assets.',
  unityCapability_advanced: 'Advanced',
  unityCapabilityDesc_advanced: 'Run Editor menu actions, reflection, documentation queries, custom tools, and request diagnostics.',
  unityCapability_raw: 'Raw MCP',
  unityCapabilityDesc_raw: 'Expose the complete raw MCP for Unity tool surface, mainly for debugging and compatibility checks.'
};

/** Set by the renderer (Settings → Language); null means "follow the system". */
let override: MainLocale | null = null;

function systemLocale(): MainLocale {
  try {
    // Mirrors the renderer rule: only Simplified Chinese counts, everything else is English.
    const tag = (app.getLocale() || 'en-US').toLowerCase();
    return tag.startsWith('zh') && (tag.includes('cn') || tag.includes('hans')) ? 'zh-CN' : 'en-US';
  } catch {
    return 'en-US';
  }
}

export function setLocale(next: string | null): void {
  override = next === 'zh-CN' ? 'zh-CN' : next === 'en-US' ? 'en-US' : null;
}

/** Translates a main-process message key, substituting `{name}` placeholders. */
export function tm(key: string, params: Record<string, string | number> = {}): string {
  const dict = (override ?? systemLocale()) === 'zh-CN' ? zh : en;
  const template = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : (en[key] ?? key);
  return template.replace(/\{(\w+)\}/g, (_all, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : `{${name}}`
  );
}
