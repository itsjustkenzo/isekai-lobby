import {PLAYER_HAND_OFFSET} from './characterSprite.js';
import { GAME_CURSORS } from './cursors.js';
import { PLAY_ZOOM } from './playScale.js';
import { canUseHoe } from './equipment.js';
import { canTill } from './farming.js';
import Phaser from 'phaser';
import { TILE } from './art.js';
import { exitTile, findSpawn, isBlocked } from './world.js';
import { createRainSound, playStep } from './sfx.js';
import { darknessAt, hourFor, lanternCanvas, lightAt } from './daycycle.js';
import { WEATHER_WASH, fogCanvas, weatherAt } from './weather.js';
import { WorldBaseScene } from './WorldBaseScene.js';

const SPEED = 64; // world pixels per second
const FOOTPRINT = { width: 10, height: 5 }; // collision box at the hero's feet
// Fixed camera magnification in play: every art pixel is drawn 3 screen pixels wide.
// PLAY_ZOOM is shared with the item preview.

// Bouncy gait. Offsets are rounded to whole pixels so the hero stays on the tile pixel grid
// (no squash/stretch scaling, which would make the hero's pixels a different size).
const HOP_HEIGHT = 4; // pixels
const HOP_MS = 130; // rise time; the fall mirrors it
const LAND_MS = 260;
const BREATHE_MS = 700;
// Stalls shorter than this (one blocked frame against a wall, say) don't count as stopping, so the stride
// carries on instead of restarting from the ground.
const STOP_GRACE_MS = 80;
const AIRBORNE_AT = -2; // above this height the shadow shrinks
// The day cycle's colour wash sits above everything on the map (map objects are layered by their y).
const DAYLIGHT_DEPTH = 1e6;
// Darkness nights: the radius (art pixels) of the light around the player, drawn as stepped rings
// [fraction of the radius, how much of the dark it clears] so it stays pixel art.
const LIGHT_RADIUS = 52;
const LIGHT_RINGS = [[1, 0.25], [0.85, 0.45], [0.7, 0.75], [0.55, 1]];
// Weather sits just under the day cycle's light, so rain and mist darken at night too.
const WEATHER_DEPTH = DAYLIGHT_DEPTH - 10;
const RAIN_SPEED = 0.22; // view pixels per ms
const RAIN_DENSITY = 1 / 700; // drops per view pixel at full strength
const SPLASH_MS = 140;
const MAX_DROPS = 700; // keeps big or high-resolution screens smooth

// Soft pixel shadows under the hero: full size on the ground, smaller mid-hop.
const SHADOWS = {
  'hero-shadow': ['..xxxxxxxx..', '.xxxxxxxxxx.', '.xxxxxxxxxx.', '..xxxxxxxx..'],
  'hero-shadow-air': ['.xxxxxx.', 'xxxxxxxx', '.xxxxxx.'],
};

// The classic "bounce out" easing (as Phaser's Bounce.easeOut): t from 0 to 1.
function bounceOut(t) {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
}

function shadowCanvas(rows) {
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(20, 30, 15, 0.28)';
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'x') ctx.fillRect(x, y, 1, 1); }));
  return canvas;
}

// Paints a darkness-night layer: near-black over everything, with a stepped circle of light centred on
// (cx, cy) that flickers a little with time. amount: how dark, 0 to 1.
export function paintDarkness(ctx, width, height, cx, cy, amount, time) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = `rgba(4, 5, 14, ${0.97 * amount})`;
  ctx.fillRect(0, 0, width, height);
  // Cut the light out of the dark, ring by ring, one pixel row at a time.
  ctx.globalCompositeOperation = 'destination-out';
  const flicker = Math.round(Math.sin(time / 170) + Math.sin(time / 83) * 0.6);
  for (const [fraction, clear] of LIGHT_RINGS) {
    const r = Math.round((LIGHT_RADIUS + flicker) * fraction);
    ctx.fillStyle = `rgba(0, 0, 0, ${clear})`;
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r - dy * dy));
      ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

export class PlayScene extends WorldBaseScene {
  // options: { world, heroUrl, muted, spawn?: {x, y} tile, entrances?: enterable buildings outside,
  //   onEnterRequest(entrance), onExitRequest(), quietEntrance?: key not to prompt for until the player steps away }
  constructor(options) {
    super('play', options);
    this.muted = options.muted;
    this.stepAlternate = false;
    this.entrances = options.entrances ?? [];
    this.promptedKey = options.quietEntrance ?? null;
    this.travel = options.travel ?? []; // travel pads with a destination
    this.tabletops = options.tabletops ?? []; // tables players can play at: [{ key, x, y }]
    this.restpoints = options.restpoints ?? [];
    this.promptedTable = null; // the table just asked about: not asked again until the player steps away
    this.quietTravel = options.quietTravel ?? null; // the pad the player arrived on: not offered until they step off
    this.paused = false;
  }

