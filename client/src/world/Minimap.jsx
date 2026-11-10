import React, { useEffect, useMemo, useRef, useState } from 'react';
import { C, drawBoard, drawPlate, drawTextCentred, fill, fitText, paintPixelCanvas } from './pixelUi.js';
import { assetById } from './world.js';

// The mini map in play mode's bottom-left corner: the current map (or room) as a small pixel-art picture
// in a wooden frame like the clock panel, with a blinking marker for the player. The picture is the game's
// own art shrunk down (see WorldBaseScene.overview); until the game has drawn the map, a simpler drawing
// stands in (each tile a 3×3 sketch: trees, water with shorelines, roofs, fences, floors...). Either is
// made once per map; the window then shows the part around the player.

export const MINIMAP_WIDTH = 92;
export const MINIMAP_HEIGHT = 77;
const VIEW = { x: 4, y: 4, w: 84, h: 60 }; // the map window, in art pixels
export const TILE_PX = 3; // art pixels per tile on the mini map
const UPDATE_MS = 100;
const BLINK_MS = 500;

const hash = (x, y) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;

const GROUND = {
  g: ['#5aa845', '#7cc25a', '#4a9a3a'], d: ['#c79a5e', '#b38650', '#d6ac70'], a: ['#e8d18f', '#d8bd76', '#f2dfa6'],
  s: ['#9aa0a8', '#868c94', '#adb3ba'], w: ['#3f8fd6', '#7fbff0', '#a9daf7'], o: ['#b07a45', '#9a6838', '#c08a52'],
  c: ['#a8456a', '#c0607f', '#8f3a5a'],
};
const ROOF = { red: ['#b5523b', '#d0694f', '#8f3d2c'], blue: ['#4f78b8', '#6f97d0', '#3a5c94'], teal: ['#3f9a94', '#5cb7ae', '#2d7570'] };
const ROOF_OF = { b: 'blue', u: 'blue', r: 'red', q: 'red', e: 'teal', v: 'teal' };
const WALLS = { M: ['#e2d6bd', '#c4b597'], L: ['#9a6638', '#7a4e2a'], N: ['#9196a0', '#767b85'] };
const FENCES = { f: '#7a4e2a', p: '#f0e9da', n: '#8b8f96', k: '#2f2a36', j: '#9a958a', z: '#a8513e' };
// Small sprites over the ground: rows of 3 pixels, '.' shows the ground.
const SPRITES = {
  T: { rows: ['GLG', 'GDG', 'DtD'], colors: { L: '#6db552', G: '#4f9a3e', D: '#2f6b2a', t: '#6e4426' } },
  P: { rows: ['.L.', 'LDL', 'DtD'], colors: { L: '#3a7430', D: '#25562a', t: '#6e4426' } },
  B: { rows: ['...', '.b.', 'BbB'], colors: { B: '#3f8a35', b: '#5aa845' } },
  R: { rows: ['...', '.r.', 'rRR'], colors: { r: '#b3b6bd', R: '#7d7f86' } },
  F: { rows: ['p..', '..y', '.p.'], colors: { p: '#f08fb8', y: '#ffd23f' } },
  S: { rows: ['...', '.s.', 'sSs'], colors: { s: '#9a6a3c', S: '#6e4426' } },
  D: { rows: ['ddd', 'dkd', 'ddd'], colors: { d: '#7a4e2a', k: '#4a2e18' } },
  E: { rows: ['mmm', 'MmM', 'mmm'], colors: { m: '#a34a4a', M: '#7d3434' } },
  A: { rows: ['www', 'wgw', 'l.l'], colors: { w: '#d8c59a', g: '#1f7d5c', l: '#a38c60' } },
};

const isBuilding = (o) => o === '#' || o === 'H' || o === 'C' || o === 'K' || /[0-9]/.test(o);
const isFenceOrWall = (o) => Boolean(FENCES[o] || WALLS[o]);

