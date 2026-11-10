import React, { useEffect, useRef, useState } from 'react';
import { C, drawBoard, drawPlate, drawTextCentred, fill, paintPixelCanvas } from './pixelUi.js';
import { PixelButton } from './PauseMenu.jsx';

// What a player sees sitting at a tabletop, in the same pixel art as the menus: a games table seen from
// above, with a thick frame of pale weathered wood around a sunken well of green felt. It's drawn as large as
// the window allows (whole pixels only, so it stays crisp). The game itself comes later; for now it says so,
// and they can leave.

export const TABLE = { w: 240, h: 166 };
const FRAME = { x: 8, y: 20, w: 224, h: 124, rim: 14 }; // the table, and how wide its wooden frame is
const LEAVE = { x: 72, y: 147, w: 96, h: 15 };
const WOOD = { light: '#d8c59a', shine: '#e8d9b2', mid: '#c2ab7c', grain: '#b49d70', shade: '#a38c60', dark: '#7d6a48' };
const FELT = { base: '#1f7d5c', light: '#2b9470', speck: '#23855f', shadow: '#145a43', deep: '#0f4634' };

// The biggest whole-number scale (screen pixels per art pixel) at which the table fits the window.
function fitScale() {
  const dpr = window.devicePixelRatio || 1;
  const fit = Math.min((window.innerWidth * dpr - 32 * dpr) / TABLE.w, (window.innerHeight * dpr - 32 * dpr) / TABLE.h);
  return Math.max(1, Math.floor(fit));
}

