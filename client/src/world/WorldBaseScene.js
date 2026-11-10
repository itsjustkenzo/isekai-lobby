import {drawInteriorLightingTile} from './interiorLighting.js';
import {drawInteriorBorderTile} from './interiorBorder.js';
import {interiorSpriteLayout} from '../interiorAssetScale.js';
import {isLiquidTexture,animatedLiquidAt,drawLiquidTile,liquidPalette,liquidCell,shorelinePixels,drawShoreline} from './liquidTextures.js';
import {drawGroundTransitions} from './groundTransitions.js';
import { drawSoilPatch } from './farming.js';
import { paintTextures } from './paintTextures.js';
import { canPaintTexture } from './world.js';
import Phaser from 'phaser';
import { TILE, WATER_FRAME_MS, buildArt, decorVariant, drawGroundTile } from './art.js';
import { shrinkPixelArt } from './pixelUi.js';
import { npcById, PART_OF_BUILDING, TURNS, assetById, assetDims, buildingById, customBuildings, isStructure, libraryAssets, placementTurn, roofRegion } from './world.js';

export const MAX_ZOOM = 16;
import {pixelateSprite,PLAYER_SPRITE_HEIGHT} from './characterSprite.js';
export {pixelateSprite} from './characterSprite.js';

// Converts the large generated sprite (chunky AI pixel art, ~16 image pixels per art pixel)
// into a crisp world-scale sprite. Each output pixel takes the most common colour in its block
// rather than an average, so no blended "blurry" colours appear. A 1px dark outline is added to
// match the tile decorations.
// A soft pixel shadow under a standing character (like the hero's).
function npcShadowCanvas() {
  const rows = ['..xxxxxxxx..', '.xxxxxxxxxx.', '.xxxxxxxxxx.', '..xxxxxxxx..'];
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(20, 30, 15, 0.28)';
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'x') ctx.fillRect(x, y, 1, 1); }));
  return canvas;
}

// Shared world rendering and pixel-exact camera for the editor and play scenes.
export class WorldBaseScene extends Phaser.Scene {
  constructor(key, options) {
    super(key);
    this.options = options;
    this.world = options.world;
    this.decor = new Map();
  }

  // Player-designed houses are images on the server; load them before the world is drawn.
  preload() {
    for (const item of this.options.equipmentLibrary ?? []) this.load.image(`equipment-${item.id}`, item.image);
    for (const texture of paintTextures()) this.load.image(`paint-${texture.id}`, texture.image);
    for (const house of customBuildings()) this.load.image(`building-${house.id}`, house.spriteUrl);
    for (const asset of libraryAssets()) {
      this.load.image(`asset-${asset.id}`, asset.spriteUrl);
      if (asset.sideSpriteUrl) this.load.image(`asset-${asset.id}-side`,asset.sideSpriteUrl);
    }
  }

  // Loads a newly added library asset's image mid-session, then calls onReady.
  // Also loads its vertical version once that exists.
  loadAsset(asset, onReady) {
    const images = [[`asset-${asset.id}`, asset.spriteUrl], [`asset-${asset.id}-side`, asset.sideSpriteUrl]]
      .filter(([key, url]) => url && !this.textures.exists(key));
    if (!images.length) return onReady();
    for (const [key, url] of images) this.load.image(key, url);
    this.load.once('complete', onReady);
    this.load.start();
  }

  // Keeps one image per placed asset, matching world.placed (added, moved or removed placements).
  // A 90°-clockwise copy of an asset's footprint (the headroom above it is left out, as it would
  // end up sideways). Drawn with smoothing off at exact right angles, so pixels map one-to-one.
  rotatedTexture(asset) {
    const key = `asset-${asset.id}-rot`;
    if (this.textures.exists(key)) return key;
    if (!this.textures.exists(`asset-${asset.id}`)) return null;
    const source = this.textures.get(`asset-${asset.id}`).getSourceImage();
    const footprintHeight=asset.height*TILE;
    const canvas=document.createElement('canvas');canvas.width=footprintHeight;canvas.height=source.width;
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.translate(footprintHeight,0);ctx.rotate(Math.PI/2);
    ctx.drawImage(source,0,source.height-footprintHeight,source.width,footprintHeight,0,0,source.width,footprintHeight);
    this.textures.addCanvas(key, canvas);
    return key;
  }

