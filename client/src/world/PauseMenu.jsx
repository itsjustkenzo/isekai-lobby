import React, { useEffect, useRef, useState } from 'react';
import { C, cssPixel, drawBoard, drawButton, drawPlate, drawText, drawTextCentred, fill, fitText, paintPixelCanvas, textWidth } from './pixelUi.js';

// The pause menu (Esc in play mode) and the little pause button in the corner, drawn in the same pixel
// art as the clock panel: a wooden board, parchment buttons that turn gold with a pointer when chosen.

// A real <button> whose look is a pixel-art canvas. w × h are art pixels.
// scale: screen pixels per art pixel, for buttons on a bigger-than-usual screen (default: the usual size).
export function PixelButton({ w, h, label, tag = null, disabled = false, onClick, ariaLabel, ariaPressed, buttonRef, style, drawExtra, pointer = true, className = '', scale }) {
  const canvasRef = useRef(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [down, setDown] = useState(false);
  const state = disabled ? 'disabled' : down ? 'down' : hover || focus ? 'hot' : 'idle';
  useEffect(() => {
    if (!canvasRef.current) return;
    paintPixelCanvas(canvasRef.current, w, h, (ctx) => {
      drawButton(ctx, w, h, label, state, tag, pointer);
      drawExtra?.(ctx, state);
    }, scale);
  }, [w, h, label, tag, state, pointer, drawExtra, scale]);
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`pixel-button ${className}`}
      style={style}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      aria-pressed={ariaPressed}
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => { setHover(false); setDown(false); }}
      onPointerDown={() => setDown(true)}
      onPointerUp={() => setDown(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
    </button>
  );
}

// Two bars, on the corner pause button.
function drawPauseBars(ctx, state) {
  const top = state === 'down' ? 1 : 0;
  fill(ctx, C.ink, 5, 4 + top, 2, 6);
  fill(ctx, C.ink, 9, 4 + top, 2, 6);
}

// The corner pause button (for touch screens and mice; Esc does the same).
export function PauseButton({ onClick }) {
  return (
    <div className="pause-corner">
      <PixelButton w={16} h={16} label="" ariaLabel="Menu (Esc)" pointer={false} onClick={onClick} drawExtra={drawPauseBars} />
    </div>
  );
}

// A small gold "PREVIEW" plate, shown in the corner while a creator previews their world.
export function PreviewTag() {
  const canvasRef = useRef(null);
  const w = textWidth('PREVIEW') + 8;
  useEffect(() => {
    paintPixelCanvas(canvasRef.current, w, 11, (ctx) => {
      drawPlate(ctx, 0, 0, w, 11, C.gold, C.goldLight, C.goldDark);
      drawText(ctx, 'PREVIEW', 4, 3);
    });
  }, [w]);
  return <div className="preview-tag" title="Preview: nothing is saved"><canvas ref={canvasRef} aria-label="Preview, nothing is saved" /></div>;
}

// A menu page: a wooden board with a title plate, a line of text under it, and buttons placed in art pixels.
const MENU = { w: 104, x: 8, bw: 88 };