  // Freezes movement while a dialogue is open; resume() continues.
  pause() {
    this.paused = true;
    this.target = null;
  }

  resume() {
    this.paused = false;
  }

  feetTile() {
    return { x: Math.floor(this.pos.x / TILE), y: Math.floor((this.pos.y - 1) / TILE) };
  }

  // Asks to enter when the player stands just below an enterable door while walking up into it, or
  // after clicking the building. Leaving through an interior's exit mat goes straight back outside.
  checkDoors(direction) {
    const feet = this.feetTile();
    // Travel areas ask when the player steps into them.
    const pad = this.travel.find((p) => p.cells.has(feet.y * this.world.width + feet.x));
    if (!pad) this.quietTravel = null;
    else if (this.quietTravel !== pad.key) {
      this.quietTravel = pad.key;
      this.pause();
      this.options.onTravelRequest?.(pad);
      return;
    }
    // Tabletops: walking into one (or arriving after clicking it) asks to play.
    // The table tile right next to the player (either half of the table), if any.
    let tableTile = null;
    const table = this.tabletops.find((t) => t.tiles.some(([x, y]) => {
      if (Math.abs(x - feet.x) + Math.abs(y - feet.y) !== 1) return false;
      tableTile = { x, y };
      return true;
    }));
    if (!table) this.promptedTable = null;
    else if (this.promptedTable !== table.key) {
      const toward = direction ? direction.dx * (tableTile.x - feet.x) + direction.dy * (tableTile.y - feet.y) : 0;
      if (toward > 0.6) {
        this.promptedTable = table.key;
        this.pause();
        this.options.onTabletopRequest?.(table);
        return;
      }
    }
    if (this.world.interior && !this.world.indoorMap) {
      // Asks to leave when the player steps onto the mat, or walks down at it from just inside. Only after
      // they have let go of "down" since arriving (they appear right next to the mat), and only once per
      // approach: after "No" it asks again when they step away and come back.
      const pushingDown = direction && direction.dy > 0.3;
      if (!pushingDown) this.exitArmed = true;
      const exit = exitTile(this.world);
      const onMat = this.world.objects[feet.y * this.world.width + feet.x] === 'E';
      const nearMat = feet.y >= exit.y - 1 && Math.abs(feet.x - exit.x) <= 1;
      if (!onMat && !nearMat) this.exitPrompted = false;
      if (!this.exitPrompted && this.exitArmed && (onMat || (nearMat && pushingDown))) {
        this.exitPrompted = true;
        this.pause();
        this.options.onExitRequest?.();
      }
      return;
    }
    const below = this.entrances.find((e) => feet.x === e.x && feet.y === e.y + 1);
    if (!below) {
      this.promptedKey = null; // stepped away, so the next approach asks again
      return;
    }
    const pushingUp = direction && direction.dy < -0.3;
    if (this.promptedKey === below.key || !pushingUp) return;
    this.promptedKey = below.key;
    this.pause();
    this.options.onEnterRequest?.(below);
  }

