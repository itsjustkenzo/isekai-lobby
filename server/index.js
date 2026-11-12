import {mountDetailedStyle} from './detailed-style.js';
import {mountInteriorImageCollection} from './interior-image-collection.js';
import {mountInteriorPrototype} from './interior-prototype.js';
import {npcAppearanceInput,generateNpcAppearance,npcGenerationError} from './npc-appearance.js';
import {preserveArtwork} from './original-artwork.js';
import {deleteBuildingAsset} from './building-deletion.js';
import {mountBuildingAssets} from './building-assets.js';
import {mountObjectBuilder} from './object-builder.js';
import {mountMechanicsBuilder} from './mechanics-builder.js';
import {normalizeEnvironmentFootprints,restoreShrunkNatureSprites} from './environment-variants.js';
import {isLiquidTexture} from '../client/src/world/liquidTextures.js';
import { saveGeneratedMap, deleteGeneratedMap } from './generated-map-storage.js';
import { readGeneratedMedia } from './generated-map-media.js';
import { generateMapFromTerrain, selectTerrainCollection, collectionsForMapKind } from './terrain-map.js';
import { mountTerrainBuilder } from './terrain-builder.js';
import { publicMapError } from './map-analysis-errors.js';
import {deleteTerrainAsset,deleteTerrainCollection,assertTerrainAssetsNotDeleted} from './terrain-deletion.js';
import { removeItemReferences, assertItemsNotDeleted } from './item-deletion.js';
import { generateItemImage } from './items.js';
import { readInventoryConfig } from './inventory.js';
import { inventoryAction, inventorySettings, starterInventory, syncInventoryPositions } from '../client/src/world/inventory.js';
import { generateEquipment, validEquipmentLibrary } from './equipment.js';
import { EQUIPMENT_TYPES } from '../client/src/world/equipment.js';
import { generateTexture, validTextureLibrary } from './textures.js';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase, closeDatabase, withDatabaseTransaction } from './db.js';
import { endSession, requireUser, startSession, verifyPassword } from './auth.js';
import { GENDERS, availableGenders, detectImageType, generateSprite } from './sprite.js';
import { MAX_DESCRIPTION, MAX_HOUSES, generateHouse, pixelateHouse } from './house.js';
import { ASSET_SIZES, MAX_ASSET_NAME, MAX_LIBRARY, generateAssetImage, generateSideImage, keywordsFor, toAssetSprite, toSideSprite } from './assets.js';
import { ObjectId } from 'mongodb';

const MAX_HOUSE_NAME = 40;
const MAX_SEARCH_RESULTS = 24;
const ASSET_LIST_PROJECTION = { sprite: 0, original: 0, sideSprite: 0, sideOriginal: 0 };
const MAX_PLACED = 1500; // placed assets per world; keeps saves well under the JSON body limit
const MAX_INTERIORS = 30;
const MAX_INTERIOR_NAME = 40;
const INTERIOR_STYLES = ['cottage', 'cabin', 'stone'];

// Checks one world's tile data (the outside world or an interior). Returns the cleaned data, or null.
const MAX_NPC_PLACEMENTS = 200; // NPCs placed per map or room