function useArtUnit() {
  const [unit, setUnit] = useState(cssPixel);
  // CSS pixels per art pixel can change when the window is resized or moved to another screen.
  useEffect(() => {
    const onResize = () => setUnit(cssPixel());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return unit;
}

// Arrow keys (or W/S) move between the page's controls, Enter or Space presses the chosen button.
// controls(): the page's focusable elements in order. onKey(event, key): handles other keys first (return true).
function useMenuKeys(controls, onKey) {
  useEffect(() => {
    function handle(event) {
      const key = event.key.toLowerCase();
      if (onKey?.(event, key)) return;
      const order = controls().filter((el) => el && !el.disabled);
      const current = order.indexOf(document.activeElement);
      if (['arrowdown', 's', 'arrowup', 'w'].includes(key)) {
        event.preventDefault();
        const step = key === 'arrowdown' || key === 's' ? 1 : -1;
        order[(current + step + order.length) % order.length]?.focus();
      } else if ((key === 'enter' || key === ' ') && current >= 0 && order[current].tagName === 'BUTTON') {
        // The game captures Space, so buttons are pressed here.
        event.preventDefault();
        order[current].click();
      }
    }
    window.addEventListener('keydown', handle, true);
    return () => window.removeEventListener('keydown', handle, true);
  });
}

function MenuBoard({ h, title, line, unit, grain, label, children }) {
  const boardRef = useRef(null);
  useEffect(() => {
    paintPixelCanvas(boardRef.current, MENU.w, h, (ctx) => {
      drawBoard(ctx, MENU.w, h, grain);
      drawPlate(ctx, MENU.x, 5, MENU.bw, 11);
      drawTextCentred(ctx, title, MENU.x, MENU.bw, 8);
      if (line) drawTextCentred(ctx, fitText(line, MENU.bw), MENU.x, MENU.bw, 19, C.plateLight);
    });
  }, [h, title, line, unit, grain]);
  return (
    <div className="pause-menu" role="dialog" aria-modal="true" aria-label={label} style={{ width: `${MENU.w * unit}px`, height: `${h * unit}px` }}>
      <canvas ref={boardRef} aria-hidden="true" />
      {children}
    </div>
  );
}

const placeAt = (unit, x, y) => ({ left: `${x * unit}px`, top: `${y * unit}px` });
const MAIN_GRAIN = [[10, 26, 8], [80, 44, 9], [14, 62, 7], [40, 82, 12]];
const OPTIONS_GRAIN = [[10, 26, 8], [80, 44, 9], [60, 70, 7], [30, 92, 12]];

// The volume bar: 10 gold segments on parchment (gold-faced when chosen). w × h art pixels.
const SLIDER = { x: 25, y: 56, w: 54, h: 14 };
const VALUE_WIDTH = textWidth('MUTED'); // room for "100%" or "MUTED"
function drawVolumeBar(ctx, level, chosen) {
  const { w, h } = SLIDER;
  drawPlate(ctx, 0, 0, w, h, chosen ? '#ffe08a' : C.plate, chosen ? C.goldLight : C.plateLight, chosen ? C.goldDark : C.plateDark);
  const filled = Math.round(level * 10);
  for (let i = 0; i < 10; i++) {
    const x = 3 + i * 5;
    fill(ctx, i < filled ? C.gold : '#e4cf9f', x, 3, 4, h - 6);
    fill(ctx, i < filled ? C.goldDark : '#cdb37f', x, h - 5, 4, 2);
    fill(ctx, i < filled ? C.goldLight : '#efe0bb', x, 3, 4, 1);
  }
}

// "−" / "+" drawn on a small square button.
function signDrawer(plus) {
  return (ctx, state) => {
    const top = state === 'down' ? 1 : 0;
    fill(ctx, C.ink, 4, 6 + top, 6, 2);
    if (plus) fill(ctx, C.ink, 6, 4 + top, 2, 6);
  };
}
const drawMinus = signDrawer(false);
const drawPlus = signDrawer(true);

// The Options page: audio for now. Sound on/off (everything) and the weather ambience volume.
function OptionsPage({ unit, muted, ambience, onToggleSound, onAmbienceChange, onBack }) {
  const soundRef = useRef(null);
  const sliderRef = useRef(null);
  const backRef = useRef(null);
  const barRef = useRef(null);
  const valueRef = useRef(null);
  const [sliderFocus, setSliderFocus] = useState(false);
  const H = 97;
  const step = (delta) => onAmbienceChange(Math.max(0, Math.min(1, Math.round((ambience + delta) * 10) / 10)));

  useEffect(() => { soundRef.current?.focus(); }, []);
  useEffect(() => {
    paintPixelCanvas(barRef.current, SLIDER.w, SLIDER.h, (ctx) => drawVolumeBar(ctx, ambience, sliderFocus));
    const text = muted ? 'MUTED' : `${Math.round(ambience * 100)}%`;
    const width = VALUE_WIDTH;
    paintPixelCanvas(valueRef.current, width, 5, (ctx) => drawText(ctx, text, width - textWidth(text), 0, C.plateLight));
  }, [ambience, sliderFocus, muted, unit]);

  // Esc goes back to the pause menu; ← → change the volume while the bar is chosen.
  useMenuKeys(() => [soundRef.current, sliderRef.current, backRef.current], (event, key) => {
    if (key === 'escape') { event.preventDefault(); event.stopPropagation(); onBack(); return true; }
    if (document.activeElement === sliderRef.current && ['arrowleft', 'arrowright', 'a', 'd'].includes(key)) {
      event.preventDefault();
      step(key === 'arrowleft' || key === 'a' ? -0.1 : 0.1);
      return true;
    }
    return false;
  });

  // Clicking or dragging on the bar sets the volume where you point.
  function setFromPointer(event) {
    const box = event.currentTarget.getBoundingClientRect();
    onAmbienceChange(Math.max(0, Math.min(1, Math.round(((event.clientX - box.left) / box.width) * 10) / 10)));
  }

  return (
    <MenuBoard h={H} title="OPTIONS" line="AUDIO" unit={unit} grain={OPTIONS_GRAIN} label="Options: audio">
      <PixelButton buttonRef={(el) => { soundRef.current = el; }} w={MENU.bw} h={15} style={placeAt(unit, MENU.x, 28)}
        label={muted ? 'SOUND: OFF' : 'SOUND: ON'} ariaLabel="Sound" ariaPressed={!muted} onClick={onToggleSound} />
      <div className="pixel-label" style={placeAt(unit, MENU.x, 48)}>
        <PixelText text="AMBIENCE" color={C.plateLight} unit={unit} />
      </div>
      <canvas ref={valueRef} className="pixel-label" aria-hidden="true" style={placeAt(unit, MENU.x + MENU.bw - VALUE_WIDTH, 48)} />
      <PixelButton w={15} h={14} label="" ariaLabel="Ambience quieter" pointer={false} drawExtra={drawMinus} style={placeAt(unit, MENU.x, SLIDER.y)} onClick={() => step(-0.1)} />
      <div ref={sliderRef} className="pixel-slider" role="slider" tabIndex={0} aria-label="Weather ambience volume" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(ambience * 100)} aria-valuetext={`${Math.round(ambience * 100)}%`}
        style={placeAt(unit, SLIDER.x, SLIDER.y)} onFocus={() => setSliderFocus(true)} onBlur={() => setSliderFocus(false)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setFromPointer(e); }}
        onPointerMove={(e) => { if (e.buttons) setFromPointer(e); }}>
        <canvas ref={barRef} aria-hidden="true" />
      </div>
      <PixelButton w={15} h={14} label="" ariaLabel="Ambience louder" pointer={false} drawExtra={drawPlus} style={placeAt(unit, SLIDER.x + SLIDER.w + 2, SLIDER.y)} onClick={() => step(0.1)} />
      <PixelButton buttonRef={(el) => { backRef.current = el; }} w={MENU.bw} h={15} style={placeAt(unit, MENU.x, 76)} label="BACK" ariaLabel="Back" onClick={onBack} />
    </MenuBoard>
  );
}

