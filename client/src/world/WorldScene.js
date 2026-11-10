import { canPaintTexture } from './world.js';
import Phaser from 'phaser';
import { TILE } from './art.js';
import { ENTRANCE_TOOL, SPAWN_TOOL, TABLETOP, TRAVEL_TOOL, npcFits, npcFromTool, tabletopFits, assetFromTool, assetPlacement, brushTiles, buildingById, buildingPlacement, canSpawnAt, entranceAt, isLocked } from './world.js';
import { MAX_ZOOM, WorldBaseScene } from './WorldBaseScene.js';

export class WorldScene extends WorldBaseScene {
  // options: { world, heroUrl, showGrid, getTool, getBrush, onPaint(x, y) => changedIndices, onStrokeEnd(),
  //   onArea(start, end) => changedIndices (the Travel point tool drags out a rectangle), onZoomChange(zoom) }
  constructor(options) {
    super('world', options);
    this.showGrid = options.showGrid;
  }

  create() {
    this.createWorld();
    this.grid = this.add.graphics().setDepth(Number.MAX_SAFE_INTEGER - 1);
    this.hover = this.add.graphics().setDepth(Number.MAX_SAFE_INTEGER);
    // The hero stands where players start: the spawn point (the middle of a building's room).
    this.loadHero(() => {
      this.previewHero = this.addHero(0, 0);
      this.placePreviewHero();
    });

    this.fitCamera();
    this.scale.on('resize', () => this.fitCamera());
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer) => this.onPointerDown(pointer));
    this.input.on('pointermove', (pointer) => this.onPointerMove(pointer));
    this.input.on('pointerup', () => this.endStroke());
    this.input.on('pointerupoutside', () => this.endStroke());
    this.input.on('gameout', () => this.hover.clear());
    this.input.on('wheel', (pointer, _over, _dx, dy) => this.zoomAt(pointer.x, pointer.y, dy > 0 ? -1 : 1));
    if (this.entrances) this.setEntranceMarkers(this.entrances);
    if (this.markers) this.setMarkers(this.markers);
  }

  placePreviewHero() {
    if (!this.previewHero) return;
    const { x, y } = this.markers?.spawn ?? { x: Math.floor(this.world.width / 2), y: Math.floor(this.world.height / 2) };
    const bottom = (y + 1) * TILE;
    this.previewHero.setPosition(x * TILE + TILE / 2, bottom - 1).setDepth(bottom + 0.5);
  }

  // Editor-only overlay: travel areas (blue, the selected one gold, ones without a destination pink)
  // and the spawn point flag. { areas: travelPoints(world), selectedKey, spawn: {x, y} or null }
  setMarkers(markers) {
    this.markers = markers;
    if (!this.ground) return; // drawn in create() once the scene is ready
    if (!this.zoneMarkers) this.zoneMarkers = this.add.graphics().setDepth(Number.MAX_SAFE_INTEGER - 3);
    const g = this.zoneMarkers.clear();
    const { width } = this.world;
    for (const area of markers.areas) {
      const color = area.key === markers.selectedKey ? 0xffdf36 : area.link.to ? 0x4fc6ea : 0xff5a7a;
      g.fillStyle(color, 0.35);
      for (const [x, y] of area.tiles) g.fillRect(x * TILE, y * TILE, TILE, TILE);
      // Outline only the area's outer edges.
      g.fillStyle(color, 1);
      const inside = (x, y) => x >= 0 && x < width && area.cells.has(y * width + x);
      for (const [x, y] of area.tiles) {
        if (!inside(x, y - 1)) g.fillRect(x * TILE, y * TILE, TILE, 1);
        if (!inside(x, y + 1)) g.fillRect(x * TILE, (y + 1) * TILE - 1, TILE, 1);
        if (!inside(x - 1, y)) g.fillRect(x * TILE, y * TILE, 1, TILE);
        if (!inside(x + 1, y)) g.fillRect((x + 1) * TILE - 1, y * TILE, 1, TILE);
      }
      // A small compass rose in the middle tile.
      const cx = area.x * TILE + 8;
      const cy = area.y * TILE + 8;
      g.fillStyle(0x292338, 1).fillRect(cx - 1, cy - 5, 3, 11).fillRect(cx - 5, cy - 1, 11, 3);
      g.fillStyle(0xffffff, 1).fillRect(cx, cy - 4, 1, 9).fillRect(cx - 4, cy, 9, 1);
    }
    g.fillStyle(0xb59aff, 0.4);
    g.lineStyle(1, 0xe3d6ff, 1);
    for (const i of this.world.restCells ?? []) {
      const x = (i % width) * TILE;
      const y = Math.floor(i / width) * TILE;
      g.fillRect(x, y, TILE, TILE).strokeRect(x, y, TILE, TILE);
    }
    g.fillStyle(0x90d652, 0.4).lineStyle(1, 0xd5fa88, 1);
    for (const i of this.world.farmCells ?? []) {
      const x = (i % width) * TILE, y = Math.floor(i / width) * TILE;
      g.fillRect(x, y, TILE, TILE).strokeRect(x, y, TILE, TILE);
    }
    if (markers.spawn) {
      // A little red flag at the spawn tile's left side, behind the hero.
      const px = markers.spawn.x * TILE + 2;
      const py = markers.spawn.y * TILE;
      g.fillStyle(0x292338, 1).fillRect(px, py - 2, 2, TILE + 1).fillRect(px + 2, py - 2, 8, 6);
      g.fillStyle(0xff5a7a, 1).fillRect(px + 2, py - 1, 7, 4);
      g.fillStyle(0xffffff, 1).fillRect(px + 3, py, 2, 1);
    }
    this.placePreviewHero();
  }

  onViewChange(zoom) {
    this.drawGrid();
    this.options.onZoomChange?.(zoom);
  }

  setShowGrid(show) {
    this.showGrid = show;
    if (this.grid) this.drawGrid();
  }

  drawGrid() {
    if (!this.grid) return;
    this.grid.clear();
    if (!this.showGrid) return;
    const { width, height } = this.world;
    this.grid.lineStyle(1 / this.cameras.main.zoom, 0x1f3324, 0.35);
    for (let x = 0; x <= width; x++) this.grid.lineBetween(x * TILE, 0, x * TILE, height * TILE);
    for (let y = 0; y <= height; y++) this.grid.lineBetween(0, y * TILE, width * TILE, y * TILE);
  }

  fitCamera() {
    const cam = this.cameras.main;
    const mapWidth = this.world.width * TILE;
    const mapHeight = this.world.height * TILE;
    const zoom = Phaser.Math.Clamp(Math.floor(Math.min(cam.width / mapWidth, cam.height / mapHeight)), 1, MAX_ZOOM);
    this.setView(zoom, mapWidth / 2 - cam.width / zoom / 2, mapHeight / 2 - cam.height / zoom / 2);
  }

  zoomBy(step) {
    const cam = this.cameras.main;
    this.zoomAt(cam.width / 2, cam.height / 2, step);
  }

  zoomAt(screenX, screenY, step) {
    const cam = this.cameras.main;
    const zoom = Phaser.Math.Clamp(cam.zoom + step, 1, MAX_ZOOM);
    if (zoom === cam.zoom) return;
    // Keep the point under the cursor fixed while zooming.
    this.setView(zoom, cam.scrollX + screenX / cam.zoom - screenX / zoom, cam.scrollY + screenY / cam.zoom - screenY / zoom);
    if (this.lastPointer) this.drawHover(this.lastPointer);
  }

  onPointerDown(pointer) {
    if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
      const cam = this.cameras.main;
      this.panning = { x: pointer.x, y: pointer.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
      return;
    }
    // The Travel point tool drags out a rectangle of tiles instead of painting.
    if ([TRAVEL_TOOL, 'rest-area', 'rest-remove', 'farm-area', 'farm-remove'].includes(this.options.getTool())) {
      const tile = this.toTile(pointer);
      if (tile) this.area = { start: tile, end: tile };
      this.drawHover(pointer);
      return;
    }
    this.painting = true;
    this.lastTile = null;
    this.paint(pointer);
  }

  onPointerMove(pointer) {
    this.lastPointer = pointer;
    if (this.panning) {
      const cam = this.cameras.main;
      this.setView(cam.zoom, this.panning.scrollX - (pointer.x - this.panning.x) / cam.zoom, this.panning.scrollY - (pointer.y - this.panning.y) / cam.zoom);
      return;
    }
    if (this.area && pointer.isDown) {
      const tile = this.toTile(pointer);
      if (tile) this.area.end = tile;
    }
    this.drawHover(pointer);
    if (this.painting && pointer.isDown) this.paint(pointer);
  }

  paint(pointer) {
    const tile = this.toTile(pointer);
    if (!tile || (this.lastTile && tile.x === this.lastTile.x && tile.y === this.lastTile.y)) return;
    this.lastTile = tile;
    const changed = this.options.onPaint(tile.x, tile.y);
    if (changed.length) this.updateTiles(changed);
  }

  endStroke() {
    this.panning = null;
    if (this.area) {
      const { start, end } = this.area;
      this.area = null;
      const changed = this.options.onArea(start, end);
      if (changed.length) this.updateTiles(changed);
      if (this.lastPointer) this.drawHover(this.lastPointer);
    }
    if (!this.painting) return;
    this.painting = false;
    this.options.onStrokeEnd();
  }

  // Small gold door markers on enterable buildings (editor only), at each entrance tile's top edge.
  setEntranceMarkers(entrances) {
    this.entrances = entrances;
    if (!this.ground) return; // drawn in create() once the scene is ready
    if (!this.entranceMarkers) this.entranceMarkers = this.add.graphics().setDepth(Number.MAX_SAFE_INTEGER - 2);
    const g = this.entranceMarkers.clear();
    for (const { x, y } of entrances) {
      const cx = x * TILE + TILE / 2;
      const top = y * TILE + 2;
      g.fillStyle(0x2a2230, 1).fillRect(cx - 4, top - 1, 8, 9);
      g.fillStyle(0xf2c14e, 1).fillRect(cx - 3, top, 6, 7);
      g.fillStyle(0x8a5a32, 1).fillRect(cx - 2, top + 1, 4, 6);
      g.fillStyle(0xf2c14e, 1).fillRect(cx + 1, top + 4, 1, 1);
    }
  }

  // Redraws the hover outline, e.g. after the placement direction changes without the mouse moving.
  refreshHover() {
    if (this.lastPointer) this.drawHover(this.lastPointer);
  }

  drawHover(pointer) {
    this.hover.clear();
    const tile = this.toTile(pointer);
    if (!tile) return;
    const lineWidth = 2 / this.cameras.main.zoom;
    const tool = this.options.getTool();
    // Dragging out a travel area: the whole rectangle, with tiles that can't be used in red.
    if (this.area) {
      const { start, end } = this.area;
      for (let y = Math.min(start.y, end.y); y <= Math.max(start.y, end.y); y++) {
        for (let x = Math.min(start.x, end.x); x <= Math.max(start.x, end.x); x++) {
          const locked = !['rest-area', 'rest-remove', 'farm-area', 'farm-remove'].includes(tool) && isLocked(this.world, x, y);
          this.hover.fillStyle(locked ? 0xff5a7a : 0x4fc6ea, 0.3).fillRect(x * TILE, y * TILE, TILE, TILE);
          this.hover.lineStyle(lineWidth / 2, locked ? 0xff5a7a : 0xffffff, 0.7).strokeRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
      return;
    }
    const building = buildingById(tool);
    // A building's whole footprint turns red if it can't be placed there.
    const asset = assetFromTool(tool);
    const buildingBlocked = (building && !buildingPlacement(this.world, building, tile.x, tile.y).valid)
      || (asset && !assetPlacement(this.world, asset, tile.x, tile.y).valid)
      || (tool === ENTRANCE_TOOL && !entranceAt(this.world, tile.x, tile.y))
      || (tool === SPAWN_TOOL && !canSpawnAt(this.world, tile.x, tile.y))
      || (tool === TABLETOP && !tabletopFits(this.world, tile.x, tile.y))
      || (npcFromTool(tool) && !npcFits(this.world, tile.x, tile.y));
    for (const [x, y] of brushTiles(this.world, tool, tile.x, tile.y, this.options.getBrush())) {
      // Assets can lean on an interior's back wall, so their outline only turns red if they don't fit.
      const locked = tool.startsWith('texture:') ? !canPaintTexture(this.world, tool.split(':')[1], x, y) : buildingBlocked || (!asset && isLocked(this.world, x, y));
      this.hover.lineStyle(lineWidth, locked ? 0xff5a7a : 0xffffff, locked ? 0.6 : 0.9);
      this.hover.strokeRect(x * TILE, y * TILE, TILE, TILE);
    }
  }
}
