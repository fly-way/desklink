// Builds DeskLink's Windows icon from the exact icon resources embedded in Electron.exe.
// This makes packaged DeskLink match the icon shown by `npm run dev`.
import fs from 'node:fs';
import path from 'node:path';
import * as PELibrary from 'pe-library';
import * as ResEdit from 'resedit';

const electronExe = path.join(
  process.cwd(),
  'node_modules', 'electron', 'dist', 'electron.exe'
);
const target = path.join(process.cwd(), 'build', 'icon.ico');

if (!fs.existsSync(electronExe)) {
  throw new Error('Electron executable not found. Run npm install first.');
}

const executable = PELibrary.NtExecutable.from(
  fs.readFileSync(electronExe),
  { ignoreCert: true }
);
const resources = PELibrary.NtExecutableResource.from(executable);
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);

if (!groups.length) {
  throw new Error('Electron.exe does not contain a Windows icon group.');
}

const group = groups[0];
const items = group.getIconItemsFromEntries(resources.entries);
const iconFile = new ResEdit.Data.IconFile();
iconFile.icons = items.map(data => ({ data }));

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, Buffer.from(iconFile.generate()));

const sizes = group.icons
  .map(icon => `${icon.width || 256}x${icon.height || 256}`)
  .join(', ');
console.log(`icon written: ${target} (${sizes})`);