  create() {
    this.createWorld();
    const spawn = this.options.spawn ?? findSpawn(this.world) ?? { x: Math.floor(this.world.width / 2), y: Math.floor(this.world.height / 2) };
    this.pos = { x: spawn.x * TILE + TILE / 2, y: spawn.y * TILE + TILE - 2 };
    this.target = null;
    this.moving = false;

    const keyboard = this.input.keyboard;
    this.keys = {
      cursors: keyboard.createCursorKeys(),
      wasd: keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' }),
    };
    this.input.mouse?.disableContextMenu();
    // Day cycle: a colour wash over the whole map, and a warm lantern glow around the player after dark.
    this.daylight = this.add.rectangle(0, 0, this.world.width * TILE, this.world.height * TILE, 0x000000, 0).setOrigin(0).setDepth(DAYLIGHT_DEPTH);
    if (!this.textures.exists('lantern')) this.textures.addCanvas('lantern', lanternCanvas());
    this.lantern = this.add.image(0, 0, 'lantern').setBlendMode(Phaser.BlendModes.ADD).setDepth(DAYLIGHT_DEPTH + 1).setAlpha(0);
    this.updateDaylight();
    this.createWeather();
    // Fireflies glow above the night lighting, including the dark-night overlay.
    if (!this.world.interior) {
      this.fireflies = this.add.graphics().setDepth(DAYLIGHT_DEPTH + 2).setBlendMode(Phaser.BlendModes.ADD);
    }
    // Darkness nights: a black layer over the view with a hole of light around the player.
    if (this.options.time?.night === 'dark') {
      if (this.textures.exists('darkness')) this.textures.remove('darkness');
      this.darknessTexture = this.textures.createCanvas('darkness', 1, 1);
      this.darkness = this.add.image(0, 0, 'darkness').setOrigin(0).setDepth(DAYLIGHT_DEPTH + 0.5).setVisible(false);
      // Drawn after the frame's movement and camera follow, so the light never lags behind the player.
      this.events.on('postupdate', (time) => this.updateDarkness(time));
    }
    this.input.on('pointerdown', (pointer) => {
      if (this.paused || this.hoeAction || !(pointer.leftButtonDown() || pointer.wasTouch)) return;
      const point = this.toWorld(pointer);
      // Left-click performs an action; walking uses WASD or arrow keys.
      const tx = Math.floor(point.x / TILE);
      const ty = Math.floor(point.y / TILE);
      if(this.options.onMechanicAction){this.options.onMechanicAction(tx,ty);return;}
      const drop = (this.inventoryDrops ?? []).find((item) => item.location.x === tx && item.location.y === ty);
      if (drop) {
        const feet = this.feetTile();
        if (Math.abs(feet.x - tx) + Math.abs(feet.y - ty) <= 1) this.options.onPickup?.(drop.id);
        else this.options.onFarmNotice?.('Stand beside the dropped item to collect it.');
        return;
      }
      if (this.options.hoeEquipped) {
        this.useHoe(tx, ty);
        return;
      }
      const restpoint = this.restpoints.find((rest) => rest.tiles.some(([x, y]) => x === tx && y === ty));
      if (restpoint) {
        this.pause();
        this.options.onRestRequest?.(restpoint);
        return;
      }
      if (this.options.equipment) {
        if (['sword', 'axe'].includes(this.options.equipment.kind)) {
          this.hero?.setFlipX(point.x < this.pos.x);
          this.swingEquipment();
        } else this.options.onFarmNotice?.('This equipment action is not available yet.');
        return;
      }
      const feet = this.feetTile();
      const table = this.tabletops.find((entry) => entry.tiles.some(([x,y]) => x === tx && y === ty));
      if (table) {
        if (table.tiles.some(([x,y]) => Math.abs(x-feet.x)+Math.abs(y-feet.y)===1)) {
          this.promptedTable=table.key;this.pause();this.options.onTabletopRequest?.(table);
        }
        return;
      }
      const entrance=this.entrances.find((entry)=>entry.footprint.some(([x,y])=>x===tx&&y===ty));
      if (entrance && feet.x===entrance.x && feet.y===entrance.y+1) {
        this.promptedKey=entrance.key;this.pause();this.options.onEnterRequest?.(entrance);
      }
    });
    this.farmHighlight = this.add.graphics().setDepth(DAYLIGHT_DEPTH + 3);
    this.input.on('pointermove', (pointer) => {
      const g = this.farmHighlight.clear();
      if (!this.options.hoeEquipped || this.paused || this.hoeAction) return;
      const point = this.toWorld(pointer);
      const x = Math.floor(point.x / TILE), y = Math.floor(point.y / TILE);
      const allowed = canTill(this.world, x, y, this.feetTile());
      g.lineStyle(1, allowed ? 0xd5fa88 : 0xff7a7a, 0.9).strokeRect(x * TILE, y * TILE, TILE, TILE);
    });
    this.input.on('pointermove', (pointer) => { this.pointerOverWorld = true;this.updateCursor(pointer); });
    this.input.on('gameout', () => { this.farmHighlight.clear();this.pointerOverWorld = false;this.setPlayCursor('arrow'); });
    this.restHighlight = this.add.graphics().setDepth(DAYLIGHT_DEPTH + 3);
    this.input.on('pointermove', (pointer) => {
      const g = this.restHighlight.clear();
      if (this.paused) return;
      const point = this.toWorld(pointer);
      const rest = this.restpoints.find((r) => r.tiles.some(([x, y]) => x === Math.floor(point.x / TILE) && y === Math.floor(point.y / TILE)));
      if (!rest) return;
      g.lineStyle(1, 0xffed9a, 0.9);
      for (const [x, y] of rest.tiles) g.strokeRect(x * TILE, y * TILE, TILE, TILE);
    });
    this.scale.on('resize', () => this.follow());

    this.hop = { y: 0 };
    this.gait = { walking: false, phase: 0, stillFor: STOP_GRACE_MS, idleFor: LAND_MS, landFrom: 0, landed: true };
    this.loadHero(() => {
      for (const [key, rows] of Object.entries(SHADOWS)) if (!this.textures.exists(key)) this.textures.addCanvas(key, shadowCanvas(rows));
      this.shadow = this.add.image(0, 0, 'hero-shadow').setOrigin(0.5);
      this.hero = this.addHero(0, 0);
      this.placeHero();
    });
    this.follow();
    this.setEquipment(this.options.equipment);
    this.setInventoryDrops(this.inventoryDrops ?? []);
  }

