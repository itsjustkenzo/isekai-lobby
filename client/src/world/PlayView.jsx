import usePlayerInventory from './usePlayerInventory.js';
import PlayerInventory from './PlayerInventory.jsx';
import { canUseHoe } from './equipment.js';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { createPixelGame } from './pixelGame.js';
import { TILE } from './art.js';
import { PlayScene } from './PlayScene.js';
import { gameDate, hourFor, timeOf } from './daycycle.js';
import DayHud from './DayHud.jsx';
import PauseMenu, { PauseButton, PreviewTag } from './PauseMenu.jsx';
import Minimap from './Minimap.jsx';
import PlayerHud from './PlayerHud.jsx';
import PixelDialog from './PixelDialog.jsx';
import TabletopView from './TabletopView.jsx';
import { listRestpoints } from './world.js';
import { weatherAt, weatherOf, weatherSeed } from './weather.js';
import { MAIN_MAP, hudOf, gamesOf, listTabletops, setNpcs, pruneNpcs, activeEntrances, activeTravel, exitTile, findSpawn, fromSaved, listMaps, mapById, setAssets, setCustomHouses } from './world.js';

const MUTE_PREF_KEY = 'isekai.play.muted';
const MINIMAP_PREF_KEY = 'isekai.play.minimap';
// The character's stats. Nothing hurts the player yet, so health starts (and stays) full.
const MAX_HEALTH = 100;

function readMinimapPref() {
  try { return localStorage.getItem(MINIMAP_PREF_KEY) !== '0'; } catch { return true; }
}

function writeMinimapPref(show) {
  try { localStorage.setItem(MINIMAP_PREF_KEY, show ? '1' : '0'); } catch { /* storage unavailable */ }
}
const SAVE_POSITION_MS = 3000;
const START_PLACE = { map: MAIN_MAP, inside: null, spawn: null, quietEntrance: null, quietTravel: null };

// Where to put the player from their saved position, if it still makes sense in the world as it is now
// (the creator may have removed that map or building, or built on that tile since). Otherwise the start.
function restorePlace(world, position) {
  const map = position && mapById(world, position.map);
  if (!map) return START_PLACE;
  const inside = position.inside ? activeEntrances(map).find((e) => e.key === position.inside) : null;
  if (position.inside && !inside) return START_PLACE;
  const current = inside ? inside.interior : map;
  if (position.x >= current.width || position.y >= current.height) return START_PLACE;
  const spawn = findSpawn(current, position);
  return spawn ? { ...START_PLACE, map: position.map, inside: position.inside ?? null, spawn } : START_PLACE;
}

// Keepalive lets the save finish even when it's sent as the page closes.
function savePosition(position) {
  fetch('/api/play/position', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(position) }).catch(() => {});
}

function readMutePref() {
  try { return localStorage.getItem(MUTE_PREF_KEY) === '1'; } catch { return false; }
}

// Weather ambience volume (0 to 1), remembered in this browser.
const AMBIENCE_PREF_KEY = 'isekai.play.ambience';

function readAmbiencePref() {
  try {
    const value = Number(localStorage.getItem(AMBIENCE_PREF_KEY));
    return localStorage.getItem(AMBIENCE_PREF_KEY) !== null && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.7;
  } catch { return 0.7; }
}

function writeAmbiencePref(volume) {
  try { localStorage.setItem(AMBIENCE_PREF_KEY, String(volume)); } catch { /* storage unavailable */ }
}

function writeMutePref(muted) {
  try { localStorage.setItem(MUTE_PREF_KEY, muted ? '1' : '0'); } catch { /* storage unavailable */ }
}

