import React, { useEffect, useRef } from 'react';
import { clockText, phaseAt } from './daycycle.js';
import { C, drawBoard, drawPlate, drawText, fill, paintPixelCanvas, textWidth } from './pixelUi.js';

// The clock panel in play mode's top-right corner, drawn as pixel art in the game's own palette: a wooden
// board with a sky window (sun or moon crossing over a grassy horizon) and parchment plates for the date,
// weather and part of the day, and the time. Everything is drawn with whole-pixel squares, at the same
// pixel size as the world (3 screen pixels per art pixel), so it sits in the same style as the map.

export const HUD_WIDTH = 99;
export const HUD_HEIGHT = 37;

// 7×7 icons; letters are colours.
const ICON_COLORS = { y: '#ffd23f', o: '#f39a2b', m: '#f4ecc2', n: '#c9b98a', c: C.cloud, d: C.cloudDark, b: '#4f8fd6', s: '#8e9aa6' };
const ICONS = {
  sun: ['...y...', '.y.y.y.', '..ooo..', 'yyoooyy', '..ooo..', '.y.y.y.', '...y...'],
  moon: ['..mmm..', '.mmn...', 'mmn....', 'mmn....', 'mmn....', '.mmn...', '..mmm..'],
  rain: ['..cc...', '.cccc..', 'cccccc.', 'dddddd.', '.b..b..', 'b..b..b', '..b..b.'],
  mist: ['.......', 'sssss..', '.......', '..sssss', '.......', 'ssss...', '.......'],
};

function drawIcon(ctx, name, x, y, clip) {
  ICONS[name].forEach((row, iy) => [...row].forEach((c, ix) => {
    if (c !== '.' && (!clip || clip(x + ix, y + iy))) fill(ctx, ICON_COLORS[c], x + ix, y + iy);
  }));
}

