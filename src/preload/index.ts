import { contextBridge, ipcRenderer } from 'electron';
import type {
  ProviderSummary, ProxyStatus, TunnelStatus, UnityCapabilityId, UnityCapabilityMode
} from '../shared/types.js';

contextBridge.exposeInMainWorld('desklink', {
  platform: process.platform,
  versions: { node: process.versions.node, electron: process.versions.electron, chrome: process.versions.chrome },
  diagnostics: (): Promise<any> => ipcRenderer.invoke('desklink:diagnostics'),
  windowAction: (action: 'minimize' | 'zoom' | 'close') => ipcRenderer.send('window:action', action),
  dragStart: (x: number, y: number) => ipcRenderer.send('window:drag-start', { x, y }),
  dragMove: (x: number, y: number) => ipcRenderer.send('window:drag-move', { x, y }),
  dragEnd: () => ipcRenderer.send('window:drag-end'),
  onFullscreen: (listener: (value: boolean) => void) => {
    const handler = (_event: unknown, value: boolean) => listener(value);
    ipcRenderer.on('window:fullscreen', handler);
    return () => ipcRenderer.removeListener('window:fullscreen', handler);
  },
  onStatus: (listener: (status: ProxyStatus) => void) => {
    const handler = (_event: unknown, status: ProxyStatus) => listener(status);
    ipcRenderer.on('desklink:status', handler);
    return () => ipcRenderer.removeListener('desklink:status', handler);
  },
  onProviders: (listener: (providers: ProviderSummary[]) => void) => {
    const handler = (_event: unknown, providers: ProviderSummary[]) => listener(providers);
    ipcRenderer.on('desklink:providers', handler);
    return () => ipcRenderer.removeListener('desklink:providers', handler);
  },
  onTunnel: (listener: (status: TunnelStatus) => void) => {
    const handler = (_event: unknown, status: TunnelStatus) => listener(status);
    ipcRenderer.on('desklink:tunnel', handler);
    return () => ipcRenderer.removeListener('desklink:tunnel', handler);
  },
  onLog: (listener: (line: string) => void) => {
    const handler = (_event: unknown, line: string) => listener(line);
    ipcRenderer.on('desklink:log', handler);
    return () => ipcRenderer.removeListener('desklink:log', handler);
  },
  getProviders: (): Promise<ProviderSummary[]> => ipcRenderer.invoke('desklink:providers'),
  unityRefresh: (): Promise<ProviderSummary | null> => ipcRenderer.invoke('desklink:unity-refresh'),
  unityInstall: (projectPath?: string): Promise<ProviderSummary | null> =>
    ipcRenderer.invoke('desklink:unity-install', projectPath),
  unityStart: (projectPath?: string): Promise<ProviderSummary | null> =>
    ipcRenderer.invoke('desklink:unity-start', projectPath),
  unitySetMode: (mode: 'auto' | 'manual' | 'disabled', projectPath?: string): Promise<ProviderSummary | null> =>
    ipcRenderer.invoke('desklink:unity-mode', { mode, projectPath }),
  unitySetCapabilityMode: (id: UnityCapabilityId, mode: UnityCapabilityMode): Promise<ProviderSummary | null> =>
    ipcRenderer.invoke('desklink:unity-capability-mode', { id, mode }),
  getLogs: (): Promise<string> => ipcRenderer.invoke('desklink:logs'),
  appVersion: (): Promise<string> => ipcRenderer.invoke('desklink:app-version'),
  checkAppUpdate: (): Promise<{ current: string; latest: string; available: boolean; installerName?: string; releaseUrl?: string; error?: string }> =>
    ipcRenderer.invoke('desklink:app-update'),
  installAppUpdate: (): Promise<{ started?: boolean; version?: string; error?: string }> =>
    ipcRenderer.invoke('desklink:app-update-install'),
  restart: (): Promise<boolean> => ipcRenderer.invoke('desklink:restart'),
  checkCommanderUpdate: (): Promise<string> => ipcRenderer.invoke('desklink:dc-update'),
  nodeStatus: (): Promise<any> => ipcRenderer.invoke('desklink:node-status'),
  nodeInstall: (): Promise<any> => ipcRenderer.invoke('desklink:node-install'),
  tunnelStatus: (): Promise<TunnelStatus | null> => ipcRenderer.invoke('desklink:tunnel-status'),
  tunnelConnect: (payload: { tunnelId: string; apiKey: string; proxy?: string }): Promise<any> =>
    ipcRenderer.invoke('desklink:tunnel-connect', payload),
  tunnelStop: (): Promise<TunnelStatus | null> => ipcRenderer.invoke('desklink:tunnel-stop'),
  tunnelInstall: (): Promise<any> => ipcRenderer.invoke('desklink:tunnel-install'),
  setLocale: (locale: string) => ipcRenderer.send('desklink:set-locale', locale)
});
