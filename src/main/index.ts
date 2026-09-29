import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, screen, shell, Tray } from 'electron';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CommanderRuntime } from './commander.js';
import { McpProxy } from './mcp-proxy.js';
import { NodeRuntime } from './node.js';
import { DesktopCommanderProvider } from './providers/desktop-commander-provider.js';
import { ProviderManager } from './providers/provider-manager.js';
import { UnityProvider } from './providers/unity/unity-provider.js';
import type { UnityCapabilityDecision, UnityCapabilityRequest } from './providers/unity/unity-capabilities.js';
import { Store, type UnityProjectMode } from './store.js';
import { TunnelRuntime } from './tunnel.js';
import { createDownloadProgressMeter, parseContentLength } from './update-progress.js';
import { setLocale, tm } from './i18n.js';
import type {
  DeskLinkUpdateProgress, ProviderSummary, ProxyStatus, TunnelStatus, UnityCapabilityId, UnityCapabilityMode
} from '../shared/types.js';

// Runtime state (config, DPAPI key, tunnel-client) must live outside the read-only asar.
const root = app.getPath('userData');
if (process.platform === 'win32') app.setAppUserModelId('app.desklink');
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let isCleaningUp = false;
let proxy: McpProxy | null = null;
let tunnel: TunnelRuntime | null = null;
let store: Store | null = null;
let nodeRuntime: NodeRuntime | null = null;
let commander: CommanderRuntime | null = null;
let desktopCommanderProvider: DesktopCommanderProvider | null = null;
let unityProvider: UnityProvider | null = null;
let providerManager: ProviderManager | null = null;
const unityPromptedSessions = new Set<string>();
let unityPromptInFlight = false;
const logBuffer: string[] = [];
const CHATGPT_PLUGIN_SETTINGS_URL = 'https://chatgpt.com/settings/plugins-settings/';
const DESKLINK_RELEASE_API = 'https://api.github.com/repos/fly-way/desklink/releases/latest';
type DeskLinkUpdateInfo = {
  current: string;
  latest: string;
  available: boolean;
  installerName?: string;
  releaseUrl?: string;
  error?: string;
};
let unityToolCount: number | null = null;
let unityToolRefreshPromptQueue: Promise<void> = Promise.resolve();

function rendererPath(): string {
  return path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html');
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload);
}