function readWorldData({ width, height, terrain, objects, placed = [], npcs = [], restCells = [], wallRows, paint = {}, farmCells = [] } = {}) {
  const validSize = (n) => Number.isInteger(n) && n >= 8 && n <= 128;
  if (!validSize(width) || !(validSize(height) || (height === 129 && wallRows === 3))) return null;
  const cells = width * height;
  if (typeof terrain !== 'string' || terrain.length !== cells || !/^[gdwsaoc]+$/.test(terrain)
    || typeof objects !== 'string' || objects.length !== cells || !/^[.TPBRFSHCK#0-9MLNrbeuqvfpnkjzDOYXEGA]+$/.test(objects)) return null;
  // Placed assets: [{ a: assetId, x, y, r?, t?, f? }] with (x, y) the bottom-left tile of the footprint,
  // r = the AI-drawn vertical version, t = rotated 90°, f = mirrored left-to-right.
  const validPlaced = Array.isArray(placed) && placed.length <= MAX_PLACED && placed.every((p) => p && typeof p.a === 'string'
    && ObjectId.isValid(p.a) && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < width && p.y < height
    && [undefined, 0, 1].includes(p.r) && [undefined, 0, 1].includes(p.t) && [undefined, 0, 1].includes(p.f) && !(p.r && p.t) && (p.supportAssetId===undefined||typeof p.supportAssetId==='string'&&/^[a-f0-9]{24}$/.test(p.supportAssetId)&&Number.isInteger(p.supportX)&&Number.isInteger(p.supportY)&&Number.isInteger(p.elevation)&&p.elevation>=4&&p.elevation<=20));
  if (!validPlaced) return null;
  // Placed NPC characters: [{ n: npc id, x, y, f? }] with (x, y) the tile they stand on.
  const validNpcs = Array.isArray(npcs) && npcs.length <= MAX_NPC_PLACEMENTS && npcs.every((p) => p && typeof p.n === 'string' && ObjectId.isValid(p.n)
    && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < width && p.y < height && [undefined, 0, 1].includes(p.f));
  if (!validNpcs) return null;
  if (!Array.isArray(restCells) || restCells.length > cells || !restCells.every((i) => Number.isInteger(i) && i >= 0 && i < cells)) return null;
  if (!paint || typeof paint !== 'object' || Array.isArray(paint) || Object.keys(paint).length > cells) return null;
  if (!Array.isArray(farmCells) || farmCells.length > cells || !farmCells.every((i) => Number.isInteger(i) && i >= 0 && i < cells)) return null;
  const cleanPaint = {};
  for (const [key, value] of Object.entries(paint)) {
    if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= cells || !value || !['floor', 'wall', 'ground'].includes(value.surface) || typeof value.id !== 'string' || !ObjectId.isValid(value.id)) return null;
    cleanPaint[key] = { id: value.id, surface: value.surface };
  }
  const npcPlacements = npcs.map(({ n, x, y, f }) => ({ n, x, y, ...(f ? { f: 1 } : {}) }));
  return { width, height, terrain, objects, paint: cleanPaint, farmCells: [...new Set(farmCells)], ...(wallRows === 3 ? { wallRows: 3 } : {}), restCells: [...new Set(restCells)], ...(npcPlacements.length ? { npcs: npcPlacements } : {}), placed: placed.map(({ a, x, y, r, t, f, supportAssetId, supportX, supportY, elevation }) => ({ a, x, y,...(supportAssetId?{supportAssetId,supportX,supportY,elevation}:{}), ...(r ? { r: 1 } : {}), ...(t ? { t: 1 } : {}), ...(f ? { f: 1 } : {}) })) };
}

const MAX_MAPS = 10;
const MAX_LINKS = 60;
const MAX_MAP_NAME = 40;
const TILE_KEY = /^\d{1,3},\d{1,3}$/;
const MAP_ID = /^(main|m\d{1,3})$/;

// Travel point settings, keyed by pad tile "x,y": { name, to: map id or null, arrive: "x,y" or null }.
function readLinks(links = {}) {
  if (typeof links !== 'object' || Array.isArray(links)) return null;
  const entries = Object.entries(links);
  if (entries.length > MAX_LINKS) return null;
  const cleaned = {};
  for (const [key, link] of entries) {
    if (!TILE_KEY.test(key) || typeof link !== 'object' || !link) return null;
    const name = typeof link.name === 'string' ? link.name.trim().slice(0, MAX_MAP_NAME) : '';
    if (!name || !(link.to === null || MAP_ID.test(link.to)) || !(link.arrive === null || TILE_KEY.test(link.arrive))) return null;
    cleaned[key] = { name, to: link.to, arrive: link.arrive };
  }
  return cleaned;
}

// One outdoor map: its tiles, interiors and travel points (and a name). Returns the cleaned map, or null.
// Time of day: { mode: 'cycle' | 'off' } or { mode: 'fixed', phase }; null if invalid.
function readTime(time) {
  const valid = time && ['cycle', 'fixed', 'off'].includes(time.mode) && (time.mode !== 'fixed' || ['morning', 'afternoon', 'evening', 'night'].includes(time.phase));
  if (!valid) return null;
  return { mode: time.mode, ...(time.mode === 'fixed' ? { phase: time.phase } : {}), ...(time.night === 'dark' ? { night: 'dark' } : {}) };
}

// Weather: { mode: 'off' | 'random' } or { mode: 'fixed', kind: 'rain' | 'mist' }; null if invalid.
function readWeather(weather) {
  const valid = weather && ['off', 'fixed', 'random'].includes(weather.mode) && (weather.mode !== 'fixed' || ['rain', 'mist'].includes(weather.kind));
  return valid ? (weather.mode === 'fixed' ? { mode: 'fixed', kind: weather.kind } : { mode: weather.mode }) : null;
}

const MAX_REGIONS = 10;
const REGION_ID = /^r\d{1,3}$/;

// Regions: { r1: { name, time, weather } }. Returns the cleaned set (invalid ones dropped).
function readRegions(regions) {
  if (!regions || typeof regions !== 'object' || Array.isArray(regions)) return {};
  const cleaned = {};
  for (const [id, region] of Object.entries(regions).slice(0, MAX_REGIONS)) {
    const name = typeof region?.name === 'string' ? region.name.trim().slice(0, MAX_MAP_NAME) : '';
    if (!REGION_ID.test(id) || !name) continue;
    cleaned[id] = { name, time: readTime(region.time) ?? { mode: 'cycle' }, weather: readWeather(region.weather) ?? { mode: 'off' } };
  }
  return cleaned;
}

function readOutdoorMap(map) {
  const data = readWorldData(map);
  const interiors = readInteriors(map?.interiors);
  const links = readLinks(map?.links);
  if (!data || !interiors || !links) return null;
  const name = typeof map.name === 'string' ? map.name.trim().slice(0, MAX_MAP_NAME) : '';
  // Indoor maps ("Small interior") are rooms reached by travel points.
  const indoor = map.kind === 'indoor' ? { kind: 'indoor', style: INTERIOR_STYLES.includes(map.style) ? map.style : 'cottage' } : {};
  const { spawn } = map;
  const validSpawn = spawn && Number.isInteger(spawn.x) && Number.isInteger(spawn.y) && spawn.x >= 0 && spawn.y >= 0 && spawn.x < data.width && spawn.y < data.height;
  // Time of day: { mode: 'cycle' | 'off' } or { mode: 'fixed', phase }.
  const { time } = map;
  // Weather: { mode: 'off' | 'random' } or { mode: 'fixed', kind: 'rain' | 'mist' }.
  const { weather } = map;
  const validWeather = weather && ['off', 'fixed', 'random'].includes(weather.mode) && (weather.mode !== 'fixed' || ['rain', 'mist'].includes(weather.kind));
  const validTime = time && ['cycle', 'fixed', 'off'].includes(time.mode) && (time.mode !== 'fixed' || ['morning', 'afternoon', 'evening', 'night'].includes(time.phase));
  return {
    ...data, interiors, links, ...(name ? { name } : {}), ...indoor, ...(validSpawn ? { spawn: { x: spawn.x, y: spawn.y } } : {}),
    ...(validTime ? { time: readTime(time) } : {}),
    ...(validWeather ? { weather: readWeather(weather) } : {}),
    ...(typeof map.region === 'string' && REGION_ID.test(map.region) ? { region: map.region } : {}),
  };
}

// Extra outdoor maps, keyed by id ("m1", "m2"...). Returns the cleaned set, or null.
function readMaps(maps = {}) {
  if (typeof maps !== 'object' || Array.isArray(maps)) return null;
  const entries = Object.entries(maps);
  if (entries.length > MAX_MAPS) return null;
  const cleaned = {};
  for (const [id, map] of entries) {
    if (!/^m\d{1,3}$/.test(id)) return null;
    const data = readOutdoorMap(map);
    if (!data || !data.name) return null;
    cleaned[id] = data;
  }
  return cleaned;
}

// Interiors of enterable buildings, keyed by the entrance tile "x,y". Returns the cleaned map, or null.
function readInteriors(interiors = {}) {
  if (typeof interiors !== 'object' || Array.isArray(interiors)) return null;
  const entries = Object.entries(interiors);
  if (entries.length > MAX_INTERIORS) return null;
  const cleaned = {};
  for (const [key, room] of entries) {
    if (!/^\d{1,3},\d{1,3}$/.test(key)) return null;
    const data = readWorldData(room);
    const name = typeof room?.name === 'string' ? room.name.trim().slice(0, MAX_INTERIOR_NAME) : '';
    const links = readLinks(room?.links);
    if (!data || !links || !name || typeof room.enabled !== 'boolean' || !INTERIOR_STYLES.includes(room.style)) return null;
    cleaned[key] = { ...data, interior: true, enabled: room.enabled, name, style: room.style, links };
  }
  return cleaned;
}
const MAX_NPCS = 20; // characters per creator
const MAX_NPC_NAME = 40;
const MAX_NPC_DESCRIPTION = 300;
const MAX_NPC_PROMPT = 1000;

function publicNpc(npc) {
  return {
    id: npc._id.toString(), name: npc.name, description: npc.description, prompt: npc.prompt, gender: npc.gender,
    spriteUrl: `/api/npcs/${npc._id}/sprite?v=${npc.createdAt.getTime()}`,
  };
}

// Name, description and prompt from a request (query or JSON). Returns the cleaned text, or an error message.
function readNpcText({ name, description = '', prompt = '' }) {
  const clean = (text, max) => (typeof text === 'string' ? text.trim().slice(0, max) : '');
  const fields = { name: clean(name, MAX_NPC_NAME), description: clean(description, MAX_NPC_DESCRIPTION), prompt: clean(prompt, MAX_NPC_PROMPT) };
  return fields.name ? fields : { error: 'Give your character a name' };
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function publicAsset(asset, user) {
  const { width, height } = ASSET_SIZES[asset.size];
  return {
    id: asset._id.toString(), name: asset.name, width, height, solid: asset.solid, source: asset.source,
    mine: asset.createdBy.equals(user._id),...(asset.originalArtwork?{originalArtwork:asset.originalArtwork}:{}),...(asset.sideOriginalArtwork?{sideOriginalArtwork:asset.sideOriginalArtwork}:{}), spriteUrl: `/api/assets/${asset._id}/sprite?v=${asset.createdAt.getTime()}`,
    // The vertical (turned) version, once someone has created it.
    sideSpriteUrl: asset.sideCreatedAt ? `/api/assets/${asset._id}/side-sprite?v=${asset.sideCreatedAt.getTime()}` : null,
  };
}

function publicHouse(house) {
  return { slot: house.slot, name: house.name,...(house.originalArtwork?{originalArtwork:house.originalArtwork}:{}), spriteUrl: `/api/houses/${house.slot}/sprite?v=${house.createdAt.getTime()}` };
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const wrap = (handler) => (req, res, next) => handler(req, res, next).catch(next);

function publicCharacter(character, spritePath) {
  if (!character) return null;
  return { gender: character.gender, createdAt: character.createdAt, spriteUrl: `${spritePath}?v=${character.createdAt.getTime()}` };
}

function publicUser(user) {
  return {
    username: user.username,
    character: publicCharacter(user.character, '/api/character/sprite'),
    characterDraft: publicCharacter(user.characterDraft, '/api/character/draft/sprite'),
    availableGenders: availableGenders(),
  };
}

const app = express();
app.disable('x-powered-by');
// Worlds with many interiors and placed assets can exceed the default JSON size.
app.use(express.json({ limit: '16mb' }));

async function start() {
  const { database, terrainCollections, games, users, sessions, worlds, houses, assets, npcs, playerInventories, itemDeletionGuards, generatedMapDrafts } = await connectDatabase();
  const auth = requireUser(sessions, users);
  const generating = new Set();
  mountDetailedStyle(app,{auth,generating});
  mountInteriorImageCollection(app,{auth,terrains:terrainCollections,generating,raw:express.raw({type:()=>true,limit:MAX_UPLOAD_BYTES})});
  mountInteriorPrototype(app,{auth,terrains:terrainCollections,generating});
  mountTerrainBuilder(app,{auth,terrains:terrainCollections,generating,deleteAsset:(userId,terrainId,assetId)=>withDatabaseTransaction(session=>deleteTerrainAsset(database,userId,terrainId,assetId,session)),deleteTerrain:(userId,terrainId)=>withDatabaseTransaction(session=>deleteTerrainCollection(database,userId,terrainId,session))});
  mountBuildingAssets(app,{auth,buildings:database.collection('buildingAssets'),generating,deleteBuilding:(userId,id)=>withDatabaseTransaction(session=>deleteBuildingAsset(database,userId,id,session))});
  mountObjectBuilder(app,{auth,objects:database.collection('creatorObjects'),generating});
  mountMechanicsBuilder(app,{auth,mechanics:database.collection('characterMechanics'),objects:database.collection('creatorObjects'),generating});
  app.locals.database = database;
  app.locals.games = games;

  app.get('/api/health', async (_req, res) => {
    try {
      await database.command({ ping: 1 });
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'disconnected' });
    }
  });

  app.post('/api/login', wrap(async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const user = await users.findOne({ username: username.trim().toLowerCase() });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    await startSession(sessions, res, user._id);
    res.json({ user: publicUser(user) });
  }));

  app.post('/api/logout', wrap(async (req, res) => {
    await endSession(sessions, req, res);
    res.json({ ok: true });
  }));

  app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

  app.post('/api/character', auth, express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), async (req, res) => {
    const gender = req.query.gender;
    if (!GENDERS.includes(gender)) return res.status(400).json({ error: 'Choose male or female' });
    if (!availableGenders().includes(gender)) return res.status(503).json({ error: `The ${gender} character base isn't ready yet` });
    if (!Buffer.isBuffer(req.body) || !detectImageType(req.body)) return res.status(400).json({ error: 'Upload a PNG, JPEG, or WebP image' });
    const key = req.user._id.toString();
    if (generating.has(key)) return res.status(409).json({ error: 'Your character is already being created' });
    generating.add(key);
    try {
      const sprite = await generateSprite(gender, req.body);
      const characterDraft = { gender, sprite, createdAt: new Date() };
      await users.updateOne({ _id: req.user._id }, { $set: { characterDraft } });
      res.json({ user: publicUser({ ...req.user, characterDraft }) });
    } catch (error) {
      console.error('Character generation failed:', error.message);
      res.status(502).json({ error: 'Character creation failed. Please try again.' });
    } finally {
      generating.delete(key);
    }
  });

  app.post('/api/character/save', auth, wrap(async (req, res) => {
    const user = await users.findOneAndUpdate(
      { _id: req.user._id, characterDraft: { $exists: true } },
      [{ $set: { character: '$characterDraft' } }, { $unset: 'characterDraft' }],
      { returnDocument: 'after', projection: { passwordHash: 0, 'character.sprite': 0 } },
    );
    if (!user) return res.status(404).json({ error: 'Nothing to save. Create a character first.' });
    res.json({ user: publicUser(user) });
  }));

  app.delete('/api/character/draft', auth, wrap(async (req, res) => {
    await users.updateOne({ _id: req.user._id }, { $unset: { characterDraft: 1 } });
    const { characterDraft, ...user } = req.user;
    res.json({ user: publicUser(user) });
  }));

  const sendSprite = (field) => wrap(async (req, res) => {
    const user = await users.findOne({ _id: req.user._id }, { projection: { [`${field}.sprite`]: 1 } });
    const sprite = user?.[field]?.sprite;
    if (!sprite) return res.status(404).json({ error: 'No character yet' });
    res.type('png').set('Cache-Control', 'private, max-age=31536000, immutable').send(Buffer.from(sprite.buffer));
  });
  app.get('/api/character/sprite', auth, sendSprite('character'));
  app.get('/api/character/draft/sprite', auth, sendSprite('characterDraft'));

  // ---- NPC characters ----
  const NPC_LIST_PROJECTION = { sprite: 0 };

  app.get('/api/npcs', auth, wrap(async (req, res) => {
    const list = await npcs.find({ userId: req.user._id }, { projection: NPC_LIST_PROJECTION }).sort({ createdAt: 1 }).toArray();
    res.json({ npcs: list.map(publicNpc), max: MAX_NPCS });
  }));

  // The upload is the request body; gender, name, description and prompt come in the query string.
  app.post('/api/npcs', auth, express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), async (req, res) => {
    const appearanceInput=npcAppearanceInput(req.query);
    if(!appearanceInput)return res.status(400).json({error:'Choose random, prompt or photo appearance; a prompt must contain 1?1000 characters.'});
    const gender = req.query.gender;
    if (!GENDERS.includes(gender)) return res.status(400).json({ error: 'Choose male or female' });
    if (!availableGenders().includes(gender)) return res.status(503).json({ error: `The ${gender} character base isn't ready yet` });
    const text = readNpcText(req.query);
    if (text.error) return res.status(400).json({ error: text.error });
    if (appearanceInput.mode==='photo'&&(!Buffer.isBuffer(req.body) || !detectImageType(req.body))) return res.status(400).json({ error: 'Upload a PNG, JPEG, or WebP image' });
    if (await npcs.countDocuments({ userId: req.user._id }) >= MAX_NPCS) return res.status(409).json({ error: `You can have up to ${MAX_NPCS} characters. Delete one to make another.` });
    const key = `npc:${req.user._id}`;
    if (generating.has(key)) return res.status(409).json({ error: 'A character is already being created' });
    generating.add(key);
    try {
      const sprite = await generateNpcAppearance(gender,appearanceInput,req.body);
      const npc = { userId: req.user._id, ...text, gender, sprite, createdAt: new Date() };
      const { insertedId } = await npcs.insertOne(npc);
      res.json({ npc: publicNpc({ ...npc, _id: insertedId }) });
    } catch (error) {
      console.error('NPC generation failed:', error.message);
      res.status(502).json({ error: npcGenerationError(error) });
    } finally {
      generating.delete(key);
    }
  });

  app.patch('/api/npcs/:id', auth, wrap(async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Character not found' });
    const text = readNpcText(req.body ?? {});
    if (text.error) return res.status(400).json({ error: text.error });
    const npc = await npcs.findOneAndUpdate({ _id: new ObjectId(req.params.id), userId: req.user._id }, { $set: text }, { returnDocument: 'after', projection: NPC_LIST_PROJECTION });
    if (!npc) return res.status(404).json({ error: 'Character not found' });
    res.json({ npc: publicNpc(npc) });
  }));

  app.delete('/api/npcs/:id', auth, wrap(async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Character not found' });
    const { deletedCount } = await npcs.deleteOne({ _id: new ObjectId(req.params.id), userId: req.user._id });
    if (!deletedCount) return res.status(404).json({ error: 'Character not found' });
    res.json({ ok: true });
  }));

  app.get('/api/npcs/:id/sprite', auth, wrap(async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Character not found' });
    const npc = await npcs.findOne({ _id: new ObjectId(req.params.id), userId: req.user._id }, { projection: { sprite: 1 } });
    if (!npc?.sprite) return res.status(404).json({ error: 'Character not found' });
    res.type('png').set('Cache-Control', 'private, max-age=31536000, immutable').send(Buffer.from(npc.sprite.buffer));
  }));

  app.get('/api/houses', auth, wrap(async (req, res) => {
    const list = await houses.find({ userId: req.user._id }, { projection: ASSET_LIST_PROJECTION }).sort({ slot: 1 }).toArray();
    res.json({ houses: list.map(publicHouse), max: MAX_HOUSES });
  }));

  // Body: an optional concept image (PNG/JPEG/WebP). Query: name, description. At least one of image/description is required.
  app.post('/api/houses', auth, express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), async (req, res) => {
    const description = String(req.query.description ?? '').trim().slice(0, MAX_DESCRIPTION);
    const upload = Buffer.isBuffer(req.body) && req.body.length ? req.body : null;
    if (upload && !detectImageType(upload)) return res.status(400).json({ error: 'Upload a PNG, JPEG, or WebP image' });
    if (!description && !upload) return res.status(400).json({ error: 'Describe your house or upload a picture of one' });
    const name = String(req.query.name ?? '').trim().slice(0, MAX_HOUSE_NAME) || 'My house';
    const used = new Set((await houses.find({ userId: req.user._id }, { projection: { slot: 1 } }).toArray()).map((h) => h.slot));
    const slot = Array.from({ length: MAX_HOUSES }, (_, i) => i).find((i) => !used.has(i));
    if (slot === undefined) return res.status(409).json({ error: `You can keep up to ${MAX_HOUSES} houses. Delete one to design another.` });
    const key = `house:${req.user._id}`;
    if (generating.has(key)) return res.status(409).json({ error: 'A house is already being designed' });
    generating.add(key);
    try {
      const original = await generateHouse(description, upload);
      const house = { userId: req.user._id, slot, name, description, sprite: pixelateHouse(original), originalArtwork:preserveArtwork(original,80,96),original, createdAt: new Date() };
      await houses.insertOne(house);
      res.json({ house: publicHouse(house) });
    } catch (error) {
      console.error('House generation failed:', error.message);
      res.status(502).json({ error: 'House design failed. Please try again.' });
    } finally {
      generating.delete(key);
    }
  });

  app.get('/api/houses/:slot/sprite', auth, wrap(async (req, res) => {
    const house = await houses.findOne({ userId: req.user._id, slot: Number(req.params.slot) }, { projection: { sprite: 1 } });
    if (!house) return res.status(404).json({ error: 'House not found' });
    res.type('png').set('Cache-Control', 'private, max-age=31536000, immutable').send(Buffer.from(house.sprite.buffer));
  }));

  // Houses placed in the world from a deleted slot are dropped when the world next loads.
  app.delete('/api/houses/:slot', auth, wrap(async (req, res) => {
    await houses.deleteOne({ userId: req.user._id, slot: Number(req.params.slot) });
    res.json({ ok: true });
  }));

  // ---- Assets: a shared pool of AI-generated props, private uploads, and each player's library ----
  const assetById = (id) => (ObjectId.isValid(id) ? assets.findOne({ _id: new ObjectId(id) }, { projection: ASSET_LIST_PROJECTION }) : null);
  const canUse = (asset, user) => asset && (asset.public || asset.createdBy.equals(user._id));
  const libraryIds = (user) => user.assetLibrary ?? [];

  function readAssetOptions(query) {
    const name = String(query.name ?? '').trim().slice(0, MAX_ASSET_NAME);
    const sizeKey = ASSET_SIZES[query.size] ? query.size : '1x1';
    return { name, sizeKey, size: ASSET_SIZES[sizeKey], solid: query.solid !== '0' };
  }

  async function addToLibrary(user, assetId) {
    if (libraryIds(user).some((id) => id.equals(assetId))) return true;
    if (libraryIds(user).length >= MAX_LIBRARY) return false;
    await users.updateOne({ _id: user._id }, { $addToSet: { assetLibrary: assetId } });
    return true;
  }

  async function storeAsset(user, { name, sizeKey, size, solid }, original, isPublic, source) {
    const asset = {
      name, keywords: keywordsFor(name), size: sizeKey, solid, public: isPublic, source,
      sprite: toAssetSprite(original, size),originalArtwork:preserveArtwork(original,size.width*16,(size.height+1)*16), original, createdBy: user._id, createdAt: new Date(),
    };
    const { insertedId } = await assets.insertOne(asset);
    asset._id = insertedId;
    await addToLibrary(user, insertedId);
    return asset;
  }

  app.delete('/api/items/:id', auth, wrap(async (req, res) => {
    const itemId = req.params.id;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(itemId)) return res.status(400).json({ error: 'Invalid item ID.' });
    const owner = { userId: req.user._id };
    await itemDeletionGuards.updateOne(owner, { $setOnInsert: { deletedIds: [], revision: 0 } }, { upsert: true });
    await withDatabaseTransaction(async (session) => {
      await itemDeletionGuards.updateOne(owner, { $addToSet: { deletedIds: itemId }, $inc: { revision: 1 } }, { session });
      const world = await worlds.findOne(owner, { session });
      if (!world) return;
      await worlds.updateOne(owner, { $pull: { 'inventory.items': { id: itemId }, 'inventory.startingItems': { itemId } }, $set: { updatedAt: new Date() } }, { session });
      const records = await playerInventories.find({ worldId: world._id, $or: [{ 'state.slots.itemId': itemId }, { 'state.hotbar': itemId }, { 'state.selectedId': itemId }, { 'state.drops.itemId': itemId }] }, { session }).toArray();
      for (const record of records) await playerInventories.updateOne({ _id: record._id }, { $set: { state: removeItemReferences(record.state, itemId), updatedAt: new Date() } }, { session });
    });
    res.json({ ok: true });
  }));

  app.post('/api/maps/dream', auth, express.raw({type:()=>true,limit:MAX_UPLOAD_BYTES}), async(req,res)=>{
    if(!Buffer.isBuffer(req.body)||!detectImageType(req.body))return res.status(400).json({error:'Upload a PNG, JPEG, or WebP map image.'});
    const width=Number(req.query.width),height=Number(req.query.height);
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192)return res.status(400).json({error:'Invalid reference dimensions.'});
    const interiorSize=req.query.interiorSize??'auto';
    if(!['auto','small','medium','large'].includes(interiorSize))return res.status(400).json({error:'Choose a small, medium or large interior size.'});
    const requestedKind=req.query.kind??'exterior';
    if(!['exterior','interior','auto'].includes(requestedKind))return res.status(400).json({error:'Choose exterior, interior or automatic detection.'});
    const key=`dream-map:${req.user._id}`;
    if(generating.has(key))return res.status(409).json({error:'A dream map is already being generated.'});
    generating.add(key);
    try {
      const candidates=await terrainCollections.find({userId:req.user._id,completed:'paint'},{projection:{title:1,kind:1,description:1,artStyle:1,completed:1,'textures.name':1,'textures.surface':1,'textures.liquid':1,'generatedAssets.name':1}}).sort({updatedAt:-1}).limit(50).toArray();
      const compatible=collectionsForMapKind(candidates,requestedKind);
      if(!compatible.length)return res.status(400).json({error:'Generate a matching '+(requestedKind==='interior'?'interior collection in Interior Asset Builder':'terrain collection in Assets Builder')+' first.'});
      const selection=await selectTerrainCollection(req.body,compatible,undefined,requestedKind==='auto'?null:requestedKind);
      const collection=await terrainCollections.findOne({_id:new ObjectId(selection.terrainId),userId:req.user._id});
      if(!collection)return res.status(404).json({error:'Terrain collection not found.'});
      if(!collection.completed?.includes('paint'))return res.status(400).json({error:'Generate texture paint for the selected terrain first.'});
      const buildingRows=selection.kind==='exterior'?await database.collection('buildingAssets').find({userId:req.user._id}).sort({createdAt:-1}).limit(Math.max(1,Math.min(10,64-(collection.generatedAssets?.length??0)))).toArray():[];
      const capacity=Math.max(0,64-(collection.generatedAssets?.length??0));
      const buildingAssets=buildingRows.slice(0,capacity).map(b=>({id:String(b._id),name:b.name,width:b.width,height:b.height,solid:true,assetKind:'Building',building:b.building,...(b.originalArtwork?{originalArtwork:b.originalArtwork}:{}),spriteUrl:b.spriteUrl}));
      const generationCollection={...collection,generatedAssets:[...(collection.generatedAssets??[]),...buildingAssets]};
      const map=await generateMapFromTerrain(req.body,width,height,String(req.query.name??'Dream map').slice(0,40),'',selection.kind,generationCollection,undefined,interiorSize);
      res.json({map,selection:{title:collection.title,kind:selection.kind,reason:selection.reason}});
    }catch(error){console.error('Dream map generation failed:',error.message);const failure=publicMapError(error);res.status(failure.status).json({error:failure.message});}
    finally{generating.delete(key);}
  });

  app.post('/api/items/generate', auth, async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 60) : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 400) : '';
    const category = req.body?.category;
    if (!name || !['seed', 'material', 'usable'].includes(category)) return res.status(400).json({ error: 'Name your item and choose a category.' });
    const key = `item:${req.user._id}`;
    if (generating.has(key)) return res.status(409).json({ error: 'An item image is already being generated.' });
    generating.add(key);
    try {
      const image = await generateItemImage(name, description, category);
      res.json({ image: `data:image/png;base64,${image.toString('base64')}`,...(image.originalArtwork?{originalArtwork:image.originalArtwork}:{}) });
    } catch (error) {
      console.error('Item image generation failed:', error.message);
      res.status(502).json({ error: 'Could not generate the item image. Please try again.' });
    } finally { generating.delete(key); }
  });

  app.post('/api/equipment/generate', auth, express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), async (req, res) => {
    const name = String(req.query.name ?? '').trim().slice(0, 60);
    const description = String(req.query.description ?? '').trim().slice(0, 800);
    const kind = String(req.query.kind ?? 'hoe');
    const reference = Buffer.isBuffer(req.body) && req.body.length ? req.body : null;
    if (!name || (!description && !reference)) return res.status(400).json({ error: 'Name your equipment and describe it or upload a reference.' });
    if (!EQUIPMENT_TYPES.some((t) => t.id === kind)) return res.status(400).json({ error: 'Choose an equipment type.' });
    if (reference && !detectImageType(reference)) return res.status(400).json({ error: 'Upload a PNG, JPEG, or WebP image.' });
    const key = `equipment:${req.user._id}`;
    if (generating.has(key)) return res.status(409).json({ error: 'Equipment is already being generated.' });
    generating.add(key);
    try {
      const image = await generateEquipment(name, description, kind, reference);
      res.json({ equipment: { id: new ObjectId().toString(), name, description, kind, ...(image.originalArtwork?{originalArtwork:image.originalArtwork}:{}),image: `data:image/png;base64,${image.toString('base64')}` } });
    } catch (error) {
      console.error('Equipment generation failed:', error.message);
      res.status(502).json({ error: 'Could not design the equipment. Please try again.' });
    } finally { generating.delete(key); }
  });

  app.post('/api/textures/generate', auth, express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), async (req, res) => {
    const name = String(req.query.name ?? req.query.prompt ?? '').trim().slice(0, 60);
    const description = String(req.query.description ?? req.query.prompt ?? '').trim().slice(0, 800);
    const surface = req.query.surface ?? 'floor';
    if (!['wall', 'floor', 'ground'].includes(surface)) return res.status(400).json({ error: 'Choose walls, floors, or grounds.' });
    if (!name) return res.status(400).json({ error: 'Give your texture a name.' });
    const reference = Buffer.isBuffer(req.body) && req.body.length ? req.body : null;
    if (!description && !reference) return res.status(400).json({ error: 'Describe a texture or upload a reference image.' });
    if (reference && !detectImageType(reference)) return res.status(400).json({ error: 'Upload a PNG, JPEG, or WebP image.' });
    const key = `texture:${req.user._id}`;
    if (generating.has(key)) return res.status(409).json({ error: 'A texture is already being generated.' });
    generating.add(key);
    try {
      const image = await generateTexture(`Name: ${name}. ${description || 'Match the uploaded material design'}`, reference, surface);
      res.json({ texture: { id: new ObjectId().toString(), name, description, surface, liquid: req.query.liquid==='true'||isLiquidTexture({name,description}), ...(image.originalArtwork?{originalArtwork:image.originalArtwork}:{}),image: `data:image/png;base64,${image.toString('base64')}` } });
    } catch (error) {
      console.error('Texture generation failed:', error.message);
      res.status(502).json({ error: 'Could not generate the texture. Please try again.' });
    } finally { generating.delete(key); }
  });

  app.get('/api/assets/library', auth, wrap(async (req, res) => {
    const ids = libraryIds(req.user);
    const list = await assets.find({ _id: { $in: ids } }, { projection: ASSET_LIST_PROJECTION }).toArray();
    // Keep the order the player added them in.
    list.sort((a, b) => ids.findIndex((id) => id.equals(a._id)) - ids.findIndex((id) => id.equals(b._id)));
    res.json({ assets: list.map((a) => publicAsset(a, req.user)), max: MAX_LIBRARY });
  }));

  app.get('/api/assets/search', auth, wrap(async (req, res) => {
    const q = String(req.query.q ?? '').trim().slice(0, MAX_ASSET_NAME);
    const words = keywordsFor(q);
    const filter = { public: true };
    if (words.length) filter.$or = [{ keywords: { $all: words } }, { name: { $regex: escapeRegex(q), $options: 'i' } }];
    const list = await assets.find(filter, { projection: ASSET_LIST_PROJECTION }).sort({ createdAt: -1 }).limit(MAX_SEARCH_RESULTS).toArray();
    res.json({ results: list.map((a) => publicAsset(a, req.user)) });
  }));

  // Generates a new public asset from a description (the search text) and adds it to the player's library.
  app.post('/api/assets/generate', auth, async (req, res) => {
    const options = readAssetOptions(req.query);
    if (!options.name) return res.status(400).json({ error: 'Describe the asset you want' });
    if (libraryIds(req.user).length >= MAX_LIBRARY) return res.status(409).json({ error: `My assets is full (${MAX_LIBRARY}). Remove one first.` });
    const key = `asset:${req.user._id}`;
    if (generating.has(key)) return res.status(409).json({ error: 'An asset is already being created' });
    generating.add(key);
    try {
      const original = await generateAssetImage(options.name, options.size);
      const asset = await storeAsset(req.user, options, original, true, 'ai');
      res.json({ asset: publicAsset(asset, req.user) });
    } catch (error) {
      console.error('Asset generation failed:', error.message);
      res.status(502).json({ error: 'Asset creation failed. Please try again.' });
    } finally {
      generating.delete(key);
    }
  });

  // Body: a PNG (the browser converts other formats). Uploads are private to the player.
  app.post('/api/assets/upload', auth, express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }), wrap(async (req, res) => {
    const options = readAssetOptions(req.query);
    if (!options.name) return res.status(400).json({ error: 'Give your asset a name' });
    if (!Buffer.isBuffer(req.body) || detectImageType(req.body)?.type !== 'image/png') return res.status(400).json({ error: 'Upload a PNG image' });
    if (libraryIds(req.user).length >= MAX_LIBRARY) return res.status(409).json({ error: `My assets is full (${MAX_LIBRARY}). Remove one first.` });
    let asset;
    try {
      asset = await storeAsset(req.user, options, req.body, false, 'upload');
    } catch (error) {
      return res.status(400).json({ error: error.message === 'Image has no visible pixels' ? 'That image looks empty. Try another.' : 'Could not use that image. Try another.' });
    }
    res.json({ asset: publicAsset(asset, req.user) });
  }));

  app.post('/api/assets/:id/library', auth, wrap(async (req, res) => {
    const asset = await assetById(req.params.id);
    if (!canUse(asset, req.user)) return res.status(404).json({ error: 'Asset not found' });
    if (!(await addToLibrary(req.user, asset._id))) return res.status(409).json({ error: `My assets is full (${MAX_LIBRARY}). Remove one first.` });
    res.json({ asset: publicAsset(asset, req.user) });
  }));

  // Removing an asset you created deletes it from the database entirely (images, original and vertical
  // version) and from every player's My assets. Removing someone else's asset only takes it off your list.
  // Either way, placed copies are dropped when a world next loads.
  app.delete('/api/assets/:id/library', auth, wrap(async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.json({ ok: true, deleted: false });
    const assetId = new ObjectId(req.params.id);
    const { deletedCount } = await assets.deleteOne({ _id: assetId, createdBy: req.user._id });
    if (deletedCount) await users.updateMany({ assetLibrary: assetId }, { $pull: { assetLibrary: assetId } });
    else await users.updateOne({ _id: req.user._id }, { $pull: { assetLibrary: assetId } });
    res.json({ ok: true, deleted: Boolean(deletedCount) });
  }));

  // Creates the vertical version of an asset with AI (once; afterwards everyone gets it instantly).
  app.post('/api/assets/:id/side', auth, async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: 'Asset not found' });
    const asset = await assets.findOne({ _id: new ObjectId(req.params.id) }, { projection: { sprite: 0, sideOriginal: 0, sideSprite: 0 } });
    if (!canUse(asset, req.user)) return res.status(404).json({ error: 'Asset not found' });
    if (asset.sideCreatedAt) return res.json({ asset: publicAsset(asset, req.user) });
    const key = `side:${asset._id}`;
    if (generating.has(key)) return res.status(409).json({ error: 'The vertical version is already being created. Try again in a minute.' });
    generating.add(key);
    try {
      const size = ASSET_SIZES[asset.size];
      const sideOriginal = await generateSideImage(asset.name, Buffer.from(asset.original.buffer), size);
      const side = { sideOriginalArtwork:preserveArtwork(sideOriginal,size.height*16,(size.width+.5)*16),sideSprite: toSideSprite(Buffer.from(asset.original.buffer), sideOriginal, size), sideOriginal, sideCreatedAt: new Date() };
      await assets.updateOne({ _id: asset._id }, { $set: side });
      res.json({ asset: publicAsset({ ...asset, ...side }, req.user) });
    } catch (error) {
      console.error('Side view generation failed:', error.message);
      res.status(502).json({ error: 'Could not create the vertical version. Please try again.' });
    } finally {
      generating.delete(key);
    }
  });

  app.get('/api/assets/:id/side-sprite', auth, wrap(async (req, res) => {
    const asset = ObjectId.isValid(req.params.id) && await assets.findOne({ _id: new ObjectId(req.params.id) }, { projection: { sideSprite: 1, public: 1, createdBy: 1 } });
    if (!canUse(asset, req.user) || !asset.sideSprite) return res.status(404).json({ error: 'Vertical version not found' });
    res.type('png').set('Cache-Control', 'private, max-age=31536000, immutable').send(Buffer.from(asset.sideSprite.buffer));
  }));

  app.get('/api/assets/:id/sprite', auth, wrap(async (req, res) => {
    const asset = ObjectId.isValid(req.params.id) && await assets.findOne({ _id: new ObjectId(req.params.id) }, { projection: { sprite: 1, public: 1, createdBy: 1 } });
    if (!canUse(asset, req.user)) return res.status(404).json({ error: 'Asset not found' });
    res.type('png').set('Cache-Control', 'private, max-age=31536000, immutable').send(Buffer.from(asset.sprite.buffer));
  }));

  // Image-generated prototype maps are isolated from the regular world and player saves.
  app.get('/api/generated-map',auth,wrap(async(req,res)=>{
    const rows=await generatedMapDrafts.find({userId:req.user._id},{projection:{'map.name':1,'map.width':1,'map.height':1,'map.kind':1,updatedAt:1}}).sort({updatedAt:-1}).toArray();
    const maps=rows.map((row)=>({id:String(row._id),...row.map,updatedAt:row.updatedAt}));
    const id=req.query.id;
    if(id && !ObjectId.isValid(id))return res.status(400).json({error:'Invalid map ID.'});
    const draft=id?await generatedMapDrafts.findOne({_id:new ObjectId(id),userId:req.user._id}):null;
    if(id&&!draft)return res.status(404).json({error:'Map not found.'});
    let loadedMap=draft?.map??null;
    if(loadedMap){
      if(typeof loadedMap.sourceTerrainId==='string'&&/^[a-f0-9]{24}$/i.test(loadedMap.sourceTerrainId)){
        const source=await terrainCollections.findOne({_id:new ObjectId(loadedMap.sourceTerrainId),userId:req.user._id},{projection:{generatedAssets:1}});
        if(source)loadedMap=restoreShrunkNatureSprites(loadedMap,source);
      }
      loadedMap=normalizeEnvironmentFootprints(loadedMap);
    }
    res.json({maps,map:loadedMap,id:draft?String(draft._id):null});
  }));
  app.put('/api/generated-map',auth,wrap(async(req,res)=>{
    const map=readOutdoorMap(req.body??{}),id=req.body?.prototypeId;
    if(!ObjectId.isValid(id))return res.status(400).json({error:'Invalid map ID.'});
    if(!map || map.npcs?.length || Object.keys(map.interiors??{}).length || Object.keys(map.links??{}).length)return res.status(400).json({error:'Invalid prototype map. Shared assets and travel links are not supported in this editor.'});
    const media=readGeneratedMedia(req.body,map);
    if(!media)return res.status(400).json({error:'Invalid generated assets or textures.'});
    Object.assign(map,normalizeEnvironmentFootprints({...map,...media}));
    for(const asset of media.generatedAssets.filter(a=>a.building)){const source=await database.collection('buildingAssets').findOne({_id:new ObjectId(asset.building.sourceId),userId:req.user._id},{projection:{_id:1}});if(!source)return res.status(400).json({error:'Source building not found in your collection.'});}
    if(typeof req.body.sourceTerrainId==='string'&&/^[a-f0-9]{24}$/i.test(req.body.sourceTerrainId)) {
      const source=await terrainCollections.findOne({_id:new ObjectId(req.body.sourceTerrainId),userId:req.user._id},{projection:{_id:1}});
      if(!source)return res.status(400).json({error:'Source terrain not found.'});
      map.sourceTerrainId=req.body.sourceTerrainId;
    }
    const _id=new ObjectId(id),guards=database.collection('generatedMapDeletionGuards');
    let result;
    try{result=await withDatabaseTransaction(async(session)=>{
      await assertTerrainAssetsNotDeleted(database.collection('terrainAssetDeletionGuards'),map,session);
      return saveGeneratedMap(generatedMapDrafts,guards,req.user._id,_id,map,session);
    });}catch(error){if(error.deletedTerrainAsset)return res.status(409).json({error:error.message});throw error;}
    if(result===404)return res.status(404).json({error:'Map not found.'});
    if(result===410)return res.status(410).json({error:'This map was permanently deleted and cannot be saved again.'});
    res.json({ok:true,id:String(_id),updatedAt:result});
  }));
  app.delete('/api/generated-map/:id',auth,wrap(async(req,res)=>{
    if(!ObjectId.isValid(req.params.id))return res.status(400).json({error:'Invalid map ID.'});
    const deleted=await withDatabaseTransaction((session)=>deleteGeneratedMap(generatedMapDrafts,database.collection('generatedMapDeletionGuards'),req.user._id,new ObjectId(req.params.id),session));
    if(!deleted)return res.status(404).json({error:'Map not found.'});
    res.json({ok:true});
  }));

  app.get('/api/world', auth, wrap(async (req, res) => {
    const world = await worlds.findOne({ userId: req.user._id }, { projection: { _id: 0, userId: 0 } });
    res.json({ world });
  }));

  async function playerInventory(req) {
    let world = await worlds.findOne({ userId: req.user._id });
    if (!world || !inventorySettings(world).enabled) return { world, record: null };
    const key = { playerId: req.user._id, worldId: world._id };
    let record = await playerInventories.findOne(key);
    if (!record) {
      const owner = { userId: req.user._id };
      await itemDeletionGuards.updateOne(owner, { $setOnInsert: { deletedIds: [], revision: 0 } }, { upsert: true });
      await withDatabaseTransaction(async (session) => {
        await itemDeletionGuards.updateOne(owner, { $inc: { revision: 1 } }, { session });
        world = await worlds.findOne(owner, { session });
        if (!world || !inventorySettings(world).enabled) return;
        const currentKey = { playerId: req.user._id, worldId: world._id };
        record = await playerInventories.findOne(currentKey, { session });
        if (!record) {
          const state = starterInventory(world);
          await playerInventories.updateOne(currentKey, { $setOnInsert: { ...currentKey, state, createdAt: new Date() } }, { upsert: true, session });
          record = await playerInventories.findOne(currentKey, { session });
        }
      });
    }
    return { world, record };
  }

  app.get('/api/play/inventory', auth, wrap(async (req, res) => {
    const { world, record } = await playerInventory(req);
    res.json({ state: record ? syncInventoryPositions(record.state, inventorySettings(world).hotbarSize) : null });
  }));

  app.post('/api/play/inventory', auth, wrap(async (req, res) => {
    const { world, record } = await playerInventory(req);
    if (!record) return res.status(400).json({ error: 'Inventory is disabled.' });
    if (req.body?.revision !== record.state.revision) return res.status(409).json({ error: 'Inventory changed in another session. It has been refreshed.', state: record.state });
    const action = req.body.action;
    if (!action || typeof action !== 'object') return res.status(400).json({ error: 'Invalid inventory action.' });
    let next;
    try { next = inventoryAction(record.state, { ...action, ...(action.type === 'drop' ? { dropId: new ObjectId().toString() } : {}) }, world); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const result = await playerInventories.updateOne({ _id: record._id, 'state.revision': record.state.revision }, { $set: { state: next, updatedAt: new Date() } });
    if (!result.modifiedCount) {
      const refreshed = await playerInventories.findOne({ _id: record._id });
      return res.status(409).json({ error: 'Inventory changed in another session. It has been refreshed.', state: refreshed.state });
    }
    res.json({ state: next });
  }));

  // Where the player was when they last left the game: { map, inside: entrance key or null, x, y }.
  app.get('/api/play/position', auth, wrap(async (req, res) => {
    res.json({ position: req.user.playPosition ?? null });
  }));

  // POST so it also works from a page that's closing (fetch with keepalive).
  app.post('/api/play/position', auth, wrap(async (req, res) => {
    const { map, inside = null, x, y } = req.body ?? {};
    const tile = (n) => Number.isInteger(n) && n >= 0 && n < 128;
    if (typeof map !== 'string' || !MAP_ID.test(map) || !(inside === null || (typeof inside === 'string' && TILE_KEY.test(inside))) || !tile(x) || !tile(y)) {
      return res.status(400).json({ error: 'Invalid position' });
    }
    await users.updateOne({ _id: req.user._id }, { $set: { playPosition: { map, inside, x, y, savedAt: new Date() } } });
    res.json({ ok: true });
  }));

  app.put('/api/world', auth, wrap(async (req, res) => {
    const main = readOutdoorMap(req.body ?? {});
    if (!main) return res.status(400).json({ error: 'Invalid world data' });
    const maps = readMaps(req.body.maps);
    if (!maps) return res.status(400).json({ error: 'Invalid maps' });
    // How long a game day lasts, in real minutes (one clock for the whole world).
    const { dayMinutes } = req.body;
    const validDay = Number.isInteger(dayMinutes) && dayMinutes >= 1 && dayMinutes <= 30;
    // Which in-game panels players see: { minimap, clock, stats } as true / false (missing means shown).
    const hud = req.body.hud && typeof req.body.hud === 'object'
      ? Object.fromEntries(['minimap', 'clock', 'stats'].filter((key) => typeof req.body.hud[key] === 'boolean').map((key) => [key, req.body.hud[key]]))
      : null;
    // Games switched on for the world: { tabletop: true }.
    const games = req.body.games && typeof req.body.games === 'object' && req.body.games.tabletop === true ? { tabletop: true } : null;
    const textures = Array.isArray(req.body.textures) ? req.body.textures : [];
    if (!validTextureLibrary(textures)) return res.status(400).json({ error: 'Invalid texture library' });
    const equipment = req.body.equipment ?? [];
    if (!validEquipmentLibrary(equipment)) return res.status(400).json({ error: 'Invalid equipment library' });
    let inventory;
    try { inventory = readInventoryConfig(req.body.inventory, equipment); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const cleanEquipment = equipment.map(({ id, name, description, kind, image,originalArtwork }) => ({ id, name, description, kind, image,...(originalArtwork?{originalArtwork}:{}) }));
    const cleanTextures = textures.map(({ id, name, image, surface, description, liquid,originalArtwork }) => ({ id, name, image,...(originalArtwork?{originalArtwork}:{}), ...(liquid!==undefined?{liquid}:{}), ...(surface ? { surface } : {}), ...(description ? { description } : {}) }));
    const restpoints = {
      enabled: req.body.restpoints?.enabled === true,
      assets: Array.isArray(req.body.restpoints?.assets)
        ? [...new Set(req.body.restpoints.assets.filter((id) => typeof id === 'string' && ObjectId.isValid(id)))].slice(0, 500) : [],
    };
    // Regions, and no map left pointing at one that doesn't exist.
    const regions = readRegions(req.body.regions);
    for (const map of [main, ...Object.values(maps)]) if (map.region && !regions[map.region]) delete map.region;
    const world = { ...main, maps, inventory, equipment: cleanEquipment, textures: cleanTextures, restpoints, ...(validDay ? { dayMinutes } : {}), ...(hud && Object.keys(hud).length ? { hud } : {}), ...(Object.keys(regions).length ? { regions } : {}), ...(games ? { games } : {}), updatedAt: new Date() };
    // Optional fields missing from this save are removed, so clearing them sticks.
    const unset = Object.fromEntries(['name', 'spawn', 'links', 'interiors', 'time', 'dayMinutes', 'weather', 'hud', 'region', 'regions', 'games', 'restCells', 'wallRows', 'paint', 'textures', 'farmCells', 'equipment', 'inventory'].filter((key) => !(key in world)).map((key) => [key, '']));
    const owner = { userId: req.user._id };
    await itemDeletionGuards.updateOne(owner, { $setOnInsert: { deletedIds: [], revision: 0 } }, { upsert: true });
    try {
      await withDatabaseTransaction(async (session) => {
        await itemDeletionGuards.updateOne(owner, { $inc: { revision: 1 } }, { session });
        const guard = await itemDeletionGuards.findOne(owner, { session });
        assertItemsNotDeleted(inventory.items, guard.deletedIds);
        await assertTerrainAssetsNotDeleted(database.collection('terrainAssetDeletionGuards'),world,session);
        await worlds.updateOne(owner, { $set: world, ...(Object.keys(unset).length ? { $unset: unset } : {}), $setOnInsert: { createdAt: new Date() } }, { upsert: true, session });
      });
    } catch (error) { if (error.deletedItem||error.deletedTerrainAsset) return res.status(409).json({ error: error.message });throw error; }
    res.json({ world });
  }));

  // Add authenticated game routes here. Do not expose the collection publicly.
  if (process.env.NODE_ENV === 'production') {
    const dist = fileURLToPath(new URL('../dist/', import.meta.url));
    app.use(express.static(dist));
    app.get('*', (req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Image must be 10 MB or smaller' });
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  });
  const server = app.listen(Number(process.env.PORT) || 3001, () => console.log('API server listening on port ' + (process.env.PORT || 3001)));
  server.on('error', async (error) => {
    console.error(error.code === 'EADDRINUSE'
      ? `API port ${process.env.PORT || 3001} is already in use. Stop the existing lobby server with Ctrl+C before starting another copy.`
      : `Could not start API server (${error.code || 'unknown error'}).`);
    await closeDatabase();
    process.exit(1);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(async () => { await closeDatabase(); process.exit(0); }));
  }
}

start().catch(async () => {
  console.error('Server startup failed. Check MongoDB credentials, network access, and configuration.');
  await closeDatabase();
  process.exitCode = 1;
});