// Paints the whole map at TILE_PX art pixels per tile onto ctx (from 0, 0).
export function paintMapTiles(ctx, world) {
  const { width, height, terrain, objects } = world;
  const T = TILE_PX;
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? null : y * width + x);
  const obj = (x, y) => { const i = at(x, y); return i === null ? null : objects[i]; };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const ox = x * T;
      const oy = y * T;
      const px = (color, dx, dy, w = 1, h = 1) => fill(ctx, color, ox + dx, oy + dy, w, h);
      const h = hash(x, y);
      const object = objects[i];

      // Ground, with a little variation.
      const ground = terrain[i];
      const [base, light, dark] = GROUND[ground] ?? GROUND.g;
      px(base, 0, 0, T, T);
      if (ground === 'w') {
        if (h % 3 === 0) px(light, h % 2, 1, 2, 1); // ripple
        // A pale shoreline on sides that touch land.
        const land = (dx, dy) => { const j = at(x + dx, y + dy); return j !== null && terrain[j] !== 'w'; };
        if (land(0, -1)) px(dark, 0, 0, T, 1);
        if (land(0, 1)) px(dark, 0, T - 1, T, 1);
        if (land(-1, 0)) px(dark, 0, 0, 1, T);
        if (land(1, 0)) px(dark, T - 1, 0, 1, T);
      } else if (ground === 'o') {
        px(light, 0, 2, T, 1); // plank seam
        px(dark, (x + y) % 2 ? 0 : 2, 0, 1, 2);
      } else if (ground === 'c') {
        px(light, 1, 1);
      } else if (h % 4 === 0) {
        px(light, h % 3, (h >>> 3) % 3);
      } else if (h % 7 === 0) {
        px(dark, (h >>> 2) % 3, (h >>> 5) % 3);
      }

      const placement = world.occupied?.[i];
      if ((object === '.' || object === 'G') && !placement) continue; // travel areas stay hidden
      const sprite = SPRITES[object];
      if (sprite) {
        const { rows, colors } = sprite;
        rows.forEach((row, dy) => [...row].forEach((c, dx) => { if (c !== '.') px(colors[c], dx, dy); }));
      } else if (isBuilding(object)) {
        // A house seen from above: roof with a light ridge, and a wall row with windows along its front.
        const [roof, ridge, eave] = ROOF.red;
        if (!isBuilding(obj(x, y + 1))) {
          px(eave, 0, 0, T, 1);
          px('#e9dcc0', 0, 1, T, 2);
          px(h % 2 ? '#7fb6e0' : '#7a4e2a', 1, 1, 1, h % 2 ? 1 : 2); // a window or a door
        } else {
          px(roof, 0, 0, T, T);
          if (!isBuilding(obj(x, y - 1))) px(ridge, 0, 0, T, 1);
        }
      } else if (ROOF_OF[object]) {
        const [roof, ridge, eave] = ROOF[ROOF_OF[object]];
        px(roof, 0, 0, T, T);
        if (!ROOF_OF[obj(x, y - 1)]) px(ridge, 0, 0, T, 1);
        if (!ROOF_OF[obj(x, y + 1)]) px(eave, 0, T - 1, T, 1);
      } else if (WALLS[object] || object === 'O' || object === 'Y') {
        const [wall, line] = WALLS[object] ?? WALLS.M;
        px(wall, 0, 0, T, T);
        px(line, 0, T - 1, T, 1);
        if (object === 'L') px(line, 0, 1, T, 1);
        if (object === 'O') px('#9fd0f0', 1, 0, 1, 2); // window
        if (object === 'Y') px('#5a3a3a', 1, 0, 1, 2); // chimney
      } else if (FENCES[object]) {
        // Posts joined to the fences and walls next to them.
        const color = FENCES[object];
        px(color, 1, 1);
        if (isFenceOrWall(obj(x - 1, y))) px(color, 0, 1);
        if (isFenceOrWall(obj(x + 1, y))) px(color, 2, 1);
        if (isFenceOrWall(obj(x, y - 1))) px(color, 1, 0);
        if (isFenceOrWall(obj(x, y + 1))) px(color, 1, 2);
      } else if (object === 'X') {
        px('#2a2230', 0, 0, T, T);
      } else if (placement) {
        // Furniture and other assets: a block with a darker front edge.
        const solid = assetById(placement.a)?.solid;
        px(solid ? '#9a6a42' : '#d2ae78', 0, 0, T, T);
        if (world.occupied[i + width] !== placement) px(solid ? '#6e4426' : '#b08a58', 0, T - 1, T, 1);
        if (world.occupied[i - width] !== placement) px(solid ? '#b8845a' : '#e4c592', 0, 0, T, 1);
      }
    }
  }
}

