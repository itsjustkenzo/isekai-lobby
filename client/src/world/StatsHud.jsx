import React, { useEffect, useRef, useState } from 'react';
import { C, cssPixel, drawBoard, drawPlate, drawText, drawTextCentred, fill, fitText, paintPixelCanvas, textWidth } from './pixelUi.js';
import { pixelateSprite } from './WorldBaseScene.js';

// The character panel at the bottom centre of play mode, in the same pixel art as the clock and the mini
// map: the character's portrait (the same 16-bit sprite that walks the map) in a gold-rimmed frame, their
// name, and health as a heart with a red bar and numbers.

export const STATS_WIDTH = 112;
export const STATS_HEIGHT = 33;
const PORTRAIT = { x: 5, y: 5, size: 23 }; // the portrait window, in art pixels
const BAR = { x: 47, y: 16, w: 60, h: 12 };

// A heart: k outline, r red, s shade, w shine.
const HEART = ['.kk...kk.', 'krrk.kwrk', 'krwrkrrrk', 'krrrrrrsk', '.krrrrsk.', '..krrsk..', '...ksk...', '....k....'];
const HEART_COLORS = { k: C.outline, r: '#e0453a', s: '#a82c2a', w: '#ffb3a6' };

function drawPortrait(ctx, sprite) {
  const { x, y, size } = PORTRAIT;
  // Gold bezel, dark rim, and a soft sky behind the character.
  fill(ctx, C.gold, x - 2, y - 2, size + 4, 1);
  fill(ctx, C.gold, x - 2, y - 2, 1, size + 4);
  fill(ctx, C.goldDark, x - 2, y + size + 1, size + 4, 1);
  fill(ctx, C.goldDark, x + size + 1, y - 2, 1, size + 4);
  fill(ctx, C.outline, x - 1, y - 1, size + 2, size + 2);
  const bands = ['#7ec3ec', '#8fcdf0', '#a3d8f3', '#bfe5f6'];
  bands.forEach((color, i) => fill(ctx, color, x, y + Math.round((i * size) / bands.length), size, Math.ceil(size / bands.length)));
  fill(ctx, C.grassDark, x, y + size - 3, size, 3);
  fill(ctx, C.grass, x, y + size - 3, size, 1);
  if (!sprite) return;
  // Head and shoulders: the top of the sprite, centred, cropped to the window.
  const sx = Math.max(0, Math.floor((sprite.width - size) / 2));
  const sw = Math.min(size, sprite.width);
  const sh = Math.min(size - 1, sprite.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, sx, 0, sw, sh, x + Math.floor((size - sw) / 2), y + 1, sw, sh);
}

function drawHealth(ctx, health, maxHealth) {
  HEART.forEach((row, dy) => [...row].forEach((c, dx) => { if (c !== '.') fill(ctx, HEART_COLORS[c], 36 + dx, 18 + dy); }));
  const { x, y, w, h } = BAR;
  // Outline, an empty dark trough, and the red fill with a light top edge and a dark bottom edge.
  fill(ctx, C.outline, x + 1, y, w - 2, 1);
  fill(ctx, C.outline, x + 1, y + h - 1, w - 2, 1);
  fill(ctx, C.outline, x, y + 1, 1, h - 2);
  fill(ctx, C.outline, x + w - 1, y + 1, 1, h - 2);
  fill(ctx, '#4a1f26', x + 1, y + 1, w - 2, h - 2);
  const inner = w - 2;
  const filled = maxHealth > 0 ? Math.round((inner * Math.max(0, Math.min(health, maxHealth))) / maxHealth) : 0;
  if (filled > 0) {
    fill(ctx, '#e0453a', x + 1, y + 1, filled, h - 2);
    fill(ctx, '#ff7a62', x + 1, y + 1, filled, 2);
    fill(ctx, '#a82c2a', x + 1, y + h - 3, filled, 2);
  }
  // A tick every 10% of the bar, like segments.
  for (let i = 1; i < 10; i++) {
    const tx = x + 1 + Math.round((inner * i) / 10);
    fill(ctx, tx - x - 1 < filled ? '#b8352f' : '#3a171d', tx, y + 3, 1, h - 6);
  }
  // The numbers, in light ink with a dark shadow so they read on red and on the dark trough.
  const text = `${Math.max(0, Math.round(health))}/${maxHealth}`;
  const tx = x + Math.floor((w - textWidth(text)) / 2);
  const ty = y + Math.floor((h - 5) / 2);
  drawText(ctx, text, tx, ty + 1, C.outline);
  drawText(ctx, text, tx, ty, '#fff6dc');
}

export function drawStats(ctx, { sprite, name, health, maxHealth, framed = true }) {
  if (framed) drawBoard(ctx, STATS_WIDTH, STATS_HEIGHT, [[36, 30, 9], [70, 2, 10], [92, 30, 8]]);
  drawPortrait(ctx, sprite);
  drawPlate(ctx, 33, 3, 75, 10);
  drawTextCentred(ctx, fitText(name.toUpperCase(), 69), 33, 75, 6);
  drawHealth(ctx, health, maxHealth);
}

// spriteUrl: the character's sprite; name: shown on the plate; health / maxHealth: the health bar.
export default function StatsHud({ spriteUrl, name, health, maxHealth, framed = true }) {
  const canvasRef = useRef(null);
  const [pixelScale,setPixelScale] = useState(cssPixel);
  useEffect(() => { const resize = () => setPixelScale(cssPixel());window.addEventListener('resize',resize);return () => window.removeEventListener('resize',resize); }, []);
  const [sprite, setSprite] = useState(null);

  // The same pixelated sprite the game uses for the character on the map.
  useEffect(() => {
    if (!spriteUrl) return undefined;
    let cancelled = false;
    const image = new Image();
    image.onload = () => { if (!cancelled) setSprite(pixelateSprite(image)); };
    image.src = spriteUrl;
    return () => { cancelled = true; };
  }, [spriteUrl]);

  useEffect(() => {
    if (!canvasRef.current) return;
    paintPixelCanvas(canvasRef.current, STATS_WIDTH, STATS_HEIGHT, (ctx) => drawStats(ctx, { sprite, name, health, maxHealth, framed }));
  }, [sprite, name, health, maxHealth, pixelScale, framed]);

  return (
    <div className="stats-hud" role="status" aria-label={`${name}: health ${Math.round(health)} of ${maxHealth}`}>
      <canvas ref={canvasRef} />
    </div>
  );
}
