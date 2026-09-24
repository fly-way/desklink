import { contextBridge, ipcRenderer } from 'electron';
import type { ProxyStatus, TunnelStatus, ToolSummary } from '../shared/types.js';

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
  getTools: (): Promise<ToolSummary[]> => ipcRenderer.invoke('desklink:tools'),
  getLogs: (): Promise<string> => ipcRenderer.invoke('desklink:logs'),
  appVersion: (): Promise<string> => ipcRenderer.invoke('desklink:app-version'),
  checkAppUpdate: (): Promise<{ latest?: string; error?: string }> => ipcRenderer.invoke('desklink:app-update'),
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
