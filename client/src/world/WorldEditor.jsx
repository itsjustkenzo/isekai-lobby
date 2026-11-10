import ItemsPanel from './ItemsPanel.jsx';
import InventorySettings from './InventorySettings.jsx';
import EditorTabs from './EditorTabs.jsx';
import EquipmentPanel from './EquipmentPanel.jsx';
import { canTill } from './farming.js';
import TexturePainter from './TexturePainter.jsx';
import { setPaintTextures } from './paintTextures.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { buildArt, toolPreview } from './art.js';
import { createPixelGame } from './pixelGame.js';
import { WEATHER_KINDS, weatherOf } from './weather.js';
import { FIXED_PHASES, MAX_DAY_MINUTES, MIN_DAY_MINUTES, PHASES, timeOf } from './daycycle.js';
import { BRUSH_SIZES, BUILDINGS, DECOR_TOOLS, ERASER, ROOF_STYLES, STRUCTURE_TOOLS, TERRAIN_TOOLS, applyTool, roofInStyle, buildingById, createDefaultWorld, customBuildings, fromSaved, rebuildFootprints, rebuildPlacements, restore, setCustomHouses, snapshot, toSaved, setAssets, assetTool, assetFromTool, setAssetOrientation, TURNS, FLOOR_TOOLS, ENTRANCE_TOOL, entranceAt, activeEntrances, createInterior, MAIN_MAP, TRAVEL_TOOL, mapById, listMaps, createMap, deleteMap, travelPoints, entranceKey, MAX_MAPS, MAP_PRESETS, HUD_PANELS, hudOf, GAME_TOOLS, gamesOf, setNpcs, npcTool, npcFromTool, pruneNpcs, MAX_REGIONS, createRegion, listRegions, regionOfMap, setMapRegion, SPAWN_TOOL, canSpawnAt, findSpawn, placeTravelArea, travelAreaAt, arrivalArea, isTwoWay, setTwoWay } from './world.js';
import { WorldScene } from './WorldScene.js';
import HouseDesigner from './HouseDesigner.jsx';
import AssetBrowser from './AssetBrowser.jsx';
import MapFlow from './MapFlow.jsx';
import PlayView from './PlayView.jsx';
import { restpointsOf } from './world.js';

const HISTORY_LIMIT = 50;
const GRID_PREF_KEY = 'isekai.worldEditor.showGrid';

function readGridPref() {
  try { return localStorage.getItem(GRID_PREF_KEY) === '1'; } catch { return false; }
}

function writeGridPref(show) {
  try { localStorage.setItem(GRID_PREF_KEY, show ? '1' : '0'); } catch { /* storage unavailable */ }
}