function broadcastDeskLinkUpdateProgress(progress: DeskLinkUpdateProgress): void {
  broadcast('desklink:app-update-progress', progress);
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function versionParts(value: string): number[] | null {
  const match = String(value || '').trim().replace(/^v/i, '').match(/^(\d+(?:\.\d+)*)(?:[-+].*)?$/);
  if (!match) return null;
  return match[1].split('.').map(part => Number(part));
}

function isNewerVersion(candidate: string, current: string): boolean {
  const left = versionParts(candidate);
  const right = versionParts(current);
  if (!left || !right) return candidate !== current;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

async function getDeskLinkUpdateInfo(): Promise<DeskLinkUpdateInfo & { installerUrl?: string }> {
  const current = app.getVersion();
  try {
    const response = await net.fetch(DESKLINK_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `DeskLink/${current}`,
        'X-GitHub-Api-Version': '2022-11-28'
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);

    const release: any = await response.json();
    const tag = String(release?.tag_name ?? '').trim();
    const latest = tag.replace(/^v/i, '');
    if (!versionParts(latest)) throw new Error('GitHub release has no valid version tag.');

    const assets = Array.isArray(release?.assets) ? release.assets : [];
    const expectedName = `DeskLink-Setup-${latest}.exe`.toLowerCase();
    const installer = assets.find((asset: any) => String(asset?.name ?? '').toLowerCase() === expectedName)
      ?? assets.find((asset: any) => /^DeskLink[- ]Setup[- ].*\.exe$/i.test(String(asset?.name ?? '')));

    return {
      current,
      latest,
      available: isNewerVersion(latest, current),
      installerName: installer ? String(installer.name) : undefined,
      installerUrl: installer ? String(installer.browser_download_url ?? '') : undefined,
      releaseUrl: String(release?.html_url ?? '') || undefined
    };
  } catch (error: any) {
    return {
      current,
      latest: '',
      available: false,
      error: String(error?.message ?? error)
    };
  }
}

async function downloadAndLaunchDeskLinkUpdate(): Promise<{ started?: boolean; version?: string; error?: string }> {
  broadcastDeskLinkUpdateProgress({ phase: 'checking' });
  const update = await getDeskLinkUpdateInfo();
  if (update.error) {
    broadcastDeskLinkUpdateProgress({ phase: 'error', error: update.error });
    return { error: update.error };
  }
  if (!update.available) {
    const error = `DeskLink ${update.current} is already up to date.`;
    broadcastDeskLinkUpdateProgress({ phase: 'error', version: update.latest || update.current, error });
    return { error };
  }
  if (!update.installerUrl || !update.installerName) {
    const error = 'The latest GitHub release has no Windows installer asset.';
    broadcastDeskLinkUpdateProgress({ phase: 'error', version: update.latest, error });
    return { error };
  }

  try {
    const updateDir = path.join(app.getPath('temp'), 'DeskLink-update');
    await mkdir(updateDir, { recursive: true });
    const safeName = path.basename(update.installerName);
    const installerPath = path.join(updateDir, safeName);
    await rm(installerPath, { force: true });

    const response = await net.fetch(update.installerUrl, {
      headers: { 'User-Agent': `DeskLink/${app.getVersion()}` },
      signal: AbortSignal.timeout(10 * 60 * 1000)
    });
    if (!response.ok || !response.body) throw new Error(`Download HTTP ${response.status}`);

    const totalBytes = parseContentLength(response.headers.get('content-length'));

    broadcastDeskLinkUpdateProgress({
      phase: 'downloading',
      version: update.latest,
      percent: totalBytes ? 0 : undefined,
      downloadedBytes: 0,
      totalBytes
    });

    const meter = createDownloadProgressMeter(totalBytes, progress => {
      broadcastDeskLinkUpdateProgress({
        phase: 'downloading',
        version: update.latest,
        ...progress
      });
    });

    await pipeline(Readable.fromWeb(response.body as any), meter.stream, createWriteStream(installerPath));
    const downloadedBytes = meter.downloadedBytes();
    broadcastDeskLinkUpdateProgress({
      phase: 'downloading',
      version: update.latest,
      percent: 100,
      downloadedBytes,
      totalBytes: totalBytes ?? downloadedBytes
    });
    broadcastDeskLinkUpdateProgress({ phase: 'launching', version: update.latest, percent: 100 });

    const launchError = await shell.openPath(installerPath);
    if (launchError) throw new Error(launchError);
    setTimeout(() => app.quit(), 750);
    return { started: true, version: update.latest };
  } catch (error: any) {
    const message = String(error?.message ?? error);
    broadcastDeskLinkUpdateProgress({ phase: 'error', version: update.latest, error: message });
    return { error: message };
  }
}

function unityPromptSessionKey(provider: ProviderSummary): string {
  const meta = provider.meta ?? {};
  return `${String(meta.projectPath ?? '')}|${String(meta.unityPid ?? 0)}`;
}

function needsUnitySetupPrompt(provider: ProviderSummary): boolean {
  if (provider.id !== 'unity') return false;
  const meta = provider.meta ?? {};
  if (!meta.projectPath || !meta.unityPid) return false;
  if (meta.projectMode === 'disabled') return false;
  if (meta.installationApproved && meta.packageDeclared && !meta.packageInstalled) return false;
  return !meta.packageInstalled || !meta.packageCompatible || !meta.integrationInstalled;
}

async function requestUnityCapability(request: UnityCapabilityRequest): Promise<UnityCapabilityDecision> {
  showMainWindow();
  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const options: Electron.MessageBoxOptions = {
    type: 'question',
    title: tm('unityCapabilityRequestTitle'),
    message: tm('unityCapabilityRequestMessage', { capability: tm(`unityCapability_${request.id}`) }),
    detail: tm('unityCapabilityRequestDetail', {
      project: request.projectName,
      description: tm(`unityCapabilityDesc_${request.id}`),
      count: request.toolNames.length
    }),
    buttons: [tm('unityCapabilityAllowOnce'), tm('unityCapabilityAlwaysAllow'), tm('unityCapabilityDeny')],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  };
  const result = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
  return result.response === 0 ? 'once' : result.response === 1 ? 'always' : 'deny';
}

async function showChatGPTToolRefreshPrompt(payload: { previous: number; current: number }): Promise<boolean> {
  if (payload.previous === payload.current) return false;

  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const options: Electron.MessageBoxOptions = {
    type: 'info',
    title: tm('unityToolsRefreshTitle'),
    message: tm('unityToolsRefreshMessage'),
    detail: tm('unityToolsRefreshDetail', { previous: payload.previous, current: payload.current }),
    buttons: [tm('unityToolsRefreshOpen'), tm('unityToolsRefreshLater')],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  };
  const result = window && window.isVisible() && !window.isMinimized()
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);
  if (result.response !== 0) return false;
  await shell.openExternal(CHATGPT_PLUGIN_SETTINGS_URL);
  return true;
}

function queueChatGPTToolRefreshPrompt(payload: { previous: number; current: number }): void {
  if (isQuitting) return;
  unityToolRefreshPromptQueue = unityToolRefreshPromptQueue
    .then(async () => { await showChatGPTToolRefreshPrompt(payload); })
    .catch(error => recordLog(`ChatGPT tool refresh prompt failed: ${String(error?.message ?? error)}\n`));
}

function trackUnityToolCount(providers: ProviderSummary[]): void {
  const unity = providers.find(provider => provider.id === 'unity');
  if (!unity) return;

  const current = Math.max(0, Number(unity.toolCount) || 0);
  if (unityToolCount === null) {
    unityToolCount = current;
    return;
  }
  if (current === unityToolCount) return;

  const previous = unityToolCount;
  unityToolCount = current;
  if (!isQuitting) queueChatGPTToolRefreshPrompt({ previous, current });
}

async function maybePromptUnitySetup(providers: ProviderSummary[]): Promise<void> {
  if (unityPromptInFlight || !unityProvider) return;
  const unity = providers.find(needsUnitySetupPrompt);
  if (!unity) return;

  const key = unityPromptSessionKey(unity);
  if (unityPromptedSessions.has(key)) return;
  unityPromptedSessions.add(key);
  unityPromptInFlight = true;

  try {
    const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    const isBackground = !window || !window.isVisible() || window.isMinimized() || !window.isFocused();
    const canFlashTaskbar = Boolean(window && window.isVisible() && !window.isMinimized() && !window.isFocused());
    const meta = unity.meta ?? {};

    if (process.platform === 'win32' && isBackground && tray) {
      tray.displayBalloon({
        title: tm('unityPromptTitle'),
        content: tm('unityPromptBalloon', { project: String(meta.projectName ?? 'Unity') }),
        iconType: 'info',
        noSound: false
      });
    }
    if (canFlashTaskbar) window!.flashFrame(true);

    const options: Electron.MessageBoxOptions = {
      type: 'info',
      title: tm('unityPromptTitle'),
      message: tm('unityPromptMessage', { project: String(meta.projectName ?? 'Unity') }),
      detail: tm('unityPromptDetail', { path: String(meta.projectPath ?? '') }),
      buttons: [tm('unityPromptInstall'), tm('unityPromptCancel')],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    };
    const result = window && window.isVisible() && !window.isMinimized()
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options);
    window?.flashFrame(false);

    if (result.response === 0) {
      showMainWindow();
      await unityProvider.installCurrentProject(String(meta.projectPath ?? ''));
    }
  } catch (error: any) {
    recordLog(`Unity setup prompt failed: ${String(error?.message ?? error)}\n`);
  } finally {
    mainWindow?.flashFrame(false);
    unityPromptInFlight = false;
  }
}

