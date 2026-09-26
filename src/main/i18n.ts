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
  msgCredsSaved: '凭据已保存。'
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
  msgCredsSaved: 'Credentials saved.'
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
