import fs from 'node:fs';
import path from 'node:path';
import {
  UNITY_MCP_PACKAGE,
  UNITY_MCP_PACKAGE_URL,
  UNITY_MCP_VERSION
} from './unity-constants.js';

export type UnityMcpPackageStatus = {
  installed: boolean;
  declared: boolean;
  resolved: boolean;
  spec: string;
  version: string;
  manifestPath: string;
  packagePath: string;
};

export type UnityMcpCompatibilityPatchResult = {
  changed: boolean;
  sourcePath: string;
  targetPath: string;
};

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function versionFromSpec(spec: string): string {
  const tagged = /#v?(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/.exec(spec)?.[1];
  if (tagged) return tagged;
  const semver = /^(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/.exec(spec)?.[1];
  return semver ?? '';
}

function findInstalledPackage(projectPath: string): string {
  const embedded = path.join(projectPath, 'Packages', UNITY_MCP_PACKAGE);
  if (fs.existsSync(path.join(embedded, 'package.json'))) return embedded;

  const cacheRoot = path.join(projectPath, 'Library', 'PackageCache');
  if (!fs.existsSync(cacheRoot)) return '';
  for (const entry of fs.readdirSync(cacheRoot)) {
    if (!entry.startsWith(`${UNITY_MCP_PACKAGE}@`)) continue;
    const candidate = path.join(cacheRoot, entry);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
  }
  return '';
}

export function inspectUnityMcpPackage(projectPath: string): UnityMcpPackageStatus {
  const manifestPath = path.join(projectPath, 'Packages', 'manifest.json');
  try {
    const manifest = readJson(manifestPath);
    const spec = String(manifest?.dependencies?.[UNITY_MCP_PACKAGE] ?? '');
    let resolved = false;
    let lockVersion = '';
    try {
      const lock = readJson(path.join(projectPath, 'Packages', 'packages-lock.json'));
      const entry = lock?.dependencies?.[UNITY_MCP_PACKAGE];
      resolved = Boolean(entry);
      lockVersion = String(entry?.version ?? '');
    } catch {}

    const packagePath = findInstalledPackage(projectPath);
    let packageVersion = '';
    if (packagePath) {
      try { packageVersion = String(readJson(path.join(packagePath, 'package.json'))?.version ?? ''); } catch {}
    }
    const version = packageVersion || versionFromSpec(lockVersion) || versionFromSpec(spec);
    return {
      installed: Boolean(packagePath),
      declared: Boolean(spec),
      resolved,
      spec,
      version,
      manifestPath,
      packagePath
    };
  } catch {
    return {
      installed: false,
      declared: false,
      resolved: false,
      spec: '',
      version: '',
      manifestPath,
      packagePath: ''
    };
  }
}

export function applyUnityMcpCompatibilityPatches(
  status: UnityMcpPackageStatus
): UnityMcpCompatibilityPatchResult {
  const sourcePath = path.resolve(__dirname, '../../../../tools/unity/ManageUI.cs');
  const targetPath = status.packagePath
    ? path.join(status.packagePath, 'Editor', 'Tools', 'ManageUI.cs')
    : '';

  if (!status.installed || status.version !== UNITY_MCP_VERSION || !targetPath) {
    return { changed: false, sourcePath, targetPath };
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`DeskLink Unity manage_ui patch source was not found: ${sourcePath}`);
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Installed Unity MCP ManageUI.cs was not found: ${targetPath}`);
  }

  const desired = fs.readFileSync(sourcePath, 'utf8');
  if (!desired.includes('DeskLink manage_ui compatibility patch: v1')) {
    throw new Error('DeskLink Unity manage_ui patch source is missing its compatibility marker.');
  }

  const current = fs.readFileSync(targetPath, 'utf8');
  if (current === desired) return { changed: false, sourcePath, targetPath };

  fs.writeFileSync(targetPath, desired, 'utf8');
  return { changed: true, sourcePath, targetPath };
}

export function installUnityMcpPackage(projectPath: string): UnityMcpPackageStatus {
  const manifestPath = path.join(projectPath, 'Packages', 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('Unity Packages/manifest.json was not found.');

  const manifest = readJson(manifestPath);
  if (!manifest.dependencies || typeof manifest.dependencies !== 'object') manifest.dependencies = {};
  const backupPath = `${manifestPath}.desklink.bak`;
  if (!fs.existsSync(backupPath)) fs.copyFileSync(manifestPath, backupPath);

  manifest.dependencies[UNITY_MCP_PACKAGE] = UNITY_MCP_PACKAGE_URL;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return inspectUnityMcpPackage(projectPath);
}