function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: tm('trayOpen'), click: showMainWindow },
    { type: 'separator' },
    { label: tm('trayQuit'), click: () => { isQuitting = true; app.quit(); } }
  ]));
}

function createTray(): void {
  if (tray) return;
  const icon = nativeImage.createFromPath(path.join(app.getAppPath(), 'build', 'icon.ico'));
  tray = new Tray(icon);
  tray.setToolTip('DeskLink');
  refreshTrayMenu();
  tray.on('click', showMainWindow);
}

function createWindow(): BrowserWindow {
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1080, Math.max(900, Math.round(workArea.width * 0.64)));
  const height = Math.min(720, Math.max(600, Math.round(workArea.height * 0.8)));

  const options: Electron.BrowserWindowConstructorOptions = {
    width,
    height,
    minWidth: 880,
    minHeight: 560,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#f5f5f7',
    icon: path.join(app.getAppPath(), 'build', 'icon.ico'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };
  if (process.platform === 'win32') (options as any).backgroundMaterial = 'acrylic';

  const window = new BrowserWindow(options);
  window.once('ready-to-show', () => window.show());
  window.on('enter-full-screen', () => window.webContents.send('window:fullscreen', true));
  window.on('leave-full-screen', () => window.webContents.send('window:fullscreen', false));
  window.on('close', event => {
    if (isQuitting) return;
    event.preventDefault();
    window.hide();
  });
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
  window.loadFile(rendererPath());
  mainWindow = window;
  return window;
}

function recordLog(line: string): void {
  logBuffer.push(line);
  if (logBuffer.length > 500) logBuffer.shift();
  broadcast('desklink:log', line);
}

