// Weather: each map's setting, the shared random schedule, and the pixel art for rain and mist.

// map.weather: { mode: 'off' } (the default), { mode: 'fixed', kind } or { mode: 'random' }.
export const WEATHER_MODES = ['off', 'fixed', 'random'];
export const WEATHER_KINDS = [
  { id: 'rain', label: 'Rainy', icon: '🌧' },
  { id: 'mist', label: 'Misty', icon: '🌫' },
];

// Random weather changes every few real minutes. It's worked out from the clock and the map, so every
// player sees the same weather at the same time. Half the time it's clear.
const SLOT_MS = 4 * 60 * 1000;
const FADE_MS = 15 * 1000;
const RANDOM_CHANCES = [['clear', 0.5], ['rain', 0.25], ['mist', 0.25]];

// The weather setting in force on a map (a map in a region uses the region's).
export function weatherOf(map, root) {
  const source = (map?.region && root?.regions?.[map.region]) || map;
  const weather = source?.weather ?? {};
  const mode = WEATHER_MODES.includes(weather.mode) ? weather.mode : 'off';
  const kind = WEATHER_KINDS.some((k) => k.id === weather.kind) ? weather.kind : 'rain';
  return { mode, kind };
}

// What random weather is worked out from: the region (so all its maps match), or the map itself.
export function weatherSeed(map, root, mapId) {
  return map?.region && root?.regions?.[map.region] ? `region:${map.region}` : mapId;
}

// A number from 0 to 1 that's the same for the same map and time slot.
function slotRandom(mapId, slot) {
  let h = 2166136261;
  for (const c of `${mapId}:${slot}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function slotKind(mapId, slot) {
  let r = slotRandom(mapId, slot);
  for (const [kind, chance] of RANDOM_CHANCES) {
    if (r < chance) return kind;
    r -= chance;
  }
  return 'clear';
}

// The weather right now: { kind: 'clear' | 'rain' | 'mist', strength: 0 to 1 }.
export function weatherAt(weather, mapId, now = Date.now()) {
  if (weather.mode === 'off') return { kind: 'clear', strength: 0 };
  if (weather.mode === 'fixed') return { kind: weather.kind, strength: 1 };
  const slot = Math.floor(now / SLOT_MS);
  const kind = slotKind(mapId, slot);
  if (kind === 'clear') return { kind, strength: 0 };
  // Fades in and out at the edges of its slot, unless the slot next to it has the same weather.
  const t = now - slot * SLOT_MS;
  const fadeIn = slotKind(mapId, slot - 1) === kind ? 1 : Math.min(1, t / FADE_MS);
  const fadeOut = slotKind(mapId, slot + 1) === kind ? 1 : Math.min(1, (SLOT_MS - t) / FADE_MS);
  return { kind, strength: Math.min(fadeIn, fadeOut) };
}

// The colour wash weather adds over the world (under the day cycle's light).
export const WEATHER_WASH = { rain: { color: 0x3c4a5c, alpha: 0.22 }, mist: { color: 0xdfe6ea, alpha: 0.18 } };

// A tileable fog texture: soft pale clouds with holes, drawn small so it shows as chunky pixels in game.
export function fogCanvas(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 12 + random() * 26;
    const a = 0.12 + random() * 0.16;
    // Drawn at every wrapped position so the texture tiles without seams.
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, `rgba(236, 242, 245, ${a})`);
        g.addColorStop(1, 'rgba(236, 242, 245, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  }
  return canvas;
}