  syncAssets() {
    this.assetImages ??= new Map();
    const wanted = new Map(this.world.placed.map((p) => [`${p.a}@${p.x},${p.y}${p.r ? 'v' : ''}${p.t ? 't' : ''}${p.f ? 'f' : ''}`, p]));
    for (const [key, image] of this.assetImages) {
      if (!wanted.has(key)) { image.destroy(); this.assetImages.delete(key); }
    }
    for (const [key, p] of wanted) {
      const asset = assetById(p.a);
      // Vertical placements use the AI-drawn side sprite, rotated ones a 90° copy; flipped ones are mirrored.
      const turn = placementTurn(p);
      if (this.assetImages.has(key) || !asset) continue;
      const texture = turn === TURNS.ROTATED ? this.rotatedTexture(asset) : turn === TURNS.VERTICAL ? `asset-${p.a}-side` : `asset-${p.a}`;
      if (!texture || !this.textures.exists(texture)) continue;
      const bottom = (p.y + 1) * TILE;
      const { width } = assetDims(asset, turn);
      const image = this.add.image(p.x * TILE + (width * TILE) / 2, bottom-(p.elevation??0), texture).setOrigin(0.5, 1).setDepth(bottom+(p.supportAssetId?0.1:0)).setFlipX(Boolean(p.f));
      if(!turn&&['Furniture','Indoor prop'].includes(asset.assetKind)){
        const source=this.textures.get(texture).getSourceImage(),canvas=document.createElement('canvas');
        canvas.width=source.width;canvas.height=source.height;const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);
        const layout=interiorSpriteLayout(asset,ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
        if(layout){const t=this.textures.get(texture);if(!t.has('interior-scale'))t.add('interior-scale',0,layout.x,layout.y,layout.width,layout.height);image.setFrame('interior-scale').setDisplaySize(layout.displayWidth,layout.displayHeight);}
      }
      this.assetImages.set(key, image);
    }
  }

  // Loads a newly designed house's image mid-session, then calls onReady.
  loadCustomHouse(house, onReady) {
    const key = `building-${house.id}`;
    if (this.textures.exists(key)) this.textures.remove(key);
    this.load.image(key, house.spriteUrl);
    this.load.once('complete', onReady);
    this.load.start();
  }

  loadPaintTexture(texture, onReady) {
    const key = `paint-${texture.id}`;
    if (this.textures.exists(key)) return onReady();
    this.load.image(key, texture.image);
    this.load.once('complete', onReady);
    this.load.start();
  }

