// Draws the app icons (PNG) with no dependencies, so the repo needs no binary files.
import fs from 'node:fs';
import zlib from 'node:zlib';

const SIZE = 1024;
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(body));
  return Buffer.concat([head, body, tail]);
};
function png(pixels) {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Shapes in a 1024 box: a motorcycle seen from behind, leaned 22 degrees.
const roundRect = (x, y, cx, cy, hw, hh, r) => {
  const dx = Math.max(Math.abs(x - cx) - (hw - r), 0);
  const dy = Math.max(Math.abs(y - cy) - (hh - r), 0);
  return dx * dx + dy * dy <= r * r;
};
const LEAN = (22 * Math.PI) / 180;
const PIVOT = [512, 810];
function glyph(x, y) {
  // returns 0 = nothing, 1 = bike, 2 = tail light, 3 = ground
  if (roundRect(x, y, 512, 822, 380, 9, 9)) return 3;
  const dx = x - PIVOT[0];
  const dy = y - PIVOT[1];
  const bx = PIVOT[0] + dx * Math.cos(LEAN) + dy * Math.sin(LEAN);
  const by = PIVOT[1] - dx * Math.sin(LEAN) + dy * Math.cos(LEAN);
  if (roundRect(bx, by, 512, 520, 58, 22, 12)) return 2; // tail light
  if (roundRect(bx, by, 512, 665, 62, 145, 62)) return 1; // tyre
  if (roundRect(bx, by, 512, 440, 150, 125, 60)) return 1; // rider + tail
  if (roundRect(bx, by, 512, 400, 275, 13, 13)) return 1; // handlebars
  if ((bx - 512) ** 2 + (by - 245) ** 2 <= 88 * 88) return 1; // helmet
  return 0;
}

function render({ background, scale, mono }) {
  const px = Buffer.alloc(SIZE * SIZE * 4);
  const SS = 3; // supersampling
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const gx = 512 + (x + (sx + 0.5) / SS - 512) / scale;
          const gy = 512 + (y + (sy + 0.5) / SS - 512) / scale;
          const k = glyph(gx, gy);
          let c = background;
          if (k === 1) c = [245, 245, 245, 255];
          else if (k === 2) c = mono ? [0, 0, 0, 0] : [255, 59, 48, 255];
          else if (k === 3) c = mono ? [245, 245, 245, 255] : [120, 120, 120, 255];
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const i = (y * SIZE + x) * 4;
      if (a > 0) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; }
      px[i + 3] = a / (SS * SS);
    }
  }
  return png(px);
}

fs.mkdirSync('assets', { recursive: true });
fs.writeFileSync('assets/icon.png', render({ background: [0, 0, 0, 255], scale: 0.82, mono: false }));
fs.writeFileSync('assets/android-icon-foreground.png', render({ background: [0, 0, 0, 0], scale: 0.56, mono: false }));
fs.writeFileSync('assets/android-icon-monochrome.png', render({ background: [0, 0, 0, 0], scale: 0.56, mono: true }));
console.log('icons written to assets/');
