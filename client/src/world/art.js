import {NATURE_SPRITE_SIZES} from './natureSizes.js';
import {TREE_HEIGHTS} from './treeSizes.js';
// Procedural 16px pixel-art tiles and decoration sprites, rendered to canvases at runtime.
import { roofRegion, structureKind, structureTool } from './world.js';

export const TILE = 16;

export function hash(x, y, seed = 0) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function px(ctx, color, x, y, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

const GRASS = { base: '#5fa843', dark: '#4a9135', light: '#7cc35a', deep: '#3f7f2e' };

function speckle(ctx, seed, base, specks) {
  px(ctx, base, 0, 0, TILE, TILE);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const r = hash(x, y, seed);
      const speck = specks.find(([threshold]) => r < threshold);
      if (speck) px(ctx, speck[1], x, y, speck[2] ?? 1, speck[3] ?? 1);
    }
  }
}

// Wood floor: 4px planks with dark seams, a staggered joint per row, and a little grain.
function paintWoodFloor(ctx, s) {
  for (let y = 0; y < TILE; y++) {
    const row = Math.floor(y / 4);
    const joint = Math.floor(hash(row, s, 40) * TILE);
    for (let x = 0; x < TILE; x++) {
      let color = ['#b07a46', '#a5703f', '#bb8550'][Math.floor(hash(row, x < joint ? 0 : 1, s + 41) * 3)];
      if (y % 4 === 3) color = '#6b4428';
      else if (x === joint) color = '#7a4e2c';
      else if (hash(x, y, s + 42) < 0.06) color = '#9a6538';
      else if (y % 4 === 0 && hash(x, y, s + 43) < 0.3) color = '#c4905a';
      px(ctx, color, x, y);
    }
  }
}

// Carpet: a soft red weave with a small repeating diamond.
function paintCarpet(ctx, s) {
  speckle(ctx, s, '#a33b3b', [[0.08, '#8e3232'], [0.14, '#b84a4a']]);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) if (Math.abs((x % 8) - 4) + Math.abs((y % 8) - 4) === 3) px(ctx, '#c9a06a', x, y);
  }
}

const TERRAIN_PAINTERS = {
  o: paintWoodFloor,
  c: paintCarpet,
  g: (ctx, s) => speckle(ctx, s, GRASS.base, [[0.045, GRASS.dark, 1, 2], [0.085, GRASS.light], [0.1, GRASS.deep]]),
  d: (ctx, s) => speckle(ctx, s, '#b98d5c', [[0.06, '#a27849'], [0.1, '#cfa673'], [0.11, '#8f8a80', 2, 1]]),
  a: (ctx, s) => speckle(ctx, s, '#e4cf90', [[0.07, '#ccb577'], [0.11, '#f2e2ad']]),
  w: (ctx, s, frame = 0) => {
    speckle(ctx, s, '#3d7fd6', [[0.05, '#3572c6']]);
    for (let i = 0; i < 3; i++) {
      // Each wave drifts right one pixel per frame, alternate rows the other way, wrapping within the tile.
      const drift = i % 2 ? -frame : frame;
      const wx = (Math.floor(hash(i, 0, s + 50) * 12) + drift + TILE) % TILE;
      const wy = 2 + i * 5 + Math.floor(hash(i, 1, s + 50) * 2);
      for (let k = 0; k < 4; k++) px(ctx, k === 3 ? '#5d9be4' : '#86bdf2', (wx + k) % TILE, wy);
    }
    // A sparkle that appears in a different spot on some frames.
    if (hash(s, frame, 60) < 0.5) px(ctx, '#d6ebff', 2 + Math.floor(hash(s, frame, 61) * 12), 1 + Math.floor(hash(s, frame, 62) * 14));
  },
  s: (ctx, s) => {
    px(ctx, '#5f616b', 0, 0, TILE, TILE);
    const stones = [[0, 0, 8, 8], [8, 0, 8, 8], [0, 8, 5, 8], [5, 8, 7, 8], [12, 8, 4, 8]];
    stones.forEach(([x, y, w, h], i) => {
      px(ctx, ['#9a9ca6', '#8f919c', '#a5a7b0'][Math.floor(hash(i, s, 9) * 3)], x, y, w - 1, h - 1);
      px(ctx, '#b9bcc5', x, y, w - 1, 1);
      px(ctx, '#7d7f8a', x, y + h - 2, w - 1, 1);
    });
  },
};

const VARIANTS = 4;
const SIDES = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
const CORNERS = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] };

// Grass that spills over the edge of a neighbouring non-grass tile, so patches look organic.
function makeFringe(side, edgeColor) {
  const canvas = makeCanvas(TILE, TILE);
  const ctx = canvas.getContext('2d');
  const seed = Object.keys(SIDES).indexOf(side) + 11;
  const at = (i, d) => ({ n: [i, d], s: [i, TILE - 1 - d], w: [d, i], e: [TILE - 1 - d, i] })[side];
  for (let i = 0; i < TILE; i++) {
    const depth = 1 + (hash(i, 3, seed) > 0.45 ? 1 : 0) + (hash(i, 4, seed) > 0.85 ? 1 : 0);
    for (let d = 0; d < depth; d++) px(ctx, hash(i, d, seed + 7) < 0.15 ? GRASS.light : GRASS.base, ...at(i, d));
    px(ctx, edgeColor, ...at(i, depth));
  }
  return canvas;
}

function makeCorner(corner, edgeColor) {
  const canvas = makeCanvas(TILE, TILE);
  const ctx = canvas.getContext('2d');
  const [dx, dy] = CORNERS[corner];
  const x = dx < 0 ? 0 : TILE - 2;
  const y = dy < 0 ? 0 : TILE - 2;
  px(ctx, GRASS.base, x, y, 2, 2);
  px(ctx, edgeColor, dx < 0 ? 2 : TILE - 3, dy < 0 ? 1 : TILE - 2);
  px(ctx, edgeColor, dx < 0 ? 1 : TILE - 2, dy < 0 ? 2 : TILE - 3);
  return canvas;
}

const EDGE_COLORS = { land: 'rgba(60, 40, 15, 0.25)', water: 'rgba(225, 242, 255, 0.7)' };

// ---- Liquid animation -------------------------------------------------------------------
// Water cycles through WATER_FRAMES frames: drifting waves, blinking sparkles, a foam line under
// grassy banks that pulses, and a shimmering dotted foam line against sand, dirt and stone.
export const WATER_FRAMES = 4;
export const WATER_FRAME_MS = 250;
const FOAM_ALPHA = [0.75, 0.6, 0.45, 0.6];

// Foam where water meets sand, dirt or stone: a solid line plus a dotted second row that moves each frame.
function makeShore(side, frame) {
  const canvas = makeCanvas(TILE, TILE);
  const ctx = canvas.getContext('2d');
  const at = (i, d) => ({ n: [i, d], s: [i, TILE - 1 - d], w: [d, i], e: [TILE - 1 - d, i] })[side];
  for (let i = 0; i < TILE; i++) {
    px(ctx, `rgba(235, 247, 255, ${FOAM_ALPHA[frame]})`, ...at(i, 0));
    if ((i + frame) % 4 === 0) px(ctx, 'rgba(235, 247, 255, 0.55)', ...at(i, 1));
  }
  return canvas;
}