  drawPaintedTile(ctx, world, x, y) {
    if(drawInteriorBorderTile(ctx,world,x,y))return;
    drawGroundTile(ctx, this.art, world, x, y, this.waterFrame);
    const finish = world.paint?.[y * world.width + x];
    if (finish && canPaintTexture(world, finish.surface, x, y) && this.textures.exists(`paint-${finish.id}`)) {
      ctx.imageSmoothingEnabled = false;
      const source=this.textures.get(`paint-${finish.id}`).getSourceImage();
      const texture=paintTextures().find((entry)=>entry.id===finish.id);
      if(world.terrain[y*world.width+x]==='w'||isLiquidTexture(texture)){
        this.liquidPalettes??=new Map();
        if(!this.liquidPalettes.has(finish.id)){
          const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;
          const sample=canvas.getContext('2d',{willReadFrequently:true});sample.drawImage(source,0,0,16,16);
          this.liquidPalettes.set(finish.id,liquidPalette(sample.getImageData(0,0,16,16).data));
        }
        drawLiquidTile(ctx,source,x,y,this.waterFrame,this.liquidPalettes.get(finish.id));
      }else ctx.drawImage(source, x * TILE, y * TILE, TILE, TILE);
    }
    if(liquidCell(world,x,y,paintTextures())){
      this.shoreMasks??=new Map();const index=y*world.width+x;
      if(!this.shoreMasks.has(index))this.shoreMasks.set(index,shorelinePixels(world,x,y,paintTextures()));
      const palette=this.liquidPalettes?.get(finish?.id)??['#9ccbf5','#bfe0fb','#e8f5ff'];
      drawShoreline(ctx,x,y,this.shoreMasks.get(index),(dx,dy)=>{
        const nx=x+dx,ny=y+dy,paint=world.paint?.[ny*world.width+nx];
        if(paint&&this.textures.exists(`paint-${paint.id}`)&&canPaintTexture(world,paint.surface,nx,ny))return this.textures.get(`paint-${paint.id}`).getSourceImage();
        return this.art.terrain[world.terrain[ny*world.width+nx]]?.[0];
      },palette,this.waterFrame);
    }
    drawGroundTransitions(ctx,world,x,y,paintTextures(),id=>this.textures.exists(`paint-${id}`)?this.textures.get(`paint-${id}`).getSourceImage():null);
    drawSoilPatch(ctx, world, x, y, this.options.tilled);
    drawInteriorLightingTile(ctx,world,x,y,libraryAssets());
  }

  createWorld() {
    const { world } = this;
    this.art = buildArt();
    for (const [id, sizes] of Object.entries(this.art.decor)) {
      sizes.forEach((canvas, size) => this.textures.addCanvas(`decor-${id}-${size}`, canvas));
    }
    for (const [id, canvas] of Object.entries(this.art.buildings)) this.textures.addCanvas(`building-${id}`, canvas);
    this.ground = this.textures.createCanvas('ground', world.width * TILE, world.height * TILE);
    this.add.image(0, 0, 'ground').setOrigin(0).setDepth(-1);
    this.waterFrame = 0;
    this.redrawAll();
    this.time.addEvent({ delay: WATER_FRAME_MS, loop: true, callback: () => this.animateWater() });
    // Origin (0, 0) plus whole-number zoom and pixel-snapped scroll keeps every art pixel the same size on screen.
    this.cameras.main.setOrigin(0, 0).setRoundPixels(true);
  }

  setWorld(world) {
    this.world = world;
    this.redrawAll();
  }

  // Advances the water animation and redraws only the water tiles (their edges and foam are part of the tile).
  animateWater() {
    this.waterFrame += 1; // a running tick: waves loop every WATER_FRAMES, bubbles use the whole count
    const { world } = this;
    const ctx = this.ground.getContext();
    let drawn = false;
    for (let i = 0; i < world.terrain.length; i++) {
      if (world.terrain[i] !== 'w' && !animatedLiquidAt(world,i,paintTextures())) continue;
      this.drawPaintedTile(ctx, world, i % world.width, Math.floor(i / world.width));
      drawn = true;
    }
    if (drawn) this.ground.refresh();
  }

  redrawAll() {
    this.shoreMasks=new Map();
    this.overviewCache = null;
    const ctx = this.ground.getContext();
    ctx.clearRect(0, 0, this.ground.width, this.ground.height);
    for (let y = 0; y < this.world.height; y++) {
      for (let x = 0; x < this.world.width; x++) this.drawPaintedTile(ctx, this.world, x, y);
    }
    this.ground.refresh();
    for (let i = 0; i < this.world.objects.length; i++) this.updateDecor(i);
    this.syncAssets();
    this.syncNpcs();
  }

