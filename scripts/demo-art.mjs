// Drawn demo images for the seed script: simple illustrations of each kind of piece on a studio
// background, clearly marked "DEMO" so nobody mistakes them for real stock photos.
// No dependencies: a tiny rasteriser plus a PNG encoder on top of Node's zlib.
import { deflateSync } from "node:zlib";

// ------------------------------------------------------------------ PNG

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** RGB float image (0..1) → PNG bytes. Rows use the "Sub" filter, which suits smooth gradients. */
export function encodePng(img) {
  const { w, h, px } = img;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * 3 + 1);
    raw[o] = 1;
    let pr = 0, pg = 0, pb = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const r = Math.max(0, Math.min(255, Math.round(px[i] * 255)));
      const g = Math.max(0, Math.min(255, Math.round(px[i + 1] * 255)));
      const b = Math.max(0, Math.min(255, Math.round(px[i + 2] * 255)));
      raw[o + 1 + x * 3] = (r - pr) & 255;
      raw[o + 2 + x * 3] = (g - pg) & 255;
      raw[o + 3 + x * 3] = (b - pb) & 255;
      pr = r; pg = g; pb = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ drawing

const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const DARK = hex("#5a3b0b"), MID = hex("#b8862b"), LIGHT = hex("#fbeab0"), DEEP = hex("#7a5212");
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v) => Math.max(0, Math.min(1, v));
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

function image(w, h) {
  return { w, h, px: new Float32Array(w * h * 3) };
}
function blend(img, x, y, c, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 3;
  img.px[i] += (c[0] - img.px[i]) * a;
  img.px[i + 1] += (c[1] - img.px[i + 1]) * a;
  img.px[i + 2] += (c[2] - img.px[i + 2]) * a;
}
/** Runs fn over the pixels of a box inside region r. */
function each(img, r, x0, y0, x1, y1, fn) {
  const xa = Math.max(r.x, Math.floor(x0)), xb = Math.min(r.x + r.s - 1, Math.ceil(x1));
  const ya = Math.max(r.y, Math.floor(y0)), yb = Math.min(r.y + r.s - 1, Math.ceil(y1));
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) fn(x, y);
}

function studio(img, r) {
  const cx = r.x + r.s / 2, cy = r.y + r.s * 0.42;
  each(img, r, r.x, r.y, r.x + r.s, r.y + r.s, (x, y) => {
    const d = Math.hypot(x - cx, y - cy) / (r.s * 0.75);
    const c = mix(hex("#f7f7f8"), hex("#d3d6db"), clamp(d));
    const i = (y * img.w + x) * 3;
    img.px[i] = c[0]; img.px[i + 1] = c[1]; img.px[i + 2] = c[2];
  });
}
function shadow(img, r, cx, cy, rx, ry, strength = 0.18) {
  each(img, r, cx - rx * 1.6, cy - ry * 1.6, cx + rx * 1.6, cy + ry * 1.6, (x, y) => {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    blend(img, x, y, [0, 0, 0], strength * (1 - smooth(0.4, 1.5, d)));
  });
}
/** Gold "tube" along an ellipse, shaded across the tube and around it, with a soft highlight. */
function goldRing(img, r, cx, cy, rx, ry, t, phase = 0) {
  rx = Math.max(rx, 1);
  each(img, r, cx - rx - t, cy - ry - t, cx + rx + t, cy + ry + t, (x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const d = Math.hypot(dx / rx, dy / ry);
    const k = Math.min(rx, ry);
    const off = (d - 1) * k; // distance from the centre line of the tube
    const half = t / 2;
    const a = 1 - smooth(half - 1, half + 0.6, Math.abs(off));
    if (a <= 0) return;
    const across = off / half; // -1 inner edge, +1 outer edge
    const ang = Math.atan2(dy, dx);
    const light = clamp(0.55 + 0.45 * Math.cos(across * 1.4 + 0.5) * (0.65 + 0.35 * Math.sin(ang - 0.9 + phase)));
    let c = light < 0.5 ? mix(DARK, MID, light * 2) : mix(MID, LIGHT, (light - 0.5) * 2);
    const spec = Math.exp(-((across + 0.35) ** 2) * 14) * clamp(Math.sin(ang - 2.2 + phase)) * 0.7;
    c = mix(c, [1, 0.98, 0.9], spec);
    blend(img, x, y, c, a);
  });
}
function disc(img, r, cx, cy, rad, kind = "gold") {
  each(img, r, cx - rad - 1, cy - rad - 1, cx + rad + 1, cy + rad + 1, (x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const d = Math.hypot(dx, dy) / rad;
    const a = 1 - smooth(1 - 1.2 / rad, 1 + 0.6 / rad, d);
    if (a <= 0) return;
    const l = clamp(1 - Math.hypot(dx / rad + 0.35, dy / rad + 0.4) * 0.75);
    let c;
    if (kind === "gem") c = mix(hex("#7f90a2"), [1, 1, 1], l);
    else if (kind === "ruby") c = mix(hex("#5c0a14"), hex("#e2465a"), l);
    else c = l < 0.5 ? mix(DEEP, MID, l * 2) : mix(MID, LIGHT, (l - 0.5) * 2);
    blend(img, x, y, c, a);
  });
}
function line(img, r, x0, y0, x1, y1, w) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  each(img, r, Math.min(x0, x1) - w, Math.min(y0, y1) - w, Math.max(x0, x1) + w, Math.max(y0, y1) + w, (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    const t = clamp(((px - x0) * (x1 - x0) + (py - y0) * (y1 - y0)) / (len * len));
    const d = Math.hypot(px - (x0 + t * (x1 - x0)), py - (y0 + t * (y1 - y0)));
    const a = 1 - smooth(w / 2 - 0.8, w / 2 + 0.6, d);
    blend(img, x, y, mix(MID, LIGHT, 0.35 + 0.3 * Math.sin(t * 40)), a);
  });
}

