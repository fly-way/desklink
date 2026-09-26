import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

export type UnityProjectInfo = {
  pid: number;
  projectPath: string;
  projectName: string;
  unityVersion: string;
};

type ProcessRow = { ProcessId?: number; CommandLine?: string | null };

function runPowerShell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error) return reject(new Error(String(stderr || error.message).trim()));
      resolve(String(stdout || '').trim());
    });
  });
}

function projectPathFromCommandLine(commandLine: string): string {
  const match = /(?:^|\s)-projectPath\s+(?:"([^"]+)"|(\S+))/i.exec(commandLine);
  return String(match?.[1] ?? match?.[2] ?? '').trim();
}

function unityVersionFromCommandLine(commandLine: string): string {
  const executable = /^"([^"]*\\Unity\.exe)"/i.exec(commandLine)?.[1]
    ?? /^(\S*\\Unity\.exe)/i.exec(commandLine)?.[1]
    ?? '';
  const match = /\\Editor\\([^\\]+)\\Editor\\Unity\.exe$/i.exec(executable);
  return match?.[1] ?? '';
}

function isUnityProject(projectPath: string): boolean {
  return fs.existsSync(path.join(projectPath, 'Assets'))
    && fs.existsSync(path.join(projectPath, 'Packages', 'manifest.json'))
    && fs.existsSync(path.join(projectPath, 'ProjectSettings'));
}

export async function discoverUnityProjects(): Promise<UnityProjectInfo[]> {
  if (process.platform !== 'win32') return [];
  const script = [
    '$p = Get-CimInstance Win32_Process -Filter "Name=\'Unity.exe\'" |',
    '  Select-Object ProcessId,CommandLine;',
    'if ($null -ne $p) { $p | ConvertTo-Json -Compress }'
  ].join(' ');

  let stdout = '';
  try {
    stdout = await runPowerShell(script);
  } catch {
    return [];
  }
  if (!stdout) return [];
  let parsed: ProcessRow | ProcessRow[];
  try {
    parsed = JSON.parse(stdout) as ProcessRow | ProcessRow[];
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const projects: UnityProjectInfo[] = [];

  for (const row of rows) {
    const commandLine = String(row.CommandLine ?? '');
    const rawProjectPath = projectPathFromCommandLine(commandLine);
    if (!rawProjectPath) continue;
    const projectPath = path.resolve(rawProjectPath);
    if (!isUnityProject(projectPath)) continue;
    projects.push({
      pid: Number(row.ProcessId ?? 0),
      projectPath,
      projectName: path.basename(projectPath),
      unityVersion: unityVersionFromCommandLine(commandLine)
    });
  }

  return projects.sort((a, b) => a.pid - b.pid);
}