  setPlayCursor(kind) {
    if (this.cursorKind === kind) return;
    this.cursorKind = kind;
    this.game.canvas.style.cursor = GAME_CURSORS[kind];
  }

  updateCursor(pointer) {
    if (!this.pointerOverWorld || this.paused || !this.pos) { this.setPlayCursor('arrow');return; }
    const point = this.toWorld(pointer), x = Math.floor(point.x / TILE), y = Math.floor(point.y / TILE);
    const hasTile = (entry) => entry.tiles?.some(([tx, ty]) => tx === x && ty === y);
    const drop = this.inventoryDrops?.some((entry) => entry.location.x === x && entry.location.y === y);
    if (drop) { this.setPlayCursor('hand');return; }
    if (this.options.hoeEquipped) { this.setPlayCursor('hoe');return; }
    const interactive = this.restpoints.some(hasTile) || this.tabletops.some(hasTile)
      || this.entrances.some((entry) => entry.footprint.some(([tx, ty]) => tx === x && ty === y))
      || this.travel.some((entry) => entry.cells.has(y * this.world.width + x));
    this.setPlayCursor(interactive ? 'hand' : 'arrow');
  }

  setInventoryDrops(drops) {
    this.inventoryDrops = drops;
    if (!this.ground) return;
    if (!this.dropMarkers) this.dropMarkers = this.add.graphics().setDepth(900000);
    const g = this.dropMarkers.clear();
    for (const drop of drops) {
      const x = drop.location.x * TILE + 5, y = drop.location.y * TILE + 8;
      g.fillStyle(0x493022).fillRect(x - 1, y - 1, 8, 7);
      g.fillStyle(0xdca34d).fillRect(x, y, 6, 5);
      g.fillStyle(0xffe4a2).fillRect(x + 2, y - 2, 2, 6);
    }
  }

  setEquipment(item) {
    this.options.equipment = item;
    this.heldEquipment?.destroy();
    this.heldEquipment = null;
    if (!item || !this.pos || !this.textures.exists(`equipment-${item.id}`)) return;
    this.heldEquipment = this.add.image(this.pos.x + 7, this.pos.y - PLAYER_HAND_OFFSET, `equipment-${item.id}`).setOrigin(0.5, 1).setScale(0.5).setDepth(this.pos.y + 1);
  }

  useHoe(x, y) {
    const item = this.options.equipment;
    if (!canUseHoe(item) || !this.textures.exists(`equipment-${item.id}`)) {
      this.options.onFarmNotice?.('Equip a generated Hoe from Equipment first.');
      return;
    }
    if (!canTill(this.world, x, y, this.feetTile())) {
      this.options.onFarmNotice?.('Stand beside clear, marked grass to till it. Use WASD or arrow keys to move.');
      return;
    }
    const i = y * this.world.width + x;
    if (this.options.tilled.has(i)) { this.options.onFarmNotice?.('This soil is already tilled.'); return; }
    this.animateHoeStrike(x, y, () => {
      if (!canTill(this.world, x, y, this.feetTile())) return;
      this.options.tilled.add(i);
      this.updateTiles([i]);
      this.options.onFarmNotice?.('Soil prepared! Till a neighboring tile to expand the patch.');
    });
  }

  // Discrete, rasterised poses keep every hoe pixel on the world grid during the strike.
  hoePoseTexture(item, angle) {
    const key = `hoe-pose-${item.id}-${angle}`;
    if (this.textures.exists(key)) return key;
    const canvas = document.createElement('canvas');canvas.width=canvas.height=48;
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    ctx.translate(24,32);ctx.rotate(angle*Math.PI/180);
    const source=this.textures.get(`equipment-${item.id}`).getSourceImage();
    ctx.drawImage(source,-4,-15,8,16);
    this.textures.addCanvas(key,canvas);
    return key;
  }

