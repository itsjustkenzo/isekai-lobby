import {validSurfacePlacement} from '../interiorGeometry.js';
import { liquidCell } from './liquidTextures.js';
import { setPaintTextures, paintTextures } from './paintTextures.js';
import { hash } from './art.js';

export const WORLD_WIDTH = 40;
export const WORLD_HEIGHT = 24;
export const FOREST_DEPTH = 2;

export const TERRAIN_TOOLS = [
  { id: 'g', label: 'Grass' },
  { id: 'd', label: 'Dirt' },
  { id: 'w', label: 'Water' },
  { id: 's', label: 'Stone' },
  { id: 'a', label: 'Sand' },
];

// Floors for building interiors.
export const FLOOR_TOOLS = [
  { id: 'o', label: 'Wood floor' },
  { id: 's', label: 'Stone floor' },
  { id: 'c', label: 'Carpet' },
];

export const DECOR_TOOLS = [
  { id: 'T', label: 'Tree' },
  { id: 'P', label: 'Pine' },
  { id: 'B', label: 'Bush' },
  { id: 'R', label: 'Rock' },
  { id: 'F', label: 'Flowers' },
  { id: 'S', label: 'Stump' },
];

// ---- NPC characters --------------------------------------------------------------------
// The creator's characters (made in the editor's Characters tab): { id, name, description, prompt, gender,
// spriteUrl }. Each map or room lists where they stand: world.npcs = [{ n: character id, x, y, f? }], one
// character per walkable tile; they block the way like a solid decoration.
let npcRegistry = new Map();
export function setNpcs(list) { npcRegistry = new Map(list.map((npc) => [npc.id, npc])); }
export const npcById = (id) => npcRegistry.get(id) ?? null;
export const npcTool = (npc) => `npc:${npc.id}`;
export const npcFromTool = (tool) => (typeof tool === 'string' && tool.startsWith('npc:') ? npcById(tool.slice(4)) : null);

// The index in world.npcs of the character standing on (x, y), or -1.
export const npcAt = (world, x, y) => (world.npcs ?? []).findIndex((p) => p.x === x && p.y === y);

// Whether a character can stand on (x, y): a walkable tile that isn't an exit mat, travel area or taken.
export function npcFits(world, x, y) {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height || isLocked(world, x, y) || isBlocked(world, x, y)) return false;
  return !['E', 'G'].includes(world.objects[y * world.width + x]) && npcAt(world, x, y) < 0;
}

// Drops placements of characters that have been deleted, on every map and room.
export function pruneNpcs(root) {
  for (const { world } of listMaps(root)) {
    for (const w of [world, ...Object.values(world.interiors ?? {})]) {
      if (w.npcs) w.npcs = w.npcs.filter((p) => npcById(p.n));
    }
  }
}

// Games players can play in the world, switched on in the editor's Game tab: world.games on the main world.
// The tabletop is a table (object "A") placed like a decoration; walking into one asks to play.
export const TABLETOP = 'A';
export const GAME_TOOLS = [{ id: TABLETOP, label: 'Tabletop' }];
export function gamesOf(root) {
  return { tabletop: root?.games?.tabletop === true };
}

export function restpointsOf(root) {
  return { enabled: root?.restpoints?.enabled === true, assets: root?.restpoints?.assets ?? [] };
}

export function listRestpoints(world, root) {
  const setting = restpointsOf(root);
  if (!setting.enabled) return [];
  const marked = (world.restCells ?? []).map((i) => [i % world.width, Math.floor(i / world.width)]);
  return marked.length ? [{ key: 'rest-area', name: 'Restpoint', tiles: marked }] : [];
}

// The tabletops on a map or room: [{ key, x, y, tiles: [[x, y]] }] (a table is one tile).
export function listTabletops(world) {
  const tables = [];
  world.objects.forEach((o, i) => {
    if (o !== TABLETOP) return;
    const x = i % world.width;
    const y = Math.floor(i / world.width);
    tables.push({ key: `${x},${y}`, x, y, tiles: [[x, y]] });
  });
  return tables;
}

// The table on (x, y), or null.
export function tableAt(world, x, y) {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return null;
  return world.objects[y * world.width + x] === TABLETOP ? { x, y } : null;
}

// Whether a table can go on (x, y): inside the room or map, dry, and not on a building, building piece,
// furniture or another table (small decorations like flowers are replaced).
export function tabletopFits(world, x, y) {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height || isLocked(world, x, y)) return false;
  const i = y * world.width + x;
  return world.terrain[i] !== 'w' && !isBuildingTile(world.objects[i]) && !isStructure(world.objects[i]) && !occupiedAt(world, i) && !tableAt(world, x, y);
}

// Multi-tile buildings, sized in tiles. A building is saved as its letter on the bottom-left tile of
// its footprint, with every other footprint tile marked PART_OF_BUILDING.
export const BUILDINGS = [
  { id: 'H', label: 'Cottage', width: 5, height: 4 },
  { id: 'C', label: 'Cabin', width: 5, height: 4 },
  { id: 'K', label: 'Stone house', width: 6, height: 4 },
];
export const PART_OF_BUILDING = '#';

// Player-designed houses (from the server) are saved as their slot digit, 0–9, and share one footprint size.
// Keep in sync with HOUSE_SPRITE in server/house.js (80×96px = 5 tiles wide, roof 2 tiles above a 4-tile-deep footprint).
export const CUSTOM_HOUSE = { width: 5, height: 4 };
let customHouses = [];

export function setCustomHouses(houses) {
  customHouses = houses.map((h) => ({ id: String(h.slot), label: h.name, ...CUSTOM_HOUSE, custom: true,...(h.originalArtwork?{originalArtwork:h.originalArtwork}:{}), spriteUrl: h.spriteUrl }));
}

export const customBuildings = () => customHouses;
const allBuildings = () => [...BUILDINGS, ...customHouses];