// Bubbles here and there across the water: one surfaces, pops with a sparkle, and a ring of ripples spreads
// out and fades (flattened, as seen from above). Each tile has its own timing and spot, worked out from its
// position and the water tick, so bubbles appear at random places rather than in step. A ripple stays inside
// its tile, so the tiles drawn next to it never cut it off.
const RIPPLE_CYCLE = 14; // water ticks between chances of a bubble on a tile (14 × 250 ms = 3.5 s)
const RIPPLE_CHANCE = 0.22;
const RIPPLE_COLORS = ['#a9d4f7', '#86bdf2', '#5d9be4']; // the ring fades as it grows

function drawRipple(ctx, x, y, tick) {
  const offset = Math.floor(hash(x, y, 70) * RIPPLE_CYCLE);
  const cycle = Math.floor((tick + offset) / RIPPLE_CYCLE);
  const t = (tick + offset) % RIPPLE_CYCLE;
  if (t > 4 || hash(x, y, 71 + cycle * 3) >= RIPPLE_CHANCE) return;
  const cx = x * TILE + 5 + Math.floor(hash(x, y, 72 + cycle * 3) * 6);
  const cy = y * TILE + 5 + Math.floor(hash(x, y, 73 + cycle * 3) * 6);
  if (t === 0) {
    // The bubble: a little round blob with a shine.
    px(ctx, '#9ccbf5', cx, cy - 1, 2, 2);
    px(ctx, '#e8f5ff', cx, cy - 1);
    return;
  }
  if (t === 1) {
    // Pop: a bright centre and a sparkle of drops.
    px(ctx, '#e8f5ff', cx, cy);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) px(ctx, '#bfe0fb', cx + dx, cy + dy);
    return;
  }
  // The ring: radius 2, 3 then 4, squashed vertically.
  const r = t;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(Math.hypot(dx, dy * 1.7) - r) < 0.55) px(ctx, RIPPLE_COLORS[t - 2], cx + dx, cy + dy);
    }
  }
}

function buildWaterFrames() {
  return Array.from({ length: WATER_FRAMES }, (_, frame) => {
    const foam = `rgba(225, 242, 255, ${FOAM_ALPHA[frame]})`;
    return {
      tiles: Array.from({ length: VARIANTS }, (_, v) => {
        const canvas = makeCanvas(TILE, TILE);
        TERRAIN_PAINTERS.w(canvas.getContext('2d'), v + 1, frame);
        return canvas;
      }),
      sides: Object.fromEntries(Object.keys(SIDES).map((side) => [side, makeFringe(side, foam)])),
      corners: Object.fromEntries(Object.keys(CORNERS).map((corner) => [corner, makeCorner(corner, foam)])),
      shore: Object.fromEntries(Object.keys(SIDES).map((side) => [side, makeShore(side, frame)])),
    };
  });
}

// Character maps for decoration sprites; each character is one pixel ('.' is transparent).
const OUTLINE = '#1f3324';
const LEAF = { o: OUTLINE, d: '#2f6b3a', g: '#3f8a45', l: '#6fb85a', t: '#7a4e2c', T: '#55341c' };
export const SPRITES = {
  T: { palette: LEAF, rows: [
    '.....oooooo.....',
    '...oollllggoo...',
    '..ollllgggggdo..',
    '.ollgllggggggdo.',
    '.olllggggggdgdo.',
    'ollggggggggggddo',
    'olgglgggggdggddo',
    'ogggggggggggdddo',
    'olggggggdgggdddo',
    'ogggggggggggdddo',
    '.ogggggggggdddo.',
    '.oddgggggdddddo.',
    '..oddddddddddo..',
    '...ooodddddooo..',
    '.....ootToo.....',
    '......otTo......',
    '......otTo......',
    '.....ottTTo.....',
  ] },
  P: { palette: LEAF, rows: [
    '.......oo.......',
    '......olgo......',
    '.....olggdo.....',
    '.....olggdo.....',
    '....olgggddo....',
    '....oogggdoo....',
    '...olggggddo....',
    '...olgggggddo...',
    '..olggggggdddo..',
    '..oooggggdddoo..',
    '..olgggggggddo..',
    '.olggggggggdddo.',
    '.olgggggggggddo.',
    'olgggggggggggddo',
    'odddggggggdddddo',
    '.ooooddddddoooo.',
    '......otTo......',
    '......otTo......',
    '.....ottTTo.....',
  ] },
  B: { palette: { ...LEAF, r: '#d8434e' }, rows: [
    '....oooo.ooo....',
    '..oollggoolgo...',
    '.olllggggglggo..',
    '.olggggrgggggdo.',
    'olggggggggrgggdo',
    'olgrgggggggggddo',
    'ogggggggggggdddo',
    '.oggggdgggggddo.',
    '.oddddddddddddo.',
    '..oooooooooooo..',
  ] },
  R: { palette: { o: '#2b2b33', k: '#5d5f6b', s: '#8a8d99', h: '#b8bcc6' }, rows: [
    '......oooo......',
    '....oohhssoo....',
    '...ohhhssssko...',
    '..ohhsssssskko..',
    '.ohsssssssskkko.',
    '.osssssssskkkko.',
    'oshssssssskkkkko',
    'ossssssskkkkkkko',
    '.okkkkkkkkkkkko.',
    '..oooooooooooo..',
  ] },
  S: { palette: { o: '#3a2412', w: '#c9a06a', r: '#a07a48', t: '#7a4e2c', T: '#55341c' }, rows: [
    '....oooooooo....',
    '...owwwwwwwwo...',
    '..owwrrrrrrwwo..',
    '..owrwwwwwwrwo..',
    '..owwrrrrrrwwo..',
    '..otwwwwwwwwTo..',
    '..otttttTTTTTo..',
    '.ootttttTTTTTTo.',
    'oootttttTTTTTToo',
    '..oooooooooooo..',
  ] },
  F: { palette: { w: '#f4f1e6', y: '#f2c14e', p: '#f08bb4', g: '#2f7a35' }, rows: [
    '................',
    '..w.........p...',
    '.wyw.......pyp..',
    '..w.........p...',
    '..g.........g...',
    '................',
    '......y.........',
    '.....ywy........',
    '......y.....w...',
    '......g....wyw..',
    '............w...',
    '..p.........g...',
    '.pyp............',
    '..p......w......',
    '..g.....wyw.....',
    '.........g......',
  ] },
};

function renderSprite({ palette, rows }) {
  const canvas = makeCanvas(rows[0].length, rows.length);
  const ctx = canvas.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((char, x) => { if (palette[char]) px(ctx, palette[char], x, y); }));
  return canvas;
}

// ---- Size variants ----------------------------------------------------------------------
// The hand-drawn sprites above are one size of each decoration. The other sizes are built from
// shapes in the same palette, with the same top-left lighting and 1px outline, so they match.

class Pixels {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.colors = new Array(width * height).fill(null);
  }

  get(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height ? this.colors[y * this.width + x] : null; }
  set(x, y, color) { if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.colors[y * this.width + x] = color; }

  // Paints every pixel where mask(x, y) is true; `color` is a colour or a function of (x, y).
  fill(mask, color) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) if (mask(x, y)) this.set(x, y, typeof color === 'function' ? color(x, y) : color);
    }
  }

  outline(color) {
    const edge = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!this.get(x, y) && (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1))) edge.push([x, y]);
      }
    }
    for (const [x, y] of edge) this.set(x, y, color);
  }

  toCanvas() {
    const canvas = makeCanvas(this.width, this.height);
    const ctx = canvas.getContext('2d');
    this.colors.forEach((color, i) => { if (color) px(ctx, color, i % this.width, Math.floor(i / this.width)); });
    return canvas;
  }
}

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

