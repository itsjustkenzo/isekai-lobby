import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MAIN_MAP, MAX_REGIONS, activeEntrances, createRegion, deleteRegion, listMaps, listRegions, mapById, setMapRegion, travelPoints } from './world.js';
import { timeOf } from './daycycle.js';
import { weatherOf } from './weather.js';

// "🔄 Day cycle · 🎲 Random weather" for a region's box label.
function climateSummary(root, region) {
  const time = timeOf({ time: region.time }, root);
  const weather = weatherOf({ weather: region.weather }, root);
  const timeText = time.mode === 'off' ? '⛔ No time' : time.mode === 'fixed' ? `📌 Always ${time.phase}` : '🔄 Day cycle';
  const weatherText = weather.mode === 'off' ? '☀ Clear' : weather.mode === 'fixed' ? (weather.kind === 'rain' ? '🌧 Rainy' : '🌫 Misty') : '🎲 Random weather';
  return `${timeText}${time.night === 'dark' && time.mode !== 'off' ? ' · 🌑 Dark nights' : ''} · ${weatherText}`;
}

// "Outdoor · 100×80" under a map's name.
function mapSubtitle(root, mapId) {
  const map = mapById(root, mapId);
  const kind = mapId === MAIN_MAP ? 'Main world · start' : map?.indoorMap ? 'Indoor' : 'Outdoor';
  return `${kind} · ${map?.width}×${map?.height}`;
}

// A workflow-style diagram of the world: maps and building interiors as boxes, travel points as labelled
// arrows between them, and dashed door lines from each map to its enterable buildings.

const MAP_NODE = { width: 190, height: 64 };
const ROOM_NODE = { width: 170, height: 44 };
const COLUMN_GAP = 140;
const ROW_GAP = 60;
const ROOM_GAP = 14;
const POSITIONS_KEY = 'isekai.mapFlow.positions';

function readPositions() {
  try { return JSON.parse(localStorage.getItem(POSITIONS_KEY) ?? '{}'); } catch { return {}; }
}

function writePositions(positions) {
  try { localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions)); } catch { /* storage unavailable */ }
}

const mapNodeId = (mapId) => `map:${mapId}`;
const roomNodeId = (mapId, key) => `room:${mapId}:${key}`;

