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
    viewTools: '工具',
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
    ovSubtitle: 'DeskLink 把 ChatGPT 的 MCP 调用转发给本机的 Desktop Commander。',
    rowTunnel: '隧道',
    rowToolCount: '工具数量',
    rowMcpEndpoint: 'MCP 端点',
    btnRestartCommander: '重启 Desktop Commander',
    restarting: '重启中…',
    restartedCommander: '已重启 Desktop Commander',
    noteToolsForward: '工具清单由 Desktop Commander 提供，原样转发',
    secStatus: '运行状态',
    secLink: '链路',
    flowText: 'ChatGPT → Custom MCP Connector → OpenAI Secure MCP Tunnel → tunnel-client → DeskLink → Desktop Commander（stdio）→ 本机文件 / 搜索 / 编辑 / 进程 / Shell',

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

    // Tools
    toolsSubtitle: '工具清单由 Desktop Commander 提供，DeskLink 原样转发。',
    rowRunningVersion: '运行版本',
    rowLatestVersion: '最新版本',
    rowUpdate: '更新',
    notChecked: '未检查',
    upToDate: '已是最新',
    updateAvailable: '有更新 {latest}，重启 Desktop Commander 生效',
    btnCheckUpdate: '检查更新',
    checking: '检查中…',
    checkUpdateFailed: '未能获取版本，请检查网络或 npm',
    latestAvailable: '最新可用版本 {latest}',
    btnUpdateCommander: '更新 Desktop Commander',
    updatedLatest: '已按 @latest 重新安装并启动',
    noteVersionResolve: '启动时用 @latest 解析，版本变化才下载',
    emptyTools: '等待 Desktop Commander 就绪…',
    secTools: '工具（{n}）',

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
    viewTools: 'Tools',
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

    ovSubtitle: 'DeskLink forwards ChatGPT MCP calls to local Desktop Commander.',
    rowTunnel: 'Tunnel',
    rowToolCount: 'Tool count',
    rowMcpEndpoint: 'MCP endpoint',
    btnRestartCommander: 'Restart Desktop Commander',
    restarting: 'Restarting…',
    restartedCommander: 'Restarted Desktop Commander',
    noteToolsForward: 'Tool list is provided by Desktop Commander and forwarded as-is',
    secStatus: 'Status',
    secLink: 'Data flow',
    flowText: 'ChatGPT → Custom MCP Connector → OpenAI Secure MCP Tunnel → tunnel-client → DeskLink → Desktop Commander (stdio) → local files / search / edit / processes / shell',

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

    toolsSubtitle: 'Tool list is provided by Desktop Commander and forwarded as-is.',
    rowRunningVersion: 'Running version',
    rowLatestVersion: 'Latest version',
    rowUpdate: 'Update',
    notChecked: 'Not checked',
    upToDate: 'Up to date',
    updateAvailable: 'Update {latest} available; restart Desktop Commander to apply',
    btnCheckUpdate: 'Check for updates',
    checking: 'Checking…',
    checkUpdateFailed: 'Could not fetch version; check network or npm',
    latestAvailable: 'Latest available version {latest}',
    btnUpdateCommander: 'Update Desktop Commander',
    updatedLatest: 'Reinstalled and started at @latest',
    noteVersionResolve: 'Resolves @latest at startup; only downloads on version change',
    emptyTools: 'Waiting for Desktop Commander to be ready…',
    secTools: 'Tools ({n})',

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