// Light from the top-left, roughened by 2px noise clusters, picks the dark, mid or light colour.
function tone(x, y, cx, cy, radius, seed, [dark, mid, light]) {
  const lit = -(((x - cx) / radius) * 0.6 + ((y - cy) / radius) * 0.8) + (hash(x >> 1, y >> 1, seed) - 0.5) * 0.6;
  return lit > 0.35 ? light : lit > -0.3 ? mid : dark;
}

const LEAF_TONES = [LEAF.d, LEAF.g, LEAF.l];
const ROCK = { o: '#2b2b33', tones: ['#5d5f6b', '#8a8d99', '#b8bcc6'] };
const STUMP = { o: '#3a2412', top: '#c9a06a', ring: '#a07a48' };

function trunk(p, cx, width, top, bottom) {
  p.fill((x, y) => y >= top && y <= bottom && Math.abs(x - cx) <= width / 2, (x) => (x < cx ? LEAF.t : LEAF.T));
}

function makeRoundTree(w, h, seed) {
  const p = new Pixels(w, h);
  const cx = w / 2 - 0.5;
  const canopyBottom = h - Math.round(h * 0.24);
  trunk(p, cx, w >= 28 ? 3 : 1, canopyBottom - 2, h - 2);
  p.fill((x, y) => y === h - 2 && Math.abs(x - cx) <= (w >= 28 ? 3.5 : 2), (x) => (x < cx ? LEAF.t : LEAF.T));
  const r = w / 2 - 1;
  const lobes = [[cx, canopyBottom * 0.58, r * 0.85], [cx - r * 0.42, canopyBottom * 0.66, r * 0.58], [cx + r * 0.42, canopyBottom * 0.66, r * 0.58],
    [cx - r * 0.3, canopyBottom * 0.32, r * 0.55], [cx + r * 0.3, canopyBottom * 0.32, r * 0.55], [cx, canopyBottom * 0.2, r * 0.5]];
  p.fill((x, y) => y >= 1 && y <= canopyBottom && lobes.some(([lx, ly, lr]) => inCircle(x, y, lx, ly, lr)),
    (x, y) => (y >= canopyBottom - 1 ? LEAF.d : tone(x, y, cx - r * 0.2, canopyBottom * 0.45, r, seed, LEAF_TONES)));
  p.outline(OUTLINE);
  return p.toCanvas();
}

function makePine(w, h, tiers, seed) {
  const p = new Pixels(w, h);
  const cx = w / 2 - 0.5;
  const canopyBottom = h - 4;
  trunk(p, cx, 1, canopyBottom - 1, h - 2);
  // Tiers overlap by only a few pixels so each one's flared bottom shows as a notch, like the hand-drawn pine.
  const overlap = 3;
  const step = (canopyBottom - 1 - overlap) / tiers;
  const bands = Array.from({ length: tiers }, (_, i) => {
    const top = 1 + Math.round(i * step);
    const bottom = i === tiers - 1 ? canopyBottom : Math.round(top + step + overlap);
    return { top, bottom, half: (w / 2 - 1) * (0.55 + 0.45 * (i / Math.max(1, tiers - 1))) };
  });
  const inBand = (x, y, b) => y >= b.top && y <= b.bottom && Math.abs(x - cx) <= 0.5 + (b.half - 0.5) * ((y - b.top) / (b.bottom - b.top));
  p.fill((x, y) => bands.some((b) => inBand(x, y, b)), (x, y) => {
    const band = bands.findLast((b) => inBand(x, y, b));
    if (y >= band.bottom) return LEAF.d;
    const lit = -(x - cx) / (w / 2) + 0.2 + (hash(x >> 1, y >> 1, seed) - 0.5) * 0.5;
    return lit > 0.45 ? LEAF.l : lit > -0.35 ? LEAF.g : LEAF.d;
  });
  p.outline(OUTLINE);
  return p.toCanvas();
}

function makeBush(w, h, seed) {
  const p = new Pixels(w, h);
  const cx = w / 2 - 0.5;
  const r = (h - 2) * 0.55;
  const lobes = [[cx - w * 0.22, h - 1 - r, r], [cx + w * 0.02, h - 1 - r * 1.25, r * 1.1], [cx + w * 0.24, h - 1 - r * 0.9, r * 0.85]];
  p.fill((x, y) => x >= 1 && x <= w - 2 && y >= 1 && y <= h - 2 && lobes.some(([lx, ly, lr]) => inCircle(x, y, lx, ly, lr)),
    (x, y) => (y === h - 2 ? LEAF.d : tone(x, y, cx, h * 0.45, w / 2, seed, LEAF_TONES)));
  const berries = Math.round(w / 6);
  for (let i = 0; i < berries; i++) {
    const x = 3 + Math.floor(hash(i, 1, seed) * (w - 6));
    const y = 3 + Math.floor(hash(i, 2, seed) * (h - 6));
    if (p.get(x, y) && p.get(x, y) !== OUTLINE) p.set(x, y, '#d8434e');
  }
  p.outline(OUTLINE);
  return p.toCanvas();
}

function makeRock(w, h, seed) {
  const p = new Pixels(w, h);
  const cx = w / 2 - 0.5;
  p.fill((x, y) => y <= h - 2 && (inEllipse(x, y, cx, h * 0.6, w / 2 - 1, h * 0.42) || inEllipse(x, y, cx - w * 0.14, h * 0.45, w * 0.3, h * 0.36)),
    (x, y) => (y === h - 2 ? ROCK.tones[0] : tone(x, y, cx - w * 0.1, h * 0.45, w / 2, seed, ROCK.tones)));
  if (w >= 20) for (const [dx, dy] of [[2, -2], [3, -1], [3, 0], [4, 1]]) p.set(Math.round(cx) + dx, Math.round(h * 0.55) + dy, ROCK.tones[0]);
  p.outline(ROCK.o);
  return p.toCanvas();
}

function makeStump(w, h) {
  const p = new Pixels(w, h);
  const cx = w / 2 - 0.5;
  const topY = Math.round(h * 0.35);
  const rx = w / 2 - 2;
  p.fill((x, y) => y >= topY && y <= h - 3 && Math.abs(x - cx) <= rx, (x) => (x < cx - rx / 2 ? LEAF.t : x > cx + rx / 2 ? LEAF.T : hash(x, 3, 9) < 0.3 ? LEAF.T : LEAF.t));
  p.fill((x, y) => y === h - 2 && Math.abs(x - cx) <= rx + 1, LEAF.T);
  p.fill((x, y) => inEllipse(x, y, cx, topY, rx, Math.max(2, topY - 1)),
    (x, y) => (Math.floor(Math.hypot((x - cx) / rx, (y - topY) / Math.max(2, topY - 1)) * 3) % 2 ? STUMP.ring : STUMP.top));
  p.outline(STUMP.o);
  return p.toCanvas();
}

const FLOWER_COLORS = ['#f4f1e6', '#f08bb4', '#f2c14e', '#8fb8f0'];

function makeFlowers(count, seed) {
  const p = new Pixels(TILE, TILE);
  for (let i = 0; i < count; i++) {
    const x = 2 + Math.floor(hash(i, 1, seed) * (TILE - 4));
    const y = 1 + Math.floor(hash(i, 2, seed) * (TILE - 5));
    const petal = FLOWER_COLORS[Math.floor(hash(i, 3, seed) * FLOWER_COLORS.length)];
    p.set(x, y + 2, '#2f7a35');
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) p.set(x + dx, y + dy, petal);
    p.set(x, y, petal === '#f2c14e' ? '#f4f1e6' : '#f2c14e');
  }
  return p.toCanvas();
}

