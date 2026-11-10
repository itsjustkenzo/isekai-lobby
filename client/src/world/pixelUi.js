// Pixel-art building blocks for the in-game interface (the clock panel, the pause menu and its buttons):
// one palette, a tiny pixel font, and wooden boards and parchment plates drawn square by square. Everything
// is drawn in art pixels; pixelCanvas() scales them to the same size as the world's pixels.

export const ART_SCALE = 3; // screen pixels per art pixel, the same as the play camera
const SMALL_SCREEN_SCALE = 2;

export const C = {
  outline: '#2a2230', wood: '#a0663a', woodLight: '#c98b50', woodDark: '#6e4426', grain: '#8a5530',
  plate: '#f3e2bd', plateLight: '#fff6dc', plateDark: '#d2b382', ink: '#3b2a33',
  gold: '#f2c14e', goldDark: '#b8862a', goldLight: '#ffe7a1',
  grass: '#5aa845', grassLight: '#7cc25a', grassDark: '#3a7430',
  star: '#ffffff', cloud: '#c9d3df', cloudDark: '#8796aa', rain: '#9fc4ec', mist: '#e8eef2',
  muted: '#d8cfc2', mutedDark: '#b9ad9c', mutedInk: '#8f8478',
};

// A 3×5 pixel font (M and W are 5 wide, N is 4); '#' is ink. Letters are drawn in capitals.
const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'], ':': ['.', '#', '.', '#', '.'], '.': ['.', '.', '.', '.', '#'],
  ',': ['.', '.', '.', '#', '#'], "'": ['#', '#', '.', '.', '.'], '!': ['#', '#', '#', '.', '#'], '?': ['##.', '..#', '.#.', '...', '.#.'],
  '-': ['...', '...', '###', '...', '...'], '&': ['.#.', '#.#', '.#.', '#.#', '.##'], '/': ['..#', '..#', '.#.', '#..', '#..'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  '(': ['.#', '#.', '#.', '#.', '.#'], ')': ['#.', '.#', '.#', '.#', '#.'], ' ': ['..', '..', '..', '..', '..'],
};
const glyph = (ch) => FONT[ch.toUpperCase()] ?? FONT[' '];

