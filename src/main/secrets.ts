import { spawnSync } from 'node:child_process';

const POWERSHELL = 'powershell.exe';
const BASE_ARGS = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'];

function run(script: string, input: string): string {
  const result = spawnSync(POWERSHELL, [...BASE_ARGS, script], {
    input,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(String(result.stderr || 'PowerShell failed.').trim().slice(0, 300));
  return result.stdout;
}

/** Windows DPAPI (current user). Falls back to plain storage on other platforms. */
export function protectSecret(plain: string): string {
  if (process.platform !== 'win32') return plain;
  return run(
    '$secure=ConvertTo-SecureString -String ([Console]::In.ReadToEnd()) -AsPlainText -Force;' +
    '[Console]::Out.Write((ConvertFrom-SecureString -SecureString $secure));',
    plain
  ).trim();
}

export function unprotectSecret(value: string): string {
  if (process.platform !== 'win32') return value;
  return run(
    '$cipher=[Console]::In.ReadToEnd();' +
    '$secure=ConvertTo-SecureString -String $cipher;' +
    '$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);' +
    'try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)); }' +
    'finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); }',
    value
  );
}
