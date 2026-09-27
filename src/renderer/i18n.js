'use strict';

/**
 * Minimal two-language i18n for DeskLink.
 * Chinese is used only for Simplified Chinese (zh-CN / zh-Hans); every other
 * system locale falls back to English.
 */
(function () {
  const zh = {
    // Static sidebar / titlebar
    titleStatusDefault: '未连接',
    winMin: '最小化',
    winMax: '最大化',
    winClose: '关闭',
    viewOverview: '概览',
    viewTunnel: '隧道',
    viewProviders: 'Provider',
    viewLogs: '日志',
    viewDiagnostics: '诊断',

    // Settings
    viewSettings: '设置',
    settingsSubtitle: '应用偏好与关于信息。',
    settingsGeneral: '通用',
    settingLang: '语言',
    langAuto: '跟随系统',
    langZh: '简体中文',
    langEn: 'English',
    settingsTunnel: '隧道',
    proxyInSettings: '在「设置」中配置',
    aboutDesklink: '关于 DeskLink',
    desklinkVersion: 'DeskLink 版本',
    checkAppUpdate: '检查更新',
    updateResultLatest: '已是最新版本（{version}）',
    updateAvailableDesklink: '发现新版本 {latest}（当前 {current}）',
    updateCheckFailed: '无法获取更新信息，请稍后重试',

    // Phase / status
    phaseIdle: '未启动',
    phaseStarting: '启动中',
    phaseReady: '已就绪',
    phaseError: '错误',

    // Tunnel text state
    tunInstalling: '正在安装 tunnel-client…',
    tunConnected: '已就绪',
    tunLocalReady: '本地就绪，等待控制面',
    tunOnline: '在线，等待就绪',
    tunProcess: '进程已启动',
    tunDisconnected: '未连接',

    // Overview
    ovSubtitle: 'DeskLink 将多个本机 MCP Provider 汇聚到一个安全隧道端点。',
    rowTunnel: '隧道',
    rowToolCount: '工具数量',
    rowMcpEndpoint: 'MCP 端点',
    btnRestartCommander: '重启 Desktop Commander',
    restarting: '重启中…',
    restartedCommander: '已重启 Desktop Commander',
    noteToolsForward: '工具清单由当前已就绪的 Provider 汇总提供',
    secStatus: '运行状态',
    secLink: '链路',
    flowText: 'ChatGPT → Secure MCP Tunnel → DeskLink Gateway → 本机 MCP Provider → Desktop Commander / Unity MCP / 其他服务',

    // Providers
    providersSubtitle: '本机能力来源。DeskLink 统一管理连接、工具路由和生命周期。',
    providersEmpty: '尚未注册 Provider。',
    providerState: '状态',
    providerMode: '启动模式',
    providerTransport: '传输',
    providerVersion: '版本',
    providerDetail: '详情',
    providerMode_always: '始终启用',
    providerMode_auto: '自动',
    providerMode_manual: '手动',
    providerMode_disabled: '禁用',
    dcManageCapabilities: 'AI 能力…',
    dcCapabilitiesTitle: 'Desktop Commander AI 能力',
    dcCapabilitiesSubtitle: '查看 Desktop Commander 当前向 AI 提供的本地电脑能力。',
    dcCapabilitiesNote: '这里按能力组展示当前版本实际提供的 MCP 工具，仅用于查看能力范围，不改变工具权限。',
    dcCapabilitiesUnavailable: 'Desktop Commander 尚未就绪，暂时无法读取能力。',
    dcCapabilityToolCount: '{n} 个工具',
    dcUpdateAvailable: '可更新到 {latest}',
    dcCapability_files: '文件与编辑',
    dcCapabilityDesc_files: '读取和写入文件、创建目录、移动文件、读取文件信息、块级编辑，以及创建 PDF。',
    dcCapability_search: '文件搜索',
    dcCapabilityDesc_search: '在本地目录中搜索文件和内容，并管理长时间运行的搜索会话。',
    dcCapability_terminal: '终端会话',
    dcCapabilityDesc_terminal: '启动命令或 REPL、读取输出、交互输入、管理并终止终端会话。',
    dcCapability_processes: '系统进程',
    dcCapabilityDesc_processes: '查看正在运行的系统进程，并在需要时终止指定进程。',
    dcCapability_configuration: '配置',
    dcCapabilityDesc_configuration: '读取和修改 Desktop Commander 的本地配置与安全相关设置。',
    dcCapability_history: '使用记录与诊断',
    dcCapabilityDesc_history: '查看工具使用统计和最近的工具调用记录，用于诊断与恢复上下文。',
    dcCapability_assistance: '辅助功能',
    dcCapabilityDesc_assistance: '提供内置引导提示，并支持打开 Desktop Commander 反馈入口。',
    dcCapability_other: '其他能力',
    dcCapabilityDesc_other: '当前 Desktop Commander 版本新增、尚未归入固定能力组的工具。',
    unityProject: 'Unity 项目',
    unityProjectPath: '项目路径',
    unityVersion: 'Unity 版本',
    unityPackage: 'MCP for Unity',
    unityIntegration: 'DeskLink 集成',
    unityIntegrationInstalled: '已安装',
    unityIntegrationMissing: '未安装',
    unityBridge: 'Editor Bridge',
    unityNoProject: '未检测到运行中的 Unity 项目',
    unityPackageInstalled: '已安装 · {version}',
    unityPackageResolving: '已声明依赖 · 等待 Package Manager 解析',
    unityPackageResolved: '已解析 · 等待 Unity 导入',
    unityConnected: '已连接',
    unityInstallEnable: '安装并启用',
    unityReinstall: '重新安装并启用',
    unityRetryResolve: '重新请求解析',
    unityUpdateEnable: '更新到 {version} 并启用',
    unityEnableIntegration: '启用 DeskLink 集成',
    unityInstalling: '正在安装…',
    unityInstallStarted: '已更新 MCP for Unity / DeskLink 集成，等待 Unity 编译并连接',
    unityStart: '启动 Unity MCP',
    unityStarting: '正在启动…',
    unityRefresh: '刷新',
    unityManageCapabilities: 'AI 能力…',
    unityCapabilitiesTitle: 'Unity AI 能力',
    unityCapabilitiesSubtitle: '控制哪些 Unity MCP 能力会暴露给 AI。',
    unityCapabilitiesNote: 'Core 始终暴露；On 直接暴露该能力工具；Ask 仅按需申请；Off 完全隐藏。隐藏低频能力可以减少模型长期携带的工具 Schema。',
    unityCapabilitiesCore: 'Core 能力',
    unityCapabilitiesCoreNote: '高频 Unity Editor 能力，始终对 AI 可用，不能关闭。',
    unityCapabilitiesOptional: '可选能力',
    unityCapabilitiesOptionalNote: '低频或专业能力，可按任务需要控制暴露范围。',
    unityCapabilityOn: 'On',
    unityCapabilityAsk: 'Ask',
    unityCapabilityOff: 'Off',
    unityCapabilityTemporary: '本次 Unity 会话已允许',
    unityCoreCapability_scene: 'Scene',
    unityCoreCapabilityDesc_scene: '创建、打开、保存、读取和管理 Unity Scene。',
    unityCoreCapability_gameobjects: 'GameObject',
    unityCoreCapabilityDesc_gameobjects: '查找、创建、复制、移动、设置父子关系和删除 GameObject。',
    unityCoreCapability_components: 'Components',
    unityCoreCapabilityDesc_components: '添加、移除、读取并配置 GameObject 上的 Component。',
    unityCoreCapability_assets: 'Assets & Materials',
    unityCoreCapabilityDesc_assets: '创建、查询、移动和管理项目资源，以及创建、配置和分配 Material。',
    unityCoreCapability_prefabs: 'Prefabs',
    unityCoreCapabilityDesc_prefabs: '创建、读取、更新和实例化 Prefab。',
    unityCoreCapability_editor: 'Editor & Console',
    unityCoreCapabilityDesc_editor: '控制 Play / Pause / Stop 等 Editor 状态，刷新 Unity，并读取 Console 输出。',
    unityCoreCapability_physics: 'Physics',
    unityCoreCapabilityDesc_physics: '处理 Rigidbody、Collider 等 Unity 物理相关对象与设置。',
    unityCoreCapability_camera: 'Camera',
    unityCoreCapabilityDesc_camera: '创建、读取和配置 Unity Camera。',
    unityCoreCapability_scriptable_objects: 'ScriptableObject',
    unityCoreCapabilityDesc_scriptable_objects: '创建和管理 ScriptableObject 资产。',
    unityCoreCapability_automation: 'Automation',
    unityCoreCapabilityDesc_automation: '批量执行 Unity 操作，并用临时 Editor / Runtime C# 做自动化和诊断。',
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
    unityCapabilityDesc_raw: '直接暴露 MCP for Unity 的完整原始工具面，主要用于调试和兼容性检查。',

    // Tunnel
    tunSubtitle: '连接 OpenAI Secure MCP Tunnel 后，ChatGPT 才能调用本机能力。',
    lblTunnelId: 'Tunnel ID',
    phTunnelId: 'tunnel_ 开头，32 位十六进制',
    lblRuntimeKey: 'Runtime API Key',
    phKeySaved: '已保存，留空则沿用',
    phKey: '运行时密钥',
    lblProxy: '代理（可选）',
    phProxy: '如 7897 或 http://127.0.0.1:7897',
    secCreds: '凭据',
    rowProcess: '进程',
    procRunning: '运行中',
    procStopped: '已停止',
    installed: '已安装',
    notInstalled: '未安装',
    hint: '提示',
    rowHealth: '健康',
    healthOnline: '在线',
    rowReady: '就绪',
    readyWaiting: '等待控制面',
    rowControlPlane: '控制面',
    probing: '正在探测控制面…',
    rowKey: '密钥',
    keySaved: '已保存（Windows DPAPI）',
    keyUnsaved: '未保存',
    installingNote: '正在安装 tunnel-client…',
    btnInstallUpdate: '更新 tunnel-client',
    btnInstall: '安装 tunnel-client',
    downloading: '下载中…',
    btnConnectStart: '连接并启动',
    btnStop: '停止',
    stopped: '已停止 tunnel-client',
    updated: 'tunnel-client 已更新',

    // Desktop Commander version / update
    rowRunningVersion: '运行版本',
    rowLatestVersion: '最新版本',
    rowUpdate: '更新',
    notChecked: '未检查',
    upToDate: '已是最新',
    btnCheckUpdate: '检查更新',
    checking: '检查中…',
    checkUpdateFailed: '未能获取版本，请检查网络或 npm',
    latestAvailable: '最新可用版本 {latest}',
    btnUpdateCommander: '更新 Desktop Commander',
    updatedLatest: '已按 @latest 重新安装并启动',

    // Logs
    logsSubtitle: 'Desktop Commander、tunnel-client 与 DeskLink 的输出。',
    noLogs: '尚无日志。',

    // Diagnostics
    diagSubtitle: '检查运行 Desktop Commander 与隧道所需的本机环境。',
    diagRuntime: 'Node.js（运行时）',
    sourceBundled: '应用内置',
    sourceSystem: '系统',
    versionLow: ' · 版本过低',
    diagCommanderInstalled: 'Desktop Commander（已装）',
    notPreinstalled: '未预装',
    diagToolCount: '工具数量',
    diagMcpPort: 'MCP 端口',
    reachable: '可访问',
    unreachable: '不可访问',
    notDetected: '未检测到',
    clickRunDiag: '点击“运行诊断”获取实时结果',
    secEnv: '环境',
    btnRunDiag: '运行诊断',
    diagDone: '诊断完成',
    noteNodeRequired: 'Desktop Commander 需要 Node.js ≥ 18',
    btnDownloadNode: '下载 Node.js（官方绿色版）',
    nodeReadyRestart: 'Node.js {version} 已就绪，请重启 Desktop Commander',
    nodeReady: 'Node.js 已就绪',

    // Title status
    titleReady: '已就绪',
    titleConnecting: '正在连接控制面',
    titleTunnelReady: '隧道已就绪',

    // Feedback
    done: '完成',
    failed: '失败：'
  };

  const en = {
    titleStatusDefault: 'Not connected',
    winMin: 'Minimize',
    winMax: 'Maximize',
    winClose: 'Close',
    viewOverview: 'Overview',
    viewTunnel: 'Tunnel',
    viewProviders: 'Providers',
    viewLogs: 'Logs',
    viewDiagnostics: 'Diagnostics',

    // Settings
    viewSettings: 'Settings',
    settingsSubtitle: 'App preferences and about info.',
    settingsGeneral: 'General',
    settingLang: 'Language',
    langAuto: 'System default',
    langZh: 'Simplified Chinese',
    langEn: 'English',
    settingsTunnel: 'Tunnel',
    proxyInSettings: 'Configured in Settings',
    aboutDesklink: 'About DeskLink',
    desklinkVersion: 'DeskLink version',
    checkAppUpdate: 'Check for updates',
    updateResultLatest: 'Up to date ({version})',
    updateAvailableDesklink: 'New version {latest} available (current {current})',
    updateCheckFailed: 'Could not retrieve update info; try again later',

    phaseIdle: 'Not started',
    phaseStarting: 'Starting',
    phaseReady: 'Ready',
    phaseError: 'Error',

    tunInstalling: 'Installing tunnel-client…',
    tunConnected: 'Ready',
    tunLocalReady: 'Local ready, awaiting control plane',
    tunOnline: 'Online, awaiting readiness',
    tunProcess: 'Process started',
    tunDisconnected: 'Not connected',

    ovSubtitle: 'DeskLink aggregates multiple local MCP providers behind one secure tunnel endpoint.',
    rowTunnel: 'Tunnel',
    rowToolCount: 'Tool count',
    rowMcpEndpoint: 'MCP endpoint',
    btnRestartCommander: 'Restart Desktop Commander',
    restarting: 'Restarting…',
    restartedCommander: 'Restarted Desktop Commander',
    noteToolsForward: 'Tool list is aggregated from providers that are currently ready',
    secStatus: 'Status',
    secLink: 'Data flow',
    flowText: 'ChatGPT → Secure MCP Tunnel → DeskLink Gateway → local MCP providers → Desktop Commander / Unity MCP / other services',

    // Providers
    providersSubtitle: 'Local capability sources managed and routed by DeskLink.',
    providersEmpty: 'No providers are registered yet.',
    providerState: 'State',
    providerMode: 'Start mode',
    providerTransport: 'Transport',
    providerVersion: 'Version',
    providerDetail: 'Detail',
    providerMode_always: 'Always on',
    providerMode_auto: 'Auto',
    providerMode_manual: 'Manual',
    providerMode_disabled: 'Disabled',
    dcManageCapabilities: 'AI Capabilities…',
    dcCapabilitiesTitle: 'Desktop Commander AI Capabilities',
    dcCapabilitiesSubtitle: 'See the local-computer capabilities Desktop Commander currently exposes to AI.',
    dcCapabilitiesNote: 'Capabilities are grouped from the MCP tools provided by the current version. This view is informational and does not change tool permissions.',
    dcCapabilitiesUnavailable: 'Desktop Commander is not ready, so its capabilities are not available yet.',
    dcCapabilityToolCount: '{n} tools',
    dcUpdateAvailable: 'Update available: {latest}',
    dcCapability_files: 'Files & Editing',
    dcCapabilityDesc_files: 'Read and write files, create directories, move files, inspect file metadata, apply block edits, and create PDFs.',
    dcCapability_search: 'File Search',
    dcCapabilityDesc_search: 'Search local directories and file contents, including management of long-running search sessions.',
    dcCapability_terminal: 'Terminal Sessions',
    dcCapabilityDesc_terminal: 'Start commands or REPLs, read output, send interactive input, and manage or terminate terminal sessions.',
    dcCapability_processes: 'System Processes',
    dcCapabilityDesc_processes: 'Inspect running system processes and terminate a selected process when needed.',
    dcCapability_configuration: 'Configuration',
    dcCapabilityDesc_configuration: 'Read and modify Desktop Commander local configuration and security-related settings.',
    dcCapability_history: 'History & Diagnostics',
    dcCapabilityDesc_history: 'Inspect tool usage statistics and recent tool-call history for diagnostics and context recovery.',
    dcCapability_assistance: 'Assistance',
    dcCapabilityDesc_assistance: 'Use built-in guidance prompts and open the Desktop Commander feedback flow.',
    dcCapability_other: 'Other Capabilities',
    dcCapabilityDesc_other: 'Tools added by the current Desktop Commander version that are not yet assigned to a stable capability group.',
    unityProject: 'Unity project',
    unityProjectPath: 'Project path',
    unityVersion: 'Unity version',
    unityPackage: 'MCP for Unity',
    unityIntegration: 'DeskLink integration',
    unityIntegrationInstalled: 'Installed',
    unityIntegrationMissing: 'Not installed',
    unityBridge: 'Editor Bridge',
    unityNoProject: 'No running Unity project detected',
    unityPackageInstalled: 'Installed · {version}',
    unityPackageResolving: 'Dependency declared · waiting for Package Manager',
    unityPackageResolved: 'Resolved · waiting for Unity import',
    unityConnected: 'Connected',
    unityInstallEnable: 'Install & Enable',
    unityReinstall: 'Reinstall & Enable',
    unityRetryResolve: 'Retry Resolve',
    unityUpdateEnable: 'Update to {version} & Enable',
    unityEnableIntegration: 'Enable DeskLink Integration',
    unityInstalling: 'Installing…',
    unityInstallStarted: 'MCP for Unity / DeskLink integration updated; waiting for Unity to compile and connect',
    unityStart: 'Start Unity MCP',
    unityStarting: 'Starting…',
    unityRefresh: 'Refresh',
    unityManageCapabilities: 'AI Capabilities…',
    unityCapabilitiesTitle: 'Unity AI Capabilities',
    unityCapabilitiesSubtitle: 'Control which Unity MCP capabilities are exposed to AI.',
    unityCapabilitiesNote: 'Core is always exposed. On exposes a capability directly, Ask makes it requestable on demand, and Off hides it completely. Hiding low-frequency capabilities reduces persistent tool-schema context.',
    unityCapabilitiesCore: 'Core capabilities',
    unityCapabilitiesCoreNote: 'High-frequency Unity Editor capabilities that are always available to AI and cannot be disabled.',
    unityCapabilitiesOptional: 'Optional capabilities',
    unityCapabilitiesOptionalNote: 'Lower-frequency or specialist capabilities that can be exposed only when needed.',
    unityCapabilityOn: 'On',
    unityCapabilityAsk: 'Ask',
    unityCapabilityOff: 'Off',
    unityCapabilityTemporary: 'Allowed for this Unity session',
    unityCoreCapability_scene: 'Scene',
    unityCoreCapabilityDesc_scene: 'Create, open, save, inspect, and manage Unity scenes.',
    unityCoreCapability_gameobjects: 'GameObjects',
    unityCoreCapabilityDesc_gameobjects: 'Find, create, duplicate, transform, parent, and delete GameObjects.',
    unityCoreCapability_components: 'Components',
    unityCoreCapabilityDesc_components: 'Add, remove, inspect, and configure components on GameObjects.',
    unityCoreCapability_assets: 'Assets & Materials',
    unityCoreCapabilityDesc_assets: 'Create, inspect, move, and manage project assets, and create, configure, and assign materials.',
    unityCoreCapability_prefabs: 'Prefabs',
    unityCoreCapabilityDesc_prefabs: 'Create, inspect, update, and instantiate prefabs.',
    unityCoreCapability_editor: 'Editor & Console',
    unityCoreCapabilityDesc_editor: 'Control Play / Pause / Stop state, refresh Unity, and read Console output.',
    unityCoreCapability_physics: 'Physics',
    unityCoreCapabilityDesc_physics: 'Work with Unity physics objects and settings such as Rigidbody and Collider.',
    unityCoreCapability_camera: 'Camera',
    unityCoreCapabilityDesc_camera: 'Create, inspect, and configure Unity cameras.',
    unityCoreCapability_scriptable_objects: 'ScriptableObjects',
    unityCoreCapabilityDesc_scriptable_objects: 'Create and manage ScriptableObject assets.',
    unityCoreCapability_automation: 'Automation',
    unityCoreCapabilityDesc_automation: 'Batch Unity operations and run temporary Editor / runtime C# for automation and diagnostics.',
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
    unityCapabilityDesc_raw: 'Expose the complete raw MCP for Unity tool surface, mainly for debugging and compatibility checks.',

    tunSubtitle: 'ChatGPT can call local capabilities only after connecting to the OpenAI Secure MCP Tunnel.',
    lblTunnelId: 'Tunnel ID',
    phTunnelId: 'starts with tunnel_, 32 hex chars',
    lblRuntimeKey: 'Runtime API Key',
    phKeySaved: 'Saved; leave blank to keep',
    phKey: 'Runtime key',
    lblProxy: 'Proxy (optional)',
    phProxy: 'e.g. 7897 or http://127.0.0.1:7897',
    secCreds: 'Credentials',
    rowProcess: 'Process',
    procRunning: 'Running',
    procStopped: 'Stopped',
    installed: 'Installed',
    notInstalled: 'Not installed',
    hint: 'Hint',
    rowHealth: 'Health',
    healthOnline: 'Online',
    rowReady: 'Ready',
    readyWaiting: 'Awaiting control plane',
    rowControlPlane: 'Control plane',
    probing: 'Probing control plane…',
    rowKey: 'Key',
    keySaved: 'Saved (Windows DPAPI)',
    keyUnsaved: 'Not saved',
    installingNote: 'Installing tunnel-client…',
    btnInstallUpdate: 'Update tunnel-client',
    btnInstall: 'Install tunnel-client',
    downloading: 'Downloading…',
    btnConnectStart: 'Connect & start',
    btnStop: 'Stop',
    stopped: 'tunnel-client stopped',
    updated: 'tunnel-client updated',

    rowRunningVersion: 'Running version',
    rowLatestVersion: 'Latest version',
    rowUpdate: 'Update',
    notChecked: 'Not checked',
    upToDate: 'Up to date',
    btnCheckUpdate: 'Check for updates',
    checking: 'Checking…',
    checkUpdateFailed: 'Could not fetch version; check network or npm',
    latestAvailable: 'Latest available version {latest}',
    btnUpdateCommander: 'Update Desktop Commander',
    updatedLatest: 'Reinstalled and started at @latest',

    logsSubtitle: 'Output from Desktop Commander, tunnel-client, and DeskLink.',
    noLogs: 'No logs yet.',

    diagSubtitle: 'Checks the local environment required to run Desktop Commander and the tunnel.',
    diagRuntime: 'Node.js (runtime)',
    sourceBundled: 'bundled with app',
    sourceSystem: 'system',
    versionLow: ' · version too low',
    diagCommanderInstalled: 'Desktop Commander (installed)',
    notPreinstalled: 'Not preinstalled',
    diagToolCount: 'Tool count',
    diagMcpPort: 'MCP port',
    reachable: 'Reachable',
    unreachable: 'Unreachable',
    notDetected: 'Not detected',
    clickRunDiag: 'Click "Run diagnostics" for live results',
    secEnv: 'Environment',
    btnRunDiag: 'Run diagnostics',
    diagDone: 'Diagnostics complete',
    noteNodeRequired: 'Desktop Commander requires Node.js ≥ 18',
    btnDownloadNode: 'Download Node.js (official portable)',
    nodeReadyRestart: 'Node.js {version} ready; restart Desktop Commander',
    nodeReady: 'Node.js ready',

    titleReady: 'Ready',
    titleConnecting: 'Connecting to control plane',
    titleTunnelReady: 'Tunnel ready',

    done: 'Done',
    failed: 'Failed: '
  };

  const zhDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const enDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function detectZh() {
    const nav = (navigator.language || 'en-US').toLowerCase();
    // Only Simplified Chinese counts; zh-TW / zh-HK / everything else => English.
    return nav.startsWith('zh') && (nav.includes('cn') || nav.includes('hans'));
  }

  // choice: 'auto' | 'zh-CN' | 'en-US'
  function applyChoice(choice) {
    const useZh = choice === 'auto' ? detectZh() : choice === 'zh-CN';
    isZh = useZh;
    locale = useZh ? 'zh-CN' : 'en-US';
    dict = useZh ? zh : en;
    days = useZh ? zhDays : enDays;
  }

  let isZh = detectZh();
  let locale = isZh ? 'zh-CN' : 'en-US';
  let dict = isZh ? zh : en;
  let days = isZh ? zhDays : enDays;

  function t(key) {
    return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
  }
  function tl(key, params) {
    let s = t(key);
    if (params) for (const k in params) s = s.split('{' + k + '}').join(String(params[k]));
    return s;
  }

  const api = {
    locale, isZh, t, tl, days,
    setLocale(choice) {
      applyChoice(choice);
      api.locale = locale;
      api.isZh = isZh;
      api.days = days;
      document.documentElement.lang = locale;
      applyStatic(document);
    }
  };

  function applyStatic(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(node => {
      const key = node.getAttribute('data-i18n');
      if (key) node.textContent = t(key);
    });
    scope.querySelectorAll('[data-i18n-ph]').forEach(node => {
      const key = node.getAttribute('data-i18n-ph');
      if (key) node.placeholder = t(key);
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(node => {
      const key = node.getAttribute('data-i18n-title');
      if (key) node.title = t(key);
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach(node => {
      const key = node.getAttribute('data-i18n-aria');
      if (key) node.setAttribute('aria-label', t(key));
    });
  }
  api.applyStatic = applyStatic;

  window.__i18n = api;
  document.documentElement.lang = locale;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyStatic(document));
  } else {
    applyStatic(document);
  }
})();