// Every decoration in three sizes (small, medium, large); flowers get three different patches instead.
// A tabletop: a games table seen from slightly above. A thick frame of pale, weathered wood around a sunken
// well of green felt (its far and left inner walls in shadow), a deep front board, and tapered legs.
// 20 × 17 pixels, standing on its tile like the other decorations.
const GAMES_TABLE = {
  outline: '#2a2230', woodLight: '#d8c59a', woodShine: '#e8d9b2', woodMid: '#c2ab7c', woodShade: '#a38c60', woodDark: '#7d6a48',
  felt: '#1f7d5c', feltLight: '#2b9470', feltShadow: '#145a43',
};

function makeTabletop() {
  const canvas = makeCanvas(20, 17);
  const ctx = canvas.getContext('2d');
  const t = GAMES_TABLE;
  // Outline around the top and the front board.
  px(ctx, t.outline, 1, 0, 18, 1);
  px(ctx, t.outline, 0, 1, 1, 12);
  px(ctx, t.outline, 19, 1, 1, 12);
  // The frame's top surface, lit along its back edge.
  px(ctx, t.woodLight, 1, 1, 18, 10);
  px(ctx, t.woodShine, 1, 1, 18, 1);
  // The felt well: inner walls in shade (far and left), felt with a shadowed far edge, a lit front lip.
  px(ctx, t.woodShade, 3, 2, 14, 1);
  px(ctx, t.woodShade, 2, 2, 1, 7);
  px(ctx, t.woodDark, 3, 3, 14, 1);
  px(ctx, t.feltShadow, 3, 4, 14, 5);
  px(ctx, t.felt, 4, 5, 13, 4);
  px(ctx, t.feltLight, 7, 6);
  px(ctx, t.feltLight, 12, 7);
  px(ctx, t.woodShine, 3, 9, 14, 1);
  px(ctx, t.woodMid, 17, 2, 1, 7);
  // The deep front board, with a grain line.
  px(ctx, t.woodShade, 1, 11, 18, 2);
  px(ctx, t.woodMid, 1, 11, 18, 1);
  px(ctx, t.woodDark, 6, 12, 3, 1);
  px(ctx, t.outline, 1, 13, 18, 1);
  // Tapered legs.
  for (const lx of [2, 15]) {
    px(ctx, t.outline, lx - 1, 14, 5, 2);
    px(ctx, t.woodMid, lx, 14, 3, 2);
    px(ctx, t.woodLight, lx, 14, 1, 2);
    px(ctx, t.outline, lx, 16, 3, 1);
    px(ctx, t.woodShade, lx + 1, 16, 1, 1);
  }
  return canvas;
}

function buildDecorVariants() {
  const drawn = Object.fromEntries(Object.entries(SPRITES).map(([id, sprite]) => [id, renderSprite(sprite)]));
  const tabletop = makeTabletop();
  return {
    A: [tabletop, tabletop, tabletop], // one size only
    T: [makeRoundTree(24, TREE_HEIGHTS.small, 0), makeRoundTree(36, TREE_HEIGHTS.medium, 1), makeRoundTree(48, TREE_HEIGHTS.large, 2)],
    P: [makePine(20, TREE_HEIGHTS.small, 2, 2), makePine(30, TREE_HEIGHTS.medium, 3, 3), makePine(40, TREE_HEIGHTS.large, 4, 4)],
    B: Object.values(NATURE_SPRITE_SIZES.Bush).map(([w,h],index)=>makeBush(w,h,5+index)),
    R: Object.values(NATURE_SPRITE_SIZES.Rock).map(([w,h],index)=>makeRock(w,h,7+index)),
    S: [makeStump(12, 8), drawn.S, makeStump(20, 12)],
    F: [drawn.F, makeFlowers(3, 9), makeFlowers(7, 10)],
  };
}

// ---- Buildings --------------------------------------------------------------------------
// Front-facing houses. The sprite's bottom edge sits on the bottom of the footprint and the roof
// rises two tiles above it. Doors sit on the footprint column the editor cursor places them by.

const HOUSE_OUTLINE = '#2a2230';
const WOOD = { light: '#8a5a32', mid: '#6b4428', dark: '#55341c' };
const FOUNDATION = ['#7d7f8a', '#9a9ca6'];

const ROOFS = {
  slate: { ridge: '#8aa2dc', light: '#5a74b8', mid: '#465f9e', dark: '#34497c' },
  red: { ridge: '#e07a5c', light: '#c25a40', mid: '#a64a34', dark: '#7a3326' },
  teal: { ridge: '#6fb0a8', light: '#3f8a84', mid: '#336f6a', dark: '#24504c' },
};

const WALLS = {
  // Cream plaster with a dark timber frame.
  timber: (x, y, { left, right, top }) => {
    if (x <= left + 1 || x >= right - 1 || y <= top + 1) return WOOD.mid;
    return hash(x >> 1, y >> 1, 21) < 0.2 ? '#e2d3ae' : '#efe3c4';
  },
  // Stacked logs with lit tops and dark gaps.
  logs: (x, y, { top }) => {
    const row = (y - top) % 3;
    if (row === 2) return '#5e3a1e';
    if (row === 0) return '#b07a46';
    return hash(x >> 2, Math.floor((y - top) / 3), 22) < 0.5 ? '#9a6a3c' : '#8a5a32';
  },
  // Offset stone blocks with mortar lines.
  stone: (x, y, { top }) => {
    const row = Math.floor((y - top) / 4);
    const bx = (x + (row % 2) * 3) % 6;
    if ((y - top) % 4 === 3 || bx === 5) return '#6e707b';
    if ((y - top) % 4 === 0) return '#b9bcc5';
    return ['#a5a7b0', '#9a9ca6', '#8f919c'][Math.floor(hash(Math.floor((x + (row % 2) * 3) / 6), row, 23) * 3)];
  },
};

// Doors and windows are sized for the ~24x32px characters: a door is a little taller and wider than a person.
const DOOR = { width: 22, height: 36 };
const WINDOW = { width: 14, height: 14 };
const HOUSE_TILES_TALL = 6;