// Build kit: paintable building pieces, one per tile. Walls and roofs join up with matching neighbours
// when drawn; doors are placed two tiles tall so they are character-height.
export const STRUCTURE_TOOLS = [
  { id: 'M', label: 'Plaster wall', kind: 'wall' },
  { id: 'L', label: 'Log wall', kind: 'wall' },
  { id: 'N', label: 'Stone wall', kind: 'wall' },
  // Each roof colour comes in two styles. A connected roof is drawn as one shape: hip (a trapezoid
  // with sloped sides) or gable (a triangle peaking in the middle).
  { id: 'b', label: 'Blue roof', kind: 'roof', style: 'hip', color: 'slate' },
  { id: 'r', label: 'Red roof', kind: 'roof', style: 'hip', color: 'red' },
  { id: 'e', label: 'Teal roof', kind: 'roof', style: 'hip', color: 'teal' },
  { id: 'u', label: 'Blue roof', kind: 'roof', style: 'gable', color: 'slate' },
  { id: 'q', label: 'Red roof', kind: 'roof', style: 'gable', color: 'red' },
  { id: 'v', label: 'Teal roof', kind: 'roof', style: 'gable', color: 'teal' },
  // Fences connect to neighbouring fence tiles: rails left/right, a continuous run up/down.
  { id: 'f', label: 'Wood fence', kind: 'fence' },
  { id: 'p', label: 'Picket fence', kind: 'fence' },
  { id: 'n', label: 'Stone wall', kind: 'fence' },
  { id: 'k', label: 'Black fence', kind: 'fence' },
  { id: 'j', label: 'Fieldstone wall', kind: 'fence' },
  { id: 'z', label: 'Brick wall', kind: 'fence' },
  { id: 'D', label: 'Door', kind: 'door' },
  { id: 'O', label: 'Window', kind: 'window' },
  { id: 'Y', label: 'Chimney', kind: 'chimney' },
  // Interior-only (not in the toolbar): the dark edge around a room, and the mat players exit through.
  { id: 'X', label: 'Room edge', kind: 'boundary', hidden: true },
  { id: 'E', label: 'Exit', kind: 'exit', hidden: true },
  // A travel area tile: walkable and invisible in play; takes players to another map (Travel point tool).
  { id: 'G', label: 'Travel point', kind: 'travel', hidden: true },
];
export const structureKind = (object) => STRUCTURE_TOOLS.find((t) => t.id === object)?.kind ?? null;
export const isStructure = (object) => Boolean(structureKind(object));
export const structureTool = (object) => STRUCTURE_TOOLS.find((t) => t.id === object) ?? null;
export const ROOF_STYLES = ['hip', 'gable'];

// The same roof colour in the other style (used when switching the editor's roof style).
export function roofInStyle(id, style) {
  const tool = structureTool(id);
  if (tool?.kind !== 'roof') return id;
  return STRUCTURE_TOOLS.find((t) => t.kind === 'roof' && t.color === tool.color && t.style === style)?.id ?? id;
}

const isRoofTile = (object) => ['roof', 'chimney'].includes(structureKind(object));

// The whole connected roof (roof and chimney tiles, 4-connected) containing tile (x, y): its tile
// indices, its bounding box in tiles, and its style (the most common style among its roof tiles).
export function roofRegion(world, x, y) {
  const start = y * world.width + x;
  if (!isRoofTile(world.objects[start])) return null;
  const tiles = new Set([start]);
  const stack = [start];
  const box = { left: x, right: x, top: y, bottom: y };
  const styles = { hip: 0, gable: 0 };
  while (stack.length) {
    const i = stack.pop();
    const tx = i % world.width;
    const ty = Math.floor(i / world.width);
    box.left = Math.min(box.left, tx); box.right = Math.max(box.right, tx);
    box.top = Math.min(box.top, ty); box.bottom = Math.max(box.bottom, ty);
    const style = structureTool(world.objects[i])?.style;
    if (style) styles[style]++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx;
      const ny = ty + dy;
      const j = ny * world.width + nx;
      if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height || tiles.has(j) || !isRoofTile(world.objects[j])) continue;
      tiles.add(j);
      stack.push(j);
    }
  }
  return { tiles, box, style: styles.gable > styles.hip ? 'gable' : 'hip' };
}
const isPaintedStructure = (tool) => ['wall', 'roof', 'fence'].includes(structureKind(tool));

// Placed assets: player library items (props, fences, pots...) from the server, placed any number of
// times. A world keeps them in world.placed as { a: assetId, x, y } with (x, y) the footprint's
// bottom-left tile; world.occupied maps each tile index to the placement covering it (or null).
export const ASSET_TOOL = 'asset:';
let assetRegistry = new Map();

export function setAssets(list) {
  assetRegistry = new Map(list.map((asset) => [asset.id, asset]));
}

export const assetById = (id) => assetRegistry.get(id);
export const libraryAssets = () => [...assetRegistry.values()];
export const assetTool = (asset) => ASSET_TOOL + asset.id;
export const assetFromTool = (tool) => (typeof tool === 'string' && tool.startsWith(ASSET_TOOL) ? assetById(tool.slice(ASSET_TOOL.length)) : null);

// How new assets are placed. turn: null (as drawn), 'v' (the AI-drawn vertical version, once it
// exists) or 't' (the sprite rotated 90° clockwise, best for flat things like rugs and paths);
// flipped mirrors left-to-right. A placement saves these as r: 1 ('v'), t: 1 ('t') and f: 1.
export const TURNS = { VERTICAL: 'v', ROTATED: 't' };
let orientation = { turn: null, flipped: false };
export function setAssetOrientation(next) {
  orientation = { turn: next.turn ?? null, flipped: Boolean(next.flipped) };
}

export const placementTurn = (placement) => (placement.r ? TURNS.VERTICAL : placement.t ? TURNS.ROTATED : null);

// An asset's footprint in tiles; turned assets swap width and height. The vertical turn only
// applies once the asset has a vertical version.
export function assetDims(asset, turn) {
  const swapped = turn === TURNS.ROTATED || (turn === TURNS.VERTICAL && asset.sideSpriteUrl);
  return swapped ? { width: asset.height, height: asset.width } : { width: asset.width, height: asset.height };
}

function assetTiles(asset, ax, ay, turn = null) {
  const { width, height } = assetDims(asset, turn);
  const tiles = [];
  for (let y = ay - height + 1; y <= ay; y++) {
    for (let x = ax; x < ax + width; x++) tiles.push([x, y]);
  }
  return tiles;
}

export function rebuildOccupancy(world) {
  world.occupied = new Array(world.width * world.height).fill(null);
  for (const placement of world.placed) {
    if(placement.supportAssetId)continue;
    const asset = assetById(placement.a);
    if (!asset) continue;
    for (const [x, y] of assetTiles(asset, placement.x, placement.y, placementTurn(placement))) world.occupied[y * world.width + x] = placement;
  }
}

const occupiedAt = (world, i) => Boolean(world.occupied?.[i]);

// Where an asset goes when the cursor is on (cx, cy): centred horizontally, bottom row on the cursor.
// Valid only on free tiles: in bounds, editable, not water, and empty of decorations, buildings and other assets.
// Inside buildings, the back of an asset may stand against the back wall: its footprint can overlap the
// wall rows (drawn over the wall, visual only). Outdoors there is no back wall, so nothing changes.
const onBackWall = (world, x, y) => Boolean(world.interior) && y >= 0 && y < INTERIOR_WALL_ROWS && x >= 1 && x < world.width - 1;

// Whether an asset's footprint can cover this tile.
function assetTileFree(world, x, y) {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return false;
  const i = y * world.width + x;
  if (onBackWall(world, x, y)) return !occupiedAt(world, i);
  if (isLocked(world, x, y)) return false;
  return world.terrain[i] !== 'w' && world.objects[i] === '.' && !occupiedAt(world, i) && !tableAt(world, x, y);
}

