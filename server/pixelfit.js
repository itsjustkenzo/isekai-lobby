import { PNG } from 'pngjs';

const OUTLINE_COLOR = [42, 34, 48, 255];
const BLOCK_INSET = 0.2; // ignore block edges, where neighbouring art pixels bleed in

// Most common colour among the opaque pixels in a rectangle, or null if it is mostly transparent.
function dominantColor({ width, data }, x0, y0, x1, y1) {
  let opaque = 0;
  let clear = 0;
  const buckets = new Map();
  for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) { clear++; continue; }
      opaque++;
      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bucket.n++; bucket.r += data[i]; bucket.g += data[i + 1]; bucket.b += data[i + 2];
      buckets.set(key, bucket);
    }
  }
  if (opaque <= clear) return null;
  let best = null;
  for (const bucket of buckets.values()) if (!best || bucket.n > best.n) best = bucket;
  return [best.r / best.n, best.g / best.n, best.b / best.n].map(Math.round);
}

// Images without transparency (e.g. a JPEG upload) get the colour of their corners treated as background.
function knockOutFlatBackground(image) {
  const { width, height, data } = image;
  const hasAlpha = data.some((v, i) => i % 4 === 3 && v < 250);
  if (hasAlpha) return;
  const corner = [0, (width - 1) * 4, (height - 1) * width * 4, (height * width - 1) * 4];
  const bg = [0, 1, 2].map((k) => Math.round(corner.reduce((sum, i) => sum + data[i + k], 0) / 4));
  const near = (i) => Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) < 40;
  // Flood fill from the borders so only background connected to the edge becomes transparent.
  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || !near(p * 4)) continue;
    seen[p] = 1;
    data[p * 4 + 3] = 0;
    const x = p % width;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (p >= width) stack.push(p - width);
    if (p < (height - 1) * width) stack.push(p + width);
  }
}

// Converts an image into an exact-size game sprite (one image pixel = one world pixel): crop to the
// subject, fit it inside the sprite keeping its shape and sitting on the bottom edge, take the most
// common colour per block (no blur), then add a 1px outline.
// ---- AI pixel-block size --------------------------------------------------------------------
// The AI draws pixel art as chunky blocks (often ~15 image pixels per art pixel). Finding that block
// size lets two drawings be converted at the same art scale, e.g. an asset and its vertical version.
const MIN_BLOCK = 6;
const MAX_BLOCK = 48;
const STRONG_EDGE = 0.15; // an edge counts if its strength is at least this share of the strongest

// Centres of the strong edges along one axis (a soft edge spanning 2-3 pixels counts once).
function edgeCentres(edges) {
  const max = Math.max(...edges);
  const centres = [];
  let run = [];
  for (let i = 0; i <= edges.length; i++) {
    if (i < edges.length && edges[i] >= max * STRONG_EDGE) { run.push(i); continue; }
    if (run.length) centres.push(run.reduce((a, b) => a + b, 0) / run.length);
    run = [];
  }
  return centres;
}

// Image pixels per art pixel, or null if no clear block grid is found. In chunky pixel art most
// neighbouring edges are exactly one block apart, so the most common gap between edges (merging gaps
// within a pixel of each other) is the block size. Scoring whole grids instead tends to pick a multiple.
export function detectBlockSize(pngBuffer) {
  const { width, height, data } = PNG.sync.read(pngBuffer);
  const diff = (a, b) => Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]) + Math.abs(data[a + 3] - data[b + 3]);
  const cols = new Float64Array(width);
  const rows = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (x > 0) cols[x] += diff(i, i - 4);
      if (y > 0) rows[y] += diff(i, i - width * 4);
    }
  }
  const gaps = [];
  for (const edges of [cols, rows]) {
    const centres = edgeCentres(edges);
    for (let i = 1; i < centres.length; i++) {
      const gap = centres[i] - centres[i - 1];
      if (gap >= MIN_BLOCK && gap <= MAX_BLOCK) gaps.push(gap);
    }
  }
  if (!gaps.length) return null;
  let best = null;
  for (let g = MIN_BLOCK; g <= MAX_BLOCK; g++) {
    const near = gaps.filter((gap) => Math.abs(gap - g) <= 1);
    if (!best || near.length > best.length) best = near; // ties keep the smaller gap
  }
  return best.reduce((a, b) => a + b, 0) / best.length;
}

// Image pixels per game pixel that fitSprite would use to fit this image into a width x height sprite.
export function fitScale(pngBuffer, width, height) {
  const image = PNG.sync.read(pngBuffer);
  knockOutFlatBackground(image);
  const box = contentBox(image);
  return Math.max(box.w / (width - 2), box.h / (height - 2));
}

function contentBox(image) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] >= 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
  }
  if (x1 < 0) throw new Error('Image has no visible pixels');
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// options.scale: convert at this many image pixels per game pixel (to match another sprite's art
// scale) instead of filling the sprite. If the result would not fit, it is shrunk just enough to fit.
export function fitSprite(pngBuffer, width, height, options = {}) {
  const image = PNG.sync.read(pngBuffer);
  knockOutFlatBackground(image);
  const { x0, y0, x1, y1 } = contentBox(image);

  const inner = { width: width - 2, height: height - 2 };
  const fillScale = Math.max((x1 - x0 + 1) / inner.width, (y1 - y0 + 1) / inner.height);
  const scale = options.scale ? Math.max(options.scale, fillScale) : fillScale;
  const w = Math.max(1, Math.min(inner.width, Math.round((x1 - x0 + 1) / scale)));
  const h = Math.max(1, Math.min(inner.height, Math.round((y1 - y0 + 1) / scale)));
  const offsetX = 1 + Math.floor((inner.width - w) / 2);
  const offsetY = 1 + inner.height - h;

  const out = new PNG({ width, height });
  out.data.fill(0);
  const inset = scale > 1 ? scale * BLOCK_INSET : 0;
  for (let oy = 0; oy < h; oy++) {
    for (let ox = 0; ox < w; ox++) {
      const sx = x0 + ox * scale;
      const sy = y0 + oy * scale;
      // When enlarging a small image, sample at least one source pixel per output pixel.
      const color = dominantColor(image, sx + inset, sy + inset, Math.max(sx + inset + 1, sx + scale - inset), Math.max(sy + inset + 1, sy + scale - inset));
      if (color) out.data.set([...color, 255], ((oy + offsetY) * width + ox + offsetX) * 4);
    }
  }

  const solid = (x, y) => x >= 0 && y >= 0 && x < width && y < height && out.data[(y * width + x) * 4 + 3] === 255;
  const edge = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push((y * width + x) * 4);
    }
  }
  for (const i of edge) out.data.set(OUTLINE_COLOR, i);
  return PNG.sync.write(out);
}