function makeHouse({ tilesWide, roof, walls, door, chimneyAt, windows, extras }) {
  const width = tilesWide * TILE;
  const height = HOUSE_TILES_TALL * TILE;
  const p = new Pixels(width, height);
  const roofTop = 10;
  const wall = { left: 3, right: width - 4, bottom: height - 4 };
  wall.top = wall.bottom - DOOR.height - 8; // room for a full-height door plus a lintel above it
  const eave = wall.top - 1;

  // Chimney first, so the roof covers its base.
  p.fill((x, y) => x >= chimneyAt && x <= chimneyAt + 7 && y >= 2 && y <= roofTop + 8,
    (x, y) => (y <= 3 ? '#5f616b' : x === chimneyAt ? '#b9bcc5' : (y + (x >> 1)) % 4 === 0 ? '#7d7f8a' : '#9a9ca6'));

  // Roof: a trapezoid of shingle rows, lit on the left, ridge highlighted.
  const inset = Math.round(width * 0.14);
  p.fill((x, y) => {
    if (y < roofTop || y > eave) return false;
    const t = (y - roofTop) / (eave - roofTop);
    return x >= Math.round(inset * (1 - t)) + 1 && x <= width - 2 - Math.round(inset * (1 - t));
  }, (x, y) => {
    if (y <= roofTop + 1) return roof.ridge;
    const row = Math.floor((y - roofTop) / 4);
    if ((y - roofTop) % 4 === 3 || y === eave) return roof.dark;
    if ((x + row * 3) % 6 === 0) return roof.mid;
    // Lit on the left, blending into shadow with a checkerboard dither.
    if (x < width * 0.3) return roof.light;
    if (x < width * 0.42) return (x + y) % 2 ? roof.light : roof.mid;
    return roof.mid;
  });

  // Walls with a shadow under the eave, then a stone foundation.
  p.fill((x, y) => x >= wall.left && x <= wall.right && y >= wall.top && y <= wall.bottom,
    (x, y) => (y === wall.top ? '#3b2f2a' : walls(x, y, wall)));
  p.fill((x, y) => x >= wall.left && x <= wall.right && y > wall.bottom && y <= height - 2, (x, y) => FOUNDATION[(x + y) % 3 === 0 ? 0 : 1]);

  // Door on the cursor column: frame, vertical planks, two cross braces, knob, and a step.
  const doorCenter = (Math.floor((tilesWide - 1) / 2) + 0.5) * TILE;
  const d = { left: doorCenter - DOOR.width / 2, right: doorCenter + DOOR.width / 2 - 1, bottom: height - 3 };
  d.top = d.bottom - DOOR.height + 1;
  const arch = door === 'arched';
  const archCut = (x, y, inset) => arch && y < d.top + 4 && Math.min(x - d.left, d.right - x) < (4 - (y - d.top)) + inset;
  p.fill((x, y) => x >= d.left - 1 && x <= d.right + 1 && y >= d.top - 2 && y <= d.bottom && !archCut(x, y, -2), WOOD.dark);
  p.fill((x, y) => x >= d.left && x <= d.right && y >= d.top && y <= d.bottom - 1 && !archCut(x, y, 0), (x, y) => {
    const braceY = [d.top + 8, d.bottom - 9];
    if (braceY.some((b) => y === b || y === b + 1)) return WOOD.mid;
    if ((x - d.left) % 4 === 3) return WOOD.dark;
    return x - d.left < 2 ? '#9a6a3c' : WOOD.light;
  });
  for (const [kx, ky] of [[d.right - 3, d.top + 18], [d.right - 3, d.top + 19]]) p.set(kx, ky, '#f2c14e');
  p.fill((x, y) => x >= d.left - 3 && x <= d.right + 3 && y >= height - 3 && y <= height - 2, (x, y) => (y === height - 3 ? '#b9bcc5' : '#8f919c'));

  // Glowing four-pane windows, centred on the given x positions.
  for (const cx of windows) {
    const w = { left: cx - WINDOW.width / 2, right: cx + WINDOW.width / 2 - 1, top: wall.top + 7 };
    w.bottom = w.top + WINDOW.height - 1;
    p.fill((x, y) => x >= w.left - 1 && x <= w.right + 1 && y >= w.top - 1 && y <= w.bottom + 1, WOOD.dark);
    p.fill((x, y) => x >= w.left && x <= w.right && y >= w.top && y <= w.bottom, (x, y) => {
      if (x === cx - 1 || x === cx || y === w.top + WINDOW.height / 2 - 1) return WOOD.mid;
      return x - w.left + y - w.top < 6 ? '#fbe7a6' : '#f6cf6e';
    });
    p.fill((x, y) => x >= w.left - 2 && x <= w.right + 2 && y >= w.bottom + 2 && y <= w.bottom + 3, (x, y) => (y === w.bottom + 2 ? '#c9a06a' : '#a07a48'));
    extras?.window?.(p, w);
  }
  extras?.door?.(p, d);
  extras?.walls?.(p, wall);
  p.outline(HOUSE_OUTLINE);
  return p.toCanvas();
}

const BUILDING_ART = {
  H: () => makeHouse({
    tilesWide: 5, roof: ROOFS.slate, walls: WALLS.timber, chimneyAt: 56, windows: [14, 66],
    extras: {
      // Flower boxes under the windows and a lantern beside the door.
      window: (p, w) => p.fill((x, y) => x >= w.left - 1 && x <= w.right + 1 && y >= w.bottom + 4 && y <= w.bottom + 6,
        (x, y) => (y === w.bottom + 4 && x % 3 === 0 ? (x % 2 ? '#f08bb4' : '#f4f1e6') : y === w.bottom + 6 ? WOOD.mid : '#4a9135')),
      door: (p, d) => p.fill((x, y) => x >= d.right + 3 && x <= d.right + 6 && y >= d.top + 6 && y <= d.top + 11,
        (x, y) => (y === d.top + 6 || x === d.right + 3 || x === d.right + 6 || y === d.top + 11 ? '#2a2230' : y === d.top + 7 ? '#fbe7a6' : '#f6cf6e')),
    },
  }),
  C: () => makeHouse({
    tilesWide: 5, roof: ROOFS.red, walls: WALLS.logs, chimneyAt: 14, windows: [66],
    extras: {
      // Round log ends at both corners.
      walls: (p, wall) => {
        for (let y = wall.top + 1; y <= wall.bottom; y += 3) {
          for (const x of [wall.left, wall.left + 1, wall.right - 1, wall.right]) p.set(x, y, (x === wall.left || x === wall.right) ? '#8a5a32' : '#c9a06a');
        }
      },
    },
  }),
  K: () => makeHouse({ tilesWide: 6, roof: ROOFS.teal, walls: WALLS.stone, door: 'arched', chimneyAt: 76, windows: [14, 66] }),
};

export function buildBuildingArt() {
  return Object.fromEntries(Object.entries(BUILDING_ART).map(([id, make]) => [id, make()]));
}

// ---- Build kit pieces -------------------------------------------------------------------
// Drawn into the ground layer per tile, looking at the four neighbours so walls and roofs join up:
// walls get corner posts only at their ends and a foundation only along the bottom; roofs get a
// ridge on top, an eave at the bottom and cut corners at the top ends. Patterns use world pixel
// coordinates so shingles, logs and stones continue seamlessly across tiles.

const PIECE_ROOFS = { slate: ROOFS.slate, red: ROOFS.red, teal: ROOFS.teal };
const HIP_SLOPE = 3; // a hip roof's sides step one pixel inward for every this many pixels up
const WALL_KINDS = ['wall', 'door', 'window'];
const ROOF_KINDS = ['roof', 'chimney'];

function wallColor(material, gx, gy) {
  if (material === 'L') return WALLS.logs(gx, gy, { top: 0 });
  if (material === 'N') return WALLS.stone(gx, gy, { top: 0 });
  return hash(gx >> 1, gy >> 1, 21) < 0.2 ? '#e2d3ae' : '#efe3c4';
}

function cornerColor(material, lx, gy) {
  if (material === 'L') return gy % 3 === 2 ? '#5e3a1e' : lx === 1 || lx === 14 ? '#c9a06a' : '#a07a48';
  if (material === 'N') return gy % 4 === 3 ? '#6e707b' : '#b9bcc5';
  return WOOD.mid;
}

// The nearest piece of the given kind along the row (then the column), used to give doors and
// windows their wall material and chimneys their roof colour.
function nearestMaterial(at, kind, fallback) {
  for (let d = 1; d <= 6; d++) {
    for (const [dx, dy] of [[-d, 0], [d, 0], [0, d], [0, -d]]) {
      const object = at(dx, dy);
      if (structureKind(object) === kind) return object;
    }
  }
  return fallback;
}