// Nodes and edges from the world data.
function buildGraph(root) {
  const nodes = [];
  const edges = [];
  for (const map of listMaps(root)) {
    const rooms = activeEntrances(map.world);
    const unset = travelPoints(map.world).filter((p) => !p.link.to).length;
    nodes.push({ id: mapNodeId(map.id), kind: 'map', mapId: map.id, name: map.name, unset, ...MAP_NODE });
    for (const point of travelPoints(map.world)) {
      if (point.link.to) edges.push({ from: mapNodeId(map.id), to: mapNodeId(point.link.to), label: point.link.name, kind: 'travel' });
    }
    for (const room of rooms) {
      const id = roomNodeId(map.id, room.key);
      const roomPads = travelPoints(room.interior);
      nodes.push({ id, kind: 'room', mapId: map.id, key: room.key, name: room.interior.name, parent: mapNodeId(map.id), unset: roomPads.filter((p) => !p.link.to).length, ...ROOM_NODE });
      edges.push({ from: mapNodeId(map.id), to: id, label: '🚪', kind: 'door' });
      for (const point of roomPads) {
        if (point.link.to) edges.push({ from: id, to: mapNodeId(point.link.to), label: point.link.name, kind: 'travel' });
      }
    }
  }
  // Drop edges to maps that no longer exist.
  const ids = new Set(nodes.map((n) => n.id));
  return { nodes, edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
}

// Columns by travel distance from the Main world; each map's rooms stacked beneath it.
function autoLayout({ nodes, edges }) {
  const maps = nodes.filter((n) => n.kind === 'map');
  const depth = new Map([[mapNodeId(MAIN_MAP), 0]]);
  const queue = [mapNodeId(MAIN_MAP)];
  const mapOf = (id) => nodes.find((n) => n.id === id)?.parent ?? id;
  while (queue.length) {
    const id = queue.shift();
    for (const edge of edges) {
      if (edge.kind !== 'travel' || mapOf(edge.from) !== id) continue;
      if (!depth.has(edge.to)) { depth.set(edge.to, depth.get(id) + 1); queue.push(edge.to); }
    }
  }
  const maxDepth = Math.max(0, ...depth.values());
  for (const map of maps) if (!depth.has(map.id)) depth.set(map.id, maxDepth + 1); // unconnected maps last
  const columns = new Map();
  for (const map of maps) {
    const col = depth.get(map.id);
    columns.set(col, [...(columns.get(col) ?? []), map]);
  }
  const positions = {};
  for (const [col, column] of columns) {
    let y = 0;
    for (const map of column) {
      const x = col * (MAP_NODE.width + COLUMN_GAP);
      positions[map.id] = { x, y };
      let ry = y + MAP_NODE.height + ROOM_GAP * 2;
      for (const room of nodes.filter((n) => n.parent === map.id)) {
        positions[room.id] = { x: x + (MAP_NODE.width - ROOM_NODE.width) / 2 + 24, y: ry };
        ry += ROOM_NODE.height + ROOM_GAP;
      }
      y = ry + ROW_GAP;
    }
  }
  return positions;
}

// Where a line from a's centre toward b leaves a's box.
function edgePoint(node, pos, toward) {
  const cx = pos.x + node.width / 2;
  const cy = pos.y + node.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const scale = 1 / Math.max(Math.abs(dx) / (node.width / 2), Math.abs(dy) / (node.height / 2));
  return { x: cx + dx * scale, y: cy + dy * scale };
}

// embedded: shown inside the editor's Map flow tab (no backdrop or close button) instead of as a pop-up.
// onRegionsChange(): called after regions are created, renamed, filled or deleted (the world changed).
export default function MapFlow({ root, version, currentMap, currentRoom, onOpen, onClose, onRegionsChange, embedded = false }) {
  const graph = useMemo(() => buildGraph(root), [root, version]);
  const [positions, setPositions] = useState(() => ({ ...autoLayout(graph), ...readPositions() }));
  const [view, setView] = useState({ x: 40, y: 40, scale: 1 });

  // Zooms and centres so every box is visible.
  function fitView(pos = positions) {
    const box = svgRef.current?.getBoundingClientRect();
    const placed = graph.nodes.filter((n) => pos[n.id]);
    if (!box?.width || !placed.length) return;
    const left = Math.min(...placed.map((n) => pos[n.id].x)) - 40;
    const top = Math.min(...placed.map((n) => pos[n.id].y)) - 40;
    const right = Math.max(...placed.map((n) => pos[n.id].x + n.width)) + 90;
    const bottom = Math.max(...placed.map((n) => pos[n.id].y + n.height)) + 40;
    const scale = Math.min(1.4, Math.max(0.4, Math.min(box.width / (right - left), box.height / (bottom - top))));
    setView({ scale, x: (box.width - (right - left) * scale) / 2 - left * scale, y: (box.height - (bottom - top) * scale) / 2 - top * scale });
  }
  const drag = useRef(null);
  const justDragged = useRef(false); // a drag ends with a click event; this stops it opening the map
  const svgRef = useRef(null);

  // New nodes get an automatic spot; existing ones keep where they were dragged.
  useEffect(() => {
    setPositions((current) => {
      const auto = autoLayout(graph);
      const next = { ...current };
      for (const node of graph.nodes) if (!next[node.id]) next[node.id] = auto[node.id];
      return next;
    });
  }, [graph]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fitView(); }, []);

  useEffect(() => {
    if (embedded) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, embedded]);

  const toCanvas = (event) => {
    const box = svgRef.current.getBoundingClientRect();
    return { x: (event.clientX - box.left - view.x) / view.scale, y: (event.clientY - box.top - view.y) / view.scale };
  };

  function startNodeDrag(event, node) {
    event.stopPropagation();
    const point = toCanvas(event);
    drag.current = { node: node.id, dx: point.x - positions[node.id].x, dy: point.y - positions[node.id].y, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function startPan(event) {
    drag.current = { pan: true, startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y };
  }

  function onPointerMove(event) {
    const d = drag.current;
    if (!d) return;
    if (d.pan) {
      setView((v) => ({ ...v, x: d.viewX + event.clientX - d.startX, y: d.viewY + event.clientY - d.startY }));
      return;
    }
    const point = toCanvas(event);
    d.moved = true;
    setPositions((p) => ({ ...p, [d.node]: { x: Math.round(point.x - d.dx), y: Math.round(point.y - d.dy) } }));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    justDragged.current = Boolean(d?.node && d.moved);
    if (d?.node && d.moved) setPositions((p) => { writePositions(p); return p; });
  }

  function onWheel(event) {
    const box = svgRef.current.getBoundingClientRect();
    const mx = event.clientX - box.left;
    const my = event.clientY - box.top;
    setView((v) => {
      const scale = Math.min(2, Math.max(0.4, v.scale * (event.deltaY > 0 ? 0.9 : 1.1)));
      return { scale, x: mx - ((mx - v.x) / v.scale) * scale, y: my - ((my - v.y) / v.scale) * scale };
    });
  }

  function open(node) {
    if (justDragged.current) { justDragged.current = false; return; }
    onOpen(node.mapId, node.kind === 'room' ? node.key : null);
  }

  function resetLayout() {
    const auto = autoLayout(graph);
    setPositions(auto);
    writePositions({});
    fitView(auto);
  }

  // Bend parallel arrows between the same two boxes apart so their labels don't overlap.
  const pairCount = new Map();
  const edgeShapes = graph.edges.map((edge, i) => {
    const a = graph.nodes.find((n) => n.id === edge.from);
    const b = graph.nodes.find((n) => n.id === edge.to);
    const pa = positions[a.id];
    const pb = positions[b.id];
    if (!pa || !pb) return null;
    if (a.id === b.id) {
      // A pad leading to its own map: a small loop on the box's right side.
      const x = pa.x + a.width;
      const y = pa.y + a.height / 2;
      return { edge, i, d: `M ${x} ${y - 10} C ${x + 50} ${y - 40}, ${x + 50} ${y + 40}, ${x} ${y + 10}`, label: { x: x + 44, y } };
    }
    const pairKey = [a.id, b.id].sort().join('|');
    const n = pairCount.get(pairKey) ?? 0;
    pairCount.set(pairKey, n + 1);
    const ca = { x: pa.x + a.width / 2, y: pa.y + a.height / 2 };
    const cb = { x: pb.x + b.width / 2, y: pb.y + b.height / 2 };
    const start = edgePoint(a, pa, cb);
    const end = edgePoint(b, pb, ca);
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    // Offset arrows sideways, measured from one fixed direction per pair of boxes, so arrows between the same
    // two boxes (including the two halves of a two-way path) curve to alternate sides instead of overlapping.
    const [first, second] = a.id < b.id ? [start, end] : [end, start];
    const len = Math.hypot(second.x - first.x, second.y - first.y) || 1;
    const side = edge.kind === 'door' ? 0 : (n % 2 ? -1 : 1) * (30 + Math.floor(n / 2) * 28);
    const cx = mx - ((second.y - first.y) / len) * side;
    const cy = my + ((second.x - first.x) / len) * side;
    return { edge, i, d: `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`, label: { x: (start.x + 2 * cx + end.x) / 4, y: (start.y + 2 * cy + end.y) / 4 } };
  }).filter(Boolean);

  const travelCount = graph.edges.filter((e) => e.kind === 'travel').length;

  // Regions: a tinted box around each region's maps (and their buildings), drawn behind everything.
  const regions = listRegions(root);
  const regionColor = Object.fromEntries(regions.map((r) => [r.id, r.color]));
  const regionBoxes = regions.map((r) => {
    const memberIds = new Set(r.maps.map((m) => mapNodeId(m.id)));
    const members = graph.nodes.filter((n) => (memberIds.has(n.id) || memberIds.has(n.parent)) && positions[n.id]);
    if (!members.length) return null;
    const left = Math.min(...members.map((n) => positions[n.id].x)) - 18;
    const top = Math.min(...members.map((n) => positions[n.id].y)) - 40;
    const right = Math.max(...members.map((n) => positions[n.id].x + n.width)) + 18;
    const bottom = Math.max(...members.map((n) => positions[n.id].y + n.height)) + 18;
    return { ...r, left, top, width: right - left, height: bottom - top };
  }).filter(Boolean);

  function changeRegions(change) {
    change();
    onRegionsChange?.();
  }

  const panel = (
      <div className={`flow-panel${embedded ? ' embedded' : ''}`} role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : 'true'} aria-labelledby="flow-title">
        <div className="flow-head">
          <div>
            <h2 id="flow-title">Map flow</h2>
            <p className="hint">{graph.nodes.filter((n) => n.kind === 'map').length} maps · {graph.nodes.filter((n) => n.kind === 'room').length} interiors · {travelCount} travel {travelCount === 1 ? 'path' : 'paths'} · Click a box to edit it · Drag boxes to arrange · Scroll to zoom</p>
          </div>
          <div className="flow-actions">
            <button type="button" className="text-button" onClick={resetLayout}>Auto-arrange</button>
            {!embedded && <button type="button" className="text-button" onClick={onClose} aria-label="Close">✕</button>}
          </div>
        </div>
        <div className="flow-body">
        <svg ref={svgRef} className="flow-canvas" onPointerDown={startPan} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onWheel={onWheel}>
          <defs>
            <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#292338" />
            </marker>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {regionBoxes.map((box) => (
              <g key={box.id} className="flow-region" transform={`translate(${box.left} ${box.top})`}>
                <rect width={box.width} height={box.height} rx="16" fill={box.color} fillOpacity="0.14" stroke={box.color} />
                <text x="14" y="18" className="flow-region-name">{box.region.name}</text>
                <text x="14" y="32" className="flow-region-sub">{climateSummary(root, box.region)}</text>
              </g>
            ))}
            {edgeShapes.map(({ edge, i, d }) => (
              <path key={`e${i}`} d={d} className={`flow-edge ${edge.kind}`} markerEnd={edge.kind === 'travel' ? 'url(#flow-arrow)' : undefined} />
            ))}
            {edgeShapes.map(({ edge, i, label }) => edge.kind === 'travel' && (
              <g key={`l${i}`} transform={`translate(${label.x} ${label.y})`} className="flow-label">
                <rect x={-Math.min(140, edge.label.length * 6.4 + 22) / 2} y="-11" width={Math.min(140, edge.label.length * 6.4 + 22)} height="22" rx="11" />
                <text textAnchor="middle" dy="4">🧭 {edge.label.length > 18 ? `${edge.label.slice(0, 17)}…` : edge.label}</text>
                <title>{edge.label}</title>
              </g>
            ))}
            {graph.nodes.map((node) => {
              const pos = positions[node.id];
              if (!pos) return null;
              const current = node.kind === 'map' ? node.mapId === currentMap && !currentRoom : node.mapId === currentMap && node.key === currentRoom;
              const icon = node.kind === 'room' ? '🏠' : node.mapId === MAIN_MAP ? '🌍' : mapById(root, node.mapId)?.indoorMap ? '🏛' : '🗺';
              return (
                <g key={node.id} transform={`translate(${pos.x} ${pos.y})`} className={`flow-node ${node.kind}${current ? ' current' : ''}`}
                  onPointerDown={(e) => startNodeDrag(e, node)} onClick={() => open(node)} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpen(node.mapId, node.kind === 'room' ? node.key : null); }}>
                  <rect width={node.width} height={node.height} rx="10" />
                  {node.kind === 'map' && regionColor[mapById(root, node.mapId)?.region] && (
                    <rect className="flow-region-stripe" x="1" y="10" width="5" height={node.height - 20} rx="2" style={{ fill: regionColor[mapById(root, node.mapId).region], stroke: 'none' }} />
                  )}
                  <text x="12" y={node.kind === 'map' ? 26 : 27} className="flow-node-name">{icon} {node.name.length > 18 ? `${node.name.slice(0, 17)}…` : node.name}</text>
                  {node.kind === 'map' && <text x="12" y="47" className="flow-node-sub">{mapSubtitle(root, node.mapId)}</text>}
                  {node.unset > 0 && (
                    <g transform={`translate(${node.width - 10} -8)`} className="flow-warning">
                      <circle r="11" />
                      <text textAnchor="middle" dy="4">!</text>
                      <title>{`${node.unset} travel ${node.unset === 1 ? 'pad has' : 'pads have'} no destination`}</title>
                    </g>
                  )}
                  <title>{`${node.name}${current ? ' (editing now)' : ''} — click to edit`}</title>
                </g>
              );
            })}
          </g>
        </svg>
        <aside className="flow-regions" aria-label="Regions">
          <h3>Regions</h3>
          <p className="hint">Maps in a region share time of day and weather: when it rains on one, it rains on all of them. Maps outside keep their own.</p>
          {regions.map((r) => (
            <div key={r.id} className="region-card" style={{ '--region': r.color }}>
              <div className="region-card-head">
                <span className="region-swatch" aria-hidden="true" />
                <input value={r.region.name} maxLength={40} aria-label="Region name" onChange={(e) => changeRegions(() => { r.region.name = e.target.value; })} />
                <button type="button" className="region-delete" aria-label={`Delete ${r.region.name}`} title="Delete region (its maps keep their current time and weather)"
                  onClick={() => changeRegions(() => deleteRegion(root, r.id))}>✕</button>
              </div>
              <small>{climateSummary(root, r.region)}</small>
              <ul>
                {listMaps(root).map((m) => {
                  const other = m.world.region && m.world.region !== r.id ? regions.find((x) => x.id === m.world.region) : null;
                  return (
                    <li key={m.id}>
                      <label>
                        <input type="checkbox" checked={m.world.region === r.id} onChange={(e) => changeRegions(() => setMapRegion(root, m.id, e.target.checked ? r.id : null))} />
                        {m.name}{other && <em> (in {other.region.name})</em>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {regions.length < MAX_REGIONS && (
            <button type="button" className="design-button" onClick={() => changeRegions(() => createRegion(root))}>＋ New region</button>
          )}
          {regions.length > 0 && <p className="hint">Set a region's time of day and weather from any of its maps in the 🗺 Maps tab.</p>}
        </aside>
        </div>
        <div className="flow-legend">
          <span><i className="legend-line travel" /> Travel point (arrow points where it leads)</span>
          <span><i className="legend-line door" /> Enterable building</span>
          <span><i className="legend-dot" /> Pad with no destination</span>
          <span><i className="legend-region" /> Region (shared time & weather)</span>
        </div>
      </div>
  );
  return embedded ? panel : <div className="modal-backdrop" role="presentation">{panel}</div>;
}