// Assets may sit entirely on the back wall (for example, windows and wall decorations).
const assetFits = (world, tiles) => tiles.length > 0 && tiles.every(([x, y]) => assetTileFree(world, x, y));

export function assetPlacement(world, asset, cx, cy, turn = orientation.turn) {
  const ax = cx - Math.floor((assetDims(asset, turn).width - 1) / 2);
  const tiles = assetTiles(asset, ax, cy, turn);
  return { anchor: [ax, cy], tiles, valid: assetFits(world, tiles) };
}

// Drops placements whose asset is no longer in the player's library, or which no longer fit.
export function rebuildPlacements(world) {
  const kept = [];
  world.placed = world.placed ?? [];
  world.occupied = new Array(world.width * world.height).fill(null);
  const supported=world.placed.filter(p=>p.supportAssetId);
  for (const placement of world.placed) {
    if(placement.supportAssetId)continue;
    const asset = assetById(placement.a);
    if (!asset) continue;
    // A turned placement whose asset has no vertical version falls back to the normal orientation.
    if (placement.r && !asset.sideSpriteUrl) delete placement.r;
    const tiles = assetTiles(asset, placement.x, placement.y, placementTurn(placement));
    if (!assetFits(world, tiles)) continue;
    kept.push(placement);
    for (const [x, y] of tiles) world.occupied[y * world.width + x] = placement;
  }
  world.placed = [...kept,...supported.filter(p=>validSurfacePlacement(p,kept,libraryAssets()))];
}

export const ERASER = 'erase';
export const BRUSH_SIZES = [{ size: 1, label: 'S' }, { size: 3, label: 'M' }, { size: 5, label: 'L' }];

const isTerrainTool = (tool) => TERRAIN_TOOLS.some((t) => t.id === tool) || FLOOR_TOOLS.some((t) => t.id === tool);
export const buildingById = (id) => allBuildings().find((b) => b.id === id);
const isBuildingTile = (object) => object === PART_OF_BUILDING || Boolean(buildingById(object));

export function isLocked(world, x, y) {
  // Generated exteriors use the reference's edge terrain, not the regular world's forest reserve.
  if (world.generatedAssets && !world.interior) return x < 0 || y < 0 || x >= world.width || y >= world.height;
  if (world.interior) return x < 1 || x >= world.width - 1 || y < INTERIOR_WALL_ROWS || y >= world.height - 1;
  return x < FOREST_DEPTH || y < FOREST_DEPTH || x >= world.width - FOREST_DEPTH || y >= world.height - FOREST_DEPTH;
}

// ---- Interiors --------------------------------------------------------------------------
// An enterable building has an interior: a small room world of its own, edited like the outside world.
// The outside world keeps them in world.interiors, keyed by the building's entrance tile ("x,y": the
// bottom tile of its door). Players enter from the tile below the entrance and leave via the exit mat.
export const INTERIOR_SIZE = { width: 18, height: 12 };
const INTERIOR_WALL_ROWS = 3;
const INTERIOR_WALLS = { cottage: 'M', cabin: 'L', stone: 'N' };
const INTERIOR_FLOORS = { cottage: 'o', cabin: 'o', stone: 's' };
export const MAX_INTERIORS = 30;

export const entranceKey = (x, y) => `${x},${y}`;

// ---- Maps and travel points ---------------------------------------------------------------
// The main world can be expanded with extra outdoor maps (world.maps, keyed by id like "m1"), each with
// its own interiors. Any map or interior can hold travel points: areas of touching "G" tiles, invisible to
// players. An area's settings live in world.links["x,y"], keyed by its first tile in reading order:
// { name, to: map id ("main" or "m1"...), arrive: "x,y" of a tile in an area on that map, or null for
// that map's spawn point }.
export const MAIN_MAP = 'main';

// The in-game panels (HUD) the creator lets players see, for the whole world: world.hud on the main world.
export const HUD_PANELS = [
  { id: 'minimap', label: 'Mini map', icon: '🗺', hint: 'Bottom left: the map around the player' },
  { id: 'clock', label: 'Time & day', icon: '🕐', hint: 'Top right: date, time, weather' },
  { id: 'stats', label: 'Character stats', icon: '❤', hint: 'Bottom centre: portrait and health' },
];
// Which panels are shown: { minimap, clock, stats }, each on unless the creator turned it off.
export function hudOf(root) {
  return Object.fromEntries(HUD_PANELS.map(({ id }) => [id, root?.hud?.[id] !== false]));
}
export const TRAVEL_TOOL = 'G';
// Sets world.spawn = { x, y }, where players start on a map (and arrive by default when travelling there).
export const SPAWN_TOOL = 'spawn';

// Whether the spawn point can go on this tile: walkable, and not part of a travel area.
export function canSpawnAt(world, x, y) {
  return !isBlocked(world, x, y) && !['G', 'E'].includes(world.objects[y * world.width + x]);
}
export const MAX_MAPS = 10;

export function mapById(root, id) {
  return id === MAIN_MAP ? root : root.maps?.[id] ?? null;
}

export function listMaps(root) {
  return [{ id: MAIN_MAP, world: root }, ...Object.entries(root.maps ?? {}).map(([id, world]) => ({ id, world }))]
    .map(({ id, world }) => ({ id, world, name: world.name || (id === MAIN_MAP ? 'Main world' : 'Map') }));
}

// Sizes a creator can pick for a new map. "indoor" maps are rooms (back wall, floor, edges) with no exit
// mat: players reach and leave them through travel points.
export const MAP_PRESETS = [
  { id: 'small', label: 'Small interior', width: 20, height: 15, indoor: true, hint: 'A room: dungeon, shop, cave' },
  { id: 'medium', label: 'Medium location', width: 40, height: 30, hint: 'A meadow, beach or farm' },
  { id: 'large', label: 'Large outdoor location', width: 80, height: 60, hint: 'Forests, lakes, wide fields' },
  { id: 'town', label: 'Town', width: 100, height: 80, hint: 'Room for streets and many houses' },
];

export function createMap(root, name, presetId = 'medium') {
  const preset = MAP_PRESETS.find((p) => p.id === presetId) ?? MAP_PRESETS[1];
  let n = 1;
  while (root.maps?.[`m${n}`]) n++;
  const id = `m${n}`;
  const world = preset.indoor
    ? Object.assign(createInterior('cottage', name, preset, false), { indoorMap: true })
    : createDefaultWorld(preset.width, preset.height);
  Object.assign(world, { name: name || `Map ${n + 1}`, interiors: {}, links: {} });
  root.maps = { ...(root.maps ?? {}), [id]: world };
  return id;
}