// A short line of pixel text on its own canvas.
function PixelText({ text, color, unit }) {
  const ref = useRef(null);
  useEffect(() => {
    paintPixelCanvas(ref.current, textWidth(text), 5, (ctx) => drawText(ctx, text, 0, 0, color));
  }, [text, color, unit]);
  return <canvas ref={ref} aria-hidden="true" />;
}

// The pause menu: Resume, Options (audio settings), Quit game.
// location: where the player is, shown under the title. preview: quitting goes back to the editor.
// ambience: weather sound volume from 0 to 1.
export default function PauseMenu({ location, preview, muted, ambience, onResume, onQuit, onToggleSound, onAmbienceChange }) {
  const unit = useArtUnit();
  const [page, setPage] = useState('main');
  const refs = useRef({});

  useEffect(() => { if (page === 'main') refs.current.resume?.focus(); }, [page]);
  useMenuKeys(() => (page === 'main' ? ['resume', 'options', 'quit'].map((id) => refs.current[id]) : []));

  const button = (id, y, label, ariaLabel, onClick) => (
    <PixelButton buttonRef={(el) => { refs.current[id] = el; }} w={MENU.bw} h={15} style={placeAt(unit, MENU.x, y)} label={label} ariaLabel={ariaLabel} onClick={onClick} />
  );
  return (
    <div className="pause-overlay" style={{ '--px': `${unit}px` }} onPointerDown={(e) => { if (e.target === e.currentTarget) onResume(); }}>
      {page === 'main' ? (
        <MenuBoard h={85} title="PAUSED" line={location} unit={unit} grain={MAIN_GRAIN} label={`Paused, ${location}`}>
          {button('resume', 28, 'RESUME', 'Resume', onResume)}
          {button('options', 46, 'OPTIONS', 'Options', () => setPage('options'))}
          {button('quit', 64, preview ? 'QUIT PREVIEW' : 'QUIT GAME', preview ? 'Quit preview' : 'Quit game', onQuit)}
        </MenuBoard>
      ) : (
        <OptionsPage unit={unit} muted={muted} ambience={ambience} onToggleSound={onToggleSound} onAmbienceChange={onAmbienceChange} onBack={() => setPage('main')} />
      )}
    </div>
  );
}
