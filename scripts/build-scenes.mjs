// Draws the pixel-art battle backgrounds (media/scenes/*.png). They are original: everything is generated from the
// code below, nothing is taken from any game. Run `npm run scenes` after changing a scene and commit the PNGs.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const W = 192, H = 112;
const GROUND = 72;                       // y where the ground starts; the platforms sit on it
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'media', 'scenes');

let buf;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));
const C = h => (typeof h === 'string' ? hex(h) : h);
const set = (x, y, c) => {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
};
const rect = (x, y, w, h, c) => { c = C(c); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); };
const disc = (cx, cy, r, c) => { c = C(c); for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.5) set(cx + x, cy + y, c); };
const rng = seed => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

/** Sky: a few colour bands blended with an ordered dither, like the old handheld backgrounds. */
function sky(top, bottom, to = GROUND + 6, bands = 6) {
  top = C(top); bottom = C(bottom);
  for (let y = 0; y < to; y++) {
    const f = (y / to) * bands, b = Math.floor(f), frac = f - b;
    for (let x = 0; x < W; x++) {
      const k = frac > (BAYER[y & 3][x & 3] + 0.5) / 16 ? b + 1 : b;
      set(x, y, mix(top, bottom, Math.min(1, k / bands)));
    }
  }
}
const fillDown = (x, y, c) => { c = C(c); for (let j = y; j < H; j++) set(x, j, c); };
function hills(c, base, amp, seed) {
  const r = rng(seed), p1 = r() * 6, p2 = r() * 6;
  for (let x = 0; x < W; x++) fillDown(x, Math.round(base - amp * (0.5 + (Math.sin(x * 0.045 + p1) + 0.5 * Math.sin(x * 0.13 + p2)) / 3)), c);
}
function mountains(c, base, peaks, snow) {
  for (let x = 0; x < W; x++) {
    let h = 0; for (const [cx, ph, hw] of peaks) h = Math.max(h, ph - Math.abs(x - cx) * ph / hw);
    const top = Math.round(base - h);
    fillDown(x, top, c);
    if (snow && h > peaks[0][1] * 0.0) for (let j = 0; j < 5 && h > 14; j++) if ((x + j) % 3 || j < 3) set(x, top + j, snow);
  }
}
function pines(c, trunk, base, xs, h) {
  for (const x of xs) {
    rect(x - 1, base - 3, 2, 4, trunk);
    for (let r = 0; r < h; r++) rect(x - 1 - Math.floor(r * 0.42), base - 4 - h + r, 2 + Math.floor(r * 0.84), 1, c);
  }
}
function skyline(c, base, seed, win, wc) {
  const r = rng(seed);
  for (let x = 0; x < W;) {
    const w = 8 + Math.floor(r() * 9), h = 16 + Math.floor(r() * 30);
    rect(x, base - h, w, h + 40, c);
    if (win) for (let y = base - h + 3; y < base - 3; y += 4) for (let i = x + 2; i < x + w - 2; i += 3) if (r() < 0.45) set(i, y, wc);
    x += w + Math.floor(r() * 3);
  }
}
function clouds(c, shade, spots) {
  for (const [x, y, w] of spots) { rect(x, y, w, 3, c); rect(x + 3, y - 2, w - 7, 3, c); rect(x + 2, y + 3, w - 4, 1, shade); }
}
function stars(n, c, seed, maxY = 50) { const r = rng(seed); for (let i = 0; i < n; i++) set(r() * W, r() * maxY, r() < 0.2 ? [255, 255, 255] : C(c)); }
/** Ground: two alternating tones in tiles (or stripes), a lit edge on top and a dark one under it. */
function ground(c1, c2, { tile = 8, stripes = false, edge, depth = 2 } = {}) {
  c1 = C(c1); c2 = C(c2);
  for (let y = GROUND; y < H; y++) for (let x = 0; x < W; x++) {
    const row = Math.floor((y - GROUND) / (tile * (0.6 + (y - GROUND) / 55)));   // rows get taller toward the viewer
    set(x, y, ((stripes ? 0 : row) + Math.floor(x / tile)) % 2 ? c2 : c1);
  }
  rect(0, GROUND, W, 1, edge ? C(edge) : mix(c1, [255, 255, 255], 0.35));
  rect(0, GROUND + 1, W, depth, mix(c1, [0, 0, 0], 0.25));
}
function platform(cx, cy, rx, ry, top, side) {
  top = C(top); side = C(side);
  for (let y = -ry - 3; y <= ry + 3; y++) for (let x = -rx; x <= rx; x++) {
    const inTop = (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1;
    const inSide = (x * x) / (rx * rx) + ((y - 3) * (y - 3)) / (ry * ry) <= 1;
    if (inTop) set(cx + x, cy + y, (x * x) / (rx * rx) + (y * y) / (ry * ry) > 0.78 ? mix(top, [255, 255, 255], 0.25) : top);
    else if (inSide) set(cx + x, cy + y, side);
  }
}
function waves(y0, y1, c1, c2, seed) {
  c1 = C(c1); c2 = C(c2); const r = rng(seed);
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) set(x, y, y % 2 ? c1 : mix(c1, c2, 0.4));
  for (let y = y0 + 2; y < y1; y += 4) for (let x = 0; x < W; x += 9 + Math.floor(r() * 6)) { rect(x, y, 4, 1, mix(c2, [255, 255, 255], 0.3)); }
}
function dots(n, c, seed, y0, y1) { const r = rng(seed); for (let i = 0; i < n; i++) set(r() * W, y0 + r() * (y1 - y0), C(c)); }