if (hasSingleInstanceLock) {
  app.on('second-instance', () => { void app.whenReady().then(showMainWindow); });

  app.whenReady().then(() => {
    // DeskLink draws its own frameless title bar; the default application menu
    // (文件/编辑/显示/窗口/帮助) is not wanted, so remove it entirely rather than auto-hide it.
    Menu.setApplicationMenu(null);

    store = new Store(root);
    nodeRuntime = new NodeRuntime(store);
    commander = new CommanderRuntime(store, nodeRuntime, recordLog);
    desktopCommanderProvider = new DesktopCommanderProvider(commander, recordLog);
    unityProvider = new UnityProvider(store, recordLog, requestUnityCapability);
    providerManager = new ProviderManager(
      [desktopCommanderProvider, unityProvider],
      providers => {
        broadcast('desklink:providers', providers);
        trackUnityToolCount(providers);
        proxy?.pushStatus();
        void maybePromptUnitySetup(providers);
      },
      recordLog
    );
    proxy = new McpProxy(
      store.config.mcpPort,
      providerManager,
      desktopCommanderProvider,
      (status: ProxyStatus) => broadcast('desklink:status', status),
      recordLog
    );
    tunnel = new TunnelRuntime(
      store,
      (status: TunnelStatus) => broadcast('desklink:tunnel', status),
      recordLog
    );

    const window = createWindow();
    createTray();
    window.webContents.once('did-finish-load', () => {
      void proxy?.start();
      void bootstrapTunnel();
    });
    app.on('activate', showMainWindow);
    setInterval(() => { void pushTunnelStatus(); }, 3000);
  });
}

/** Like Start-All.cmd: make sure everything DeskLink needs is present, then connect if configured. */
async function bootstrapTunnel(): Promise<void> {
  if (!tunnel || !store) return;
  try {
    if (!tunnel.isInstalled()) {
      recordLog(tm('logTunnelPreparing') + '\n');
      await tunnel.install();
    }
    await pushTunnelStatus();
    if (store.tunnelId && store.hasApiKey()) {
      recordLog(tm('logStartingWithCreds') + '\n');
      await tunnel.start();
    }
  } catch (error: any) {
    broadcast('desklink:tunnel', { ...(await tunnel.status()), lastError: String(error?.message ?? error) });
    recordLog(tm('logPrepareFailed', { message: String(error?.message ?? error) }) + '\n');
  }
}

async function pushTunnelStatus(): Promise<void> {
  if (!tunnel) return;
  broadcast('desklink:tunnel', await tunnel.status());
}

app.on('before-quit', event => {
  isQuitting = true;
  if (isCleaningUp) return;
  event.preventDefault();
  isCleaningUp = true;
  void (async () => {
    await tunnel?.stop();
    await proxy?.stop();
    tray?.destroy();
    tray = null;
    app.quit();
  })();
});
// Closing the last window keeps DeskLink alive in the system tray.
app.on('window-all-closed', () => {});

ipcMain.on('window:action', (event, action: string) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;
  if (action === 'minimize') window.minimize();
  else if (action === 'zoom') window.isMaximized() ? window.unmaximize() : window.maximize();
  else if (action === 'close') window.close();
});

// Frameless window dragging: keeps working regardless of Chromium's app-region behaviour
// when the title bar uses backdrop-filter.
type DragState = { mouse: [number, number]; window: [number, number]; size: [number, number] };
let dragOrigin: DragState | null = null;

ipcMain.on('window:drag-start', (event, point: { x: number; y: number }) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isMaximized()) return;
  // Sample the size once. Re-reading it on every move accumulates rounding drift
  // on Windows and the window grows while being dragged.
  dragOrigin = {
    mouse: [point.x, point.y],
    window: window.getPosition() as [number, number],
    size: window.getSize() as [number, number]
  };
  const guard = () => {
    if (!dragOrigin) return;
    window.unmaximize();
    window.setBounds({ x: window.getPosition()[0], y: window.getPosition()[1], width: dragOrigin.size[0], height: dragOrigin.size[1] });
  };
  window.once('maximize', guard);
});

ipcMain.on('window:drag-move', (event, point: { x: number; y: number }) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || !dragOrigin) return;
  window.setBounds({
    x: dragOrigin.window[0] + point.x - dragOrigin.mouse[0],
    y: dragOrigin.window[1] + point.y - dragOrigin.mouse[1],
    width: dragOrigin.size[0],
    height: dragOrigin.size[1]
  });
});

ipcMain.on('window:drag-end', () => { dragOrigin = null; });