// ---- Fences ------------------------------------------------------------------------------
// A fence tile is a post (or wall section) plus rails toward neighbouring fence tiles: rails to the
// left/right, and the post runs on up/down into fence tiles above/below. Corners, T-junctions and
// ends come out of the same rule. Each style has 16 neighbour combinations, built once and cached.

// Low walls share one shape so they join each other: a horizontal band toward left/right neighbours,
// a column toward neighbours above/below, and a cap along every top edge. face(x, y) colours the wall body.
function lowWall(p, { n, s, w, e }, { face, cap, outline }) {
  const band = (x, y) => (w || e) && y >= 5 && y <= (s ? 15 : 14) && x >= (w ? 0 : 2) && x <= (e ? 15 : 13);
  const column = (x, y) => x >= 3 && x <= 12 && y >= (n ? 0 : 5) && y <= (s ? 15 : 14);
  const inWall = (x, y) => band(x, y) || column(x, y);
  p.fill(inWall, (x, y) => {
    if (!inWall(x, y - 1) && !(n && y === 0)) return cap[0];
    if (!inWall(x, y - 2) && !(n && y <= 1)) return cap[1];
    return face(x, y);
  });
  p.outline(outline);
}

const FENCE_STYLES = {
  // Wood: dark posts with two rails, like a farm fence.
  f: (p, { n, s, w, e }) => {
    const top = n ? 0 : 3;
    const bottom = s ? 15 : 13;
    p.fill((x, y) => x >= 6 && x <= 9 && y >= top && y <= bottom && !(y === top && !n && (x === 6 || x === 9)),
      (x, y) => (y === top && !n ? '#c08e58' : x === 6 ? '#a87a46' : x === 9 ? '#5e3a1e' : '#8a5a32'));
    // In a vertical run each tile still shows its own post: a dark seam, then the next post's lit top.
    if (n) p.fill((x, y) => x >= 6 && x <= 9 && (y === 1 || y === 2), (x, y) => (y === 1 ? '#3b2414' : x === 9 ? '#a07a48' : '#c08e58'));
    for (const [on, x0, x1] of [[w, 0, 5], [e, 10, 15]]) {
      if (!on) continue;
      p.fill((x, y) => x >= x0 && x <= x1 && (y === 5 || y === 6 || y === 10 || y === 11), (x, y) => (y === 5 || y === 10 ? '#a07a48' : '#6b4428'));
    }
    p.outline('#2a1a10');
  },
  // White picket: pointed pickets and thin rails, with an extra picket in each rail span.
  p: (p, { n, s, w, e }) => {
    const picket = (x0, x1, top, bottom, pointed) => p.fill(
      (x, y) => x >= x0 && x <= x1 && y >= top && y <= bottom && !(pointed && y === top && (x === x0 || x === x1)),
      (x) => (x === x0 ? '#f4f1e8' : x === x1 ? '#c9c3b6' : '#e6e1d6'),
    );
    for (const [on, x0, x1] of [[w, 0, 5], [e, 10, 15]]) {
      if (!on) continue;
      p.fill((x, y) => x >= x0 && x <= x1 && (y === 6 || y === 10), '#d6d0c2');
      picket(x0 === 0 ? 1 : 12, x0 === 0 ? 3 : 14, 4, 13, true);
    }
    picket(6, 9, n ? 0 : 2, s ? 15 : 13, !n);
    // In a vertical run each tile still shows its own picket: a seam, then the next picket's lit top.
    if (n) p.fill((x, y) => x >= 6 && x <= 9 && (y === 1 || y === 2), (x, y) => (y === 1 ? '#8f897e' : '#ffffff'));
    p.outline('#4a4652');
  },
  // Stone wall: a low wall of neat cut blocks with a light top cap.
  n: (p, links) => lowWall(p, links, {
    cap: ['#c9ccd4', '#b3b6bf'],
    outline: '#2b2b33',
    face: (x, y) => {
      const row = Math.floor(y / 4);
      if (y % 4 === 3 || (x + (row % 2) * 3) % 6 === 5) return '#6e707b';
      return hash(Math.floor((x + (row % 2) * 3) / 6), row, 31) < 0.5 ? '#9a9ca6' : '#8a8d99';
    },
  }),

  // Black fence: wrought iron. Posts with knobs, thin bars with spear tips between top and bottom rails.
  // No outline, as the iron is already dark; a lighter left edge picks out each bar.
  k: (p, { n, s, w, e }) => {
    const IRON = '#26262e';
    const SHINE = '#5c5c6c';
    const top = n ? 0 : 2;
    p.fill((x, y) => x >= 6 && x <= 9 && y >= top && y <= (s ? 15 : 14), (x) => (x === 6 ? SHINE : IRON));
    if (!n) p.fill((x, y) => (x === 7 || x === 8) && (y === 0 || y === 1), (x, y) => (y === 0 ? SHINE : IRON)); // knob
    if (n) p.fill((x, y) => x >= 6 && x <= 9 && y === 1, '#111116'); // seam between posts in a vertical run
    for (const [on, x0, x1, bars] of [[w, 0, 5, [1, 4]], [e, 10, 15, [11, 14]]]) {
      if (!on) continue;
      p.fill((x, y) => x >= x0 && x <= x1 && (y === 4 || y === 12), IRON);
      for (const bar of bars) {
        p.fill((x, y) => x === bar && y >= 3 && y <= 14, IRON);
        p.set(bar, 2, SHINE); // spear tip
      }
    }
  },

  // Fieldstone wall: rounded natural stones of mixed tones with mossy tufts on top. Stones are 8px wide
  // with a half-stone offset per row, so the pattern lines up across tiles.
  j: (p, links) => lowWall(p, links, {
    cap: ['#b5ad9f', '#a39a8c'],
    outline: '#3a3530',
    face: (x, y) => {
      const row = Math.floor(y / 4);
      const sx = (x + (row % 2) * 4) % 8;
      const sy = y % 4;
      const corner = (sx === 0 || sx === 7) && (sy === 0 || sy === 3);
      if (sx === 7 || sy === 3 || corner) return '#5e574f';
      const tone = ['#a39a8c', '#8e8578', '#b5ad9f', '#978d80'][Math.floor(hash(Math.floor((x + (row % 2) * 4) / 8), row, 33) * 4)];
      return sy === 0 && sx < 4 ? '#c4bcae' : tone;
    },
  }),

  // Brick wall: red bricks (8x4, offset by half a brick per row) under a grey stone cap.
  z: (p, links) => lowWall(p, links, {
    cap: ['#c9ccd4', '#9a9ca6'],
    outline: '#3a1f1a',
    face: (x, y) => {
      const row = Math.floor(y / 4);
      if (y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7) return '#cdbfa8';
      const brick = ['#a5463a', '#b8553f', '#933d33'][Math.floor(hash(Math.floor((x + (row % 2) * 4) / 8), row, 34) * 3)];
      return y % 4 === 0 ? '#c46a52' : brick;
    },
  }),
};

const fenceCache = new Map();