// Blends two "#rrggbb" colours.
function mix(a, b, t) {
  const p = (c, i) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

// Sky colours (top, horizon) through the day.
function skyColors(hour) {
  if (hour === null) return ['#5cb8f0', '#c8ecff'];
  if (hour < 5 || hour >= 20.5) return ['#141a44', '#2c3576'];
  if (hour < 7.5) return ['#6d7fd1', '#f7b48a'];
  if (hour < 16.5) return ['#5cb8f0', '#c8ecff'];
  if (hour < 19) return ['#f08a4b', '#ffd28a'];
  return ['#4b3a86', '#e07a6a'];
}

// The sky window: an arch with a dark rim and a gold bezel.
const DIAL = { cx: 20, cy: 20, r: 15, top: 5, bottom: 32, ground: 29 };
function insideDial(x, y) {
  if (y < DIAL.top || y > DIAL.bottom) return false;
  const half = y >= DIAL.cy ? DIAL.r : Math.floor(Math.sqrt(DIAL.r ** 2 - (DIAL.cy - y) ** 2) + 0.5);
  return Math.abs(x - DIAL.cx) <= half;
}
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const onRim = (x, y) => !insideDial(x, y) && SIDES.some(([dx, dy]) => insideDial(x + dx, y + dy));
const onBezel = (x, y) => !insideDial(x, y) && !onRim(x, y) && SIDES.some(([dx, dy]) => onRim(x + dx, y + dy));

// Where the sun or moon is: the sun crosses from 6 AM to 6 PM, the moon from 6 PM to 6 AM.
export function skyBody(hour) {
  const h = hour ?? 12;
  const night = h < 6 || h >= 18;
  const progress = night ? ((h - 18 + 24) % 24) / 12 : (h - 6) / 12;
  const angle = Math.PI * (1 - progress);
  return { night, angle, x: Math.round(DIAL.cx + Math.cos(angle) * 13), y: Math.round(DIAL.ground - Math.sin(angle) * 13) };
}

function drawDial(ctx, hour, weather) {
  const [top, bottom] = skyColors(hour);
  const bands = [0, 1, 2, 3].map((i) => {
    const color = mix(top, bottom, i / 3);
    return weather === 'rain' ? mix(color, '#6f7c8c', 0.45) : weather === 'mist' ? mix(color, '#d9e2e8', 0.4) : color;
  });
  for (let y = DIAL.top - 2; y <= DIAL.bottom + 2; y++) {
    for (let x = DIAL.cx - DIAL.r - 2; x <= DIAL.cx + DIAL.r + 2; x++) {
      if (insideDial(x, y)) {
        // Banded sky with a checker dither between bands.
        const level = ((y - DIAL.top) / (DIAL.ground - DIAL.top)) * 3;
        const base = Math.min(3, Math.floor(level));
        const frac = level - base;
        fill(ctx, bands[Math.min(3, base + (frac > 0.75 || (frac > 0.5 && (x + y) % 2 === 0) ? 1 : 0))], x, y);
      } else if (onRim(x, y)) {
        fill(ctx, C.outline, x, y);
      } else if (onBezel(x, y)) {
        fill(ctx, x <= DIAL.cx && y < DIAL.ground ? C.gold : C.goldDark, x, y); // lit from the top left
      }
    }
  }
  const h = hour ?? 12;
  if (hour !== null && (h < 5 || h >= 20.5) && weather !== 'rain') {
    for (const [sx, sy] of [[11, 12], [16, 8], [26, 10], [30, 16], [22, 15], [9, 19]]) fill(ctx, C.star, sx, sy);
  }
  // The sun or moon sinks behind the hills at each end of its arc; rain clouds hide it.
  const body = skyBody(hour);
  if (weather !== 'rain') drawIcon(ctx, body.night ? 'moon' : 'sun', body.x - 3, body.y - 3, insideDial);
  if (weather === 'rain') {
    for (const [x, y, w] of [[9, 9, 9], [8, 10, 12], [21, 7, 8], [19, 8, 12], [27, 12, 6]]) fill(ctx, C.cloud, x, y, w, 1);
    for (const [x, y, w] of [[8, 11, 12], [19, 9, 12], [26, 13, 7]]) fill(ctx, C.cloudDark, x, y, w, 1);
    for (const [x, y] of [[10, 15], [15, 19], [20, 13], [24, 18], [29, 16], [12, 23], [18, 24], [27, 23], [32, 21]]) {
      fill(ctx, C.rain, x, y);
      fill(ctx, C.rain, x - 1, y + 1);
    }
  }
  if (weather === 'mist') {
    for (const [x, y, w] of [[7, 14, 10], [20, 17, 12], [9, 21, 14], [24, 24, 9], [6, 26, 8]]) {
      for (let i = 0; i < w; i++) if (insideDial(x + i, y)) fill(ctx, C.mist, x + i, y);
    }
  }
  // Grassy hills along the bottom of the window.
  for (let y = DIAL.ground; y <= DIAL.bottom; y++) {
    for (let x = DIAL.cx - DIAL.r; x <= DIAL.cx + DIAL.r; x++) {
      if (!insideDial(x, y)) continue;
      fill(ctx, y === DIAL.ground ? (x % 3 === 0 ? C.grassLight : C.grass) : (x + y) % 5 === 0 ? C.grass : C.grassDark, x, y);
    }
  }
  for (const x of [8, 13, 27, 33]) fill(ctx, C.grassLight, x, DIAL.ground - 1);
  // The hand points at the sun or moon, from a gold hub.
  for (let i = 1; i <= 9; i++) {
    fill(ctx, C.outline, Math.round(DIAL.cx + Math.cos(body.angle) * i), Math.round(DIAL.bottom - 1 - Math.sin(body.angle) * i));
  }
  fill(ctx, C.outline, DIAL.cx - 2, DIAL.bottom - 3, 5, 4);
  fill(ctx, C.gold, DIAL.cx - 1, DIAL.bottom - 2, 3, 2);
  fill(ctx, C.goldDark, DIAL.cx, DIAL.bottom - 1, 2, 1);
}

// Draws the whole panel at 1 unit per art pixel (the caller scales the context).
export function drawHud(ctx, { hour, fixed, date, weather }) {
  const W = HUD_WIDTH;
  const H = HUD_HEIGHT;
  drawBoard(ctx, W, H, [[39, 13, 6], [60, 25, 9], [83, 13, 7], [70, 2, 8], [44, 35, 10]]);

  drawDial(ctx, hour, weather);

  // Plates: date; weather icon and part of the day; time.
  const night = hour !== null && (hour < 6 || hour >= 18);
  const plateX = 40;
  const plateW = 56;
  const centred = (text, y, left = plateX, width = plateW) => drawText(ctx, text, left + Math.floor((width - textWidth(text)) / 2), y);
  drawPlate(ctx, plateX, 3, plateW, 10);
  centred(`${date.weekday.toUpperCase()}. ${date.day}`, 6);
  drawPlate(ctx, plateX, 14, plateW, 11);
  // The weather icon sits on a little sky-coloured tile so the pale moon and mist show up.
  const tile = weather === 'rain' ? '#6f7c8c' : weather === 'mist' ? '#c3cdd5' : night ? '#2c3576' : '#7ec3ec';
  fill(ctx, C.outline, plateX + 2, 15, 11, 9);
  fill(ctx, tile, plateX + 3, 16, 9, 7);
  drawIcon(ctx, weather ?? (night ? 'moon' : 'sun'), plateX + 4, 16);
  centred(hour === null ? 'NO TIME' : phaseAt(hour).label.toUpperCase(), 17, plateX + 14, plateW - 15);
  drawPlate(ctx, plateX, 26, plateW, 9);
  centred(hour === null ? '--:--' : fixed ? 'ALWAYS' : clockText(hour), 28);
}

// hour: the game hour, or null when the map has no time of day. fixed: the time never changes on this map.
// weather: 'rain', 'mist' or null (clear). date: { weekday, day }.
export default function DayHud({ hour, fixed, date, weather, dayMinutes }) {
  const canvasRef = useRef(null);
  const clock = hour === null ? null : clockText(hour); // redraw only when the shown time changes
  const phaseId = hour === null ? null : phaseAt(hour).id;
  const skyStep = hour === null ? null : Math.floor(hour * 4); // the sun moves in quarter-hour steps
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paintPixelCanvas(canvas, HUD_WIDTH, HUD_HEIGHT, (ctx) => drawHud(ctx, { hour, fixed, date, weather }));
  }, [clock, phaseId, skyStep, fixed, date.weekday, date.day, weather]);

  const weatherLabel = weather === 'rain' ? 'Rainy' : weather === 'mist' ? 'Misty' : 'Clear';
  const label = `${date.weekday} ${date.day}, ${weatherLabel}${phaseId ? `, ${phaseAt(hour).label}` : ''}${clock && !fixed ? `, ${clock}` : ''}`;
  return (
    <div className="day-hud" role="status" aria-label={label} title={fixed ? 'The time of day never changes here' : `One game day lasts ${dayMinutes} minutes`}>
      <canvas ref={canvasRef} />
    </div>
  );
}