ipcMain.handle('desklink:providers', () => providerManager?.statuses() ?? []);
ipcMain.handle('desklink:unity-refresh', () => unityProvider?.refreshNow() ?? null);
ipcMain.handle('desklink:unity-install', (_event, projectPath?: string) =>
  unityProvider?.installCurrentProject(projectPath) ?? null);
ipcMain.handle('desklink:unity-start', (_event, projectPath?: string) =>
  unityProvider?.startCurrentProject(projectPath) ?? null);
ipcMain.handle('desklink:unity-mode', (_event, payload: { mode: UnityProjectMode; projectPath?: string }) =>
  unityProvider?.setProjectMode(payload.mode, payload.projectPath) ?? null);
ipcMain.handle('desklink:unity-capability-mode', (_event, payload: { id: UnityCapabilityId; mode: UnityCapabilityMode }) =>
  unityProvider?.setCapabilityMode(payload.id, payload.mode) ?? null);
ipcMain.handle('desklink:app-version', () => app.getVersion());
ipcMain.handle('desklink:app-update', () => getDeskLinkUpdateInfo());
ipcMain.handle('desklink:app-update-install', () => downloadAndLaunchDeskLinkUpdate());
ipcMain.handle('desklink:logs', () => logBuffer.join(''));
ipcMain.handle('desklink:dc-update', () => proxy?.checkLatest() ?? '');
ipcMain.handle('desklink:diagnostics', async () => {
  const mcpPort = store?.config.mcpPort ?? 0;
  let endpointReachable = false;
  try {
    const response = await fetch(`http://127.0.0.1:${mcpPort}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      signal: AbortSignal.timeout(3000)
    });
    endpointReachable = response.ok || response.status === 406;
  } catch {}

  const node = nodeRuntime?.status();
  return {
    node: process.versions.node,
    electron: process.versions.electron,
    platform: process.platform,
    runtime: {
      available: node?.available ?? false,
      source: node?.source ?? 'none',
      version: node?.version ?? '',
      satisfies: node?.satisfies ?? false,
      commanderInstalled: commander?.installedVersion ?? ''
    },
    commander: {
      phase: desktopCommanderProvider?.getStatus().phase ?? '',
      version: desktopCommanderProvider?.getStatus().version ?? '',
      toolCount: desktopCommanderProvider?.getStatus().toolCount ?? 0
    },
    providers: providerManager?.statuses() ?? [],
    endpoint: { port: mcpPort, reachable: endpointReachable },
    tunnel: await tunnel?.status()
  };
});
ipcMain.handle('desklink:restart', async () => {
  await proxy?.stop();
  await commander?.update();
  await proxy?.start();
  return true;
});
ipcMain.handle('desklink:node-status', () => nodeRuntime?.status() ?? null);
ipcMain.handle('desklink:node-install', async () => {
  if (!nodeRuntime) return null;
  try {
    return await nodeRuntime.install(recordLog);
  } catch (error: any) {
    return { error: String(error?.message ?? error) };
  }
});
ipcMain.handle('desklink:tunnel-status', () => tunnel?.status() ?? null);
ipcMain.handle('desklink:tunnel-connect', async (_event, payload: { tunnelId: string; apiKey: string; proxy?: string }) => {
  if (!tunnel) return null;
  try {
    await tunnel.configure(String(payload?.tunnelId ?? ''), String(payload?.apiKey ?? ''), payload?.proxy);
    // start() is a no-op while a daemon is already running, so an edited proxy/key would
    // otherwise be ignored until a manual stop. Restart explicitly to apply the new config.
    await tunnel.stop();
    await tunnel.start();
  } catch (error: any) {
    broadcast('desklink:tunnel', { ...(await tunnel.status()), lastError: String(error?.message ?? error) });
    return { error: String(error?.message ?? error) };
  }
  return tunnel.status();
});
ipcMain.handle('desklink:tunnel-stop', async () => {
  await tunnel?.stop();
  return tunnel?.status() ?? null;
});
ipcMain.handle('desklink:tunnel-install', async () => {
  if (!tunnel) return null;
  try {
    await tunnel.install(true);
  } catch (error: any) {
    return { error: String(error?.message ?? error) };
  }
  return tunnel.status();
});

// The renderer owns the language choice (Settings → Language); mirror it here so main-process
// log lines and error texts match, then re-push status so cached text is re-rendered.
ipcMain.on('desklink:set-locale', (_event, locale: string) => {
  setLocale(typeof locale === 'string' ? locale : null);
  refreshTrayMenu();
  void pushTunnelStatus();
  proxy?.pushStatus();
});