// ---- Regions -----------------------------------------------------------------------------
// Maps can be grouped into regions: root.regions = { r1: { name, time, weather } } and map.region = 'r1'.
// Every map in a region shares the region's time of day and weather (random weather is worked out per
// region, so it rains on all of its maps together). Maps outside a region keep their own settings.
export const MAX_REGIONS = 10;
export const REGION_COLORS = ['#5aa9e6', '#7cc25a', '#f2a541', '#c77dd8', '#ef6f6f', '#3fbfb0', '#e6c84a', '#8d9cf0', '#f08fb8', '#9a8f86'];

// The regions in creation order: [{ id, region, color, maps: [{ id, name }] }].
export function listRegions(root) {
  return Object.entries(root.regions ?? {}).map(([id, region], i) => ({
    id, region, color: REGION_COLORS[i % REGION_COLORS.length],
    maps: listMaps(root).filter((m) => m.world.region === id).map(({ id: mapId, name }) => ({ id: mapId, name })),
  }));
}

// The region a map is in ({ id, region }), or null.
export function regionOfMap(root, mapId) {
  const id = mapById(root, mapId)?.region;
  return id && root.regions?.[id] ? { id, region: root.regions[id] } : null;
}

export function createRegion(root, name) {
  let n = 1;
  while (root.regions?.[`r${n}`]) n++;
  const id = `r${n}`;
  root.regions = { ...(root.regions ?? {}), [id]: { name: name || `Region ${n}`, time: { mode: 'cycle' }, weather: { mode: 'off' } } };
  return id;
}

// Moves a map into a region (or out of any, with null). The first map to join an empty region gives it its
// time and weather settings; a map that leaves keeps the region's, so nothing changes by surprise.
export function setMapRegion(root, mapId, regionId) {
  const map = mapById(root, mapId);
  if (!map) return;
  const current = regionOfMap(root, mapId);
  if (current) Object.assign(map, { time: { ...current.region.time }, weather: { ...current.region.weather } });
  if (!regionId || !root.regions?.[regionId]) { delete map.region; return; }
  const region = root.regions[regionId];
  const empty = !listMaps(root).some((m) => m.world.region === regionId);
  if (empty) Object.assign(region, { time: { ...(map.time ?? { mode: 'cycle' }) }, weather: { ...(map.weather ?? { mode: 'off' }) } });
  map.region = regionId;
}

// Deletes a region; its maps keep the region's time and weather as their own.
export function deleteRegion(root, regionId) {
  for (const m of listMaps(root)) if (m.world.region === regionId) setMapRegion(root, m.id, null);
  delete root.regions[regionId];
}

// Removes a map, and points any travel point that led there back to "not set".
export function deleteMap(root, id) {
  delete root.maps[id];
  for (const { world } of listMaps(root)) {
    for (const w of [world, ...Object.values(world.interiors ?? {})]) {
      for (const link of Object.values(w.links ?? {})) if (link.to === id) Object.assign(link, { to: null, arrive: null });
    }
  }
}

// Travel areas on a world, with their settings (a fresh area gets default ones). Each is
// { key, x, y: the tile nearest its middle (where travellers arrive), tiles: [[x, y]...], cells: Set of
// tile indices, link }. When areas merge or lose their first tile, the settings move to the new key.
export function travelPoints(world) {
  world.links ??= {};
  const { width, objects } = world;
  const seen = new Set();
  const points = [];
  for (let i = 0; i < objects.length; i++) {
    if (objects[i] !== 'G' || seen.has(i)) continue;
    // i is the area's first tile in reading order: any earlier tile would already have claimed it.
    const cells = new Set([i]);
    const queue = [i];
    while (queue.length) {
      const j = queue.pop();
      const x = j % width;
      for (const k of [j - width, j + width, x > 0 ? j - 1 : -1, x < width - 1 ? j + 1 : -1]) {
        if (k >= 0 && k < objects.length && objects[k] === 'G' && !cells.has(k)) { cells.add(k); queue.push(k); }
      }
    }
    cells.forEach((j) => seen.add(j));
    const tiles = [...cells].sort((a, b) => a - b).map((j) => [j % width, Math.floor(j / width)]);
    const key = entranceKey(tiles[0][0], tiles[0][1]);
    if (!world.links[key]) {
      // Settings left behind on a tile that's no longer a travel tile (its area merged, or lost its first
      // tile to Remove) belong to the area it was in or touching.
      const orphaned = (k) => {
        if (!world.links[k] || objects[tileIndex(world, k)] === 'G') return false;
        const [ox, oy] = k.split(',').map(Number);
        return tiles.some(([x, y]) => Math.max(Math.abs(x - ox), Math.abs(y - oy)) <= 2);
      };
      const adopted = tiles.map(([x, y]) => entranceKey(x, y)).find((k) => world.links[k]) ?? Object.keys(world.links).find(orphaned);
      world.links[key] = adopted ? world.links[adopted] : { name: 'Travel point', to: null, arrive: null };
      if (adopted) delete world.links[adopted];
    }
    const mx = tiles.reduce((sum, [x]) => sum + x, 0) / tiles.length;
    const my = tiles.reduce((sum, [, y]) => sum + y, 0) / tiles.length;
    const [x, y] = tiles.reduce((best, t) => (Math.hypot(t[0] - mx, t[1] - my) < Math.hypot(best[0] - mx, best[1] - my) ? t : best));
    points.push({ key, x, y, tiles, cells, link: world.links[key] });
  }
  return points;
}

// The travel area covering tile (x, y), or null.
export function travelAreaAt(world, x, y) {
  return travelPoints(world).find((p) => p.cells.has(y * world.width + x)) ?? null;
}

// The travel area that `area` (on any map) brings players into, or null when they arrive at the spawn point.
export function arrivalArea(root, area) {
  const destination = area.link.to && mapById(root, area.link.to);
  if (!destination || !area.link.arrive) return null;
  return travelAreaAt(destination, ...area.link.arrive.split(',').map(Number));
}

// Whether the path through `area` on map fromId is two-way: its arrival area leads straight back into it.
export function isTwoWay(root, fromId, area) {
  const back = arrivalArea(root, area);
  return Boolean(back && back.link.to === fromId && back.link.arrive && area.cells.has(tileIndex(mapById(root, fromId), back.link.arrive)));
}

// Makes the arrival area lead back into `area` (on) or clears its destination (off).
export function setTwoWay(root, fromId, area, on) {
  const back = arrivalArea(root, area);
  if (!back) return;
  if (!on) {
    Object.assign(back.link, { to: null, arrive: null });
    return;
  }
  const fromName = listMaps(root).find((m) => m.id === fromId)?.name ?? 'Map';
  Object.assign(back.link, { to: fromId, arrive: area.key, ...(back.link.name === 'Travel point' ? { name: `Back to ${fromName}`.slice(0, 40) } : {}) });
}

// Fills a rectangle of tiles (corners in any order) with a travel area. Returns the changed tile indices.
export function placeTravelArea(world, x0, y0, x1, y1) {
  const changed = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) changed.push(...applyTool(world, TRAVEL_TOOL, x, y, 1));
  }
  travelPoints(world); // gives a new area its default settings
  return changed;
}