  animateHoeStrike(x, y, onImpact) {
    const item=this.options.equipment;
    if (!canUseHoe(item) || this.hoeAction) return;
    this.target=null;this.moving=false;this.hoeAction=true;this.heldEquipment?.setVisible(false);
    const impact={x:x*TILE+TILE/2,y:y*TILE+TILE-4};
    const left=impact.x<this.pos.x;this.hero?.setFlipX(left);
    const grip={x:Math.round(this.pos.x)+(left?-6:6),y:Math.round(this.pos.y)-8};
    const angle=Math.round(Math.atan2(Math.abs(impact.x-grip.x),-(impact.y-grip.y))*180/Math.PI/15)*15;
    // Quick contact, then a visible pull towards the body and a gentle settle into idle.
    const frames=[{angle:-20,dx:0,dy:0,dip:0,ms:50},
      {angle,dx:1,dy:2,dip:1,ms:75,impact:true},
      {angle:angle-15,dx:-2,dy:0,dip:1,ms:80},
      {angle:Math.round(angle/30)*15,dx:-4,dy:-3,dip:0,ms:100},
      {angle:15,dx:-2,dy:-1,dip:0,ms:85},
      {angle:0,dx:0,dy:0,dip:0,ms:60}];
    const tool=this.add.image(grip.x,grip.y,this.hoePoseTexture(item,frames[0].angle)).setOrigin(0.5,32/48).setFlipX(left).setDepth(this.pos.y+2);
    const play=(index)=>{
      if(index===frames.length){tool.destroy();this.actionDip=0;this.hoeAction=false;this.heldEquipment?.setVisible(true);return;}
      const frame=frames[index];
      tool.setTexture(this.hoePoseTexture(item,frame.angle)).setPosition(grip.x+frame.dx*(left?-1:1),grip.y+frame.dy);
      this.actionDip=frame.dip;
      if(frame.impact&&this.options.equipment?.id===item.id)onImpact();
      this.time.delayedCall(frame.ms,()=>play(index+1));
    };
    play(0);
  }

  hoeImpact(point) {
    const dirt=this.add.graphics().setDepth(point.y+3);
    const bits=[[-2,-1,-2],[-1,1,-3],[0,-1,-4],[1,2,-3],[2,1,-2]];
    let frame=0;
    const paint=()=>{
      dirt.clear();
      for(const [i,[dx,vx,vy]] of bits.entries()){
        const x=Math.round(point.x+dx+vx*frame),y=Math.round(point.y+vy*frame+frame*frame/2);
        dirt.fillStyle([0xb47b4c,0x65412d,0xd4a365][i%3]).fillRect(x,y,frame<3?2:1,frame<3?2:1);
      }
      frame++;
    };
    paint();
    this.time.addEvent({delay:45,repeat:5,callback:()=>{if(frame===6)dirt.destroy();else paint();}});
  }

  swingEquipment(onComplete) {
    const item=this.options.equipment;
    if (!item || this.hoeAction || !this.textures.exists(`equipment-${item.id}`)) return;
    this.target=null;this.hoeAction=true;this.heldEquipment?.setVisible(false);
    const left=this.hero?.flipX;
    const tool=this.add.image(Math.round(this.pos.x)+(left?-5:5),Math.round(this.pos.y)-6,`equipment-${item.id}`).setOrigin(0.5,0.9).setScale(0.6).setFlipX(Boolean(left)).setDepth(this.pos.y+2);
    tool.setAngle(left?55:-55);
    this.tweens.add({targets:tool,angle:left?-40:40,duration:160,yoyo:true,onComplete:()=>{
      tool.destroy();this.hoeAction=false;this.heldEquipment?.setVisible(true);
      if(this.options.equipment?.id===item.id)onComplete?.();
    }});
  }