// "DEMO" in a 5×7 bitmap font, so every image says what it is.
const FONT = { D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"], E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"], M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"], O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"] };
function demoLabel(img, r) {
  const u = Math.max(2, Math.round(r.s / 110));
  const w = (4 * 6 - 1) * u, h = 7 * u, pad = 2 * u;
  // Top centre: the app puts its own badges in the corners (select, 360°, status).
  const x0 = r.x + (r.s - w - pad * 2) / 2, y0 = r.y + 3 * u;
  each(img, r, x0, y0, x0 + w + pad * 2, y0 + h + pad * 2, (x, y) => blend(img, x, y, [0.1, 0.11, 0.13], 0.78));
  [..."DEMO"].forEach((ch, k) =>
    FONT[ch].forEach((row, j) =>
      [...row].forEach((bit, i) => {
        if (bit !== "1") return;
        each(img, r, x0 + pad + (k * 6 + i) * u, y0 + pad + j * u, x0 + pad + (k * 6 + i + 1) * u - 1, y0 + pad + (j + 1) * u - 1, (x, y) => blend(img, x, y, [1, 1, 1], 1));
      }),
    ),
  );
}

// ------------------------------------------------------------------ one illustration per kind

/** Draws a piece into region r (x, y, s = size). th is the turntable angle for spins. */
function drawPiece(img, r, kind, th = 0) {
  studio(img, r);
  const S = r.s, cx = r.x + S / 2, cy = r.y + S / 2;
  const turn = (R) => Math.max(R * Math.abs(Math.cos(th)), S * 0.03);
  switch (kind) {
    case "bangle": {
      shadow(img, r, cx, r.y + S * 0.86, turn(S * 0.33) + S * 0.04, S * 0.03);
      goldRing(img, r, cx, cy - S * 0.02, turn(S * 0.32), S * 0.3, S * 0.07, th);
      goldRing(img, r, cx, cy - S * 0.02, turn(S * 0.32), S * 0.3, S * 0.012, th + 1.5);
      break;
    }
    case "baby-bangle": {
      shadow(img, r, cx, r.y + S * 0.8, S * 0.26, S * 0.03);
      goldRing(img, r, cx, cy, S * 0.24, S * 0.22, S * 0.05);
      break;
    }
    case "ring": {
      const rx = turn(S * 0.26);
      shadow(img, r, cx, r.y + S * 0.8, rx + S * 0.04, S * 0.03);
      goldRing(img, r, cx, cy + S * 0.1, rx, S * 0.1, S * 0.05, th);
      const sx = cx + Math.sin(th) * S * 0.02, sy = cy - S * 0.09;
      line(img, r, sx - S * 0.04, sy + S * 0.09, sx - S * 0.02, sy, S * 0.018);
      line(img, r, sx + S * 0.04, sy + S * 0.09, sx + S * 0.02, sy, S * 0.018);
      disc(img, r, sx, sy, S * 0.075, "gem");
      break;
    }
    case "signet": {
      shadow(img, r, cx, r.y + S * 0.8, S * 0.3, S * 0.03);
      goldRing(img, r, cx, cy + S * 0.1, S * 0.24, S * 0.1, S * 0.06);
      disc(img, r, cx, cy - S * 0.04, S * 0.12);
      disc(img, r, cx, cy - S * 0.04, S * 0.08);
      break;
    }
    case "chain": {
      for (let k = 0; k <= 34; k++) {
        const t = -Math.PI / 2 + (k / 34) * Math.PI;
        goldRing(img, r, cx + S * 0.34 * Math.sin(t), r.y + S * 0.18 + S * 0.62 * Math.cos(t), S * 0.022, S * 0.018, S * 0.009, k);
      }
      break;
    }
    case "necklace":
    case "set": {
      for (let k = 0; k <= 26; k++) {
        const t = -Math.PI / 2 + (k / 26) * Math.PI;
        disc(img, r, cx + S * 0.32 * Math.sin(t), r.y + S * 0.16 + S * 0.5 * Math.cos(t), S * (0.022 + 0.012 * Math.cos(t)));
      }
      disc(img, r, cx, r.y + S * 0.74, S * 0.07);
      disc(img, r, cx, r.y + S * 0.74, S * 0.03, kind === "set" ? "ruby" : "gold");
      if (kind === "set") {
        for (const ex of [r.x + S * 0.12, r.x + S * 0.88]) {
          disc(img, r, ex, r.y + S * 0.62, S * 0.025);
          disc(img, r, ex, r.y + S * 0.72, S * 0.05);
        }
      }
      break;
    }
    case "earrings": {
      for (const ex of [cx - S * 0.17, cx + S * 0.17]) {
        goldRing(img, r, ex, r.y + S * 0.25, S * 0.03, S * 0.03, S * 0.012);
        line(img, r, ex, r.y + S * 0.28, ex, r.y + S * 0.4, S * 0.012);
        goldRing(img, r, ex, r.y + S * 0.56, S * 0.13, S * 0.16, S * 0.045);
        disc(img, r, ex, r.y + S * 0.5, S * 0.035, "ruby");
        for (let k = 0; k < 7; k++) disc(img, r, ex - S * 0.12 + k * S * 0.04, r.y + S * 0.74, S * 0.014);
      }
      break;
    }
    case "pendant": {
      line(img, r, r.x + S * 0.2, r.y + S * 0.08, cx, r.y + S * 0.38, S * 0.01);
      line(img, r, r.x + S * 0.8, r.y + S * 0.08, cx, r.y + S * 0.38, S * 0.01);
      goldRing(img, r, cx, r.y + S * 0.4, S * 0.025, S * 0.025, S * 0.012);
      goldRing(img, r, cx, cy + S * 0.12, S * 0.17, S * 0.2, S * 0.05);
      goldRing(img, r, cx, cy + S * 0.12, S * 0.08, S * 0.1, S * 0.02);
      break;
    }
    case "bracelet": {
      for (let k = 0; k < 20; k++) {
        const t = (k / 20) * Math.PI * 2;
        goldRing(img, r, cx + S * 0.3 * Math.cos(t), cy + S * 0.18 * Math.sin(t), S * 0.04, S * 0.025, S * 0.014, t);
      }
      break;
    }
  }
  demoLabel(img, r);
}

export function photoPng(kind, size = 1000) {
  const img = image(size, size);
  drawPiece(img, { x: 0, y: 0, s: size }, kind, 0.35);
  return encodePng(img);
}

/** 24-frame turntable sprite sheet (6×4), as the phone makes from a video. */
export function spritePng(kind, cell = 360, frames = 24, cols = 6) {
  const rows = Math.ceil(frames / cols);
  const img = image(cols * cell, rows * cell);
  for (let i = 0; i < frames; i++) drawPiece(img, { x: (i % cols) * cell, y: Math.floor(i / cols) * cell, s: cell }, kind, (i / frames) * Math.PI * 2);
  return encodePng(img);
}