export function fill(ctx, color, x, y, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export const textWidth = (text) => [...text].reduce((w, ch) => w + glyph(ch)[0].length + 1, -1);

// Shortens text with ".." until it fits in `width` art pixels.
export function fitText(text, width) {
  if (textWidth(text) <= width) return text;
  let cut = text;
  while (cut.length && textWidth(`${cut.trimEnd()}..`) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}..`;
}

export function drawText(ctx, text, x, y, color = C.ink) {
  let cx = x;
  for (const ch of text) {
    const g = glyph(ch);
    g.forEach((row, gy) => [...row].forEach((p, gx) => { if (p === '#') fill(ctx, color, cx + gx, y + gy); }));
    cx += g[0].length + 1;
  }
}

export function drawTextCentred(ctx, text, left, width, y, color) {
  drawText(ctx, text, left + Math.floor((width - textWidth(text)) / 2), y, color);
}

// A plate with a dark outline, a bevel and cut corners (parchment unless other colours are given).
export function drawPlate(ctx, x, y, w, h, face = C.plate, light = C.plateLight, dark = C.plateDark) {
  fill(ctx, C.outline, x + 1, y, w - 2, 1);
  fill(ctx, C.outline, x + 1, y + h - 1, w - 2, 1);
  fill(ctx, C.outline, x, y + 1, 1, h - 2);
  fill(ctx, C.outline, x + w - 1, y + 1, 1, h - 2);
  fill(ctx, face, x + 1, y + 1, w - 2, h - 2);
  fill(ctx, light, x + 1, y + 1, w - 3, 1);
  fill(ctx, light, x + 1, y + 1, 1, h - 3);
  fill(ctx, dark, x + 2, y + h - 2, w - 3, 1);
  fill(ctx, dark, x + w - 2, y + 2, 1, h - 3);
}

// A wooden board: outline, cut corners, a bevel, some grain and gold pins in two corners.
export function drawBoard(ctx, W, H, grain = []) {
  fill(ctx, C.outline, 2, 0, W - 4, 1);
  fill(ctx, C.outline, 2, H - 1, W - 4, 1);
  fill(ctx, C.outline, 0, 2, 1, H - 4);
  fill(ctx, C.outline, W - 1, 2, 1, H - 4);
  for (const [x, y] of [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]]) fill(ctx, C.outline, x, y);
  fill(ctx, C.wood, 2, 1, W - 4, H - 2);
  fill(ctx, C.wood, 1, 2, W - 2, H - 4);
  fill(ctx, C.woodLight, 2, 1, W - 4, 1);
  fill(ctx, C.woodLight, 1, 2, 1, H - 4);
  fill(ctx, C.woodDark, 2, H - 2, W - 4, 1);
  fill(ctx, C.woodDark, W - 2, 2, 1, H - 4);
  for (const [x, y, w] of grain) fill(ctx, C.grain, x, y, w, 1);
  for (const [x, y] of [[3, 2], [W - 4, H - 3]]) { fill(ctx, C.gold, x, y); fill(ctx, C.goldDark, x + 1, y); }
}

// A menu button, w × h art pixels including a 1-pixel ledge under it. state: 'idle', 'hot' (hovered or
// focused: gold, with a pointer arrow), 'down' (pressed onto its ledge) or 'disabled' (greyed out).
// tag: a small gold label on the right, e.g. "SOON". pointer: false for small icon buttons.
export function drawButton(ctx, w, h, label, state = 'idle', tag = null, pointer = true) {
  const down = state === 'down';
  const top = down ? 1 : 0;
  // The ledge it sits on.
  fill(ctx, C.outline, 1, h - 1, w - 2, 1);
  fill(ctx, C.woodDark, 2, h - 2, w - 4, 1);
  const faces = {
    idle: [C.plate, C.plateLight, C.plateDark, C.ink],
    hot: ['#ffe08a', C.goldLight, C.goldDark, C.ink],
    down: ['#f6cf6a', C.gold, C.goldDark, C.ink],
    disabled: [C.muted, '#e8e1d6', C.mutedDark, C.mutedInk],
  };
  const [face, light, dark, ink] = faces[state] ?? faces.idle;
  drawPlate(ctx, 0, top, w, h - 1, face, light, dark);
  const textY = top + Math.floor((h - 1 - 5) / 2);
  const tagWidth = tag ? textWidth(tag) + 4 : 0;
  drawTextCentred(ctx, label, 0, w - tagWidth, textY, ink);
  if (tag) {
    drawPlate(ctx, w - tagWidth - 3, textY - 2, tagWidth, 9, C.gold, C.goldLight, C.goldDark);
    drawText(ctx, tag, w - tagWidth - 1, textY, C.ink);
  }
  // A little pointer arrow on the hovered or focused button, like an RPG menu cursor.
  if (pointer && (state === 'hot' || down)) {
    const ay = textY;
    for (let i = 0; i < 3; i++) fill(ctx, C.ink, 4 + i, ay + i, 1, 5 - i * 2);
  }
}

// Shrinks pixel art by a whole factor, keeping each block's most common colour (instead of blending), so
// the result stays crisp. image: { width, height, data } like ImageData. Returns the same shape.
export function shrinkPixelArt(image, factor) {
  const width = Math.floor(image.width / factor);
  const height = Math.floor(image.height / factor);
  const data = new Uint8ClampedArray(width * height * 4);
  const counts = new Map();
  for (let by = 0; by < height; by++) {
    for (let bx = 0; bx < width; bx++) {
      counts.clear();
      let best = -1;
      let bestCount = 0;
      for (let y = by * factor; y < (by + 1) * factor; y++) {
        for (let x = bx * factor; x < (bx + 1) * factor; x++) {
          const i = (y * image.width + x) * 4;
          if (image.data[i + 3] < 128) continue; // see-through
          const key = (image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2];
          const count = (counts.get(key) ?? 0) + 1;
          counts.set(key, count);
          if (count > bestCount) { bestCount = count; best = key; }
        }
      }
      if (best < 0) continue;
      data.set([(best >> 16) & 255, (best >> 8) & 255, best & 255, 255], (by * width + bx) * 4);
    }
  }
  return { width, height, data };
}

// Screen pixels per art pixel right now (smaller on phone-sized screens).
export function artScale() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches ? SMALL_SCREEN_SCALE : ART_SCALE;
}

// CSS pixels per art pixel: the canvas is sized in screen pixels and shown at 1/devicePixelRatio, like the
// game canvas, so the pixels stay sharp.
export const cssPixel = () => artScale() / (window.devicePixelRatio || 1);

// Draws into a canvas element: `draw(ctx)` paints a w × h art-pixel picture, at `scale` screen pixels per
// art pixel (the usual interface size unless a bigger one is given).
export function paintPixelCanvas(canvas, w, h, draw, scale = artScale()) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * scale;
  canvas.height = h * scale;
  canvas.style.width = `${(w * scale) / dpr}px`;
  canvas.style.height = `${(h * scale) / dpr}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, w, h);
  draw(ctx);
}