const SCENES = {
  volcano() {
    sky('#2a0a08', '#e8662a');
    mountains('#4a1a12', GROUND, [[40, 30, 50], [150, 26, 44]]);
    mountains('#34100c', GROUND, [[96, 52, 62]]);            // the volcano
    rect(88, GROUND - 52, 16, 3, '#ffb23a'); rect(90, GROUND - 56, 12, 4, '#ff6a1a'); rect(93, GROUND - 60, 6, 4, '#ffd24a');   // glowing crater
    for (let y = GROUND - 48; y < GROUND; y += 2) rect(95 + Math.round(Math.sin(y * 0.4) * 2), y, 2, 2, '#e8501a');             // lava flow
    ground('#3b2a2a', '#2e2020', { tile: 12, edge: '#6a4a3a' });
    dots(70, '#ffb23a', 11, 40, GROUND + 30);
    for (let i = 0; i < 6; i++) rect(14 + i * 33, GROUND + 14 + (i % 2) * 10, 10, 1, '#ff7a1a');   // cracks of lava in the floor
  },
  lake() {
    sky('#4a98d8', '#c4eaf8');
    disc(150, 22, 9, '#fff6c0'); disc(150, 22, 6, '#ffffff');
    clouds('#ffffff', '#cfe6f4', [[20, 24, 26], [88, 14, 22], [120, 40, 18]]);
    hills('#4b8f6a', 58, 14, 3);
    waves(58, GROUND, '#3a86c8', '#2a64a8', 5);
    ground('#e8d49a', '#dcc688', { tile: 10, stripes: true, edge: '#fff0c0' });
  },
  forest() {
    sky('#6fb5d8', '#cdeed2');
    hills('#2f7a46', 52, 16, 7);
    pines('#1f5f34', '#4a3020', 62, [10, 34, 58, 82, 106, 130, 154, 178], 22);
    pines('#2b7a42', '#4a3020', 70, [22, 46, 70, 94, 118, 142, 166], 18);
    ground('#4fa84f', '#459a45', { tile: 10, edge: '#8bd870' });
    const r = rng(9); for (let i = 0; i < 40; i++) { const x = r() * W, y = GROUND + 3 + r() * 36; rect(x, y, 1, 2, '#2f7a2f'); set(x + 1, y + 1, '#2f7a2f'); }
  },
  plant() {
    sky('#2a2a40', '#a89238');
    skyline('#2a2a34', GROUND, 21, true, '#ffe14a');
    for (const x of [30, 100, 160]) {   // pylons
      for (let y = 0; y < 46; y++) { const w = 3 + Math.floor((y / 46) * 9); rect(x - Math.floor(w / 2), GROUND - 46 + y, 1, 1, '#14141c'); rect(x + Math.floor(w / 2), GROUND - 46 + y, 1, 1, '#14141c'); if (y % 6 === 0) rect(x - Math.floor(w / 2), GROUND - 46 + y, w + 1, 1, '#14141c'); }
      rect(x - 9, GROUND - 46, 19, 1, '#14141c');
    }
    for (const [x, y] of [[62, 20], [126, 34]]) { rect(x, y, 2, 6, '#ffe14a'); rect(x - 2, y + 5, 3, 2, '#ffe14a'); rect(x + 1, y + 6, 3, 5, '#ffe14a'); }
    ground('#6a6a70', '#5c5c64', { tile: 14, edge: '#9a9aa4' });
    for (let x = 6; x < W; x += 24) rect(x, GROUND + 24, 8, 1, '#ffe14a');
  },
  temple() {
    sky('#241048', '#c28be6');
    stars(40, '#e8d8ff', 4, 46);
    disc(96, 30, 14, '#e8d0ff'); disc(100, 28, 12, '#c8a0ee');
    for (const x of [20, 56, 132, 168]) { rect(x - 5, GROUND - 40, 11, 3, '#d8c8f0'); rect(x - 3, GROUND - 37, 7, 37, '#bba8e0'); rect(x - 2, GROUND - 37, 2, 37, '#d8c8f0'); rect(x - 5, GROUND - 4, 11, 4, '#d8c8f0'); }
    rect(14, GROUND - 46, 160, 6, '#8a70b8'); rect(14, GROUND - 46, 160, 1, '#d8c8f0');
    ground('#8a70b8', '#7860a8', { tile: 12, edge: '#d8c8f0' });
  },
  dojo() {
    sky('#e88a4a', '#f8dc98');
    disc(96, 52, 26, '#ffd070'); disc(96, 52, 20, '#ffe8a0');
    mountains('#a8643c', GROUND, [[30, 22, 40], [168, 26, 44]]);
    for (let i = 0; i < 4; i++) { const w = 54 - i * 10, y = GROUND - 14 - i * 11; rect(96 - w / 2, y, w, 4, '#3a1c14'); rect(96 - w / 2 + 4, y + 4, w - 8, 7, '#7a2a1a'); }   // pagoda
    rect(94, GROUND - 62, 4, 6, '#3a1c14');
    ground('#a8743c', '#8f5f2e', { tile: 8, stripes: true, edge: '#d8a060' });
  },
  night() {
    sky('#05060f', '#232650');
    stars(60, '#c8d0ff', 6, 56);
    disc(150, 22, 10, '#f4f0d0'); disc(154, 20, 8, '#14183a'); disc(150, 22, 10, '#f4f0d0'); disc(155, 20, 8, '#0c1030');
    hills('#10142e', 60, 14, 12);
    for (const [x, h] of [[22, 30], [84, 36], [162, 28]]) { rect(x, GROUND - h, 2, h, '#07080f'); rect(x - 7, GROUND - h + 8, 7, 1, '#07080f'); rect(x + 2, GROUND - h + 14, 8, 1, '#07080f'); rect(x - 4, GROUND - h + 4, 1, 4, '#07080f'); }
    ground('#1c2a1c', '#16221a', { tile: 10, edge: '#3a5a3a' });
  },
  factory() {
    sky('#4a5560', '#9aa6b0');
    skyline('#363f48', GROUND, 31, true, '#ffd85a');
    for (const x of [40, 150]) { rect(x, GROUND - 52, 10, 52, '#2a3138'); rect(x, GROUND - 52, 10, 3, '#8a96a0'); rect(x, GROUND - 40, 10, 2, '#b04a2a'); disc(x + 4, GROUND - 60, 6, '#cfd6dc'); disc(x + 10, GROUND - 68, 7, '#dfe5ea'); }
    ground('#6a757e', '#5a646c', { tile: 16, edge: '#aab4bc' });
    for (let y = GROUND + 4; y < H; y += 12) for (let x = 3; x < W; x += 16) set(x, y, '#2a3138');
  },
  peak() {
    sky('#2a1450', '#e07080');
    stars(24, '#ffe8f0', 8, 36);
    clouds('#f4b0c0', '#c87088', [[16, 40, 30], [130, 34, 34]]);
    mountains('#5a3a78', GROUND, [[40, 44, 50], [150, 50, 56]], '#fff0f4');
    mountains('#3c2458', GROUND, [[96, 60, 58]], '#ffe4ec');
    ground('#6a5a6a', '#5c4c5c', { tile: 12, edge: '#a890a8' });
  },
  garden() {
    sky('#ffc0e4', '#fff4fa');
    clouds('#ffffff', '#f4d8ec', [[24, 20, 26], [112, 28, 24]]);
    hills('#a8e0a0', 56, 12, 15);
    const r = rng(17);
    for (const x of [18, 60, 108, 150]) { rect(x, GROUND - 22, 3, 22, '#7a4a3a'); for (let i = 0; i < 26; i++) disc(x + 1 + (r() * 22 - 11), GROUND - 28 - r() * 16, 3, r() < 0.5 ? '#ff9ac8' : '#ffc4de'); }
    ground('#8fd88f', '#80cc80', { tile: 10, edge: '#d8ffc8' });
    for (let i = 0; i < 50; i++) { const x = r() * W, y = GROUND + 3 + r() * 36; set(x, y, r() < 0.5 ? '#ffffff' : '#ff7ab8'); }
  },
  meadow() {
    sky('#4f9ee0', '#c0e2f8');
    clouds('#ffffff', '#d6ebf8', [[14, 18, 28], [80, 10, 24], [130, 30, 30]]);
    hills('#6fbf5a', 56, 14, 19);
    hills('#58aa48', 64, 8, 23);
    ground('#5cbf4a', '#50ae40', { tile: 10, edge: '#a0e888' });
    const r = rng(2); for (let i = 0; i < 40; i++) { const x = r() * W, y = GROUND + 3 + r() * 36; rect(x, y, 1, 2, '#3a8f2f'); }
  },
  stadium() {
    sky('#0a1220', '#1c3050');
    rect(0, 30, W, 36, '#141c2c');
    const r = rng(41); for (let y = 34; y < 64; y += 3) for (let x = 0; x < W; x += 2) set(x, y, r() < 0.5 ? '#3a4a6a' : r() < 0.5 ? '#c04a4a' : '#e0e0f0');   // the crowd
    for (const x of [20, 70, 122, 172]) { rect(x, 8, 8, 4, '#f0f4ff'); rect(x - 1, 7, 10, 6, '#8a9ac0'); rect(x, 8, 8, 4, '#ffffff'); rect(x + 2, 13, 4, 3, '#3a4a6a'); }
    rect(0, 64, W, 8, '#2a3448');
    ground('#2f7a3a', '#2a6b34', { tile: 24, stripes: true, edge: '#ffffff' });
    rect(0, GROUND + 28, W, 1, '#ffffff'); rect(95, GROUND + 14, 2, 20, '#ffffff');
  },
  hideout() {
    sky('#0c0c10', '#401828', GROUND, 4);
    for (let x = 0; x < W; x += 24) { rect(x, 0, 22, GROUND, '#1c1c26'); rect(x, 0, 22, 1, '#2c2c3a'); rect(x + 21, 0, 1, GROUND, '#0c0c12'); rect(x + 4, 14, 14, 2, '#2c2c3a'); }
    rect(0, 20, W, 3, '#6a1a2a'); rect(0, 50, W, 3, '#6a1a2a');
    for (let x = 0; x < W; x += 8) { rect(x, 21, 4, 1, '#e8c83a'); rect(x + 4, 51, 4, 1, '#e8c83a'); }   // warning stripes
    rect(150, 0, 3, 40, '#3a3a48'); rect(40, 0, 3, 56, '#3a3a48');                                       // pipes
    ground('#2a2a34', '#22222c', { tile: 12, edge: '#6a1a2a' });
  },
};

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1); }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xFFFFFFFF; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]); };
  const head = Buffer.alloc(13); head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync(out, { recursive: true });
for (const [name, draw] of Object.entries(SCENES)) {
  buf = new Uint8Array(W * H * 4);
  draw();
  platform(48, 96, 34, 6, '#9aa0a8', '#6a7078');   // where the rival stands (left)
  platform(144, 96, 34, 6, '#9aa0a8', '#6a7078');                              // where you stand (right)
  fs.writeFileSync(path.join(out, name + '.png'), png(W, H, buf));
}
console.log('wrote ' + Object.keys(SCENES).length + ' scenes to ' + out);