  updateTiles(indices) {
    this.shoreMasks=new Map();
    this.overviewCache = null;
    const { world } = this;
    const ctx = this.ground.getContext();
    const redraw = new Set();
    for (const i of indices) {
      const x = i % world.width;
      const y = Math.floor(i / world.width);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx >= 0 && y + dy >= 0 && x + dx < world.width && y + dy < world.height) redraw.add((y + dy) * world.width + x + dx);
        }
      }
      this.updateDecor(i);
    }
    // A roof is drawn as one shape, so any change touching a roof redraws that whole roof.
    const roofTiles = new Set();
    for (const i of [...redraw]) {
      if (roofTiles.has(i)) continue;
      roofRegion(world, i % world.width, Math.floor(i / world.width))?.tiles.forEach((j) => { roofTiles.add(j); redraw.add(j); });
    }
    for (const i of redraw) this.drawPaintedTile(ctx, world, i % world.width, Math.floor(i / world.width));
    this.ground.refresh();
    this.syncAssets();
    this.syncNpcs();
  }

  // ---- Characters (NPCs) ----
  // Each placed character is drawn from the creator's sprite, pixelated exactly like the hero so they match
  // in size and style, standing on their tile with a soft shadow. Sprites are fetched only once a character
  // is placed on this map (the originals are large).
  npcTexture(id) {
    const key = `npc-${id}`;
    if (this.textures.exists(key)) return key;
    if (!this.textures.exists(`npc-src-${id}`)) return null;
    const source=this.textures.get(`npc-src-${id}`).getSourceImage();
    this.textures.addCanvas(key,pixelateSprite(source));
    return key;
  }

  syncNpcs() {
    this.npcImages ??= new Map();
    this.npcLoading ??= new Set();
    if (!this.textures.exists('npc-shadow')) this.textures.addCanvas('npc-shadow', npcShadowCanvas());
    const placements = this.world.npcs ?? [];
    const wanted = new Map(placements.filter((p) => npcById(p.n)).map((p) => [`${p.n}@${p.x},${p.y}${p.f ? 'f' : ''}`, p]));
    for (const [key, entry] of this.npcImages) {
      if (!wanted.has(key)) { entry.image.destroy(); entry.shadow.destroy(); this.npcImages.delete(key); }
    }
    const missing = [];
    for (const [key, p] of wanted) {
      if (this.npcImages.has(key)) continue;
      const texture = this.npcTexture(p.n);
      if (!texture) { missing.push(p.n); continue; }
      const feetY = p.y * TILE + TILE - 2;
      const x = p.x * TILE + TILE / 2;
      const shadow = this.add.image(x, feetY - 1, 'npc-shadow').setDepth(feetY + 0.4);
      const image = this.add.image(x, feetY + 1, texture).setOrigin(0.5, 1).setDepth(feetY + 0.5).setFlipX(Boolean(p.f));
      this.npcImages.set(key, { image, shadow, baseY: feetY + 1, phase: (p.x * 7 + p.y * 13) % 10 });
      this.overviewCache = null; // the mini map picture should include them
    }
    // Fetch sprites not loaded yet, then draw those characters.
    const toLoad = [...new Set(missing)].filter((id) => !this.npcLoading.has(id));
    if (!toLoad.length) return;
    for (const id of toLoad) {
      this.npcLoading.add(id);
      this.load.image(`npc-src-${id}`, npcById(id).spriteUrl);
    }
    this.load.once('complete', () => {
      toLoad.forEach((id) => this.npcLoading.delete(id));
      if (this.sys.isActive()) this.syncNpcs();
    });
    this.load.start();
  }

  // A gentle idle bob: each character rises one pixel now and then, at their own rhythm.
  animateNpcs(time) {
    for (const entry of this.npcImages?.values() ?? []) {
      const up = Math.sin(time / 520 + entry.phase) > 0.35 ? 1 : 0;
      entry.image.y = entry.baseY - up;
    }
  }

  updateDecor(i) {
    const id = this.world.objects[i];
    const x = i % this.world.width;
    const y = Math.floor(i / this.world.width);
    const building = buildingById(id);
    // Buildings are drawn once, from their bottom-left tile; the rest of the footprint has no image.
    // Decoration size (small/medium/large) is fixed per tile, so trees, rocks and bushes vary across the map.
    const key = building ? `building-${id}` : `decor-${id}-${decorVariant(x, y)}`;
    const existing = this.decor.get(i);
    if (existing?.texture.key === key) return;
    existing?.destroy();
    this.decor.delete(i);
    // Build-kit pieces are drawn into the ground layer, not as separate images.
    if (id === '.' || id === PART_OF_BUILDING || isStructure(id)) return;
    const bottom = (y + 1) * TILE;
    const image = building
      ? this.add.image(x * TILE, bottom, key).setOrigin(0, 1)
      : this.add.image(x * TILE + TILE / 2, bottom, key).setOrigin(0.5, 1);
    this.decor.set(i, image.setDepth(bottom));
  }

  // A picture of the whole map in the game's own art (ground, decorations, buildings and furniture, drawn
  // back to front as in the game; no player or weather), shrunk to pxPerTile pixels per tile keeping each
  // block's most common colour so it stays crisp. Made once per scene: { canvas, pxPerTile, world }.
  overview(pxPerTile = 4) {
    if (this.overviewCache) return this.overviewCache;
    if (!this.ground) return null;
    const { world } = this;
    const full = document.createElement('canvas');
    full.width = world.width * TILE;
    full.height = world.height * TILE;
    const ctx = full.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.ground.getSourceImage(), 0, 0);
    const npcs = [...(this.npcImages?.values() ?? [])].flatMap((e) => [e.shadow, e.image]);
    const images = [...this.decor.values(), ...(this.assetImages?.values() ?? []), ...npcs].sort((a, b) => a.depth - b.depth);
    for (const image of images) {
      const { frame } = image;
      const left = Math.round(image.x - image.originX * image.displayWidth);
      const top = Math.round(image.y - image.originY * image.displayHeight);
      ctx.save();
      if (image.flipX) {
        ctx.translate(left + image.displayWidth, top);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(left, top);
      }
      ctx.drawImage(image.texture.getSourceImage(), frame.cutX, frame.cutY, frame.width, frame.height, 0, 0, image.displayWidth, image.displayHeight);
      ctx.restore();
    }
    const small = shrinkPixelArt(ctx.getImageData(0, 0, full.width, full.height), TILE / pxPerTile);
    const canvas = document.createElement('canvas');
    canvas.width = small.width;
    canvas.height = small.height;
    canvas.getContext('2d').putImageData(new ImageData(small.data, small.width, small.height), 0, 0);
    this.overviewCache = { canvas, pxPerTile, world };
    return this.overviewCache;
  }

  // Loads the player's sprite as the 'hero' texture, then calls onReady.
  loadHero(onReady) {
    if (!this.options.heroUrl) return;
    const image = new Image();
    image.onload = () => {
      if (!this.sys.isActive()) return;
      if (!this.textures.exists('hero')) {
        this.textures.addCanvas('hero',pixelateSprite(image,{height:PLAYER_SPRITE_HEIGHT-2}));
      }
      onReady();
    };
    image.src = this.options.heroUrl;
  }

  // The hero image, anchored at the bottom-centre of its feet on a whole pixel so it stays on the tile pixel grid.
  addHero(x, y) {
    const hero = this.add.image(x, y, 'hero');
    return hero.setDisplayOrigin(Math.floor(hero.width / 2), hero.height);
  }

  // With camera origin (0, 0): screen = (world - scroll) * zoom. Scroll is snapped so that is always a whole pixel.
  setView(zoom, scrollX, scrollY) {
    const cam = this.cameras.main;
    cam.setZoom(zoom);
    cam.setScroll(Math.round(scrollX * zoom) / zoom, Math.round(scrollY * zoom) / zoom);
    this.onViewChange?.(zoom);
  }

  toWorld(pointer) {
    const cam = this.cameras.main;
    return { x: (pointer.x - cam.x) / cam.zoom + cam.scrollX, y: (pointer.y - cam.y) / cam.zoom + cam.scrollY };
  }

  toTile(pointer) {
    const { x, y } = this.toWorld(pointer);
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    return tx >= 0 && ty >= 0 && tx < this.world.width && ty < this.world.height ? { x: tx, y: ty } : null;
  }
}