function fenceTile(id, links) {
  const key = `${id}:${links.n ? 1 : 0}${links.s ? 1 : 0}${links.w ? 1 : 0}${links.e ? 1 : 0}`;
  if (!fenceCache.has(key)) {
    const p = new Pixels(TILE, TILE);
    FENCE_STYLES[id](p, links);
    if (id === 'j') {
      // A few moss tufts along the cap.
      for (let x = 0; x < TILE; x++) {
        for (let y = 0; y < TILE; y++) {
          if (p.get(x, y) === '#b5ad9f' && hash(x, y, 35) < 0.18) p.set(x, y, '#6f9e4a');
        }
      }
    }
    const canvas = p.toCanvas();
    // A soft shadow at the foot of a free-standing post or wall end.
    if (!links.s) {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(30, 20, 10, 0.25)';
      ctx.fillRect(5, 15, 6, 1);
    }
    fenceCache.set(key, canvas);
  }
  return fenceCache.get(key);
}

function drawStructureTile(ctx, world, x, y) {
  const at = (dx, dy) => {
    const nx = x + dx;
    const ny = y + dy;
    return nx < 0 || ny < 0 || nx >= world.width || ny >= world.height ? '.' : world.objects[ny * world.width + nx];
  };
  const id = at(0, 0);
  const kind = structureKind(id);
  if (!kind) return;
  const isWall = (object) => WALL_KINDS.includes(structureKind(object));
  const isRoof = (object) => ROOF_KINDS.includes(structureKind(object));
  const ox = x * TILE;
  const oy = y * TILE;
  const paint = (color) => {
    for (let ly = 0; ly < TILE; ly++) {
      for (let lx = 0; lx < TILE; lx++) {
        const c = color(lx, ly, ox + lx, oy + ly);
        if (c) px(ctx, c, ox + lx, oy + ly);
      }
    }
  };

  // Interior room edge: dark, with a lighter rim on the sides that face the room.
  if (kind === 'boundary') {
    const open = (dx, dy) => !['boundary', 'exit'].includes(structureKind(at(dx, dy))) && !WALL_KINDS.includes(structureKind(at(dx, dy)));
    const rim = { n: open(0, -1), s: open(0, 1), w: open(-1, 0), e: open(1, 0) };
    paint((lx, ly) => ((rim.n && ly <= 1) || (rim.s && ly >= TILE - 2) || (rim.w && lx <= 1) || (rim.e && lx >= TILE - 2) ? '#4a3f4f' : '#2a2230'));
    return;
  }

  // Travel area: invisible, so players discover it by walking there (the editor shows an overlay).
  if (kind === 'travel') return;

  // Interior exit: a doormat in the gap of the room's edge.
  if (kind === 'exit') {
    paint((lx, ly) => {
      if (lx < 2 || lx > 13 || ly < 3) return null;
      if (lx === 2 || lx === 13 || ly === 3 || ly === 15) return '#5e2626';
      return ly % 3 === 0 ? '#a34a4a' : '#8a3b3b';
    });
    return;
  }

  if (kind === 'fence') {
    const isFence = (object) => structureKind(object) === 'fence';
    ctx.drawImage(fenceTile(id, { n: isFence(at(0, -1)), s: isFence(at(0, 1)), w: isFence(at(-1, 0)), e: isFence(at(1, 0)) }), ox, oy);
    return;
  }

  if (WALL_KINDS.includes(kind)) {
    const material = kind === 'wall' ? id : nearestMaterial(at, 'wall', 'M');
    const left = !isWall(at(-1, 0));
    const right = !isWall(at(1, 0));
    const bottom = !isWall(at(0, 1));
    const underRoof = isRoof(at(0, -1));
    const topOpen = !isWall(at(0, -1)) && !underRoof;
    const doorTop = kind === 'door' && at(0, -1) !== 'D';
    const doorBottom = kind === 'door' && at(0, 1) !== 'D';
    paint((lx, ly, gx, gy) => {
      if ((left && lx === 0) || (right && lx === TILE - 1) || (bottom && ly === TILE - 1) || (topOpen && ly === 0)) return HOUSE_OUTLINE;
      if (kind === 'door' && lx >= 1 && lx <= 14) {
        if (doorBottom && ly === 14) return lx === 1 || lx === 14 ? '#8f919c' : '#b9bcc5'; // step
        if (doorTop && ly === 0) return WOOD.mid; // lintel
        if (lx === 1 || lx === 14 || (doorTop && ly === 1)) return WOOD.dark; // frame
        if ((doorTop && ly === 7) || (doorBottom && ly === 6)) return WOOD.mid; // cross braces
        if (doorBottom && lx === 12 && ly === (doorTop ? 8 : 1)) return '#f2c14e'; // knob, at mid-height of the door
        return (lx - 2) % 3 === 2 ? WOOD.dark : lx === 2 ? '#9a6a3c' : WOOD.light;
      }
      if (kind === 'window' && lx >= 2 && lx <= 13 && ly >= 3 && ly <= 12) {
        if (ly === 12) return '#c9a06a'; // sill
        if (lx === 2 || lx === 13) return wallColor(material, gx, gy); // sill overhang only
        if (lx === 3 || lx === 12 || ly === 3 || ly === 11) return WOOD.dark;
        if (lx === 7 || lx === 8 || ly === 7) return WOOD.mid;
        return lx - 4 + ly - 4 < 4 ? '#fbe7a6' : '#f6cf6e';
      }
      if (bottom && ly >= 13) return ly === 13 ? '#b9bcc5' : FOUNDATION[(gx + gy) % 3 === 0 ? 0 : 1];
      if (underRoof && ly === 0) return '#3b2f2a';
      if (topOpen && ly === 1) return WOOD.mid;
      if ((left && lx <= 2) || (right && lx >= TILE - 3)) return cornerColor(material, lx, gy);
      return wallColor(material, gx, gy);
    });
    return;
  }

  // Roofs are shaped as a whole: this tile's connected roof is measured, and each pixel is tested
  // against the roof's overall shape, so slopes run diagonally across many tiles.
  const roof = PIECE_ROOFS[structureTool(kind === 'roof' ? id : nearestMaterial(at, 'roof', 'r')).color];
  const region = roofRegion(world, x, y);
  const left = region.box.left * TILE;
  const right = (region.box.right + 1) * TILE - 1;
  const top = region.box.top * TILE;
  const bottom = (region.box.bottom + 1) * TILE - 1;
  const width = right - left + 1;
  const height = bottom - top + 1;
  const mid = (left + right) / 2;
  const inShape = (gx, gy) => {
    if (gx < left || gx > right || gy < top || gy > bottom) return false;
    if (!region.tiles.has(Math.floor(gy / TILE) * world.width + Math.floor(gx / TILE))) return false;
    if (region.style === 'gable') return Math.abs(gx - mid) <= (width / 2) * ((gy - top + 1) / height);
    const inset = Math.min(Math.floor((bottom - gy) / HIP_SLOPE), Math.floor(width / 2) - 2);
    return gx >= left + inset && gx <= right - inset;
  };
  const overWall = (gx) => isWall(world.objects[(Math.floor(bottom / TILE) + 1) * world.width + Math.floor(gx / TILE)]);
  paint((lx, ly, gx, gy) => {
    if (kind === 'chimney' && lx >= 4 && lx <= 11 && ly <= 12) {
      if (lx === 4 || lx === 11 || ly === 0) return HOUSE_OUTLINE;
      if (ly <= 2) return '#5f616b';
      if (lx === 5) return '#b9bcc5';
      return ly % 3 === 0 ? '#7d7f8a' : '#9a9ca6';
    }
    if (!inShape(gx, gy)) return null;
    // Edges: outline on the sides and top of the shape; along the bottom, a dark eave over walls.
    if (!inShape(gx - 1, gy) || !inShape(gx + 1, gy) || !inShape(gx, gy - 1)) return HOUSE_OUTLINE;
    if (!inShape(gx, gy + 1)) return gy === bottom && overWall(gx) ? roof.dark : HOUSE_OUTLINE;
    if (!inShape(gx, gy + 2)) return roof.dark;
    if (!inShape(gx, gy - 2) || !inShape(gx, gy - 3)) return roof.ridge; // highlight along the ridge and slopes
    if ((gy - top) % 4 === 3) return roof.dark;
    const row = Math.floor((gy - top) / 4);
    if ((gx + row * 3) % 6 === 0) return roof.mid;
    // Lighting across the whole roof: hip lit on the left, gable lit on its left slope; dithered into shadow.
    const lit = region.style === 'gable' ? (mid - gx) / (width / 2) : 1 - ((gx - left) / width) * 2.4;
    if (lit > 0.3) return roof.light;
    if (lit > -0.05) return (gx + gy) % 2 ? roof.light : roof.mid;
    return roof.mid;
  });
}