function ToolButton({ active, preview, icon = '⌫', label, onClick }) {
  return (
    <button type="button" className={`tool${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active} title={label}>
      {preview ? <img src={preview} alt="" /> : <span className="tool-icon" aria-hidden="true">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

export default function WorldEditor({ user, onBack }) {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const rootRef = useRef(null); // the main world; extra maps live in rootRef.current.maps, interiors in each map's .interiors
  const worldRef = useRef(null); // the world being edited: the outside, or one interior
  const strokeRef = useRef(null);
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const [loadState, setLoadState] = useState('loading');
  const [tool, setTool] = useState('d');
  const [brush, setBrush] = useState(1);
  const toolRef = useRef(tool);
  const brushRef = useRef(brush);
  const [dirty, setDirty] = useState(false);
  const [savedItems,setSavedItems] = useState([]);
  const [deletingItem,setDeletingItem] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [showGrid, setShowGrid] = useState(readGridPref);
  const [zoom, setZoom] = useState(null);
  const [houses, setHouses] = useState([]); // the player's designed houses
  const [maxHouses, setMaxHouses] = useState(10);
  const [designing, setDesigning] = useState(false);
  const [library, setLibrary] = useState([]); // the player's "My assets"
  const [characters, setCharacters] = useState([]); // the creator's NPC characters
  const [maxCharacters, setMaxCharacters] = useState(20);
  const [npcForm, setNpcForm] = useState({ file: null, preview: null, gender: user.availableGenders?.[0] ?? 'male', name: '', description: '', prompt: '' });
  const [npcBusy, setNpcBusy] = useState(false);
  const [npcNotice, setNpcNotice] = useState('');
  const [npcDraft, setNpcDraft] = useState(null); // edits to the selected character's text: { id, name, description, prompt }
  const [maxLibrary, setMaxLibrary] = useState(100);
  const [browsing, setBrowsing] = useState(false);
  const [roofStyle, setRoofStyle] = useState('hip');
  const [assetTurn, setAssetTurn] = useState(null); // null, TURNS.ROTATED or TURNS.VERTICAL
  const [assetFlipped, setAssetFlipped] = useState(false);
  const [turning, setTurning] = useState(false); // creating an asset's vertical version
  const [historyVersion, setHistoryVersion] = useState(0);
  const [editingMap, setEditingMap] = useState(MAIN_MAP); // which outdoor map is being edited
  const [editingKey, setEditingKey] = useState(null); // entrance key of the interior being edited, or null
  const [selectedTravel, setSelectedTravel] = useState(null); // a tile key in the selected travel area
  const [sideTab, setSideTab] = useState('paint'); // sidebar section: maps, paint, create, hud or game
  const [stageTab, setStageTab] = useState('edit'); // main area: the map editor or the map flow diagram
  const [selectedEntrance, setSelectedEntrance] = useState(null);
  const [preview, setPreview] = useState(null); // the world being previewed in play mode, or null
  const [newMap, setNewMap] = useState(null); // the Add map chooser: { name, preset }, or null when closed
  const [entranceVersion, setEntranceVersion] = useState(0);
  const bumpEntrances = () => setEntranceVersion((v) => v + 1);
  const bumpHistory = () => setHistoryVersion((v) => v + 1);
  const previews = useMemo(() => {
    const art = buildArt();
    return Object.fromEntries([
      ...TERRAIN_TOOLS.map((t) => [t.id, toolPreview(art, 'terrain', t.id)]),
      ...FLOOR_TOOLS.map((t) => [t.id, toolPreview(art, 'terrain', t.id)]),
      ...DECOR_TOOLS.map((t) => [t.id, toolPreview(art, 'decor', t.id)]),
      ...GAME_TOOLS.map((t) => [t.id, toolPreview(art, 'decor', t.id)]),
      ...BUILDINGS.map((b) => [b.id, toolPreview(art, 'building', b.id)]),
      ...STRUCTURE_TOOLS.map((t) => [t.id, toolPreview(art, 'structure', t.id)]),
    ]);
  }, []);

  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { brushRef.current = brush; }, [brush]);
  useEffect(() => {
    sceneRef.current?.setShowGrid(showGrid);
    writeGridPref(showGrid);
  }, [showGrid]);

  useEffect(() => {
    let cancelled = false;
    // Player houses must be registered before the world is read, so their footprints are recognised.
    Promise.all([api('/api/world'), api('/api/houses'), api('/api/assets/library'), api('/api/npcs')])
      .then(([worldRes, housesRes, assetsRes, npcsRes]) => {
        if (cancelled) return;
        if (!worldRes.ok || !housesRes.ok || !assetsRes.ok || !npcsRes.ok) return setLoadState('error');
        setNpcs(npcsRes.data.npcs);
        setCharacters(npcsRes.data.npcs);
        setMaxCharacters(npcsRes.data.max);
        setCustomHouses(housesRes.data.houses);
        setAssets(assetsRes.data.assets);
        setLibrary(assetsRes.data.assets);
        setMaxLibrary(assetsRes.data.max);
        setHouses(housesRes.data.houses);
        setMaxHouses(housesRes.data.max);
        const root = worldRes.data.world ? fromSaved(worldRes.data.world) : createDefaultWorld();
        root.interiors ??= {};
        pruneNpcs(root); // characters deleted since the world was saved
        setSavedItems(structuredClone(root.inventory?.items ?? []));
        rootRef.current = root;
        worldRef.current = root;
        setLoadState('ready');
      })
      .catch(() => !cancelled && setLoadState('error'));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loadState !== 'ready') return undefined;
    const map = mapById(rootRef.current, editingMap);
    worldRef.current = editingKey ? map.interiors[editingKey] : map;
    const scene = new WorldScene({
      world: worldRef.current,
      heroUrl: user.character?.spriteUrl,
      showGrid: readGridPref(),
      onZoomChange: setZoom,
      getTool: () => toolRef.current,
      getBrush: () => brushRef.current,
      onPaint: (x, y) => {
        // The Entrances tool selects a building instead of painting.
        if (toolRef.current === ENTRANCE_TOOL) {
          setSelectedEntrance(entranceAt(worldRef.current, x, y));
          return [];
        }
        // The Spawn point tool moves the map's spawn point (not part of undo, like other settings).
        if (toolRef.current === SPAWN_TOOL) {
          if (!editingKey && canSpawnAt(worldRef.current, x, y)) {
            worldRef.current.spawn = { x, y };
            setDirty(true);
            bumpEntrances();
          }
          return [];
        }
        if (!strokeRef.current) strokeRef.current = { before: snapshot(worldRef.current), changed: false };
        // One building per click: dragging with a building tool doesn't stamp a row of houses.
        if ((buildingById(toolRef.current) || assetFromTool(toolRef.current)) && strokeRef.current.changed) return [];
        const changed = applyTool(worldRef.current, toolRef.current, x, y, brushRef.current);
        if (changed.length) strokeRef.current.changed = true;
        return changed;
      },
      // Travel point tool: a click on an area selects it; a drag marks a rectangle as a travel area.
      onArea: (start, end) => {
        const world = worldRef.current;
        if (['rest-area', 'rest-remove', 'farm-area', 'farm-remove'].includes(toolRef.current)) {
          const farming = toolRef.current.startsWith('farm-');
          if (farming ? world.interior : !restpointsOf(rootRef.current).enabled) return [];
          const field = farming ? 'farmCells' : 'restCells';
          const before = snapshot(world);
          const cells = new Set(world[field] ?? []);
          const changed = [];
          for (let y = Math.max(0, Math.min(start.y, end.y)); y <= Math.min(world.height - 1, Math.max(start.y, end.y)); y++) {
            for (let x = Math.max(0, Math.min(start.x, end.x)); x <= Math.min(world.width - 1, Math.max(start.x, end.x)); x++) {
              const i = y * world.width + x;
              const remove = toolRef.current.endsWith('-remove');
              if (farming && !remove && !canTill({ ...world, farmCells: [i] }, x, y)) continue;
              if (cells.has(i) === !remove) continue;
              if (remove) cells.delete(i); else cells.add(i);
              changed.push(i);
            }
          }
          if (!changed.length) return [];
          world[field] = [...cells];
          undoRef.current = [...undoRef.current.slice(-(HISTORY_LIMIT - 1)), before];
          redoRef.current = [];
          setDirty(true);
          bumpHistory();
          return changed;
        }
        if (start.x === end.x && start.y === end.y && travelAreaAt(world, start.x, start.y)) {
          setSelectedTravel(entranceKey(start.x, start.y));
          return [];
        }
        const before = snapshot(world);
        const changed = placeTravelArea(world, start.x, start.y, end.x, end.y);
        if (!changed.length) return [];
        undoRef.current = [...undoRef.current.slice(-(HISTORY_LIMIT - 1)), before];
        redoRef.current = [];
        const first = changed[0];
        setSelectedTravel(entranceKey(first % world.width, Math.floor(first / world.width)));
        setDirty(true);
        setStatus('');
        bumpHistory();
        return changed;
      },
      onStrokeEnd: () => {
        const stroke = strokeRef.current;
        strokeRef.current = null;
        if (!stroke?.changed) return;
        undoRef.current = [...undoRef.current.slice(-(HISTORY_LIMIT - 1)), stroke.before];
        redoRef.current = [];
        setDirty(true);
        setStatus('');
        bumpHistory();
      },
    });
    sceneRef.current = scene;
    const destroyGame = createPixelGame(hostRef.current, scene);
    return () => {
      sceneRef.current = null;
      destroyGame();
    };
  }, [loadState, editingMap, editingKey, user.character?.spriteUrl]);

  // Gold markers on enterable buildings, kept up to date as buildings and settings change.
  useEffect(() => {
    if (loadState !== 'ready') return;
    sceneRef.current?.setEntranceMarkers(editingKey ? [] : activeEntrances(mapById(rootRef.current, editingMap)));
  }, [loadState, editingMap, editingKey, entranceVersion, historyVersion]);

  useEffect(() => {
    if (loadState !== 'ready' || !worldRef.current) return;
    const world = worldRef.current;
    const selected = selectedTravel && travelAreaAt(world, ...selectedTravel.split(',').map(Number));
    sceneRef.current?.setMarkers({ areas: travelPoints(world), selectedKey: selected?.key ?? null, spawn: editingKey ? null : findSpawn(world) });
  }, [loadState, editingMap, editingKey, entranceVersion, historyVersion, selectedTravel]);

  // ---- Entrances and interiors ----
  const currentMap = () => mapById(rootRef.current, editingMap);
  const interiorOf = (entrance) => entrance && currentMap()?.interiors[entrance.key];

  function setEnterable(entrance, enabled) {
    const rooms = currentMap().interiors;
    if (enabled && !rooms[entrance.key]) rooms[entrance.key] = createInterior(entrance.style, entrance.label);
    if (rooms[entrance.key]) rooms[entrance.key].enabled = enabled;
    setDirty(true);
    setStatus('');
    bumpEntrances();
  }

  function renameInterior(entrance, name) {
    const room = interiorOf(entrance);
    if (!room) return;
    room.name = name.slice(0, 40);
    setDirty(true);
    bumpEntrances();
  }

  // Switches what's being edited: a map, or one of its interiors (undo history is per map or room).
  function switchTo(mapId, key = null) {
    undoRef.current = [];
    redoRef.current = [];
    strokeRef.current = null;
    setSelectedEntrance(null);
    setSelectedTravel(null);
    setEditingMap(mapId);
    setEditingKey(key);
    setTool(key || mapById(rootRef.current, mapId)?.indoorMap ? 'o' : 'd');
    bumpHistory();
  }
  const switchWorld = (key) => switchTo(editingMap, key);
  const openEditor = (mapId, key = null) => {
    if (mapId !== editingMap || key !== editingKey) switchTo(mapId, key);
    setStageTab('edit');
  };

  // ---- Maps ----
  function addMap(event) {
    event.preventDefault();
    const id = createMap(rootRef.current, newMap.name.trim(), newMap.preset);
    setNewMap(null);
    setDirty(true);
    openEditor(id);
  }

  function renameMap(name) {
    currentMap().name = name.slice(0, 40);
    setDirty(true);
    bumpEntrances();
  }

  function removeMap() {
    const map = currentMap();
    if (!window.confirm(`Delete the map "${map.name}" and everything on it, including its interiors? Travel points leading there will need a new destination.`)) return;
    deleteMap(rootRef.current, editingMap);
    setDirty(true);
    switchTo(MAIN_MAP);
  }

  // ---- Characters (NPCs) ----
  const selectedNpc = npcFromTool(tool);

  // The text panel follows the selected character.
  useEffect(() => {
    setNpcDraft(selectedNpc ? { id: selectedNpc.id, name: selectedNpc.name, description: selectedNpc.description, prompt: selectedNpc.prompt } : null);
  }, [selectedNpc?.id]);

  function pickNpcFile(event) {
    const file = event.target.files?.[0] ?? null;
    if (npcForm.preview) URL.revokeObjectURL(npcForm.preview);
    setNpcForm((form) => ({ ...form, file, preview: file ? URL.createObjectURL(file) : null }));
    setNpcNotice('');
  }

  async function createNpc(event) {
    event.preventDefault();
    const { file, gender, name, description, prompt } = npcForm;
    if (!file || !name.trim() || npcBusy) return;
    setNpcBusy(true);
    setNpcNotice('');
    try {
      const query = new URLSearchParams({ gender, name: name.trim(), description, prompt });
      const { ok, data } = await api(`/api/npcs?${query}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      if (!ok) { setNpcNotice(data.error ?? 'Could not create the character. Please try again.'); return; }
      const next = [...characters, data.npc];
      setCharacters(next);
      setNpcs(next);
      if (npcForm.preview) URL.revokeObjectURL(npcForm.preview);
      setNpcForm({ file: null, preview: null, gender, name: '', description: '', prompt: '' });
      setTool(npcTool(data.npc));
      setNpcNotice(`${data.npc.name} is ready. Click the map to place them.`);
    } catch {
      setNpcNotice('Could not reach the server. Please try again.');
    } finally {
      setNpcBusy(false);
    }
  }

  async function saveNpcText() {
    if (!npcDraft?.name.trim()) return;
    const { ok, data } = await api(`/api/npcs/${npcDraft.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: npcDraft.name, description: npcDraft.description, prompt: npcDraft.prompt }),
    }).catch(() => ({ ok: false, data: {} }));
    if (!ok) { setNpcNotice(data.error ?? 'Could not save. Please try again.'); return; }
    const next = characters.map((c) => (c.id === data.npc.id ? data.npc : c));
    setCharacters(next);
    setNpcs(next);
    setNpcNotice(`Saved ${data.npc.name}.`);
  }

  // Deleting a character removes them everywhere they stand (save the world to keep that).
  async function deleteNpc(npc) {
    if (!window.confirm(`Delete ${npc.name}? They'll be removed from every map they stand on.`)) return;
    const { ok } = await api(`/api/npcs/${npc.id}`, { method: 'DELETE' }).catch(() => ({ ok: false }));
    if (!ok) { setNpcNotice('Could not delete. Please try again.'); return; }
    const next = characters.filter((c) => c.id !== npc.id);
    setCharacters(next);
    setNpcs(next);
    pruneNpcs(rootRef.current);
    sceneRef.current?.syncNpcs();
    if (tool === npcTool(npc)) setTool('d');
    setDirty(true);
    setNpcNotice(`Deleted ${npc.name}.`);
  }

  // ---- Time of day, weather and regions ----
  // A map in a region shares the region's time of day and weather, so those controls edit the region.
  const climateTarget = () => regionOfMap(rootRef.current, editingMap)?.region ?? currentMap();

  function chooseRegion(value) {
    const regionId = value === '__new' ? createRegion(rootRef.current) : value || null;
    setMapRegion(rootRef.current, editingMap, regionId);
    setDirty(true);
    bumpEntrances();
  }

  // "Shared with region …" under Time of day and Weather, for a map in a region.
  function regionNote() {
    const inRegion = regionOfMap(rootRef.current, editingMap);
    if (!inRegion) return null;
    const members = listRegions(rootRef.current).find((r) => r.id === inRegion.id)?.maps ?? [];
    return <p className="region-note">Shared by the region <strong>{inRegion.region.name}</strong> ({members.map((m) => m.name).join(', ')}). Changes apply to all of them.</p>;
  }

  function setMapTime(time) {
    const target = climateTarget();
    target.time = { ...(target.time ?? {}), ...time };
    setDirty(true);
    bumpEntrances();
  }

  // Games players can play (whole world). Turning one off keeps placed tables as furniture.
  function setGame(id, on) {
    rootRef.current.games = { ...gamesOf(rootRef.current), [id]: on };
    if (!on && GAME_TOOLS.some((t) => t.id === tool)) setTool('d');
    setDirty(true);
    bumpEntrances();
  }

  function setHudPanel(id, shown) {
    rootRef.current.hud = { ...hudOf(rootRef.current), [id]: shown };
    setDirty(true);
    bumpEntrances();
  }

  function setDayMinutes(minutes) {
    rootRef.current.dayMinutes = minutes;
    setDirty(true);
    bumpEntrances();
  }

  function setMapWeather(weather) {
    climateTarget().weather = weather;
    setDirty(true);
    bumpEntrances();
  }

  // ---- Travel points ----
  const selectedArea = selectedTravel && worldRef.current ? travelAreaAt(worldRef.current, ...selectedTravel.split(',').map(Number)) : null;
  const travelLink = selectedArea?.link ?? null;

  // Two-way paths link maps, not building interiors (players can only travel to maps).
  const canTwoWay = !editingKey;

  function updateTravel(patch) {
    Object.assign(travelLink, patch);
    if ('to' in patch) travelLink.arrive = null;
    // Arriving in an area that doesn't lead anywhere yet (or leads to this map, at its spawn point): make it the way back.
    const back = patch.arrive && canTwoWay ? arrivalArea(rootRef.current, selectedArea) : null;
    if (back && (!back.link.to || (back.link.to === editingMap && !back.link.arrive))) setTwoWay(rootRef.current, editingMap, selectedArea, true);
    setDirty(true);
    bumpEntrances();
  }

  function toggleTwoWay(on) {
    if (!on && !window.confirm(`"${arrivalArea(rootRef.current, selectedArea).link.name}" will stop leading back here. Continue?`)) return;
    setTwoWay(rootRef.current, editingMap, selectedArea, on);
    setDirty(true);
    bumpEntrances();
  }

  const editingRoom = editingKey ? currentMap()?.interiors[editingKey] : null;
  // Indoor maps ("Small interior") are edited like building interiors: floors and assets, no buildings.
  const editingIndoor = Boolean(editingRoom || currentMap()?.indoorMap);

  // Swaps in a whole-world snapshot, saving the current state onto the given history stack.
  const replaceWorld = useCallback((next, stackForCurrent) => {
    stackForCurrent.current = [...stackForCurrent.current, snapshot(worldRef.current)];
    restore(worldRef.current, next);
    sceneRef.current?.setWorld(worldRef.current);
    setDirty(true);
    setStatus('');
    bumpHistory();
  }, []);

  const undo = useCallback(() => {
    const previous = undoRef.current.at(-1);
    if (!previous) return;
    undoRef.current = undoRef.current.slice(0, -1);
    replaceWorld(previous, redoRef);
  }, [replaceWorld]);

  const redo = useCallback(() => {
    const next = redoRef.current.at(-1);
    if (!next) return;
    redoRef.current = redoRef.current.slice(0, -1);
    replaceWorld(next, undoRef);
  }, [replaceWorld]);

  function houseDesigned(house) {
    const next = [...houses, house].sort((a, b) => a.slot - b.slot);
    setCustomHouses(next);
    setHouses(next);
    sceneRef.current?.loadCustomHouse({ id: String(house.slot), spriteUrl: house.spriteUrl,originalArtwork:house.originalArtwork }, () => {});
  }

  function placeDesigned(house) {
    setDesigning(false);
    setTool(String(house.slot));
  }

  async function deleteHouse(house) {
    if (!window.confirm(`Delete "${house.name}"? Any copies placed in your world will be removed, and undo history is cleared.`)) return;
    const { ok } = await api(`/api/houses/${house.slot}`, { method: 'DELETE' }).catch(() => ({ ok: false }));
    if (!ok) return setStatus('Could not delete that house. Please try again.');
    const next = houses.filter((h) => h.slot !== house.slot);
    setCustomHouses(next);
    setHouses(next);
    const outdoor = listMaps(rootRef.current).map((m) => m.world);
    const before = outdoor.map((w) => w.objects.join('')).join('|');
    outdoor.forEach(rebuildFootprints);
    sceneRef.current?.setWorld(worldRef.current);
    if (outdoor.map((w) => w.objects.join('')).join('|') !== before) setDirty(true);
    bumpEntrances();
    // Older snapshots may still contain the deleted house, so history can't safely restore them.
    undoRef.current = [];
    redoRef.current = [];
    bumpHistory();
    if (tool === String(house.slot)) setTool('H');
  }

  const selectedAsset = assetFromTool(tool);
  // Vertical only applies to assets that have a vertical version; until then they place as drawn.
  const placingTurn = assetTurn === TURNS.VERTICAL && !selectedAsset?.sideSpriteUrl ? null : assetTurn;

  useEffect(() => {
    setAssetOrientation({ turn: placingTurn, flipped: assetFlipped });
    sceneRef.current?.refreshHover();
  }, [placingTurn, assetFlipped]);

  // Chooses how assets are placed. Vertical creates the asset's vertical version with AI the first time.
  async function chooseTurn(turn) {
    if (turn !== TURNS.VERTICAL || !selectedAsset || selectedAsset.sideSpriteUrl) return setAssetTurn(turn);
    setTurning(true);
    setStatus('');
    try {
      const { ok, data } = await api(`/api/assets/${selectedAsset.id}/side`, { method: 'POST' });
      if (!ok) return setStatus(data.error || 'Could not create the vertical version.');
      const next = library.map((a) => (a.id === data.asset.id ? data.asset : a));
      setAssets(next);
      setLibrary(next);
      sceneRef.current?.loadAsset(data.asset, () => sceneRef.current?.syncAssets());
      setAssetTurn(TURNS.VERTICAL);
    } catch {
      setStatus('Could not reach the server. Please try again.');
    } finally {
      setTurning(false);
    }
  }

  useEffect(() => {
    function onKey(event) {
      if (!selectedAsset || turning || browsing || designing || preview || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target.closest?.('input, textarea, select')) return;
      const key = event.key.toLowerCase();
      if (key === 'r') { event.preventDefault(); chooseTurn(placingTurn === TURNS.ROTATED ? null : TURNS.ROTATED); }
      else if (key === 'v') { event.preventDefault(); chooseTurn(placingTurn === TURNS.VERTICAL ? null : TURNS.VERTICAL); }
      else if (key === 'f') { event.preventDefault(); setAssetFlipped((f) => !f); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function assetAdded(asset) {
    setLibrary((current) => {
      if (current.some((a) => a.id === asset.id)) return current;
      const next = [...current, asset];
      setAssets(next);
      return next;
    });
    sceneRef.current?.loadAsset(asset, () => sceneRef.current?.syncAssets());
    setTool(assetTool(asset));
  }

  async function removeFromLibrary(asset) {
    // Assets you created are deleted for good; others are only taken off your list.
    const message = asset.mine
      ? `Delete "${asset.name}" permanently? It is removed from the database, from every player who added it, and from all worlds where it is placed. Undo history is cleared. This can't be undone.`
      : `Remove "${asset.name}" from My assets? It was made by another player, so it stays available in search. Copies placed in your world will be removed, and undo history is cleared.`;
    if (!window.confirm(message)) return;
    const { ok } = await api(`/api/assets/${asset.id}/library`, { method: 'DELETE' }).catch(() => ({ ok: false }));
    if (!ok) return setStatus('Could not remove that asset. Please try again.');
    const next = library.filter((a) => a.id !== asset.id);
    setAssets(next);
    setLibrary(next);
    const worlds = listMaps(rootRef.current).flatMap((m) => [m.world, ...Object.values(m.world.interiors ?? {})]);
    const before = worlds.reduce((n, w) => n + w.placed.length, 0);
    worlds.forEach(rebuildPlacements);
    sceneRef.current?.setWorld(worldRef.current);
    if (worlds.reduce((n, w) => n + w.placed.length, 0) !== before) setDirty(true);
    // Older snapshots may still contain the removed asset, so history can't safely restore them.
    undoRef.current = [];
    redoRef.current = [];
    bumpHistory();
    if (tool === assetTool(asset)) setTool('d');
  }

  function reset() {
    const message = editingIndoor ? 'Reset this room to its starting layout? You can undo this.' : 'Reset this map to a fresh meadow? You can undo this.';
    if (!window.confirm(message)) return;
    redoRef.current = [];
    // Rebuilt at the current size, so a 100×80 town stays 100×80.
    const world = worldRef.current;
    const fresh = editingRoom ? createInterior(editingRoom.style, editingRoom.name)
      : world.indoorMap ? createInterior(world.style, world.name, world, false)
        : createDefaultWorld(world.width, world.height);
    replaceWorld(snapshot(fresh), undoRef);
  }

  // Plays a copy of the world as it is now (saved or not), starting where the creator is editing.
  function startPreview() {
    setPreview({ world: fromSaved(toSaved(rootRef.current)), map: editingMap, inside: editingKey });
  }

  async function deleteItem(itemId) {
    if (saving) throw new Error('Wait for the current save to finish, then delete this item.');
    setDeletingItem(true);
    try {
    const { ok, data } = await api(`/api/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
    if (!ok) throw new Error(data.error || 'Could not delete the item. Please try again.');
    const config = rootRef.current.inventory;
    if (config) rootRef.current.inventory = { ...config, items: config.items.filter((item) => item.id !== itemId), startingItems: config.startingItems.filter((entry) => entry.itemId !== itemId) };
    setSavedItems((items) => items.filter((item) => item.id !== itemId));
    bumpEntrances();
    } finally { setDeletingItem(false); }
  }

  async function save() {
    setSaving(true);
    setStatus('');
    try {
      const submitted = toSaved(rootRef.current);
      const { ok, data } = await api('/api/world', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitted) });
      if (ok) { setSavedItems(structuredClone(data.world?.inventory?.items ?? submitted.inventory?.items ?? [])); setDirty(false); setStatus('Saved ✓'); }
      else setStatus(data.error || 'Could not save. Please try again.');
    } catch {
      setStatus('Could not reach the server. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function back() {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    onBack();
  }

  useEffect(() => {
    function onKey(event) {
      if (preview || !(event.ctrlKey || event.metaKey) || event.target.closest?.('input, textarea')) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
      else if (key === 's') { event.preventDefault(); save(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const brushApplies = tool.startsWith('texture:') || tool === ERASER || TERRAIN_TOOLS.some((t) => t.id === tool) || FLOOR_TOOLS.some((t) => t.id === tool) || STRUCTURE_TOOLS.some((t) => t.id === tool && ['wall', 'roof', 'fence'].includes(t.kind));
  const toolKind = STRUCTURE_TOOLS.find((t) => t.id === tool)?.kind;

  return (
    <section className="editor" aria-labelledby="editor-title">
      <div className="editor-head">
        <div className="editor-title">
          {editingRoom
            ? <button type="button" className="text-button" onClick={() => switchWorld(null)}>← Back to world</button>
            : <button type="button" className="text-button" onClick={back}>← Back</button>}
          <h2 id="editor-title">{editingRoom ? `Interior: ${editingRoom.name}` : editingMap === MAIN_MAP ? 'Create your world' : `Map: ${currentMap()?.name}`}</h2>
        </div>
        <div className="editor-actions">
          <span className="save-status" role="status">{saving ? 'Saving…' : status || (dirty ? 'Unsaved changes' : '')}</span>
          <button type="button" className="login-button save-button preview-button" onClick={startPreview} disabled={loadState !== 'ready'} title="Play the world as it is now, starting here. Nothing is saved.">
            <span aria-hidden="true">▶</span><span>Preview world</span>
          </button>
          <button type="button" className="login-button save-button" onClick={save} disabled={saving || deletingItem || loadState !== 'ready'}>
            <span className="button-spark" aria-hidden="true">✧</span><span>Save world</span>
          </button>
        </div>
      </div>

      <div className="editor-body">
        <aside className="toolbar" aria-label="World editing tools">
          <EditorTabs selected={sideTab} onSelect={setSideTab} />

          <div className="side-panel" id="side-panel" role="tabpanel" aria-labelledby={`side-tab-${sideTab}`}>
            {sideTab === 'maps' && loadState === 'ready' && (<>
              <div className="tool-group">
                <h3>Maps <span className="count">{listMaps(rootRef.current).length}/{MAX_MAPS + 1}</span></h3>
                <ul className="map-list">
                  {listMaps(rootRef.current).map((map) => (
                    <li key={map.id}>
                      <button type="button" className={editingMap === map.id && !editingKey ? 'active' : ''} aria-current={editingMap === map.id && !editingKey ? 'true' : undefined} onClick={() => openEditor(map.id)}>
                        <span className="map-name">{map.id === MAIN_MAP ? '🌍' : map.world.indoorMap ? '🏛' : '🗺'} {map.name}</span>
                        <small>{map.world.width}×{map.world.height}</small>
                      </button>
                      {activeEntrances(map.world).length > 0 && (
                        <ul>
                          {activeEntrances(map.world).map((entrance) => (
                            <li key={entrance.key}>
                              <button type="button" className={editingMap === map.id && editingKey === entrance.key ? 'active' : ''} onClick={() => openEditor(map.id, entrance.key)}>
                                🏠 {entrance.interior.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="map-creation-options" aria-label="Map creation options">
                  <section className="map-creation-option"><h4>Create your map</h4><p>Start with a blank interior or exterior map. Choose a size, then paint and build it yourself.</p><button type="button" className="design-button" onClick={()=>setNewMap({name:'',preset:'medium'})} disabled={Object.keys(rootRef.current.maps??{}).length>=MAX_MAPS}>Create your map</button></section>
                </div>
                {newMap ? (
                  <form className="new-map" onSubmit={addMap}>
                    <fieldset className="map-presets">
                      <legend>Map size</legend>
                      {MAP_PRESETS.map((preset) => (
                        <label key={preset.id} className={newMap.preset === preset.id ? 'selected' : ''}>
                          <input type="radio" name="map-preset" value={preset.id} checked={newMap.preset === preset.id} onChange={() => setNewMap({ ...newMap, preset: preset.id })} />
                          <span className="preset-shape" aria-hidden="true"><span className={preset.indoor ? 'indoor' : ''} style={{ width: `${preset.width * 0.4}px`, height: `${preset.height * 0.4}px` }} /></span>
                          <span className="preset-text">
                            <strong>{preset.label}</strong>
                            <small>{preset.width} × {preset.height} tiles · {preset.indoor ? 'indoor' : 'outdoor'}</small>
                            <small>{preset.hint}</small>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                    <label className="entrance-name">Map name
                      <input value={newMap.name} maxLength={40} placeholder={`Map ${listMaps(rootRef.current).length + 1}`} onChange={(e) => setNewMap({ ...newMap, name: e.target.value })} autoFocus />
                    </label>
                    {MAP_PRESETS.find((p) => p.id === newMap.preset)?.indoor && <p className="hint">Indoor maps have no door to the outside: add a travel point inside, and one on another map leading here.</p>}
                    <div className="map-buttons">
                      <button type="submit" className="design-button">Create map</button>
                      <button type="button" className="design-button secondary" onClick={() => setNewMap(null)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                <div className="map-buttons">
                  <button type="button" className="design-button secondary" onClick={() => setStageTab('flow')}>🔀 Map flow</button>
                </div>
                )}
                {!editingRoom && (
                  <div className="map-settings">
                    <label className="entrance-name">Map name
                      <input value={currentMap()?.name ?? (editingMap === MAIN_MAP ? 'Main world' : '')} placeholder="Main world" maxLength={40} onChange={(e) => renameMap(e.target.value)} />
                    </label>
                    <label className="entrance-name">Region
                      <select value={regionOfMap(rootRef.current, editingMap)?.id ?? ''} onChange={(e) => chooseRegion(e.target.value)}>
                        <option value="">No region (its own time & weather)</option>
                        {listRegions(rootRef.current).map((r) => <option key={r.id} value={r.id}>{r.region.name}</option>)}
                        {listRegions(rootRef.current).length < MAX_REGIONS && <option value="__new">＋ New region…</option>}
                      </select>
                    </label>
                    {editingMap !== MAIN_MAP && <button type="button" className="text-button danger" onClick={removeMap}>Delete this map</button>}
                  </div>
                )}
              </div>

              <div className="tool-group">
                <h3>Time of day</h3>
                {regionNote()}
                {(() => {
                  const time = timeOf(currentMap(), rootRef.current);
                  const mapName = currentMap()?.name || 'Main world';
                  return (<>
                    {editingRoom && <p className="hint">This building follows its map. Changing it here changes all of {mapName}.</p>}
                    <div className="segmented" role="group" aria-label="Time of day">
                      {[['cycle', '🔄 Day cycle'], ['fixed', '📌 Fixed'], ['off', '⛔ Off']].map(([mode, label]) => (
                        <button key={mode} type="button" className={time.mode === mode ? 'active' : ''} aria-pressed={time.mode === mode}
                          onClick={() => setMapTime(mode === 'fixed' ? { mode, phase: time.phase } : { mode })}>{label}</button>
                      ))}
                    </div>
                    {time.mode === 'fixed' && (
                      <div className="segmented phase-picker" role="group" aria-label="Always this time of day">
                        {FIXED_PHASES.map((phase) => {
                          const info = PHASES.find((p) => p.id === phase);
                          return <button key={phase} type="button" className={time.phase === phase ? 'active' : ''} aria-pressed={time.phase === phase} onClick={() => setMapTime({ mode: 'fixed', phase })}><span aria-hidden="true">{info.icon}</span> {info.label}</button>;
                        })}
                      </div>
                    )}
                    {(time.mode === 'cycle' || (time.mode === 'fixed' && time.phase === 'night')) && (<>
                      <div className="night-style">
                        <span>Night</span>
                        <div className="segmented" role="group" aria-label="Night style">
                          {[['peaceful', '🌙 Peaceful'], ['dark', '🌑 Darkness']].map(([id, label]) => (
                            <button key={id} type="button" className={time.night === id ? 'active' : ''} aria-pressed={time.night === id} onClick={() => setMapTime({ night: id })}>{label}</button>
                          ))}
                        </div>
                      </div>
                      <p className="hint">{time.night === 'dark' ? 'At night players only see the glow around them; the rest of the map is pitch black.' : 'At night the world is tinted blue but everything stays visible.'}</p>
                    </>)}
                    {time.mode === 'cycle' && (
                      <label className="entrance-name day-length">Day length (all maps) <strong>{time.minutes} min</strong>
                        <input type="range" min={MIN_DAY_MINUTES} max={MAX_DAY_MINUTES} step="1" value={time.minutes} onChange={(e) => setDayMinutes(Number(e.target.value))} />
                      </label>
                    )}
                    <p className="hint">
                      {time.mode === 'cycle' ? `Morning, afternoon, evening and night repeat every ${time.minutes} minutes. Every map with a day cycle shares this clock.`
                        : time.mode === 'fixed' ? `${mapName} always looks like ${time.phase}, e.g. a cave that's always night.`
                          : `${mapName} has no time of day: normal colours, no clock.`}
                    </p>
                  </>);
                })()}
              </div>

              <div className="tool-group">
                <h3>Weather</h3>
                {regionNote()}
                {(() => {
                  const weather = weatherOf(currentMap(), rootRef.current);
                  const mapName = currentMap()?.name || 'Main world';
                  return (<>
                    {editingRoom && <p className="hint">There's no weather inside buildings. This setting is for all of {mapName}.</p>}
                    <div className="segmented" role="group" aria-label="Weather">
                      {[['off', '⛔ Off'], ['fixed', '📌 Fixed'], ['random', '🎲 Random']].map(([mode, label]) => (
                        <button key={mode} type="button" className={weather.mode === mode ? 'active' : ''} aria-pressed={weather.mode === mode}
                          onClick={() => setMapWeather(mode === 'fixed' ? { mode, kind: weather.kind } : { mode })}>{label}</button>
                      ))}
                    </div>
                    {weather.mode === 'fixed' && (
                      <div className="segmented phase-picker" role="group" aria-label="Always this weather">
                        {WEATHER_KINDS.map((kind) => (
                          <button key={kind.id} type="button" className={weather.kind === kind.id ? 'active' : ''} aria-pressed={weather.kind === kind.id} onClick={() => setMapWeather({ mode: 'fixed', kind: kind.id })}>
                            <span aria-hidden="true">{kind.icon}</span> {kind.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="hint">
                      {weather.mode === 'off' ? `Clear skies on ${mapName}.`
                        : weather.mode === 'fixed' ? `It's always ${weather.kind === 'rain' ? 'raining' : 'misty'} on ${mapName}.`
                          : 'Changes every few minutes: clear about half the time, otherwise rain or mist. All players see the same weather.'}
                    </p>
                  </>);
                })()}
              </div>

              <div className="tool-group">
                <h3>Connections</h3>
                <div className="tool-grid">
                  {!editingIndoor && <ToolButton active={tool === ENTRANCE_TOOL} icon="🚪" label="Entrances" onClick={() => setTool(ENTRANCE_TOOL)} />}
                  <ToolButton active={tool === TRAVEL_TOOL} icon="🧭" label="Travel point" onClick={() => setTool(TRAVEL_TOOL)} />
                  {!editingRoom && <ToolButton active={tool === SPAWN_TOOL} icon="🚩" label="Spawn point" onClick={() => setTool(SPAWN_TOOL)} />}
                </div>
                {tool === ENTRANCE_TOOL && !editingIndoor && (
                  selectedEntrance ? (
                    <div className="entrance-panel">
                      <strong>{selectedEntrance.label}</strong>
                      <button type="button" className={`toggle${interiorOf(selectedEntrance)?.enabled ? ' active' : ''}`} aria-pressed={Boolean(interiorOf(selectedEntrance)?.enabled)}
                        onClick={() => setEnterable(selectedEntrance, !interiorOf(selectedEntrance)?.enabled)}>
                        <span className="toggle-box" aria-hidden="true">{interiorOf(selectedEntrance)?.enabled ? '✓' : ''}</span> Players can enter
                      </button>
                      {interiorOf(selectedEntrance)?.enabled && (<>
                        <label className="entrance-name">Name shown to players
                          <input value={interiorOf(selectedEntrance).name} maxLength={40} onChange={(e) => renameInterior(selectedEntrance, e.target.value)} />
                        </label>
                        <button type="button" className="design-button" onClick={() => switchWorld(selectedEntrance.key)}>✎ Edit interior</button>
                      </>)}
                    </div>
                  ) : <p className="hint">Click a house or a door on the map to choose whether players can go inside.</p>
                )}
                {tool === TRAVEL_TOOL && (
                  travelLink ? (
                    <div className="entrance-panel">
                      <strong>{selectedArea.tiles.length} {selectedArea.tiles.length === 1 ? 'tile' : 'tiles'} · hidden from players</strong>
                      <label className="entrance-name">Name
                        <input value={travelLink.name} maxLength={40} onChange={(e) => updateTravel({ name: e.target.value })} />
                      </label>
                      <label className="entrance-name">Goes to
                        <select value={travelLink.to ?? ''} onChange={(e) => updateTravel({ to: e.target.value || null })}>
                          <option value="">Choose a map…</option>
                          {listMaps(rootRef.current).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </label>
                      {travelLink.to && (
                        <label className="entrance-name">Arrive at
                          <select value={travelLink.arrive ?? ''} onChange={(e) => updateTravel({ arrive: e.target.value || null })}>
                            <option value="">Automatic: the area leading back here, else the spawn point</option>
                            {travelPoints(mapById(rootRef.current, travelLink.to))
                              .filter((p) => !(travelLink.to === editingMap && !editingKey && p.key === selectedArea.key))
                              .map((p) => <option key={p.key} value={p.key}>{p.link.name} ({p.tiles.length} {p.tiles.length === 1 ? 'tile' : 'tiles'})</option>)}
                          </select>
                        </label>
                      )}
                      {travelLink.to && canTwoWay && (travelLink.arrive && arrivalArea(rootRef.current, selectedArea) ? (() => {
                        const twoWay = isTwoWay(rootRef.current, editingMap, selectedArea);
                        const back = arrivalArea(rootRef.current, selectedArea);
                        return (<>
                          <button type="button" className={`toggle${twoWay ? ' active' : ''}`} aria-pressed={twoWay} onClick={() => toggleTwoWay(!twoWay)}>
                            <span className="toggle-box" aria-hidden="true">{twoWay ? '✓' : ''}</span> ↔ Two-way: "{back.link.name}" leads back here
                          </button>
                          {!twoWay && back.link.to && <p className="hint">That area currently leads to {listMaps(rootRef.current).find((m) => m.id === back.link.to)?.name ?? 'another map'}. Turning on two-way changes it.</p>}
                        </>);
                      })() : (
                        <p className="hint">Players arrive in an area on {listMaps(rootRef.current).find((m) => m.id === travelLink.to)?.name} that leads back here, or at its spawn point if there is none. For a way back, drag a travel area on {listMaps(rootRef.current).find((m) => m.id === travelLink.to)?.name} and pick it under "Arrive at"; it then leads back here automatically.</p>
                      ))}
                      {!travelLink.to && <p className="hint">Players can't use this area until it has a destination.</p>}
                    </div>
                  ) : <p className="hint">Drag across the grid to mark a travel area, like the end of a road. Players can't see it: walking in asks whether to travel. Click an area to choose where it leads. Pick an area on the other map under "Arrive at" to make the path two-way.</p>
                )}
                {tool === SPAWN_TOOL && <p className="hint">Click a walkable tile: players start here{editingMap === MAIN_MAP ? ' when they play your world' : ''}, and travel to this map arrives here unless an area is chosen.</p>}
                {tool !== ENTRANCE_TOOL && tool !== TRAVEL_TOOL && tool !== SPAWN_TOOL && <p className="hint">Choose a tool to make buildings enterable, link maps with travel areas, or set where players start.</p>}
              </div>
            </>)}

            {sideTab === 'paint' && loadState === 'ready' && <TexturePainter key={editingIndoor ? 'interior' : 'exterior'} interior={editingIndoor} textures={rootRef.current.textures ?? []} tool={tool} onSelect={setTool} onCreated={(texture, surface) => {
              const root = rootRef.current;
              root.textures = [...(root.textures ?? []), texture];
              setPaintTextures(root.textures);
              setDirty(true);
              bumpEntrances();
              sceneRef.current?.loadPaintTexture(texture, () => setTool(`texture:${surface}:${texture.id}`));
            }} />}

            {sideTab === 'paint' && (editingIndoor ? (
              <div className="tool-group">
                <h3>Floors</h3>
                <div className="tool-grid">
                  {FLOOR_TOOLS.map((t) => <ToolButton key={t.id} active={tool === t.id} preview={previews[t.id]} label={t.label} onClick={() => setTool(t.id)} />)}
                  <ToolButton active={tool === ERASER} label="Remove" onClick={() => setTool(ERASER)} />
                </div>
                <p className="hint">Furnish the room from ✨ Create → My assets. {editingRoom ? 'Use AI textures above to paint walls; the exit mat is fixed.' : 'Use AI textures above to paint walls. Players come and go by travel points (🗺 Maps tab).'}</p>
              </div>
            ) : (<>
              <div className="tool-group">
                <h3>Ground</h3>
                <div className="tool-grid">
                  {TERRAIN_TOOLS.map((t) => <ToolButton key={t.id} active={tool === t.id} preview={previews[t.id]} label={t.label} onClick={() => setTool(t.id)} />)}
                </div>
              </div>
              <div className="tool-group">
                <h3>Decorate</h3>
                <div className="tool-grid">
                  {DECOR_TOOLS.map((t) => <ToolButton key={t.id} active={tool === t.id} preview={previews[t.id]} label={t.label} onClick={() => setTool(t.id)} />)}
                  <ToolButton active={tool === ERASER} label="Remove" onClick={() => setTool(ERASER)} />
                </div>
              </div>
              <div className="tool-group">
                <h3>Build</h3>
                <div className="tool-grid">
                  {STRUCTURE_TOOLS.filter((t) => !t.hidden && (t.kind !== 'roof' || t.style === roofStyle)).map((t) => <ToolButton key={t.id} active={tool === t.id} preview={previews[t.id]} label={t.label} onClick={() => setTool(t.id)} />)}
                </div>
                <div className="roof-style">
                  <span>Roof style</span>
                  <div className="segmented" role="group" aria-label="Roof style">
                    {ROOF_STYLES.map((style) => (
                      <button key={style} type="button" className={roofStyle === style ? 'active' : ''} aria-pressed={roofStyle === style}
                        onClick={() => { setRoofStyle(style); setTool((current) => roofInStyle(current, style)); }}>
                        {style === 'hip' ? 'Hip' : 'Gable'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="tool-group">
                <h3>Buildings</h3>
                <div className="building-grid">
                  {BUILDINGS.map((b) => <ToolButton key={b.id} active={tool === b.id} preview={previews[b.id]} label={`${b.label} · ${b.width}×${b.height}`} onClick={() => setTool(b.id)} />)}
                </div>
              </div>
            </>))}

            {/* HUD: which in-game panels players see, for the whole world (not per map). */}
            {sideTab === 'characters' && loadState === 'ready' && (<>
              <div className="tool-group">
                <h3>Create a character</h3>
                <form className="login-form npc-form" onSubmit={createNpc}>
                  <fieldset className="gender-picker" disabled={npcBusy}>
                    <legend>Base</legend>
                    {['male', 'female'].map((option) => {
                      const available = user.availableGenders?.includes(option) ?? true;
                      return (
                        <label key={option} className={npcForm.gender === option ? 'selected' : ''}>
                          <input type="radio" name="npc-gender" value={option} checked={npcForm.gender === option} disabled={!available} onChange={() => setNpcForm((f) => ({ ...f, gender: option }))} />
                          <span>{option === 'male' ? '♂ Male' : '♀ Female'}</span>
                          {!available && <small>Coming soon</small>}
                        </label>
                      );
                    })}
                  </fieldset>
                  <label className="upload">Image
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickNpcFile} disabled={npcBusy} />
                    <span className="upload-drop">
                      {npcForm.preview ? <img src={npcForm.preview} alt="Uploaded character" /> : <span>Click to choose a PNG, JPEG, or WebP (max 10 MB)</span>}
                    </span>
                  </label>
                  <label>Name
                    <input value={npcForm.name} maxLength={40} placeholder="e.g. Old Tom the innkeeper" onChange={(e) => setNpcForm((f) => ({ ...f, name: e.target.value }))} disabled={npcBusy} />
                  </label>
                  <label>Description
                    <textarea rows={3} value={npcForm.description} maxLength={300} placeholder="Who they are: looks, job, backstory." onChange={(e) => setNpcForm((f) => ({ ...f, description: e.target.value }))} disabled={npcBusy} />
                    <span className="char-count">{npcForm.description.length}/300</span>
                  </label>
                  <label>Prompt
                    <textarea rows={4} value={npcForm.prompt} maxLength={1000} placeholder="How they behave and talk to players, e.g. 'Grumpy but kind. Knows the forest. Speaks in short sentences.'" onChange={(e) => setNpcForm((f) => ({ ...f, prompt: e.target.value }))} disabled={npcBusy} />
                    <span className="char-count">{npcForm.prompt.length}/1000</span>
                  </label>
                  <button type="submit" className="design-button" disabled={npcBusy || !npcForm.file || !npcForm.name.trim() || characters.length >= maxCharacters}>
                    {npcBusy ? 'Creating… (up to a minute)' : '✦ Create character'}
                  </button>
                </form>
                {npcNotice && <p className="hint" role="status">{npcNotice}</p>}
              </div>
              <div className="tool-group">
                <h3>My characters <span className="count">{characters.length}/{maxCharacters}</span></h3>
                {characters.length ? (
                  <div className="tool-grid asset-grid">
                    {characters.map((npc) => (
                      <div key={npc.id} className="custom-house">
                        <ToolButton active={tool === npcTool(npc)} preview={npc.spriteUrl} label={npc.name} onClick={() => setTool(npcTool(npc))} />
                        <button type="button" className="delete-house" onClick={() => deleteNpc(npc)} aria-label={`Delete ${npc.name}`} title="Delete">✕</button>
                      </div>
                    ))}
                  </div>
                ) : <p className="hint">No characters yet. Create one above.</p>}
              </div>
              {selectedNpc && npcDraft && (
                <div className="tool-group">
                  <h3>{selectedNpc.name}</h3>
                  <div className="entrance-panel npc-details">
                    <label className="entrance-name">Name
                      <input value={npcDraft.name} maxLength={40} onChange={(e) => setNpcDraft((d) => ({ ...d, name: e.target.value }))} />
                    </label>
                    <label className="entrance-name">Description
                      <textarea rows={3} value={npcDraft.description} maxLength={300} onChange={(e) => setNpcDraft((d) => ({ ...d, description: e.target.value }))} />
                    </label>
                    <label className="entrance-name">Prompt
                      <textarea rows={4} value={npcDraft.prompt} maxLength={1000} onChange={(e) => setNpcDraft((d) => ({ ...d, prompt: e.target.value }))} />
                    </label>
                    <button type="button" className="design-button" onClick={saveNpcText} disabled={!npcDraft.name.trim()}>Save details</button>
                  </div>
                  <p className="hint">Click a walkable tile to place {selectedNpc.name}; Remove deletes one. Talking to characters comes later: the description and prompt will shape what they say.</p>
                </div>
              )}
            </>)}

            {loadState === 'ready' && <div style={{ display: sideTab === 'equipment' ? 'contents' : 'none' }}>
              <EquipmentPanel equipment={rootRef.current.equipment ?? []} onCreated={(item) => {
                rootRef.current.equipment = [...(rootRef.current.equipment ?? []), item];
                setDirty(true);
                bumpEntrances();
              }} />
            </div>}

            {loadState === 'ready' && <div style={{ display: sideTab === 'items' ? 'contents' : 'none' }}><ItemsPanel world={rootRef.current} savedItems={savedItems} onDelete={deleteItem} onOpenInventory={() => setSideTab('inventory')} onChange={(inventory) => {
              rootRef.current.inventory = inventory;
              setDirty(true);
              bumpEntrances();
            }} /></div>}

            {sideTab === 'inventory' && loadState === 'ready' && <InventorySettings world={rootRef.current} onOpenItems={() => setSideTab('items')} onChange={(inventory) => {
              rootRef.current.inventory = inventory;
              setDirty(true);
              bumpEntrances();
            }} />}

            {sideTab === 'gameplay' && loadState === 'ready' && (
              <div className="tool-group gameplay-mechanics">
                <h3>Gameplay Mechanics</h3>
                <section className="farming-overview" aria-labelledby="farming-title">
                  <div className="farming-heading"><h4 id="farming-title">Farming</h4><span className="preview-badge">Prototype</span></div>
                  <p>Test turning grass into soil with a hoe. Highlight the grass players are allowed to farm, then open Preview.</p>
                  {editingIndoor ? <p className="hint">Open an exterior map to mark farmable grass.</p> : <>
                    <div className="tool-grid">
                      <ToolButton active={tool === 'farm-area'} icon="+" label="Highlight farm area" onClick={() => setTool('farm-area')} />
                      <ToolButton active={tool === 'farm-remove'} icon="-" label="Remove farm area" onClick={() => setTool('farm-remove')} />
                    </div>
                    <p className="hint">Drag over clear grass to mark it green. Buildings, assets, travel points, and restpoints are protected. Undo and redo are supported.</p>
                  </>}
                  <h5>Try it in Preview</h5>
                  <ol className="farming-stages"><li>Create a Hoe in Equipment. If inventory is enabled, add it to Inventory ? Starter Kit, then open Preview and equip it from the bag or hotbar. Otherwise select it from Equipment.</li><li>Walk beside a marked grass tile using WASD or arrow keys.</li><li>Click the tile to till it. Adjacent soil patches join together.</li></ol>
                  <p className="hint">Farmable areas save with your world. Tilled soil is a play-session test and resets when you leave Play or Preview. Planting and crop growth are not active yet.</p>
                </section>
              </div>
            )}

            {sideTab === 'restpoint' && loadState === 'ready' && (() => {
              const setting = restpointsOf(rootRef.current);
              const update = (next) => { rootRef.current.restpoints = next; setDirty(true); bumpEntrances(); };
              return <div className="tool-group">
                <h3>Restpoint <span className="count">whole world</span></h3>
                <button type="button" className={`toggle${setting.enabled ? ' active' : ''}`} aria-pressed={setting.enabled} onClick={() => update({ ...setting, enabled: !setting.enabled })}>
                  <span className="toggle-box" aria-hidden="true">{setting.enabled ? '✓' : ''}</span>
                  <span className="hud-toggle-text">Enable restpoints<small>Let players sleep until the next morning</small></span>
                </button>
                {setting.enabled && <>
                  <p className="hint">Select Highlight, then drag a rectangle over a bed, altar, or any area on the map, just like Travel point. Purple tiles are restpoints.</p>
                  <div className="tool-grid">
                    <ToolButton active={tool === 'rest-area'} icon="+" label="Highlight" onClick={() => setTool('rest-area')} />
                    <ToolButton active={tool === 'rest-remove'} icon="-" label="Remove highlight" onClick={() => setTool('rest-remove')} />
                  </div>
                  <p className="hint">Drag with Remove highlight to clear an area. Undo and redo work with both tools. Players click a highlighted area to sleep.</p>
                </>}
              </div>;
            })()}

            {sideTab === 'game' && loadState === 'ready' && (<>
              <div className="tool-group">
                <h3>Games <span className="count">whole world</span></h3>
                <div className="hud-toggles">
                  {(() => {
                    const on = gamesOf(rootRef.current).tabletop;
                    return (
                      <button type="button" className={`toggle${on ? ' active' : ''}`} aria-pressed={on} onClick={() => setGame('tabletop', !on)}>
                        <span className="toggle-box" aria-hidden="true">{on ? '✓' : ''}</span>
                        <span className="hud-toggle-text"><span aria-hidden="true">🎲</span> Tabletop<small>Players sit at a table and play</small></span>
                      </button>
                    );
                  })()}
                </div>
              </div>
              {gamesOf(rootRef.current).tabletop ? (
                <div className="tool-group">
                  <h3>Tabletop</h3>
                  <div className="tool-grid">
                    {GAME_TOOLS.map((t) => <ToolButton key={t.id} active={tool === t.id} preview={previews[t.id]} label={t.label} onClick={() => setTool(t.id)} />)}
                    <ToolButton active={tool === ERASER} label="Remove" onClick={() => setTool(ERASER)} />
                  </div>
                  <p className="hint">Place tables on any map or inside buildings. Players walk into one, or click it, to sit down and play. The game itself is coming soon.</p>
                </div>
              ) : <p className="hint">Turn on Tabletop to place game tables in your world.</p>}
            </>)}

            {sideTab === 'hud' && loadState === 'ready' && (
              <div className="tool-group">
                <h3>Panels players see <span className="count">whole world</span></h3>
                <div className="hud-toggles">
                  {HUD_PANELS.map((panel) => {
                    const shown = hudOf(rootRef.current)[panel.id];
                    return (
                      <button key={panel.id} type="button" className={`toggle${shown ? ' active' : ''}`} aria-pressed={shown} onClick={() => setHudPanel(panel.id, !shown)}>
                        <span className="toggle-box" aria-hidden="true">{shown ? '✓' : ''}</span>
                        <span className="hud-toggle-text"><span aria-hidden="true">{panel.icon}</span> {panel.label}<small>{panel.hint}</small></span>
                      </button>
                    );
                  })}
                </div>
                <p className="hint">Choose which panels players see while playing. Turning off Time & day only hides the clock: day, night and weather still happen.</p>
              </div>
            )}

            {sideTab === 'create' && (<>
              {!editingIndoor && (
                <div className="tool-group">
                  <h3>My houses <span className="count">{houses.length}/{maxHouses}</span></h3>
                  <div className="building-grid">
                    {customBuildings().map((b) => {
                      const house = houses.find((h) => String(h.slot) === b.id);
                      return (
                        <div key={b.id} className="custom-house">
                          <ToolButton active={tool === b.id} preview={b.spriteUrl} label={`${b.label} · ${b.width}×${b.height}`} onClick={() => setTool(b.id)} />
                          <button type="button" className="delete-house" onClick={() => deleteHouse(house)} aria-label={`Delete ${b.label}`} title="Delete">✕</button>
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" className="design-button" onClick={() => setDesigning(true)} disabled={loadState !== 'ready' || houses.length >= maxHouses}>✦ Design a house</button>
                  {houses.length >= maxHouses && <p className="hint">Delete a house to design another.</p>}
                </div>
              )}
              <div className="tool-group">
                <h3>My assets <span className="count">{library.length}/{maxLibrary}</span></h3>
                <div className="tool-grid asset-grid">
                  {library.map((asset) => (
                    <div key={asset.id} className="custom-house">
                      <ToolButton active={tool === assetTool(asset)} preview={asset.spriteUrl} label={asset.name} onClick={() => setTool(assetTool(asset))} />
                      <button type="button" className="delete-house" onClick={() => removeFromLibrary(asset)} aria-label={`${asset.mine ? 'Delete' : 'Remove'} ${asset.name}`} title={asset.mine ? 'Delete permanently' : 'Remove from My assets'}>✕</button>
                    </div>
                  ))}
                </div>
                <button type="button" className="design-button" onClick={() => setBrowsing(true)} disabled={loadState !== 'ready' || library.length >= maxLibrary}>＋ Add asset</button>
              </div>
              {selectedAsset && (
                <div className="tool-group">
                  <h3>Placement</h3>
                  <div className="segmented" role="group" aria-label="Direction">
                    {[[null, '↔ Normal', 'As drawn'], [TURNS.ROTATED, '↻ 90°', 'Rotate 90° (instant; best for flat things like rugs and paths)'], [TURNS.VERTICAL, '↕ Vertical', 'Upright side view drawn by AI (best for fences, benches)']].map(([turn, label, title]) => (
                      <button key={label} type="button" title={title} className={placingTurn === turn ? 'active' : ''} aria-pressed={placingTurn === turn} onClick={() => chooseTurn(turn)} disabled={turning}>{label}</button>
                    ))}
                  </div>
                  <button type="button" className={`toggle${assetFlipped ? ' active' : ''}`} aria-pressed={assetFlipped} onClick={() => setAssetFlipped((f) => !f)} disabled={turning}>
                    <span className="toggle-box" aria-hidden="true">{assetFlipped ? '✓' : ''}</span> Flip left–right
                  </button>
                  <p className="hint">
                    {turning ? 'Creating the vertical version… (up to a minute)'
                      : `90° rotates the picture (best for flat things). Vertical is an upright side view${selectedAsset.sideSpriteUrl ? '' : ', drawn by AI the first time and then shared with everyone'}. Keys: R rotate, V vertical, F flip.`}
                  </p>
                </div>
              )}
            </>)}
          </div>

          <div className="side-dock">
            <div className="dock-row">
              <span className="dock-label">Brush</span>
              <div className="segmented" role="group" aria-label="Brush size">
                {BRUSH_SIZES.map((b) => (
                  <button key={b.size} type="button" className={brush === b.size ? 'active' : ''} aria-pressed={brush === b.size} disabled={!brushApplies} onClick={() => setBrush(b.size)}>{b.label}</button>
                ))}
              </div>
            </div>
            {!brushApplies && <p className="hint">{buildingById(tool) ? 'Click to place. Remove deletes the whole building.' : assetFromTool(tool) ? 'Click to place. Remove deletes one copy.' : npcFromTool(tool) ? 'Click a walkable tile to place this character. Remove deletes one.' : toolKind === 'travel' ? 'Drag to select tiles; remove them with Remove.' : tool === SPAWN_TOOL ? 'Click to move the spawn point.' : toolKind === 'door' ? 'Doors are placed two tiles tall, on the tile you click and the one above.' : toolKind ? 'Place on a wall (window) or roof (chimney).' : tool === ENTRANCE_TOOL ? 'Click a building to select it.' : 'Decorations are placed one at a time.'}</p>}
            <div className="dock-row">
              <button type="button" className={`toggle compact${showGrid ? ' active' : ''}`} aria-pressed={showGrid} onClick={() => setShowGrid((v) => !v)}>
                <span className="toggle-box" aria-hidden="true">{showGrid ? '✓' : ''}</span> Grid
              </button>
              <div className="zoom-row" role="group" aria-label="Zoom">
                <button type="button" onClick={() => sceneRef.current?.zoomBy(-1)} disabled={zoom === 1} aria-label="Zoom out">−</button>
                <span aria-live="polite">{zoom ? `${zoom}×` : '–'}</span>
                <button type="button" onClick={() => sceneRef.current?.zoomBy(1)} aria-label="Zoom in">+</button>
                <button type="button" onClick={() => sceneRef.current?.fitCamera()}>Fit</button>
              </div>
            </div>
            <div className="history">
              <button type="button" onClick={undo} disabled={!undoRef.current.length}>↶ Undo</button>
              <button type="button" onClick={redo} disabled={!redoRef.current.length}>↷ Redo</button>
              <button type="button" onClick={reset}>⟲ {editingIndoor ? 'Reset room' : 'Reset map'}</button>
            </div>
          </div>
        </aside>

        <div className="stage-area">
          <div className="stage-tabs" role="tablist" aria-label="View">
            {[['edit', '🖌', editingRoom ? `Edit room: ${editingRoom.name}` : `Edit map: ${currentMap()?.name || 'Main world'}`], ['flow', '🔀', 'Map flow']].map(([id, icon, label]) => (
              <button key={id} type="button" role="tab" aria-selected={stageTab === id} className={stageTab === id ? 'active' : ''} onClick={() => setStageTab(id)}>
                <span aria-hidden="true">{icon}</span> {label}
              </button>
            ))}
          </div>
          {/* The map editor stays mounted (just hidden) while Map flow is open, so switching back is instant. */}
          <div className="stage" hidden={stageTab !== 'edit'}>
            <div ref={hostRef} className="stage-canvas" />
            {loadState === 'loading' && <p className="stage-message">Loading your world…</p>}
            {loadState === 'error' && <p className="stage-message">Could not load your world. Please refresh and try again.</p>}
            <p className="stage-hint">Drag to paint · Scroll to zoom · Right-drag to move · Forest edge is fixed</p>
          </div>
          {stageTab === 'flow' && loadState === 'ready' && (
            <MapFlow embedded root={rootRef.current} version={`${historyVersion}:${entranceVersion}`} currentMap={editingMap} currentRoom={editingKey}
              onOpen={(mapId, key) => openEditor(mapId, key)} onClose={() => setStageTab('edit')}
              onRegionsChange={() => { setDirty(true); bumpEntrances(); }} />
          )}
        </div>
      </div>
      {browsing && <AssetBrowser libraryIds={new Set(library.map((a) => a.id))} onAdded={assetAdded} onClose={() => setBrowsing(false)} />}
      {designing && <HouseDesigner onCreated={houseDesigned} onPlace={placeDesigned} onClose={() => setDesigning(false)} />}
      {preview && (
        <div className="preview-overlay">
          <PlayView user={user} preview={preview} onBack={() => setPreview(null)} />
        </div>
      )}
    </section>
  );
}
