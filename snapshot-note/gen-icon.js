const { createCanvas } = (() => {
  try { return require('canvas'); } catch { return null; }
})() || {};
const fs = require('fs');
const zlib = require('zlib');

// Pure-Node PNG generator — no external deps
function crc32(buf) {
  let c = 0xFFFFFFFF;
  const table = [];
  for (let i = 0; i < 256; i++) {
    let n = i;
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xEDB88320 ^ (n >>> 1) : n >>> 1;
    table[i] = n;
  }
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeB = Buffer.from(type, 'ascii');
  const lenB = Buffer.alloc(4);
  lenB.writeUInt32BE(data.length, 0);
  const payload = Buffer.concat([typeB, data]);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(payload), 0);
  return Buffer.concat([lenB, payload, crcB]);
}

function makePNG(size) {
  const s = size;
  // RGBA pixel array
  const pixels = new Uint8Array(s * s * 4);

  const bg = [245, 240, 235, 255]; // warm off-white #f5f0eb
  const accent = [180, 90, 60];    // terracotta
  const dark = [40, 20, 10];

  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= s || y < 0 || y >= s) return;
    const i = (y * s + x) * 4;
    // alpha blend over existing
    const aa = a / 255;
    pixels[i]   = Math.round(r * aa + pixels[i]   * (1 - aa));
    pixels[i+1] = Math.round(g * aa + pixels[i+1] * (1 - aa));
    pixels[i+2] = Math.round(b * aa + pixels[i+2] * (1 - aa));
    pixels[i+3] = Math.min(255, pixels[i+3] + a * aa);
  }

  // Fill background (rounded rect)
  const r = Math.round(s * 0.22);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      // corner check
      let inCorner = false;
      const cx = x < r ? r : x >= s - r ? s - r - 1 : -1;
      const cy = y < r ? r : y >= s - r ? s - r - 1 : -1;
      if (cx >= 0 && cy >= 0) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r * r) inCorner = true;
      }
      if (!inCorner) {
        const i = (y * s + x) * 4;
        pixels[i] = bg[0]; pixels[i+1] = bg[1]; pixels[i+2] = bg[2]; pixels[i+3] = 255;
      }
    }
  }

  // Draw thick line helper (anti-aliased via Bresenham + thickness)
  function drawLine(x0, y0, x1, y1, r, g, b, thick) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx*dx + dy*dy);
    const steps = Math.ceil(len * 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x0 + dx * t, py = y0 + dy * t;
      for (let ox = -thick; ox <= thick; ox++) {
        for (let oy = -thick; oy <= thick; oy++) {
          const d = Math.sqrt(ox*ox + oy*oy);
          if (d <= thick) {
            const a = Math.max(0, 255 - Math.max(0, d - thick + 1) * 255);
            setPixel(Math.round(px + ox), Math.round(py + oy), r, g, b, a);
          }
        }
      }
    }
  }

  function drawCircle(cx, cy, rad, r, g, b, fill) {
    for (let ox = -rad - 2; ox <= rad + 2; ox++) {
      for (let oy = -rad - 2; oy <= rad + 2; oy++) {
        const d = Math.sqrt(ox*ox + oy*oy);
        if (fill) {
          if (d <= rad) setPixel(Math.round(cx+ox), Math.round(cy+oy), r, g, b, 255);
        } else {
          const border = 2;
          if (d >= rad - border && d <= rad) {
            const a = 255 - Math.max(0, (d - (rad - border)) / border) * 100;
            setPixel(Math.round(cx+ox), Math.round(cy+oy), r, g, b, a);
          }
        }
      }
    }
  }

  const sc = s / 100;
  const th = Math.round(sc * 5.5); // stroke thickness

  // ── ICON DESIGN: stylized "M" with a glowing dot ──
  // M shape: two legs + two diagonals meeting in center-top
  const left   = 20 * sc;
  const right  = 80 * sc;
  const top    = 22 * sc;
  const bot    = 76 * sc;
  const midX   = 50 * sc;
  const midY   = 48 * sc;

  // Left vertical leg
  drawLine(left, bot, left, top, ...accent, th);
  // Right vertical leg
  drawLine(right, bot, right, top, ...accent, th);
  // Left diagonal (top-left → center-mid)
  drawLine(left, top, midX, midY, ...accent, th);
  // Right diagonal (top-right → center-mid)
  drawLine(right, top, midX, midY, ...accent, th);

  // Serif-like feet
  const footLen = 7 * sc;
  const footTh = Math.round(th * 0.65);
  drawLine(left - footLen, bot + 2*sc, left + footLen, bot + 2*sc, ...accent, footTh);
  drawLine(right - footLen, bot + 2*sc, right + footLen, bot + 2*sc, ...accent, footTh);

  // Glowing accent dot (top right corner)
  const dotX = 76 * sc, dotY = 26 * sc, dotR = 7 * sc;
  // outer glow
  drawCircle(dotX, dotY, dotR + 4*sc, ...accent, false);
  // fill dot
  for (let ox = -dotR; ox <= dotR; ox++) {
    for (let oy = -dotR; oy <= dotR; oy++) {
      const d = Math.sqrt(ox*ox + oy*oy);
      if (d <= dotR) {
        const bright = 1 - (d / dotR) * 0.3;
        setPixel(
          Math.round(dotX + ox), Math.round(dotY + oy),
          Math.min(255, Math.round(accent[0] * bright + 30)),
          Math.min(255, Math.round(accent[1] * bright + 10)),
          Math.round(accent[2] * bright),
          255
        );
      }
    }
  }
  // small white highlight inside dot
  drawCircle(dotX - dotR * 0.25, dotY - dotR * 0.25, dotR * 0.28, 255, 255, 255, true);

  // Build PNG bytes
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0);
  ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Raw image rows: filter byte 0 + RGB
  const raw = Buffer.alloc(s * (1 + s * 3));
  for (let y = 0; y < s; y++) {
    raw[y * (1 + s * 3)] = 0;
    for (let x = 0; x < s; x++) {
      const src = (y * s + x) * 4;
      const dst = y * (1 + s * 3) + 1 + x * 3;
      // blend pixel over white if transparent
      const a = pixels[src + 3] / 255;
      raw[dst]   = Math.round(pixels[src]   * a + 255 * (1 - a));
      raw[dst+1] = Math.round(pixels[src+1] * a + 255 * (1 - a));
      raw[dst+2] = Math.round(pixels[src+2] * a + 255 * (1 - a));
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

const dir = __dirname + '/icons';
if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir);
fs.writeFileSync(dir + '/icon-192.png', makePNG(192));
fs.writeFileSync(dir + '/icon-512.png', makePNG(512));
console.log('Icons generated: icon-192.png, icon-512.png');
