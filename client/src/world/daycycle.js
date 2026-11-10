// The day cycle: one shared game clock (the same time for every player), lighting for each hour, and
// the names of the parts of the day.

// How long one game day lasts in real minutes; the creator picks it for the whole world (one shared clock,
// so travelling between maps never jumps the time).
export const DEFAULT_DAY_MINUTES = 14;
export const MIN_DAY_MINUTES = 1;
export const MAX_DAY_MINUTES = 30;

// Each map's time of day (map.time): { mode: 'cycle' } (the default), { mode: 'fixed', phase } or { mode: 'off' }
// (no lighting at all). Building interiors follow the map they are on.
export const TIME_MODES = ['cycle', 'fixed', 'off'];
export const FIXED_PHASES = ['morning', 'afternoon', 'evening', 'night'];
// The hour whose light a fixed time of day shows.
const FIXED_HOURS = { morning: 8, afternoon: 14, evening: 18.5, night: 0 };

// The game hour (0 up to 24) at a real time.
export function gameHour(now = Date.now(), minutes = DEFAULT_DAY_MINUTES) {
  const length = minutes * 60 * 1000;
  return ((now % length) / length) * 24;
}

// The time settings in force on a map: { mode, phase, minutes }. A map in a region uses the region's.
export function timeOf(map, root) {
  const source = (map?.region && root?.regions?.[map.region]) || map;
  const time = source?.time ?? {};
  const mode = TIME_MODES.includes(time.mode) ? time.mode : 'cycle';
  const phase = FIXED_PHASES.includes(time.phase) ? time.phase : 'night';
  const minutes = Math.min(MAX_DAY_MINUTES, Math.max(MIN_DAY_MINUTES, Math.round(root?.dayMinutes ?? DEFAULT_DAY_MINUTES)));
  // Night style: 'peaceful' (dim but everything visible) or 'dark' (only the light around the player shows).
  const night = time.night === 'dark' ? 'dark' : 'peaceful';
  return { mode, phase, minutes, night };
}

// How dark a "darkness night" is now, from 0 (none) to 1 (full night), following the day cycle's light so
// it creeps in at dusk and lifts at dawn. Only on maps set to dark nights; a fixed time other than night
// is never dark.
export function darknessAt(time, now = Date.now()) {
  if (time.night !== 'dark' || time.mode === 'off' || (time.mode === 'fixed' && time.phase !== 'night')) return 0;
  const { alpha } = lightAt(hourFor(time, now));
  return Math.max(0, Math.min(1, (alpha - 0.2) / 0.35));
}

// The hour to light the map with now, or null when the time of day is off.
export function hourFor(time, now = Date.now()) {
  if (time.mode === 'off') return null;
  if (time.mode === 'fixed') return FIXED_HOURS[time.phase];
  return gameHour(now + (time.offset ?? 0), time.minutes);
}

export const PHASES = [
  { id: 'night', label: 'Night', icon: '🌙', from: 0, to: 5 },
  { id: 'morning', label: 'Morning', icon: '🌅', from: 5, to: 12 },
  { id: 'afternoon', label: 'Afternoon', icon: '☀️', from: 12, to: 17 },
  { id: 'evening', label: 'Evening', icon: '🌇', from: 17, to: 20 },
  { id: 'night', label: 'Night', icon: '🌙', from: 20, to: 24 },
];

export const phaseAt = (hour) => PHASES.find((p) => hour >= p.from && hour < p.to) ?? PHASES[0];

// The game calendar: a 7-day week and 28-day months, counted from the same shared clock, so every player
// sees the same date. { weekday: 'Mon', day: 1 to 28 }.
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAYS_PER_MONTH = 28;

export function gameDate(now = Date.now(), minutes = DEFAULT_DAY_MINUTES) {
  const dayIndex = Math.floor(now / (minutes * 60 * 1000));
  return { weekday: WEEKDAYS[dayIndex % 7], day: (dayIndex % DAYS_PER_MONTH) + 1 };
}

// "7:30 AM"
export function clockText(hour) {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60 / 10) * 10; // in 10-minute steps, so it doesn't flicker
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// A colour wash over the world through the day: [hour, colour, strength]. Between keys it blends smoothly.
const LIGHT_KEYS = [
  [0, 0x0b1030, 0.55], // night: deep blue
  [4.5, 0x0b1030, 0.55],
  [6, 0xff9a6a, 0.22], // dawn: rosy
  [8, 0xffe0b0, 0.07], // soft morning light
  [10.5, 0xffe0b0, 0], // clear day
  [15.5, 0xffc870, 0],
  [17.5, 0xff8a3d, 0.2], // golden evening
  [19.5, 0x3a2a6a, 0.4], // dusk: purple
  [21, 0x0b1030, 0.55],
  [24, 0x0b1030, 0.55],
];

const mix = (a, b, t) => Math.round(a + (b - a) * t);

// The wash at an hour: { color, alpha }. Indoors it's gentler (lamps are lit).
export function lightAt(hour, indoors = false) {
  const i = LIGHT_KEYS.findIndex(([h], k) => hour >= h && hour < LIGHT_KEYS[k + 1]?.[0]);
  const [h0, c0, a0] = LIGHT_KEYS[Math.max(0, i)];
  const [h1, c1, a1] = LIGHT_KEYS[Math.max(0, i) + 1] ?? LIGHT_KEYS[LIGHT_KEYS.length - 1];
  const t = h1 > h0 ? (hour - h0) / (h1 - h0) : 0;
  const color = (mix(c0 >> 16, c1 >> 16, t) << 16) | (mix((c0 >> 8) & 255, (c1 >> 8) & 255, t) << 8) | mix(c0 & 255, c1 & 255, t);
  const alpha = (a0 + (a1 - a0) * t) * (indoors ? 0.4 : 1);
  return { color, alpha };
}

// A soft round glow (canvas) for the player's lantern after dark.
export function lanternCanvas(radius = 56) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = radius * 2;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  gradient.addColorStop(0, 'rgba(255, 214, 150, 0.55)');
  gradient.addColorStop(0.45, 'rgba(255, 190, 120, 0.25)');
  gradient.addColorStop(1, 'rgba(255, 170, 100, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, radius * 2, radius * 2);
  return canvas;
}
