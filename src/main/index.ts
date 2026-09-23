import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import { CommanderRuntime } from './commander.js';
import { McpProxy } from './mcp-proxy.js';
import { NodeRuntime } from './node.js';
import { Store } from './store.js';
import { TunnelRuntime } from './tunnel.js';
import type { ProxyStatus, TunnelStatus } from '../shared/types.js';

// Runtime state (config, DPAPI key, tunnel-client) must live outside the read-only asar.
const root = app.getPath('userData');
let mainWindow: BrowserWindow | null = null;
let proxy: McpProxy | null = null;
let tunnel: TunnelRuntime | null = null;
let store: Store | null = null;
let nodeRuntime: NodeRuntime | null = null;
let commander: CommanderRuntime | null = null;
const logBuffer: string[] = [];

function rendererPath(): string {
  return path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html');
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload);
}

function createWindow(): void {
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
  window.loadFile(rendererPath());
  mainWindow = window;
}

function recordLog(line: string): void {
  logBuffer.push(line);
  if (logBuffer.length > 500) logBuffer.shift();
  broadcast('desklink:log', line);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

  store = new Store(root);
  nodeRuntime = new NodeRuntime(store);
  commander = new CommanderRuntime(store, nodeRuntime, recordLog);
  proxy = new McpProxy(
    store.config.mcpPort,
    commander,
    (status: ProxyStatus) => broadcast('desklink:status', status),
    recordLog
  );
  tunnel = new TunnelRuntime(
    store,
    (status: TunnelStatus) => broadcast('desklink:tunnel', status),
    recordLog
  );

  void proxy.start();
  void bootstrapTunnel();
  setInterval(() => { void pushTunnelStatus(); }, 3000);
});

/** Like Start-All.cmd: make sure everything DeskLink needs is present, then connect if configured. */
async function bootstrapTunnel(): Promise<void> {
  if (!tunnel || !store) return;
  try {
    if (!tunnel.isInstalled()) {
      recordLog('tunnel-client 未安装，正在准备…\n');
      await tunnel.install();
    }
    await pushTunnelStatus();
    if (store.tunnelId && store.hasApiKey()) {
      recordLog('已保存凭据，正在启动 tunnel-client…\n');
      await tunnel.start();
    }
  } catch (error: any) {
    broadcast('desklink:tunnel', { ...(await tunnel.status()), lastError: String(error?.message ?? error) });
    recordLog(`tunnel 准备失败：${String(error?.message ?? error)}\n`);
  }
}

async function pushTunnelStatus(): Promise<void> {
  if (!tunnel) return;
  broadcast('desklink:tunnel', await tunnel.status());
}

app.on('before-quit', async () => {
  await tunnel?.stop();
  await proxy?.stop();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

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

ipcMain.handle('desklink:tools', () => proxy?.listTools() ?? []);
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
      phase: proxy ? (proxy as any).phase ?? '' : '',
      version: proxy ? (proxy as any).commanderVersion ?? '' : '',
      toolCount: proxy?.listTools().length ?? 0
    },
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