  // Can the hero's feet stand at (x, y)?
  canStand(x, y) {
    const left = Math.floor((x - FOOTPRINT.width / 2) / TILE);
    const right = Math.floor((x + FOOTPRINT.width / 2 - 0.01) / TILE);
    const top = Math.floor((y - FOOTPRINT.height) / TILE);
    const bottom = Math.floor((y - 0.01) / TILE);
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) if (isBlocked(this.world, tx, ty)) return false;
    }
    return true;
  }

  inputDirection() {
    const { wasd, cursors } = this.keys;
    const dx = (wasd.right.isDown || cursors.right.isDown ? 1 : 0) - (wasd.left.isDown || cursors.left.isDown ? 1 : 0);
    const dy = (wasd.down.isDown || cursors.down.isDown ? 1 : 0) - (wasd.up.isDown || cursors.up.isDown ? 1 : 0);
    if (!dx && !dy) return null;
    const length = Math.hypot(dx, dy);
    return { dx: dx / length, dy: dy / length };
  }

  // The bouncy gait, worked out every frame from how long the hero has been walking or standing (not with
  // tweens, so it can't get stuck or restart mid-stride). Walking: continuous hops, a footstep each time one
  // lands. Standing: land with a bounce, then breathe gently.
  updateGait(delta, moving) {
    const g = this.gait;
    g.stillFor = moving ? 0 : g.stillFor + delta;
    const walking = g.stillFor < STOP_GRACE_MS;
    if (walking) {
      if (!g.walking) Object.assign(g, { walking: true, phase: 0 });
      const before = g.phase;
      g.phase += delta / (HOP_MS * 2);
      if (Math.floor(g.phase) > Math.floor(before)) this.footstep(); // a hop just landed
      // Rise and fall like an eased hop: fast up, hang, fast down.
      this.hop.y = -HOP_HEIGHT * Math.sin(Math.PI * (g.phase % 1));
      return;
    }
    if (g.walking) Object.assign(g, { walking: false, idleFor: 0, landFrom: this.hop.y, landed: false });
    g.idleFor += delta;
    if (g.idleFor < LAND_MS) {
      this.hop.y = g.landFrom * (1 - bounceOut(g.idleFor / LAND_MS));
      return;
    }
    if (!g.landed) {
      g.landed = true;
      if (g.landFrom <= AIRBORNE_AT) this.footstep(true);
    }
    // Breathing: up one pixel and back, with a short pause at the top.
    const breath = BREATHE_MS * 2 + 150;
    this.hop.y = -(1 - Math.cos((2 * Math.PI * ((g.idleFor - LAND_MS) % breath)) / breath)) / 2;
  }

  setMuted(muted) {
    this.muted = muted;
  }

  // Weather ambience volume, 0 to 1 (Options in the pause menu).
  setAmbienceVolume(volume) {
    this.options.ambienceVolume = volume;
  }

  // Rain you can hear: louder outside, muffled indoors, following the weather's strength. Started once the
  // browser allows sound (after the first click or key press) and stopped when the scene ends.
  updateRainSound() {
    const weather = this.options.weather;
    if (!weather || weather.mode === 'off') return;
    const context = this.sound.context;
    if (!context || this.sound.locked || context.state !== 'running') return;
    if (!this.rainSound) {
      this.rainSound = createRainSound(context, this.sound.destination ?? context.destination);
      const stop = () => { this.rainSound?.stop(); this.rainSound = null; };
      this.events.once('shutdown', stop);
      this.events.once('destroy', stop);
    }
    const { kind, strength } = weatherAt(weather, this.options.mapId ?? 'main');
    const indoors = this.world.interior && !this.world.indoorMap;
    const volume = this.options.ambienceVolume ?? 1;
    this.rainSound.setLevel(this.muted || kind !== 'rain' ? 0 : strength * volume, indoors);
  }

  footstep(soft = false) {
    // Phaser unlocks its audio context on the first click or key press; before that, stay silent.
    const context = this.sound.context;
    if (this.muted || !context || this.sound.locked || context.state !== 'running') return;
    const tx = Math.floor(this.pos.x / TILE);
    const ty = Math.floor((this.pos.y - 1) / TILE);
    const terrain = this.world.terrain[ty * this.world.width + tx];
    this.stepAlternate = !this.stepAlternate;
    playStep(context, this.sound.destination ?? context.destination, terrain, this.stepAlternate, soft);
  }

  // Weather (outdoors, and on indoor maps that have it): a wash, two drifting fog layers and rain.
  // options.weather is the map's setting (see weather.js) and options.mapId seeds random weather.
  createWeather() {
    this.hasWeather = Boolean(this.options.weather) && !(this.world.interior && !this.world.indoorMap) && this.options.weather.mode !== 'off';
    if (!this.hasWeather) return;
    this.weatherWash = this.add.rectangle(0, 0, this.world.width * TILE, this.world.height * TILE, 0x000000, 0).setOrigin(0).setDepth(WEATHER_DEPTH);
    if (!this.textures.exists('fog')) this.textures.addCanvas('fog', fogCanvas());
    this.fogLayers = [
      { sprite: this.add.tileSprite(0, 0, 1, 1, 'fog').setOrigin(0).setDepth(WEATHER_DEPTH + 1), drift: 0.004, parallax: 1, scale: 1 },
      { sprite: this.add.tileSprite(0, 0, 1, 1, 'fog').setOrigin(0).setDepth(WEATHER_DEPTH + 2), drift: 0.009, parallax: 1, scale: 2 },
    ];
    for (const layer of this.fogLayers) layer.sprite.setTileScale(layer.scale).setAlpha(0);
    this.rain = this.add.graphics().setDepth(WEATHER_DEPTH + 3);
    this.drops = [];
    this.splashes = [];
  }

  updateWeather(time, delta) {
    if (!this.hasWeather) return;
    const { kind, strength } = weatherAt(this.options.weather, this.options.mapId ?? 'main');
    const cam = this.cameras.main;
    const view = { x: cam.scrollX, y: cam.scrollY, width: Math.ceil(cam.width / cam.zoom), height: Math.ceil(cam.height / cam.zoom) };
    const wash = WEATHER_WASH[kind];
    this.weatherWash.setFillStyle(wash?.color ?? 0, (wash?.alpha ?? 0) * strength);

    // Mist: fog fixed to the ground that slowly drifts with the wind.
    const mist = kind === 'mist' ? strength : 0;
    for (const layer of this.fogLayers) {
      layer.sprite.setPosition(Math.floor(view.x), Math.floor(view.y)).setSize(view.width + 1, view.height + 1).setAlpha(mist * 0.9);
      if (!mist) continue;
      layer.sprite.tilePositionX = (Math.floor(view.x) + time * layer.drift) / layer.scale;
      layer.sprite.tilePositionY = Math.floor(view.y) / layer.scale;
    }

    // Rain: slanted pixel streaks falling across the view, with a little splash where each one lands.
    const g = this.rain.clear();
    const wanted = kind === 'rain' ? Math.min(MAX_DROPS, Math.round(view.width * view.height * RAIN_DENSITY * strength)) : 0;
    while (this.drops.length < wanted) this.drops.push(this.newDrop(view, true));
    if (this.drops.length > wanted) this.drops.length = wanted;
    const step = Math.min(delta, 50) * RAIN_SPEED;
    for (const drop of this.drops) {
      drop.y += step * drop.speed;
      drop.x -= step * drop.speed * 0.25;
      if (drop.y >= drop.land) {
        this.splashes.push({ x: drop.x, y: drop.land, until: time + SPLASH_MS });
        Object.assign(drop, this.newDrop(view, false));
      }
      g.fillStyle(0xbcd4f0, 0.75);
      for (let k = 0; k < drop.length; k++) g.fillRect(Math.round(view.x + drop.x + k * 0.25), Math.round(view.y + drop.y - k), 1, 1);
    }
    this.splashes = this.splashes.filter((s) => s.until > time);
    g.fillStyle(0xdbe8f7, 0.8);
    for (const s of this.splashes) {
      const x = Math.round(view.x + s.x);
      const y = Math.round(view.y + s.y);
      g.fillRect(x - 1, y, 1, 1).fillRect(x + 1, y, 1, 1).fillRect(x, y - 1, 1, 1);
    }
  }

  // Sparse, world-anchored fireflies: drifting pixel lights that pulse independently after dusk.
  updateFireflies(time) {
    const g = this.fireflies.clear();
    const hour = this.options.time ? hourFor(this.options.time) : null;
    if (hour === null) return;
    const night = Phaser.Math.Clamp((lightAt(hour).alpha - 0.3) / 0.25, 0, 1);
    if (!night) return;
    const cam = this.cameras.main;
    const spacing = 64;
    const width = this.world.width * TILE;
    const height = this.world.height * TILE;
    // Visit only the visible cells, with a margin for their small wandering paths.
    const left = Math.max(0, Math.floor((cam.scrollX - 16) / spacing));
    const top = Math.max(0, Math.floor((cam.scrollY - 16) / spacing));
    const right = Math.min(Math.ceil(width / spacing), Math.ceil((cam.scrollX + cam.width / cam.zoom + 16) / spacing));
    const bottom = Math.min(Math.ceil(height / spacing), Math.ceil((cam.scrollY + cam.height / cam.zoom + 16) / spacing));
    for (let row = top; row < bottom; row++) {
      for (let col = left; col < right; col++) {
        const seed = ((Math.imul(col + 1, 73856093) ^ Math.imul(row + 1, 19349663)) >>> 0);
        const phase = (seed % 6283) / 1000;
        const t = time / 1000;
        const x = Math.round(col * spacing + 12 + seed % 40 + Math.sin(t * 0.4 + phase) * 9);
        const y = Math.round(row * spacing + 12 + (seed >>> 8) % 40 + Math.sin(t * 0.6 + phase * 2) * 7);
        if (x >= width || y >= height) continue;
        const pulse = Math.pow((Math.sin(t * (1.1 + (seed % 7) / 10) + phase) + 1) / 2, 3);
        const glow = night * pulse;
        g.fillStyle(0xb6ed66, glow * 0.08).fillRect(x - 3, y - 3, 7, 7);
        g.fillStyle(0xd5fa80, glow * 0.22).fillRect(x - 1, y - 1, 3, 3);
        g.fillStyle(0xfff4b0, glow * 0.9).fillRect(x, y, 1, 1);
      }
    }
  }

  // A raindrop in view coordinates; it lands somewhere in the view. Fresh drops start anywhere, later ones at the top.
  newDrop(view, anywhere) {
    const land = Math.random() * view.height;
    return { x: Math.random() * (view.width + view.height * 0.25), y: anywhere ? Math.random() * land : -6, land, length: 4 + Math.floor(Math.random() * 3), speed: 0.8 + Math.random() * 0.4 };
  }

  // Covers the view in near-black except a stepped circle of light around the player, which flickers a
  // little like a lantern. Fades with the night; softer inside buildings.
  updateDarkness(time) {
    const indoors = this.world.interior && !this.world.indoorMap;
    const amount = darknessAt(this.options.time) * (indoors ? 0.6 : 1);
    if (amount <= 0 || !this.pos) { this.darkness.setVisible(false); return; }
    const cam = this.cameras.main;
    const width = Math.ceil(cam.width / cam.zoom) + 2;
    const height = Math.ceil(cam.height / cam.zoom) + 2;
    if (this.darknessTexture.width !== width || this.darknessTexture.height !== height) this.darknessTexture.setSize(width, height);
    const ox = Math.floor(cam.scrollX);
    const oy = Math.floor(cam.scrollY);
    paintDarkness(this.darknessTexture.getContext(), width, height, Math.round(this.pos.x) - ox, Math.round(this.pos.y) - 8 - oy, amount, time);
    this.darknessTexture.refresh();
    this.darkness.setPosition(ox, oy).setVisible(true);
  }

  updateDaylight() {
    // options.time: the map's time of day settings (see daycycle.js); off means normal colours.
    const hour = this.options.time ? hourFor(this.options.time) : null;
    const { color, alpha } = hour === null ? { color: 0, alpha: 0 } : lightAt(hour, this.world.interior);
    this.daylight.setFillStyle(color, alpha);
    // The lantern fades in as it gets dark.
    this.lantern.setAlpha(Phaser.Math.Clamp((alpha - 0.15) / 0.35, 0, 1));
    if (this.pos) this.lantern.setPosition(Math.round(this.pos.x), Math.round(this.pos.y) - 8);
  }

  update(time, delta) {
    this.updateCursor(this.input.activePointer);
    if (this.daylight) this.updateDaylight();
    this.animateNpcs(time);
    if (this.rain) this.updateWeather(time, delta);
    if (this.fireflies) this.updateFireflies(time);
    this.updateRainSound();
    if (!this.hero) return;
    if (this.paused || this.hoeAction) {
      this.updateGait(delta, false);
      this.placeHero();
      return;
    }
    const direction = this.inputDirection();
    this.moving = false;
    if (direction) {
      const step = Math.min(SPEED * Math.min(delta, 50) / 1000, direction.distance ?? Infinity);
      // Move each axis separately so the hero slides along walls instead of sticking.
      const nextX = this.pos.x + direction.dx * step;
      const nextY = this.pos.y + direction.dy * step;
      if (direction.dx && this.canStand(nextX, this.pos.y)) { this.pos.x = nextX; this.moving = true; }
      if (direction.dy && this.canStand(this.pos.x, nextY)) { this.pos.y = nextY; this.moving = true; }
      if (!this.moving) this.target = null;
      if (direction.dx < 0) this.hero.setFlipX(true);
      else if (direction.dx > 0) this.hero.setFlipX(false);
    }
    this.updateGait(Math.min(delta, 50), this.moving);
    this.placeHero();
    this.follow();
    this.checkDoors(direction);
  }

  placeHero() {
    const x = Math.round(this.pos.x);
    const y = Math.round(this.pos.y);
    const lift = Math.round(this.hop.y + (this.actionDip ?? 0));
    if (this.heldEquipment) {
      const left = this.hero.flipX;
      this.heldEquipment.setPosition(x + (left ? -7 : 7), y + lift - PLAYER_HAND_OFFSET).setDepth(this.pos.y + 1).setFlipX(left).setVisible(!this.hoeAction);
    }
    this.hero.setPosition(x, y + lift).setDepth(this.pos.y + 0.5);
    const shadowKey = lift <= AIRBORNE_AT ? 'hero-shadow-air' : 'hero-shadow';
    // Anchor in whole pixels (both shadows are an even width) so the shadow stays on the pixel grid.
    if (this.shadow.texture.key !== shadowKey) this.shadow.setTexture(shadowKey);
    this.shadow.setDisplayOrigin(this.shadow.width / 2, 2).setPosition(x, y - 1).setDepth(this.pos.y + 0.4);
  }

  // Centre the camera on the hero, clamped to the map; scroll moves in whole world pixels with the hero.
  follow() {
    const cam = this.cameras.main;
    const viewWidth = cam.width / PLAY_ZOOM;
    const viewHeight = cam.height / PLAY_ZOOM;
    const mapWidth = this.world.width * TILE;
    const mapHeight = this.world.height * TILE;
    const axis = (pos, view, map) => (map <= view ? (map - view) / 2 : Math.round(Phaser.Math.Clamp(pos - view / 2, 0, map - view)));
    this.setView(PLAY_ZOOM, axis(Math.round(this.pos.x), viewWidth, mapWidth), axis(Math.round(this.pos.y), viewHeight, mapHeight));
  }
}