export default function PlayView({ user, onBack, onCreateWorld, preview = null }) {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const [world, setWorld] = useState(undefined);
  const inventory = usePlayerInventory(world, preview);
  const [bagOpen, setBagOpen] = useState(false);
  const [error, setError] = useState(false);
  const [muted, setMuted] = useState(readMutePref);
  const [ambience, setAmbience] = useState(readAmbiencePref);

  useEffect(() => {
    sceneRef.current?.setAmbienceVolume(ambience);
    writeAmbiencePref(ambience);
  }, [ambience]);
  // Where the player is: which map, outside (inside: null) or in the building with that entrance key,
  // where to appear, and a door / travel pad not to ask about until the player steps away from it.
  const [place, setPlace] = useState(START_PLACE);
  const placeRef = useRef(place);
  placeRef.current = place;
  const lastSavedRef = useRef(''); // the last position sent, so standing still doesn't resend it
  const [now, setNow] = useState(Date.now); // ticks the header clock
  const [equippedId, setEquippedId] = useState('');
  const equipped = world?.equipment?.find((item) => inventory.enabled ? inventory.state?.selectedId === `equipment:${item.id}` && inventory.state.slots.some((slot) => slot.itemId === `equipment:${item.id}`) : item.id === equippedId) ?? null;
  const hoeEquipped = canUseHoe(equipped);
  const [farmNotice, setFarmNotice] = useState('Equip the hoe, stand beside marked grass, then click to till.');
  const tilledRef = useRef(new Map());
  useEffect(() => {
    if (sceneRef.current) { sceneRef.current.options.hoeEquipped = hoeEquipped && !sceneRef.current.world.interior; sceneRef.current.setEquipment(equipped); sceneRef.current.farmHighlight?.clear(); }
  }, [equipped, hoeEquipped]);
  const [sleeping, setSleeping] = useState(null);
  const [clockOffset, setClockOffset] = useState(null);
  const clockOffsetRef = useRef(null);
  const playTime = (map, root) => {
    const setting = timeOf(map, root);
    return clockOffsetRef.current === null ? setting : { ...setting, mode: 'cycle', offset: clockOffsetRef.current };
  };
  const [menuOpen, setMenuOpen] = useState(false); // the pause menu (Esc)
  const [tabletop, setTabletop] = useState(null); // the table the player is sitting at, or null
  const [showMinimap, setShowMinimap] = useState(readMinimapPref); // the mini map (M)
  const [health] = useState(MAX_HEALTH);
  // The player's position in tiles (with fractions, so the mini map marker moves smoothly).
  const getPlayerPosition = useCallback(() => {
    const pos = sceneRef.current?.pos;
    return pos ? { x: pos.x / TILE, y: (pos.y - 3) / TILE } : null;
  }, []);
  const getOverview = useCallback(() => sceneRef.current?.overview?.() ?? null, []);

  useEffect(() => { writeMinimapPref(showMinimap); }, [showMinimap]);
  const [prompt, setPrompt] = useState(null); // { door: entrance } or { travel: pad } being asked about

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    sceneRef.current?.setMuted(muted);
    writeMutePref(muted);
  }, [muted]);

  useEffect(() => {
    if (!preview) return;
    // The editor has already registered the player's houses and assets.
    const map = mapById(preview.world, preview.map) ?? preview.world;
    const inside = preview.inside ? activeEntrances(map).find((e) => e.key === preview.inside) : null;
    const exit = inside && exitTile(inside.interior);
    setPlace({ ...START_PLACE, map: mapById(preview.world, preview.map) ? preview.map : MAIN_MAP, inside: inside?.key ?? null, spawn: inside ? { x: exit.x, y: exit.y - 1 } : null });
    setWorld(preview.world);
  }, [preview]);

  useEffect(() => {
    if (preview) return undefined;
    let cancelled = false;
    // Player houses must be registered before the world is read, so their footprints are recognised.
    Promise.all([api('/api/world'), api('/api/houses'), api('/api/assets/library'), api('/api/play/position'), api('/api/npcs')])
      .then(([worldRes, housesRes, assetsRes, positionRes, npcsRes]) => {
        if (cancelled) return;
        if (!worldRes.ok || !housesRes.ok || !assetsRes.ok) return setError(true);
        setCustomHouses(housesRes.data.houses);
        setAssets(assetsRes.data.assets);
        setNpcs(npcsRes.ok ? npcsRes.data.npcs : []);
        const loaded = worldRes.data.world ? fromSaved(worldRes.data.world) : null;
        if (loaded) pruneNpcs(loaded);
        // Continue where the player left off.
        if (loaded) setPlace(restorePlace(loaded, positionRes.ok ? positionRes.data.position : null));
        setWorld(loaded);
      })
      .catch(() => !cancelled && setError(true));
    return () => { cancelled = true; };
  }, []);

  // Saves where the player stands every few seconds (when it changed), on leaving the game and when the
  // page closes, so the next visit starts there.
  useEffect(() => {
    if (!world || preview) return undefined;
    const save = () => {
      const scene = sceneRef.current;
      if (!scene?.pos) return;
      const { x, y } = scene.feetTile();
      const position = { map: placeRef.current.map, inside: placeRef.current.inside, x, y };
      const text = JSON.stringify(position);
      if (text === lastSavedRef.current) return;
      lastSavedRef.current = text;
      savePosition(position);
    };
    const timer = setInterval(save, SAVE_POSITION_MS);
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      save();
      clearInterval(timer);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [world, preview]);

  const outdoor = world ? mapById(world, place.map) ?? world : null;
  // The map's time of day (interiors follow their map): the clock shows only when there is one.
  const time = outdoor ? playTime(outdoor, world) : null;
  const hour = time ? hourFor(time, now) : null;
  const insideEntrance = outdoor && place.inside ? activeEntrances(outdoor).find((e) => e.key === place.inside) : null;
  // The clock panel shows the map's weather even indoors, like a forecast.
  const weatherNow = outdoor ? weatherAt(weatherOf(outdoor, world), weatherSeed(outdoor, world, place.map), now) : null;
  const date = gameDate(now + (clockOffset ?? 0), time?.minutes);
  const mapName = world && place.map !== MAIN_MAP ? listMaps(world).find((m) => m.id === place.map)?.name : null;

  useEffect(() => {
    if (!world) return undefined;
    const map = mapById(world, place.map) ?? world;
    const entrances = activeEntrances(map);
    const inside = place.inside ? entrances.find((e) => e.key === place.inside) : null;
    const current = inside ? inside.interior : map;
    const farmKey = `${place.map}:${place.inside ?? ''}`;
    if (!tilledRef.current.has(farmKey)) tilledRef.current.set(farmKey, new Set());
    const scene = new PlayScene({
      world: current,
      equipmentLibrary: world.equipment ?? [],
      equipment: equipped,
      onPickup: (dropId) => inventory.act({ type: 'pickup', dropId, location: getInventoryLocation() }),
      tilled: tilledRef.current.get(farmKey),
      hoeEquipped: hoeEquipped && !current.interior && Boolean(current.farmCells?.length),
      onFarmNotice: setFarmNotice,
      heroUrl: user.character?.spriteUrl,
      muted: readMutePref(),
      ambienceVolume: readAmbiencePref(),
      spawn: place.spawn,
      time: playTime(map, world),
      weather: weatherOf(map, world),
      mapId: weatherSeed(map, world, place.map),
      entrances: inside ? [] : entrances,
      travel: activeTravel(current, world),
      tabletops: gamesOf(world).tabletop ? listTabletops(current) : [],
      onTabletopRequest: (table) => setPrompt({ tabletop: table }),
      restpoints: listRestpoints(current, world),
      onRestRequest: (restpoint) => setPrompt({ restpoint }),
      quietEntrance: place.quietEntrance,
      quietTravel: place.quietTravel,
      onEnterRequest: (entrance) => setPrompt({ door: entrance }),
      onTravelRequest: (pad) => setPrompt({ travel: pad }),
      onExitRequest: () => inside && setPrompt({ exit: inside }),
    });
    sceneRef.current = scene;
    const destroyGame = createPixelGame(hostRef.current, scene);
    hostRef.current.focus();
    return () => {
      sceneRef.current = null;
      destroyGame();
    };
  }, [world, place, user.character?.spriteUrl]);

  function getInventoryLocation() {
    const feet = sceneRef.current?.pos ? sceneRef.current.feetTile() : null;
    return feet ? { map: placeRef.current.map, inside: placeRef.current.inside, ...feet } : null;
  }

  useEffect(() => {
    sceneRef.current?.setInventoryDrops((inventory.state?.drops ?? []).filter((drop) => drop.location.map === place.map && drop.location.inside === place.inside));
  }, [inventory.state, place, world]);

  useEffect(() => {
    if (bagOpen) sceneRef.current?.pause();
    else if (!menuOpen && !prompt && !sleeping && !tabletop) sceneRef.current?.resume();
  }, [bagOpen, menuOpen, prompt, sleeping, tabletop, place]);

  function enter() {
    const { door, travel, exit: leaving, tabletop: table } = prompt;
    setPrompt(null);
    // Sitting down at a table opens it (the game stays paused until the player leaves).
    if (table) {
      setTabletop(table);
      return;
    }
    // Leaving a building puts the player just outside its door.
    if (leaving) {
      setPlace({ map: place.map, inside: null, spawn: { x: leaving.x, y: leaving.y + 1 }, quietEntrance: leaving.key, quietTravel: null });
      return;
    }
    if (door) {
      const exit = exitTile(door.interior);
      setPlace({ map: place.map, inside: door.key, spawn: { x: exit.x, y: exit.y - 1 }, quietEntrance: null, quietTravel: null });
      return;
    }
    // Travel: arrive in the chosen area (quiet until the player steps out of it), or at the map's spawn point.
    const arrive = travel.arriveAt;
    setPlace({ map: travel.destination, inside: null, spawn: arrive ? { x: arrive.x, y: arrive.y } : null, quietEntrance: null, quietTravel: arrive?.key ?? null });
  }

  function leaveTable() {
    setTabletop(null);
    sceneRef.current?.resume();
    hostRef.current?.focus();
  }

  function sleep() {
    if (sleeping) return;
    setPrompt(null);
    sceneRef.current?.pause();
    sceneRef.current?.restHighlight?.clear();
    setSleeping('out');
  }

  function finishSleepFade() {
    if (sleeping === 'out') {
      const current = Date.now();
      const day = (time?.minutes ?? 14) * 60 * 1000;
      const shifted = current + (clockOffsetRef.current ?? 0);
      // Always the following calendar day, at 8 AM; fixed-time maps start cycling after sleep.
      const offset = (Math.floor(shifted / day) + 1) * day + day / 3 - current;
      clockOffsetRef.current = offset;
      setClockOffset(offset);
      setNow(current);
      if (sceneRef.current) sceneRef.current.options.time = playTime(outdoor, world);
      setSleeping('in');
    } else {
      setSleeping(null);
      sceneRef.current?.resume();
      hostRef.current?.focus();
    }
  }

  function decline() {
    setPrompt(null);
    sceneRef.current?.resume();
    hostRef.current?.focus();
  }

  // The pause menu stops the game while it's open. (While a door or travel question is showing, Esc
  // answers "No" instead.)
  function openMenu() {
    if (sleeping) return;
    sceneRef.current?.pause();
    setMenuOpen(true);
  }

  function closeMenu() {
    setMenuOpen(false);
    sceneRef.current?.resume();
    hostRef.current?.focus();
  }

  useEffect(() => {
    if (!world) return undefined;
    const onKey = (event) => {
      if (prompt || tabletop || sleeping || bagOpen) return;
      if (event.key.toLowerCase() === 'm' && hud.minimap && !menuOpen && !event.ctrlKey && !event.metaKey && !event.altKey) {
        setShowMinimap((show) => !show);
        return;
      }
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (menuOpen) closeMenu();
      else openMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const currentWorld = insideEntrance ? insideEntrance.interior : outdoor;
  const hud = hudOf(world); // which panels the creator lets players see
  const location = insideEntrance ? insideEntrance.interior.name : mapName ?? world?.name ?? `${user.username}'s world`;

  return (
    <section className="editor play-view" aria-label={world ? `Playing: ${location}` : 'Play'}>
      <div className="stage">
        <div ref={hostRef} className="stage-canvas play-canvas" tabIndex={-1} />
        {world && time && hud.clock && <DayHud hour={hour} fixed={time.mode === 'fixed'} date={date} dayMinutes={time.minutes} weather={weatherNow?.strength > 0.3 ? weatherNow.kind : null} />}
        {world === undefined && !error && <p className="stage-message">Loading your world…</p>}
        {error && <p className="stage-message">Could not load your world. Please refresh and try again.</p>}
        {world === null && (
          <div className="stage-message empty-world">
            <div>
              <p>You haven't saved a world yet.</p>
              <button type="button" className="login-button" onClick={onCreateWorld}><span className="button-spark" aria-hidden="true">✧</span><span>Create your world</span></button>
            </div>
          </div>
        )}
        {!inventory.enabled && world && currentWorld && ((world.equipment?.length ?? 0) > 0 || (!currentWorld.interior && currentWorld.farmCells?.length > 0)) && !menuOpen && !prompt && !sleeping && !tabletop && (
          <div className="farming-test-controls" role="group" aria-label="Equipment">
            <label>Equipment<select value={equippedId} onChange={(event) => setEquippedId(event.target.value)}>
              <option value="">Unequipped</option>
              {(world.equipment ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}{canUseHoe(item) ? ' (Hoe)' : ''}</option>)}
            </select></label>
            {equipped && <img className="equipped-preview" src={equipped.image} width={16} height={32} alt={equipped.name} />}
            <p role="status">{!world.equipment?.length ? 'No equipment yet. Create a Hoe in the editor Equipment tab, then reopen Preview.' : hoeEquipped ? farmNotice : equipped ? `${equipped.name} equipped. This equipment has no gameplay action yet.` : 'Select your generated hoe to equip it and till marked grass.'}</p>
          </div>
        )}
        {world && inventory.enabled && <PlayerInventory hero={{ spriteUrl: user.character?.spriteUrl, name: user.username, health, maxHealth: MAX_HEALTH, showStats: hud.stats }} visible={!menuOpen && !tabletop && !sleeping} world={world} inventory={inventory} open={bagOpen} onOpenChange={setBagOpen} blocked={Boolean(prompt || menuOpen || sleeping || tabletop)} getLocation={getInventoryLocation} preview={Boolean(preview)} actionNotice={hoeEquipped && !currentWorld?.interior ? farmNotice : ''} />}
        {prompt?.door && <PixelDialog icon="door" title={prompt.door.interior.name} question="Do you want to go inside?" yesLabel="Enter" onYes={enter} onNo={decline} />}
        {prompt?.exit && <PixelDialog icon="door" title={prompt.exit.interior.name} question="Do you want to go outside?" yesLabel="Exit" onYes={enter} onNo={decline} />}
        {prompt?.tabletop && <PixelDialog icon="dice" title="Tabletop" question="Sit down and play?" yesLabel="Play" onYes={enter} onNo={decline} />}
        {prompt?.restpoint && <PixelDialog icon="bed" title="Restpoint" question="Go to sleep?" yesLabel="Yes" onYes={sleep} onNo={decline} />}
        {sleeping && <div key={sleeping} className={`sleep-fade sleep-fade-${sleeping}`} role="status" aria-label="Sleeping until the next morning" onAnimationEnd={finishSleepFade} />}
        {tabletop && <TabletopView onLeave={leaveTable} />}
        {prompt?.travel && <PixelDialog icon="compass" title={prompt.travel.link.name} question={`Travel to ${prompt.travel.destinationName}?`} yesLabel="Travel" onYes={enter} onNo={decline} />}
        {world && !prompt && !menuOpen && !tabletop && (
          <p className="stage-hint">
            {insideEntrance ? 'WASD / arrow keys to walk | Left-click to act | Walk onto the mat to leave | Esc for menu' : `WASD / arrow keys to walk | Left-click to act | Walk into a door to go inside${hud.minimap ? ' | M map' : ''} | Esc menu`}
          </p>
        )}
        {world && !menuOpen && !tabletop && <PauseButton onClick={openMenu} />}
        {world && !inventory.enabled && hud.stats && !menuOpen && !tabletop && !sleeping && <PlayerHud spriteUrl={user.character?.spriteUrl} name={user.username} health={health} maxHealth={MAX_HEALTH} />}
        {world && currentWorld && hud.minimap && showMinimap && !prompt && !menuOpen && <Minimap world={currentWorld} location={location} getPlayerPosition={getPlayerPosition} getOverview={getOverview} />}
        {world && preview && !menuOpen && <PreviewTag />}
        {(world === null || error) && <PauseButton onClick={onBack} />}
        {menuOpen && (
          <PauseMenu location={location} preview={Boolean(preview)} muted={muted} ambience={ambience} onResume={closeMenu} onQuit={onBack}
            onToggleSound={() => setMuted((m) => !m)} onAmbienceChange={setAmbience} />
        )}
      </div>
    </section>
  );
}