// The first art pixel of the picture shown along one axis: centred on the player and kept inside the map,
// or the whole map centred when it fits (negative: black space before it).
function firstPixel(player, size, view) {
  if (size <= view) return -Math.floor((view - size) / 2);
  return Math.max(0, Math.min(size - view, Math.round(player - view / 2)));
}

// picture: the map picture (a canvas, tilePx pixels per tile). player: { x, y } in tiles (fractions allowed).
export function drawMinimap(ctx, { picture, tilePx = TILE_PX, world, player, blink, location }) {
  drawBoard(ctx, MINIMAP_WIDTH, MINIMAP_HEIGHT, [[40, 2, 10], [6, 65, 6], [70, 74, 8]]);
  fill(ctx, C.outline, VIEW.x - 1, VIEW.y - 1, VIEW.w + 2, VIEW.h + 2);
  fill(ctx, C.goldDark, VIEW.x - 2, VIEW.y + VIEW.h + 1, VIEW.w + 4, 1);
  fill(ctx, '#000000', VIEW.x, VIEW.y, VIEW.w, VIEW.h);
  const mapW = world.width * tilePx;
  const mapH = world.height * tilePx;
  const left = firstPixel((player?.x ?? world.width / 2) * tilePx, mapW, VIEW.w);
  const top = firstPixel((player?.y ?? world.height / 2) * tilePx, mapH, VIEW.h);
  // Copy the visible part of the picture into the window.
  const sx = Math.max(0, left);
  const sy = Math.max(0, top);
  const sw = Math.min(mapW - sx, VIEW.w - (sx - left));
  const sh = Math.min(mapH - sy, VIEW.h - (sy - top));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(picture, sx, sy, sw, sh, VIEW.x + sx - left, VIEW.y + sy - top, sw, sh);
  // The player: a small red marker with a ring that blinks white.
  if (player) {
    const mx = VIEW.x + Math.round(player.x * tilePx) - left;
    const my = VIEW.y + Math.round(player.y * tilePx) - top;
    const inView = (x, y) => x >= VIEW.x && y >= VIEW.y && x < VIEW.x + VIEW.w && y < VIEW.y + VIEW.h;
    const ring = blink ? '#ffffff' : C.outline;
    for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) {
      if (inView(mx + dx, my + dy)) fill(ctx, Math.abs(dx) + Math.abs(dy) <= 1 ? '#ff5a7a' : ring, mx + dx, my + dy);
    }
    if (inView(mx, my)) fill(ctx, '#ffd0da', mx, my);
  }
  drawPlate(ctx, 4, 66, 84, 9);
  drawTextCentred(ctx, fitText(location.toUpperCase(), 78), 4, 84, 68);
}

// world: the map or room the player is in. getPlayerPosition(): the player's position in tiles, or null.
// getOverview(): the game's own picture of the map ({ canvas, pxPerTile, world }), or null if not ready.
export default function Minimap({ world, location, getPlayerPosition, getOverview }) {
  const canvasRef = useRef(null);
  const sketch = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = world.width * TILE_PX;
    canvas.height = world.height * TILE_PX;
    paintMapTiles(canvas.getContext('2d'), world);
    return canvas;
  }, [world]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), UPDATE_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const player = getPlayerPosition();
    const blink = Math.floor(Date.now() / BLINK_MS) % 2 === 0;
    // The game's picture only if it's of this map (just after travelling, the old scene may still answer).
    const overview = getOverview?.();
    const { canvas, pxPerTile } = overview?.world === world ? overview : { canvas: sketch, pxPerTile: TILE_PX };
    paintPixelCanvas(canvasRef.current, MINIMAP_WIDTH, MINIMAP_HEIGHT, (ctx) => drawMinimap(ctx, { picture: canvas, tilePx: pxPerTile, world, player, blink, location }));
  }, [tick, sketch, world, location, getPlayerPosition, getOverview]);

  return (
    <div className="minimap" title="Map (M to hide)">
      <canvas ref={canvasRef} role="img" aria-label={`Map of ${location}`} />
    </div>
  );
}