// Travel points players can use: their destination map exists. arriveAt is the pad they land on (or null
// for the destination map's starting spot).
// Without a chosen arrival area, players arrive in the destination's area that leads back to where they
// came from (preferring one that leads into this very area), and only otherwise at its spawn point.
export function activeTravel(world, root) {
  const fromId = listMaps(root).find((m) => m.world === world)?.id ?? null;
  return travelPoints(world).flatMap((point) => {
    const destination = point.link.to && mapById(root, point.link.to);
    if (!destination) return [];
    const areas = travelPoints(destination);
    const chosen = point.link.arrive && areas.find((p) => p.key === point.link.arrive || p.cells.has(tileIndex(destination, point.link.arrive)));
    const leadsBack = fromId && !point.link.arrive ? areas.filter((p) => p.link.to === fromId) : [];
    const arrive = chosen || leadsBack.find((p) => p.link.arrive && point.cells.has(tileIndex(world, p.link.arrive))) || leadsBack[0];
    const name = listMaps(root).find((m) => m.id === point.link.to).name;
    return [{ ...point, destination: point.link.to, destinationName: name, arriveAt: arrive ? { x: arrive.x, y: arrive.y, key: arrive.key } : null }];
  });
}
const tileIndex = (world, key) => { const [x, y] = key.split(',').map(Number); return y * world.width + x; };

export const exitTile = (interior) => ({ x: Math.floor(interior.width / 2), y: interior.height - 1 });

// A fresh room: a plain back wall in the building's material, a floor, dark edges, and an exit mat.
// size: tiles (building interiors use INTERIOR_SIZE); withExit: false for indoor maps, which players
// leave through travel points instead of an exit mat.
export function createInterior(style = 'cottage', name = 'House', size = INTERIOR_SIZE, withExit = true) {
  const { width, height } = size;
  const room = { width, height, terrain: [], objects: [], placed: [], interior: true, enabled: true, name, style };
  const wall = INTERIOR_WALLS[style] ?? 'M';
  const exit = exitTile(room);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      room.terrain.push(INTERIOR_FLOORS[style] ?? 'o');
      let object = '.';
      if (x === 0 || x === width - 1 || y === height - 1) object = 'X';
      else if (y < INTERIOR_WALL_ROWS) object = wall;
      if (withExit && x === exit.x && y === exit.y) object = 'E';
      room.objects.push(object);
    }
  }
  rebuildOccupancy(room);
  return room;
}

// Where a building's door is: { key, x, y, label, style } for the building or build-kit door covering (x, y).
export function entranceAt(world, x, y) {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return null;
  const found = findBuilding(world, x, y);
  if (found) {
    const { building, anchor: [ax, ay] } = found;
    const ex = ax + Math.floor((building.width - 1) / 2);
    const style = building.id === 'C' ? 'cabin' : building.id === 'K' ? 'stone' : 'cottage';
    return { key: entranceKey(ex, ay), x: ex, y: ay, label: building.label, style, footprint: footprint(building, ax, ay) };
  }
  if (world.objects[y * world.width + x] === 'D') {
    let by = y;
    while (by + 1 < world.height && world.objects[(by + 1) * world.width + x] === 'D') by++;
    let ty = y;
    while (ty - 1 >= 0 && world.objects[(ty - 1) * world.width + x] === 'D') ty--;
    const tiles = [];
    for (let dy = ty; dy <= by; dy++) tiles.push([x, dy]);
    const wall = [-1, 1].map((dx) => world.objects[by * world.width + x + dx]).find((o) => 'MLN'.includes(o) && o !== '');
    return { key: entranceKey(x, by), x, y: by, label: 'House', style: wall === 'L' ? 'cabin' : wall === 'N' ? 'stone' : 'cottage', footprint: tiles };
  }
  return null;
}

// Enterable entrances that still have a building at their door, with their interior.
export function activeEntrances(world) {
  return Object.entries(world.interiors ?? {}).flatMap(([key, interior]) => {
    if (!interior.enabled) return [];
    const [x, y] = key.split(',').map(Number);
    const entrance = entranceAt(world, x, y);
    return entrance && entrance.key === key ? [{ ...entrance, interior }] : [];
  });
}

export function createDefaultWorld(width = WORLD_WIDTH, height = WORLD_HEIGHT) {
  const world = { width, height, terrain: [], objects: [], placed: [] };
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      world.terrain.push('g');
      world.objects.push(isLocked(world, x, y) ? (hash(x, y, 5) < 0.5 ? 'T' : 'P') : '.');
    }
  }
  rebuildOccupancy(world);
  return world;
}

// Rooms saved at an older, smaller size are enlarged: a fresh room at the current size, with the old
// room's floor, furniture and travel pads kept in place (relative to the back wall and left side).
function enlargeRoom(saved) {
  const room = createInterior(saved.style, saved.name);
  for (let y = INTERIOR_WALL_ROWS; y < saved.height - 1; y++) {
    for (let x = 1; x < saved.width - 1; x++) {
      room.terrain[y * room.width + x] = saved.terrain[y * saved.width + x];
      room.objects[y * room.width + x] = saved.objects[y * saved.width + x];
    }
  }
  return { ...saved, ...toSaved(room), placed: saved.placed ?? [], npcs: saved.npcs ?? [], paint: Object.fromEntries(Object.entries(saved.paint ?? {}).map(([i, value]) => [Math.floor(Number(i) / saved.width) * room.width + Number(i) % saved.width, { ...value }])), restCells: (saved.restCells ?? []).map((i) => Math.floor(i / saved.width) * room.width + i % saved.width), links: saved.links ?? {}, enabled: saved.enabled };
}

// Insert the third wall row above existing floors, preserving furniture, travel pads and restpoints.
function upgradeInterior(source) {
  if ((!source.interior && source.kind !== 'indoor') || source.wallRows === INTERIOR_WALL_ROWS) return source;
  const { width, height } = source;
  const shiftY = (y) => y >= 2 ? y + 1 : y;
  const shiftKey = (key) => { const [x, y] = key.split(',').map(Number); return `${x},${shiftY(y)}`; };
  const wall = INTERIOR_WALLS[source.style] ?? 'M';
  const wallRow = 'X' + wall.repeat(width - 2) + 'X';
  return {
    ...source, height: height + 1, wallRows: INTERIOR_WALL_ROWS,
    terrain: source.terrain.slice(0, width * 2) + (INTERIOR_FLOORS[source.style] ?? 'o').repeat(width) + source.terrain.slice(width * 2),
    objects: wallRow.repeat(3) + source.objects.slice(width * 2),
    placed: (source.placed ?? []).map((p) => ({ ...p, y: shiftY(p.y) })),
    npcs: (source.npcs ?? []).map((p) => ({ ...p, y: shiftY(p.y) })),
    restCells: (source.restCells ?? []).map((i) => shiftY(Math.floor(i / width)) * width + i % width),
    paint: Object.fromEntries(Object.entries(source.paint ?? {}).map(([i, value]) => [shiftY(Math.floor(Number(i) / width)) * width + Number(i) % width, { ...value }])),
    links: Object.fromEntries(Object.entries(source.links ?? {}).map(([key, link]) => [shiftKey(key), { ...link }])),
    ...(source.spawn ? { spawn: { ...source.spawn, y: shiftY(source.spawn.y) } } : {}),
  };
}