// A repeatable 0..1 value per position, for grain and felt texture.
const noise = (x, y, seed) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function drawTabletop(ctx) {
  const { w, h } = TABLE;
  drawBoard(ctx, w, h, [[20, 145, 12], [190, 12, 12], [200, 160, 10]]);
  drawPlate(ctx, 8, 5, w - 16, 11);
  drawTextCentred(ctx, 'TABLETOP', 8, w - 16, 8);

  const { x, y, w: fw, h: fh, rim } = FRAME;
  const inner = { x: x + rim, y: y + rim, w: fw - rim * 2, h: fh - rim * 2 };
  // The frame: pale boards with grain running along each side, mitred at the corners.
  fill(ctx, C.outline, x, y, fw, fh);
  fill(ctx, WOOD.light, x + 1, y + 1, fw - 2, fh - 2);
  // Long thin streaks: each row of a board gets a few runs of darker grain, staggered from row to row.
  const streak = (along, row, seed) => noise(Math.floor((along + row * 13) / 22), row, seed) < 0.22;
  for (let i = 2; i < rim - 1; i++) {
    for (let px = x + 1; px < x + fw - 1; px++) {
      if (streak(px, i, 1)) fill(ctx, WOOD.grain, px, y + i, 1, 1); // back board
      if (streak(px, i, 2)) fill(ctx, WOOD.grain, px, y + fh - 1 - i, 1, 1); // front board
    }
    for (let py = y + 1; py < y + fh - 1; py++) {
      if (streak(py, i, 3)) fill(ctx, WOOD.grain, x + i, py, 1, 1); // left board
      if (streak(py, i, 4)) fill(ctx, WOOD.grain, x + fw - 1 - i, py, 1, 1); // right board
    }
  }
  // Mitre joints where the boards meet at each corner.
  for (let i = 1; i < rim; i++) {
    fill(ctx, WOOD.shade, x + i, y + i, 1, 1);
    fill(ctx, WOOD.shade, x + fw - 1 - i, y + i, 1, 1);
    fill(ctx, WOOD.shade, x + i, y + fh - 1 - i, 1, 1);
    fill(ctx, WOOD.shade, x + fw - 1 - i, y + fh - 1 - i, 1, 1);
  }
  // A few knots, and the lit outer edge.
  for (const [kx, ky] of [[x + 40, y + 6], [x + 170, y + fh - 8], [x + 6, y + 70], [x + fw - 8, y + 34]]) {
    fill(ctx, WOOD.shade, kx - 1, ky, 3, 1);
    fill(ctx, WOOD.dark, kx, ky, 1, 1);
  }
  fill(ctx, WOOD.shine, x + 1, y + 1, fw - 2, 1);
  fill(ctx, WOOD.shine, x + 1, y + 1, 1, fh - 2);
  fill(ctx, WOOD.shade, x + 1, y + fh - 2, fw - 2, 1);

  // The sunken well: dark rim line, the far and left inner walls in shade, the right wall catching light.
  fill(ctx, C.outline, inner.x - 1, inner.y - 1, inner.w + 2, inner.h + 2);
  fill(ctx, WOOD.dark, inner.x, inner.y, inner.w, 6); // far wall
  fill(ctx, WOOD.shade, inner.x, inner.y, inner.w, 1);
  fill(ctx, WOOD.dark, inner.x, inner.y, 4, inner.h); // left wall
  fill(ctx, WOOD.mid, inner.x + inner.w - 3, inner.y + 6, 3, inner.h - 6); // right wall, lit
  // The felt, shadowed along the far and left walls, with a soft texture.
  const felt = { x: inner.x + 4, y: inner.y + 6, w: inner.w - 7, h: inner.h - 6 };
  fill(ctx, FELT.base, felt.x, felt.y, felt.w, felt.h);
  for (let py = felt.y; py < felt.y + felt.h; py++) {
    for (let px = felt.x; px < felt.x + felt.w; px++) {
      const r = noise(px, py, 9);
      if (r < 0.06) fill(ctx, FELT.speck, px, py, 1, 1);
      else if (r > 0.97) fill(ctx, FELT.light, px, py, 1, 1);
    }
  }
  fill(ctx, FELT.deep, felt.x, felt.y, felt.w, 2);
  fill(ctx, FELT.shadow, felt.x, felt.y + 2, felt.w, 2);
  fill(ctx, FELT.deep, felt.x, felt.y, 2, felt.h);
  fill(ctx, FELT.shadow, felt.x + 2, felt.y + 2, 2, felt.h - 2);
  // The front lip of the frame catches the light where it meets the felt.
  fill(ctx, WOOD.shine, inner.x, inner.y + inner.h, inner.w, 1);

  // The game itself isn't ready yet.
  const plateX = Math.round(felt.x + felt.w / 2 - 40);
  const plateY = Math.round(felt.y + felt.h / 2 - 5);
  drawPlate(ctx, plateX, plateY, 80, 11, C.gold, C.goldLight, C.goldDark);
  drawTextCentred(ctx, 'GAME COMING SOON', plateX, 80, plateY + 3);
}

// onLeave: stand up from the table (Esc or Enter on Leave does the same).
export default function TabletopView({ onLeave }) {
  const boardRef = useRef(null);
  const leaveRef = useRef(null);
  const [scale, setScale] = useState(fitScale);
  const unit = scale / (window.devicePixelRatio || 1); // CSS pixels per art pixel

  useEffect(() => {
    const onResize = () => setScale(fitScale());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => { paintPixelCanvas(boardRef.current, TABLE.w, TABLE.h, drawTabletop, scale); }, [scale]);
  useEffect(() => { leaveRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(event) {
      const key = event.key.toLowerCase();
      if (key === 'escape' || key === 'enter' || key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        onLeave();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onLeave]);

  return (
    <div className="pause-overlay" style={{ '--px': `${unit}px` }}>
      <div className="pause-menu" role="dialog" aria-modal="true" aria-label="Tabletop: the game is coming soon" style={{ width: `${TABLE.w * unit}px`, height: `${TABLE.h * unit}px` }}>
        <canvas ref={boardRef} aria-hidden="true" />
        <PixelButton buttonRef={(el) => { leaveRef.current = el; }} w={LEAVE.w} h={LEAVE.h} scale={scale} style={{ left: `${LEAVE.x * unit}px`, top: `${LEAVE.y * unit}px` }}
          label="LEAVE TABLE" ariaLabel="Leave table" onClick={onLeave} />
      </div>
    </div>
  );
}
