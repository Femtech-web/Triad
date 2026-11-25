// Draws the Triad mark (three rings, a green centre) into the PNG icons the browsers need. No dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };

function draw(size) {
  const s = size / 32, ss = 4, px = Buffer.alloc(size * size * 4);
  const rings = [[16, 11.2], [11.2, 19.6], [20.8, 19.6]], r = 7.2, w = Math.max(1.7, 2.6 / s);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let ring = 0, dot = 0, bg = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const X = (x + (sx + 0.5) / ss) / s, Y = (y + (sy + 0.5) / ss) / s;
      const rr = 6.5; const inBg = Math.max(Math.abs(X - 16) - (16 - rr), 0) ** 2 + Math.max(Math.abs(Y - 16) - (16 - rr), 0) ** 2 <= rr * rr;
      if (!inBg) continue; bg++;
      if (Math.hypot(X - 16, Y - 16.8) <= 2.4) { dot++; continue; }
      if (rings.some(([cx, cy]) => Math.abs(Math.hypot(X - cx, Y - cy) - r) <= w / 2)) ring++;
    }
    const n = ss * ss, i = (y * size + x) * 4;
    const a = bg / n; const fr = ring / n, fd = dot / n, base = 1 - fr - fd;
    px[i] = Math.round(15 * base + 226 * fr + 61 * fd); px[i + 1] = Math.round(18 * base + 232 * fr + 220 * fd); px[i + 2] = Math.round(23 * base + 255 * fr + 154 * fd); px[i + 3] = Math.round(255 * a);
  }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const size of [16, 32, 48, 128]) writeFileSync(new URL(`./icons/${size}.png`, import.meta.url), draw(size));
console.log('icons written');