export function fromSaved(source) {
  source = upgradeInterior(source);
  if (source.textures) setPaintTextures(source.textures);
  const saved = source.interior && (source.width < INTERIOR_SIZE.width || source.height < INTERIOR_SIZE.height) ? enlargeRoom(source) : source;
  const world = { width: saved.width, height: saved.height, terrain: [...saved.terrain], objects: [...saved.objects], placed: (saved.placed ?? []).map((p) => ({ ...p })), npcs: (saved.npcs ?? []).map((p) => ({ ...p })) };
  if (saved.interior) Object.assign(world, { interior: true, enabled: saved.enabled !== false, name: saved.name ?? 'House', style: saved.style ?? 'cottage' });
  else if (saved.kind === 'indoor') Object.assign(world, { interior: true, indoorMap: true, name: saved.name ?? 'Room', style: saved.style ?? 'cottage' });
  else if (saved.name) world.name = saved.name;
  world.links = Object.fromEntries(Object.entries(saved.links ?? {}).map(([key, link]) => [key, { ...link }]));
  if (saved.spawn) world.spawn = { x: saved.spawn.x, y: saved.spawn.y };
  if (saved.time) world.time = { ...saved.time };
  if (saved.weather) world.weather = { ...saved.weather };
  if (saved.dayMinutes) world.dayMinutes = saved.dayMinutes;
  if (saved.hud) world.hud = { ...saved.hud };
  if (saved.games) world.games = { ...saved.games };
  world.paint = structuredClone(saved.paint ?? {});
  if (!world.interior) for (const finish of Object.values(world.paint)) if (finish.surface === 'floor') finish.surface = 'ground';
  if (saved.inventory) world.inventory = structuredClone(saved.inventory);
  if (saved.equipment) world.equipment = saved.equipment.map((item) => ({ ...item }));
  if (saved.generatedAssets) world.generatedAssets = saved.generatedAssets.map((asset) => ({ ...asset }));
  if (saved.sourceTerrainId) world.sourceTerrainId = saved.sourceTerrainId;
  if (saved.environmentReport) world.environmentReport = structuredClone(saved.environmentReport);
  if (saved.textures) world.textures = saved.textures.map((t) => ({ ...t }));
  world.farmCells = [...(saved.farmCells ?? [])];
  world.restCells = [...(saved.restCells ?? [])];
  if (saved.restpoints) world.restpoints = { enabled: saved.restpoints.enabled === true, assets: [...(saved.restpoints.assets ?? [])] };
  if (saved.region) world.region = saved.region;
  if (saved.regions) world.regions = Object.fromEntries(Object.entries(saved.regions).map(([id, r]) => [id, { name: r.name, time: { ...r.time }, weather: { ...r.weather } }]));
  rebuildFootprints(world);
  rebuildPlacements(world);
  if (!saved.interior) {
    world.interiors = Object.fromEntries(Object.entries(saved.interiors ?? {}).map(([key, room]) => [key, fromSaved({ ...room, interior: true })]));
    // Extra maps (only the main world has them); each is an outdoor world with its own interiors and links.
    if (saved.maps) world.maps = Object.fromEntries(Object.entries(saved.maps).map(([id, map]) => [id, fromSaved({ ...map, maps: undefined })]));
  }
  if (!source.interior && source.kind !== 'indoor') {
    for (const { world: map } of listMaps(world)) {
      for (const room of [map, ...Object.values(map.interiors ?? {})]) {
        for (const link of Object.values(room.links ?? {})) {
          const destination = source.maps?.[link.to];
          if (link.arrive && destination?.kind === 'indoor' && destination.wallRows !== INTERIOR_WALL_ROWS) {
            const [x, y] = link.arrive.split(',').map(Number);
            if (y >= 2) link.arrive = `${x},${y + 1}`;
          }
        }
      }
    }
  }
  return world;
}

// Re-marks every building's footprint from its bottom-left letter, so worlds saved when buildings
// had a different size still load cleanly. A building that no longer fits, or a player house that
// has since been deleted, is removed. Call setCustomHouses first.
export function rebuildFootprints(world) {
  world.objects = world.objects.map((o) => (o === PART_OF_BUILDING || (/[0-9]/.test(o) && !buildingById(o)) ? '.' : o));
  for (let i = 0; i < world.objects.length; i++) {
    const building = buildingById(world.objects[i]);
    if (!building) continue;
    const ax = i % world.width;
    const ay = Math.floor(i / world.width);
    world.objects[i] = '.';
    const tiles = footprint(building, ax, ay);
    const fits = tiles.every(([x, y]) => x >= 0 && y >= 0 && x < world.width && y < world.height && !isLocked(world, x, y)
      && world.terrain[y * world.width + x] !== 'w' && !isBuildingTile(world.objects[y * world.width + x]));
    if (!fits) continue;
    for (const [x, y] of tiles) world.objects[y * world.width + x] = PART_OF_BUILDING;
    world.objects[i] = building.id;
  }
}

