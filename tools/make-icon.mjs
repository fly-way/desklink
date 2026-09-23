// Draws the DeskLink mark (two dots joined by a bar) into a multi-size Windows .ico.
// PNG payloads are embedded directly, which Windows has supported since Vista.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const SIZES = [16, 32, 48, 64, 128, 256];
const INK = { r: 29, g: 29, b: 31 }; // #1d1d1f, same as the UI text

function insideMark(x, y, size) {
  // Mark geometry is 24 x 13: two 9px dots and a 10 x 3 rounded bar between them.
  const scale = (size * 0.75) / 24;
  const offsetX = (size - 24 * scale) / 2;
  const offsetY = (size - 13 * scale) / 2;
  const mx = (x + 0.5 - offsetX) / scale;
  const my = (y + 0.5 - offsetY) / scale;

  const dot = (cx) => (mx - cx) ** 2 + (my - 6.5) ** 2 <= 4.5 ** 2;
  if (dot(5.5) || dot(18.5)) return true;

  const rx = 1.5;
  const left = 7;
  const right = 17;
  const top = 5;
  const bottom = 8;
  if (mx < left || mx > right || my < top || my > bottom) return false;
  const cx = Math.min(Math.max(mx, left + rx), right - rx);
  const cy = Math.min(Math.max(my, top + rx), bottom - rx);
  return (mx - cx) ** 2 + (my - cy) ** 2 <= rx ** 2;
}

function render(size) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (size * y + x) << 2;
      if (!insideMark(x, y, size)) { png.data[index + 3] = 0; continue; }
      png.data[index] = INK.r;
      png.data[index + 1] = INK.g;
      png.data[index + 2] = INK.b;
      png.data[index + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const images = SIZES.map(size => ({ size, data: render(size) }));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);

const entries = [];
let offset = 6 + images.length * 16;
for (const image of images) {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(image.size === 256 ? 0 : image.size, 0);
  entry.writeUInt8(image.size === 256 ? 0 : image.size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(image.data.length, 8);
  entry.writeUInt32LE(offset, 12);
  entries.push(entry);
  offset += image.data.length;
}

const target = path.join(process.cwd(), 'build', 'icon.ico');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, Buffer.concat([header, ...entries, ...images.map(image => image.data)]));
console.log(`icon written: ${target} (${SIZES.join(', ')})`);