const VARIANT_WEIGHTS = [0.4, 0.35, 0.25]; // small, medium, large

// Which size a decoration on tile (x, y) uses: fixed per tile, so the editor and play always agree.
export function decorVariant(x, y) {
  const r = hash(x, y, 77);
  return r < VARIANT_WEIGHTS[0] ? 0 : r < VARIANT_WEIGHTS[0] + VARIANT_WEIGHTS[1] ? 1 : 2;
}

// ---- Click marker -----------------------------------------------------------------------
// Shown where the player clicks to walk: four arrows close in on the spot, then a ring ripples out
// and fades. Flattened into an oval so it lies on the ground in the top-down view.
export const CLICK_MARKER = { width: 19, height: 13, frames: 4, frameMs: 90 };
const MARKER_COLORS = {
  move: { fill: '#5dff7a', light: '#c8ffd2', outline: '#0d3b18' },
  blocked: { fill: '#ff5a5a', light: '#ffc8c8', outline: '#4a1010' },
};

function makeMarkerFrame(frame, { fill, light, outline }) {
  const { width, height } = CLICK_MARKER;
  const p = new Pixels(width, height);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const squash = 0.6; // ground perspective: vertical distances shrink
  // Arrows close in over the first two frames, then a ring ripples outward over the last two.
  const reach = [8, 5, null, null][frame];
  if (reach !== null) {
    const dy = Math.round(reach * squash);
    const arrows = [
      [[cx - reach, cy], [cx - reach - 1, cy - 1], [cx - reach - 1, cy + 1]], // left, pointing right
      [[cx + reach, cy], [cx + reach + 1, cy - 1], [cx + reach + 1, cy + 1]], // right, pointing left
      [[cx, cy - dy], [cx - 1, cy - dy - 1], [cx + 1, cy - dy - 1]], // top, pointing down
      [[cx, cy + dy], [cx - 1, cy + dy + 1], [cx + 1, cy + dy + 1]], // bottom, pointing up
    ];
    for (const arrow of arrows) arrow.forEach(([x, y], i) => p.set(x, y, i === 0 ? light : fill));
  }
  const radius = [null, null, 4, 8][frame];
  if (radius !== null) {
    const rx = radius;
    const ry = Math.max(1.5, radius * squash);
    p.fill((x, y) => Math.abs(Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) < 0.75 / radius, frame === 3 ? light : fill);
  }
  p.outline(outline);
  return p.toCanvas();
}

export function buildClickMarker() {
  return Object.fromEntries(Object.entries(MARKER_COLORS).map(([kind, colors]) => [kind,
    Array.from({ length: CLICK_MARKER.frames }, (_, frame) => makeMarkerFrame(frame, colors))]));
}

export function buildArt() {
  const terrain = Object.fromEntries(Object.entries(TERRAIN_PAINTERS).map(([id, paint]) => [id,
    Array.from({ length: VARIANTS }, (_, v) => {
      const canvas = makeCanvas(TILE, TILE);
      paint(canvas.getContext('2d'), v + 1);
      return canvas;
    })]));
  const edges = Object.fromEntries(Object.entries(EDGE_COLORS).map(([kind, color]) => [kind, {
    sides: Object.fromEntries(Object.keys(SIDES).map((side) => [side, makeFringe(side, color)])),
    corners: Object.fromEntries(Object.keys(CORNERS).map((corner) => [corner, makeCorner(corner, color)])),
  }]));
  return { terrain, edges, water: buildWaterFrames(), decor: buildDecorVariants(), buildings: buildBuildingArt() };
}

function drawTerrainTile(ctx, art, world, x, y, frame) {
  const type = world.terrain[y * world.width + x];
  const at = (dx, dy) => {
    const nx = x + dx;
    const ny = y + dy;
    return nx < 0 || ny < 0 || nx >= world.width || ny >= world.height ? type : world.terrain[ny * world.width + nx];
  };
  const water = type === 'w' ? art.water[frame % WATER_FRAMES] : null;
  const variant = Math.floor(hash(x, y, 1) * VARIANTS);
  ctx.drawImage(water ? water.tiles[variant] : art.terrain[type][variant], x * TILE, y * TILE);
  if (water) drawRipple(ctx, x, y, frame);
  if (type === 'g') return;
  const edges = water ?? art.edges.land;
  for (const [side, [dx, dy]] of Object.entries(SIDES)) {
    const neighbour = at(dx, dy);
    if (neighbour === 'g') ctx.drawImage(edges.sides[side], x * TILE, y * TILE);
    else if (water && neighbour !== 'w') ctx.drawImage(water.shore[side], x * TILE, y * TILE);
  }
  for (const [corner, [dx, dy]] of Object.entries(CORNERS)) {
    if (at(dx, dy) === 'g' && at(dx, 0) !== 'g' && at(0, dy) !== 'g') ctx.drawImage(edges.corners[corner], x * TILE, y * TILE);
  }
}

// frame: the water tick, counting up every WATER_FRAME_MS (the waves loop every WATER_FRAMES ticks; bubbles
// use the whole count). Only water tiles change with it.
export function drawGroundTile(ctx, art, world, x, y, frame = 0) {
  drawTerrainTile(ctx, art, world, x, y, frame);
  drawStructureTile(ctx, world, x, y);
}

// Small images for the toolbar buttons.
export function toolPreview(art, kind, id) {
  if (kind === 'terrain') return art.terrain[id][0].toDataURL();
  if (kind === 'building') return art.buildings[id].toDataURL();
  if (kind === 'structure') {
    // A door is shown two tiles tall, like it is placed.
    const tall = structureKind(id) === 'door';
    const world = { width: 1, height: tall ? 2 : 1, terrain: tall ? ['g', 'g'] : ['g'], objects: tall ? [id, id] : [id] };
    const canvas = makeCanvas(TILE, world.height * TILE);
    const ctx = canvas.getContext('2d');
    for (let y = 0; y < world.height; y++) drawGroundTile(ctx, art, world, 0, y);
    return canvas.toDataURL();
  }
  const sprite = art.decor[id][0];
  const canvas = makeCanvas(Math.max(TILE, sprite.width), Math.max(TILE, sprite.height));
  const ctx = canvas.getContext('2d');
  for (let x = 0; x < canvas.width; x += TILE) ctx.drawImage(art.terrain.g[0], x, canvas.height - TILE);
  ctx.drawImage(sprite, 0, canvas.height - sprite.height);
  return canvas.toDataURL();
}