export function toSaved(world) {
  const saved = { width: world.width, height: world.height, terrain: world.terrain.join(''), objects: world.objects.join(''), placed: world.placed.map(({ a, x, y, r, t, f, supportAssetId, supportX, supportY, elevation }) => ({ a, x, y,...(supportAssetId?{supportAssetId,supportX,supportY,elevation}:{}), ...(r ? { r: 1 } : {}), ...(t ? { t: 1 } : {}), ...(f ? { f: 1 } : {}) })) };
  if (world.npcs?.length) saved.npcs = world.npcs.map(({ n, x, y, f }) => ({ n, x, y, ...(f ? { f: 1 } : {}) }));
  // Settings of travel pads that still exist.
  const links = Object.fromEntries(travelPoints(world).map(({ key, link }) => [key, { name: link.name, to: link.to, arrive: link.arrive }]));
  if (Object.keys(links).length) saved.links = links;
  if (world.spawn && (!world.interior || world.indoorMap)) saved.spawn = { ...world.spawn };
  if (world.time && (!world.interior || world.indoorMap)) saved.time = { ...world.time };
  if (world.weather && (!world.interior || world.indoorMap)) saved.weather = { ...world.weather };
  if (world.dayMinutes) saved.dayMinutes = world.dayMinutes;
  if (world.hud) saved.hud = { ...world.hud };
  if (world.games) saved.games = { ...world.games };
  saved.paint = structuredClone(world.paint ?? {});
  if (world.inventory) saved.inventory = structuredClone(world.inventory);
  if (world.equipment) saved.equipment = world.equipment.map((item) => ({ ...item }));
  if (world.generatedAssets) saved.generatedAssets = world.generatedAssets.map((asset) => ({ ...asset }));
  if (world.sourceTerrainId) saved.sourceTerrainId = world.sourceTerrainId;
  if (world.environmentReport) saved.environmentReport = structuredClone(world.environmentReport);
  if (world.textures) saved.textures = world.textures.map((t) => ({ ...t }));
  saved.farmCells = [...(world.farmCells ?? [])];
  saved.restCells = [...(world.restCells ?? [])];
  if (world.restpoints) saved.restpoints = { enabled: world.restpoints.enabled, assets: [...world.restpoints.assets] };
  if (world.region && (!world.interior || world.indoorMap)) saved.region = world.region;
  if (world.regions && Object.keys(world.regions).length) {
    saved.regions = Object.fromEntries(Object.entries(world.regions).map(([id, r]) => [id, { name: r.name, time: { ...r.time }, weather: { ...r.weather } }]));
  }
  if (world.interior) saved.wallRows = INTERIOR_WALL_ROWS;
  if (world.indoorMap) return { ...saved, kind: 'indoor', name: world.name, style: world.style };
  if (world.interior) return { ...saved, interior: true, enabled: world.enabled, name: world.name, style: world.style };
  if (world.name) saved.name = world.name;
  if (world.interiors && Object.keys(world.interiors).length) {
    saved.interiors = Object.fromEntries(Object.entries(world.interiors).map(([key, room]) => [key, toSaved(room)]));
  }
  if (world.maps && Object.keys(world.maps).length) {
    saved.maps = Object.fromEntries(Object.entries(world.maps).map(([id, map]) => [id, toSaved(map)]));
  }
  return saved;
}

const BLOCKING_DECOR = new Set(['T', 'P', 'B', 'R', 'S', 'A']);

// Whether the player can't walk onto this tile (off-map, the forest edge, water, solid decorations or buildings).
export function isBlocked(world, x, y) {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return true;
  const i = y * world.width + x;
  if (liquidCell(world,x,y,world.textures??paintTextures())) return true;
  if (world.objects[i] === 'E' || world.objects[i] === 'G') return false; // exit mats and travel pads are walkable
  if (tableAt(world, x, y)) return true; // tabletops
  if (npcAt(world, x, y) >= 0) return true; // characters
  if (isLocked(world, x, y)) return true;
  if (world.terrain[i] === 'w' || BLOCKING_DECOR.has(world.objects[i]) || isBuildingTile(world.objects[i]) || isStructure(world.objects[i])) return true;
  const placement = world.occupied?.[i];
  return Boolean(placement && assetById(placement.a)?.solid);
}

// The footprint tiles of a building whose bottom-left tile is (ax, ay).
function footprint(building, ax, ay) {
  const tiles = [];
  for (let y = ay - building.height + 1; y <= ay; y++) {
    for (let x = ax; x < ax + building.width; x++) tiles.push([x, y]);
  }
  return tiles;
}

// Where a building goes when the cursor is on (cx, cy): centred horizontally, bottom row on the cursor.
export function buildingPlacement(world, building, cx, cy) {
  const ax = cx - Math.floor((building.width - 1) / 2);
  const tiles = footprint(building, ax, cy);
  const valid = tiles.every(([x, y]) => x >= 0 && y >= 0 && x < world.width && y < world.height && !isLocked(world, x, y)
    && world.terrain[y * world.width + x] !== 'w' && !isBuildingTile(world.objects[y * world.width + x]) && !occupiedAt(world, y * world.width + x)
    && !tableAt(world, x, y));
  return { anchor: [ax, cy], tiles, valid };
}

// The bottom-left tile and building for any tile that is part of a building, or null.
export function findBuilding(world, x, y) {
  const maxWidth = Math.max(...allBuildings().map((b) => b.width));
  const maxHeight = Math.max(...allBuildings().map((b) => b.height));
  for (let ay = y; ay < Math.min(world.height, y + maxHeight); ay++) {
    for (let ax = Math.max(0, x - maxWidth + 1); ax <= x; ax++) {
      const building = buildingById(world.objects[ay * world.width + ax]);
      if (building && x < ax + building.width && y > ay - building.height) return { building, anchor: [ax, ay] };
    }
  }
  return null;
}

// Where players start: the creator's spawn point, or the walkable tile nearest to it (or to the middle of
// the map when there is no spawn point). Null if nothing is walkable.
// Pass `near` to find the walkable tile closest to another spot (e.g. where the player last stood).
export function findSpawn(world, near = world.spawn) {
  const cx = near?.x ?? Math.floor(world.width / 2);
  const cy = near?.y ?? Math.floor(world.height / 2);
  const maxRadius = Math.max(world.width, world.height);
  for (let r = 0; r <= maxRadius; r++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) === r && x >= 0 && y >= 0 && x < world.width && y < world.height && canSpawnAt(world, x, y)) return { x, y };
      }
    }
  }
  return null;
}

export const snapshot = (world) => ({ farmCells: [...(world.farmCells ?? [])], paint: structuredClone(world.paint ?? {}), restCells: [...(world.restCells ?? [])], terrain: [...world.terrain], objects: [...world.objects], placed: world.placed.map((p) => ({ ...p })), npcs: (world.npcs ?? []).map((p) => ({ ...p })) });

export function restore(world, { terrain, objects, placed = [], npcs = [], restCells = [], paint = {}, farmCells = [] }) {
  world.farmCells = [...farmCells];
  world.paint = structuredClone(paint);
  world.restCells = [...restCells];
  world.terrain = [...terrain];
  world.objects = [...objects];
  world.placed = placed.map((p) => ({ ...p }));
  world.npcs = npcs.map((p) => ({ ...p }));
  rebuildOccupancy(world);
}

export const ENTRANCE_TOOL = 'entrance';

export function brushTiles(world, tool, cx, cy, brush) {
  // The Entrances tool highlights the whole building (or door) under the cursor.
  if (tool === ENTRANCE_TOOL) return entranceAt(world, cx, cy)?.footprint ?? [[cx, cy]];
  const building = buildingById(tool);
  if (building) return buildingPlacement(world, building, cx, cy).tiles.filter(([x, y]) => x >= 0 && y >= 0 && x < world.width && y < world.height);
  const asset = assetFromTool(tool);
  if (asset) return assetPlacement(world, asset, cx, cy).tiles.filter(([x, y]) => x >= 0 && y >= 0 && x < world.width && y < world.height);
  if (structureKind(tool) === 'door') return [[cx, cy - 1], [cx, cy]].filter(([x, y]) => x >= 0 && y >= 0 && x < world.width && y < world.height);
  const size = tool.startsWith('texture:') || isTerrainTool(tool) || tool === ERASER || isPaintedStructure(tool) ? brush : 1;
  const r = Math.floor(size / 2);
  const tiles = [];
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (x >= 0 && y >= 0 && x < world.width && y < world.height) tiles.push([x, y]);
    }
  }
  return tiles;
}

