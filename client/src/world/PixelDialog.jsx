import React, { useEffect, useRef, useState } from 'react';
import { C, cssPixel, drawBoard, drawPlate, drawText, drawTextCentred, fill, fitText, paintPixelCanvas, textWidth } from './pixelUi.js';
import { PixelButton } from './PauseMenu.jsx';

// The yes / no question in play mode (go inside, go outside, travel), drawn in the same pixel art as the
// HUD and the pause menu: a wooden board, a gold title plate with a small icon, the question on parchment,
// and two pixel buttons.

// 7×7 icons: a door and a compass. k outline, d wood, y gold, w parchment, r red, b blue.
const ICON_COLORS = { k: C.outline, d: '#8a5a32', y: C.gold, w: C.plate, r: '#e0453a', b: '#4f78b8' };
const ICONS = {
  bed: ['.......', 'k......', 'kyy....', 'kwwwwwk', 'kkkkkkk', 'k.....k', '.......'],
  door: ['.kkkkk.', '.kdddk.', '.kdddk.', '.kddyk.', '.kdddk.', '.kdddk.', 'kkkkkkk'],
  compass: ['..kkk..', '.kwrwk.', 'kwwrwwk', 'kwwkwwk', 'kwwbwwk', '.kwbwk.', '..kkk..'],
  dice: ['kkkkkkk', 'kwwwwwk', 'kwkwwwk', 'kwwkwwk', 'kwwwkwk', 'kwwwwwk', 'kkkkkkk'],
};

export const DIALOG = { w: 150, h: 59, pad: 6 };
export const BUTTONS = { y: 35, h: 14, gap: 6 };

export function drawDialog(ctx, { icon, title, question, keys }) {
  const { w, h, pad } = DIALOG;
  drawBoard(ctx, w, h, [[30, 32, 9], [110, 2, 10], [60, 56, 12]]);
  // Gold title plate with the icon and the place's name.
  drawPlate(ctx, pad, 4, w - pad * 2, 11, C.gold, C.goldLight, C.goldDark);
  ICONS[icon].forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') fill(ctx, ICON_COLORS[c], pad + 3 + x, 6 + y); }));
  drawText(ctx, fitText(title.toUpperCase(), w - pad * 2 - 16), pad + 13, 7);
  // The question.
  drawPlate(ctx, pad, 18, w - pad * 2, 14);
  drawTextCentred(ctx, fitText(question.toUpperCase(), w - pad * 2 - 6), pad, w - pad * 2, 22);
  // Key reminder along the bottom of the board.
  drawText(ctx, keys, Math.floor((w - textWidth(keys)) / 2), 51, C.plateLight);
}

// icon: 'door', 'compass' or 'dice'. yesLabel: e.g. "Enter". Keys: Enter / Space press the chosen button, ← → choose,
// E or Y means yes, Esc or N means no.
export default function PixelDialog({ icon, title, question, yesLabel, onYes, onNo }) {
  const boardRef = useRef(null);
  const yesRef = useRef(null);
  const noRef = useRef(null);
  const [unit, setUnit] = useState(cssPixel);
  const keys = 'E: YES   ESC: NO';

  useEffect(() => {
    const onResize = () => setUnit(cssPixel());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    paintPixelCanvas(boardRef.current, DIALOG.w, DIALOG.h, (ctx) => drawDialog(ctx, { icon, title, question, keys }));
  }, [icon, title, question, unit]);

  useEffect(() => { yesRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(event) {
      const key = event.key.toLowerCase();
      const handled = () => { event.preventDefault(); event.stopPropagation(); };
      if (key === 'e' || key === 'y') { handled(); onYes(); }
      else if (key === 'escape' || key === 'n') { handled(); onNo(); }
      else if (['arrowleft', 'arrowright', 'a', 'd'].includes(key)) {
        handled();
        (document.activeElement === yesRef.current ? noRef : yesRef).current?.focus();
      } else if (key === 'enter' || key === ' ') {
        // The game captures Space, so the chosen button is pressed here.
        handled();
        if (document.activeElement === noRef.current) onNo();
        else onYes();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onYes, onNo]);

  const buttonW = (DIALOG.w - DIALOG.pad * 2 - BUTTONS.gap) / 2;
  const place = (x) => ({ left: `${x * unit}px`, top: `${BUTTONS.y * unit}px` });
  return (
    <div className="pixel-dialog" role="dialog" aria-modal="true" aria-label={`${title}. ${question}`} style={{ width: `${DIALOG.w * unit}px`, height: `${DIALOG.h * unit}px` }}>
      <canvas ref={boardRef} aria-hidden="true" />
      <PixelButton buttonRef={yesRef} w={buttonW} h={BUTTONS.h} label={yesLabel.toUpperCase()} ariaLabel={yesLabel} style={place(DIALOG.pad)} onClick={onYes} />
      <PixelButton buttonRef={noRef} w={buttonW} h={BUTTONS.h} label="NO" ariaLabel="No" style={place(DIALOG.pad + buttonW + BUTTONS.gap)} onClick={onNo} />
    </div>
  );
}
