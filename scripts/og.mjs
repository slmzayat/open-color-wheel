/**
 * Open Color Wheel — social preview image
 *
 * Renders data/palette.js as a 1200x630 PNG for og:image. No text: the social
 * card supplies the title and description itself, so the image only has to
 * show what the project is.
 *
 * Run: npm run og  (also runs as part of npm run build)
 *
 * The PNG is written by hand rather than pulled from a rendering library,
 * because rule 3 says vanilla and node:zlib is already in the runtime. Output
 * is deterministic, so CI can diff it like every other generated file.
 */

import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(ROOT, 'data/palette.js'), 'utf8');
const palette = JSON.parse(source.slice(source.indexOf('{'), source.lastIndexOf('}') + 1));

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 48;
const GAP = 5;

/* ---------- minimal PNG writer ------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Truecolor, 8 bits per channel, one filter byte of 0 per scanline. */
function encodePng(width, height, pixels) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;  // bit depth
  header[9] = 2;  // colour type: truecolor
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- draw ---------------------------------------------------------- */

const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);

function rgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function fill(x0, y0, w, h, [r, g, b]) {
  const xEnd = Math.min(WIDTH, x0 + w);
  const yEnd = Math.min(HEIGHT, y0 + h);
  for (let y = Math.max(0, y0); y < yEnd; y++) {
    let i = (y * WIDTH + Math.max(0, x0)) * 3;
    for (let x = Math.max(0, x0); x < xEnd; x++) {
      pixels[i++] = r; pixels[i++] = g; pixels[i++] = b;
    }
  }
}

const scales = Object.entries(palette.scales).filter(([k]) => !k.startsWith('$'));
const steps = Object.keys(scales[0][1].steps).filter(k => !k.startsWith('$'))
  .sort((a, b) => Number(a) - Number(b));

fill(0, 0, WIDTH, HEIGHT, rgb(palette.scales.gray.steps['950'].hex));

const cellW = (WIDTH - PAD * 2 - GAP * (steps.length - 1)) / steps.length;
const cellH = (HEIGHT - PAD * 2 - GAP * (scales.length - 1)) / scales.length;

scales.forEach(([, scale], row) => {
  steps.forEach((step, col) => {
    fill(
      Math.round(PAD + col * (cellW + GAP)),
      Math.round(PAD + row * (cellH + GAP)),
      Math.round(cellW),
      Math.round(cellH),
      rgb(scale.steps[step].hex),
    );
  });
});

const png = encodePng(WIDTH, HEIGHT, pixels);
writeFileSync(join(ROOT, 'og.png'), png);
console.log(`  og.png  ${WIDTH}x${HEIGHT}, ${scales.length} x ${steps.length} swatches, ${(png.length / 1024).toFixed(0)}KB`);