// Applies a tool at the brush centred on (cx, cy). Returns the indices of tiles that changed.
export function canPaintTexture(world, surface, x, y) {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return false;
  const i = y * world.width + x;
  if (world.interior ? !['floor', 'wall'].includes(surface) : surface !== 'ground') return false;
  const wall = ['M', 'L', 'N'].includes(world.objects[i]) || Boolean(world.generatedAssets && world.interior && world.objects[i] === 'X');
  return surface === 'wall' ? wall : !isLocked(world, x, y) && !isStructure(world.objects[i]) && !isBuildingTile(world.objects[i]) && (world.terrain[i] !== 'w' || Boolean(world.generatedAssets));
}

export function applyTool(world, tool, cx, cy, brush) {
  if (tool.startsWith('texture:')) {
    const [, surface, id] = tool.split(':');
    if (id !== 'clear' && !/^[a-f0-9]{24}$/.test(id)) return [];
    const changed = [];
    world.paint ??= {};
    for (const [x, y] of brushTiles(world, tool, cx, cy, brush)) {
      if (!canPaintTexture(world, surface, x, y)) continue;
      const i = y * world.width + x;
      if (id === 'clear') {
        if (world.paint[i]?.surface !== surface) continue;
        delete world.paint[i];
      } else {
        if (world.paint[i]?.id === id && world.paint[i]?.surface === surface) continue;
        world.paint[i] = { surface, id };
      }
      changed.push(i);
    }
    return changed;
  }
  const building = buildingById(tool);
  if (building) return placeBuilding(world, building, cx, cy);
  const asset = assetFromTool(tool);
  if (asset) return placeAsset(world, asset, cx, cy);
  // A door needs both of its tiles free, or it isn't placed at all.
  if (structureKind(tool) === 'door') {
    const tiles = brushTiles(world, tool, cx, cy, brush);
    const fits = tiles.length === 2 && tiles.every(([x, y]) => !isLocked(world, x, y)
      && world.terrain[y * world.width + x] !== 'w' && !isBuildingTile(world.objects[y * world.width + x]) && !occupiedAt(world, y * world.width + x));
    if (!fits) return [];
  }
  const npc = npcFromTool(tool);
  if (npc) {
    if (!npcFits(world, cx, cy)) return [];
    world.npcs = [...(world.npcs ?? []), { n: npc.id, x: cx, y: cy }];
    return [cy * world.width + cx];
  }
  if (tool === TABLETOP) {
    if (!tabletopFits(world, cx, cy)) return [];
    const i = cy * world.width + cx;
    world.objects[i] = TABLETOP;
    return [i];
  }
  const changed = new Set();
  for (const [x, y] of brushTiles(world, tool, cx, cy, brush)) {
    if (isLocked(world, x, y)) continue;
    // A character: Remove takes them away (and nothing else on that tile this time).
    const standing = npcAt(world, x, y);
    if (standing >= 0) {
      if (tool === ERASER) {
        world.npcs = world.npcs.filter((_, k) => k !== standing);
        changed.add(y * world.width + x);
      }
      continue;
    }
    // A table: Remove takes it away; nothing else is painted over it.
    const table = tableAt(world, x, y);
    if (table) {
      if (tool === ERASER) {
        const j = table.y * world.width + table.x;
        world.objects[j] = '.';
        changed.add(j);
      }
      continue;
    }
    const i = y * world.width + x;
    const onBuilding = isBuildingTile(world.objects[i]);
    const onAsset = occupiedAt(world, i);
    const before = world.terrain[i] + world.objects[i] + JSON.stringify(world.paint?.[i]);
    if (isTerrainTool(tool)) {
      if (tool === 'w' && (onBuilding || onAsset || isStructure(world.objects[i]))) continue; // no water under houses, assets or building pieces
      if (['floor', 'ground'].includes(world.paint?.[i]?.surface)) delete world.paint[i];
      world.terrain[i] = tool;
      if (tool === 'w') world.objects[i] = '.';
    } else if (tool === ERASER) {
      if (onAsset) removeAsset(world, world.occupied[i]).forEach((j) => changed.add(j));
      else if (onBuilding) removeBuilding(world, x, y).forEach((j) => changed.add(j));
      else world.objects[i] = '.';
    } else if (world.terrain[i] !== 'w' && !onBuilding && !onAsset) {
      world.objects[i] = tool;
    }
    if (world.terrain[i] + world.objects[i] + JSON.stringify(world.paint?.[i]) !== before) changed.add(i);
  }
  return [...changed];
}

// Places a building centred on the cursor, clearing decorations under it. Returns changed indices, or [] if it doesn't fit.
function placeBuilding(world, building, cx, cy) {
  const { anchor: [ax, ay], tiles, valid } = buildingPlacement(world, building, cx, cy);
  if (!valid) return [];
  for (const [x, y] of tiles) world.objects[y * world.width + x] = PART_OF_BUILDING;
  world.objects[ay * world.width + ax] = building.id;
  return tiles.map(([x, y]) => y * world.width + x);
}

// Places an asset centred on the cursor. Returns its footprint indices, or [] if it doesn't fit.
function placeAsset(world, asset, cx, cy) {
  const { anchor: [ax, ay], tiles, valid } = assetPlacement(world, asset, cx, cy);
  if (!valid) return [];
  const vertical = orientation.turn === TURNS.VERTICAL && Boolean(asset.sideSpriteUrl);
  const rotated = orientation.turn === TURNS.ROTATED;
  world.placed.push({ a: asset.id, x: ax, y: ay, ...(vertical ? { r: 1 } : {}), ...(rotated ? { t: 1 } : {}), ...(orientation.flipped ? { f: 1 } : {}) });
  rebuildOccupancy(world);
  return tiles.map(([x, y]) => y * world.width + x);
}

// Removes one placed asset. Returns the indices it covered.
function removeAsset(world, placement) {
  const asset = assetById(placement.a);
  world.placed = world.placed.filter((p) => p !== placement && !(p.supportAssetId===placement.a&&p.supportX===placement.x&&p.supportY===placement.y));
  rebuildOccupancy(world);
  return asset ? assetTiles(asset, placement.x, placement.y, placementTurn(placement)).map(([x, y]) => y * world.width + x) : [];
}

// Removes the whole building that tile (x, y) belongs to. Returns changed indices.
function removeBuilding(world, x, y) {
  const found = findBuilding(world, x, y);
  if (!found) {
    world.objects[y * world.width + x] = '.';
    return [y * world.width + x];
  }
  const tiles = footprint(found.building, ...found.anchor);
  for (const [tx, ty] of tiles) world.objects[ty * world.width + tx] = '.';
  return tiles.map(([tx, ty]) => ty * world.width + tx);
}
