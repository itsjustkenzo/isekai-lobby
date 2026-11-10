export const DEFAULT_INVENTORY = { enabled: false, capacity: 20, stackLimit: 99, hotbarSize: 5, allowDrop: false, allowDiscard: false, items: [], startingItems: [] };
export function inventorySettings(world) { return { ...DEFAULT_INVENTORY, ...world?.inventory }; }
export function itemCatalog(world) {
  const config = inventorySettings(world);
  return [...config.items.map((item) => ({ ...item, stackLimit: item.stackLimit ?? config.stackLimit })),
    ...(world?.equipment ?? []).map((item) => ({ ...item, id: `equipment:${item.id}`, equipmentId: item.id, category: 'equipment', stackLimit: 1 }))];
}
// Stable positions keep empty cells in place when a stack is removed or moved.
export function syncInventoryPositions(state, hotbarSize) {
  const next = structuredClone(state), used = new Set();
  next.slots = next.slots.map((slot) => {
    if (Number.isInteger(slot.position) && slot.position >= 0 && !used.has(slot.position)) { used.add(slot.position); return slot; }
    return { ...slot, position: null };
  });
  for (const slot of next.slots) if (slot.position === null) {
    let position = 0; while (used.has(position)) position++;
    slot.position = position; used.add(position);
  }
  next.hotbar = Array.from({ length: hotbarSize }, (_, position) => next.slots.find((slot) => slot.position === position)?.itemId ?? null);
  return next;
}
export function addItems(state, item, quantity, capacity) {
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  const next = syncInventoryPositions(state, state.hotbar?.length ?? 5);
  let remaining = quantity;
  for (const slot of next.slots) {
    if (slot.itemId !== item.id) continue;
    const moved = Math.min(remaining, Math.max(0, item.stackLimit - slot.quantity));
    slot.quantity += moved; remaining -= moved;
  }
  while (remaining > 0) {
    if (next.slots.length >= capacity) return null;
    let n = 1; while (next.slots.some((slot) => slot.key === `slot-${n}`)) n++;
    const moved = Math.min(remaining, item.stackLimit);
    let position = 0; while (next.slots.some((slot) => slot.position === position)) position++;
    if (position >= capacity) return null;
    next.slots.push({ position, key: `slot-${n}`, itemId: item.id, quantity: moved }); remaining -= moved;
  }
  return syncInventoryPositions(next, state.hotbar?.length ?? 5);
}
export function starterInventory(world) {
  const config = inventorySettings(world), catalog = itemCatalog(world);
  let state = { slots: [], hotbar: Array(config.hotbarSize).fill(null), selectedId: null, drops: [], revision: 0 };
  for (const starter of config.startingItems) {
    const item = catalog.find((entry) => entry.id === starter.itemId);
    if (!item) throw new Error('A starting item no longer exists.');
    const next = addItems(state, item, starter.quantity, config.capacity);
    if (!next) throw new Error('Starting items do not fit in the bag.');
    state = next;
  }
  return syncInventoryPositions(state, config.hotbarSize);
}
export function nearbyDrop(drop, location) {
  return drop.location.map === location?.map && drop.location.inside === location?.inside
    && Math.abs(drop.location.x - location.x) + Math.abs(drop.location.y - location.y) <= 1;
}
export function inventoryAction(state, action, world) {
  const config = inventorySettings(world), catalog = itemCatalog(world);
  if (!config.enabled) throw new Error('Inventory is disabled.');
  let next = syncInventoryPositions(state, config.hotbarSize);
  const owns = (id) => next.slots.some((slot) => slot.itemId === id && slot.quantity > 0);
  if (action.type === 'select') {
    if (action.itemId !== null && (!owns(action.itemId) || !catalog.some((item) => item.id === action.itemId))) throw new Error('You do not have that item.');
    next.selectedId = action.itemId;
  } else if (action.type === 'move') {
    const source = next.slots.find((slot) => slot.key === action.slotKey);
    if (!source || !Number.isInteger(action.toIndex) || action.toIndex < 0 || action.toIndex >= config.capacity) throw new Error('Invalid inventory move.');
    const target = next.slots.find((slot) => slot.position === action.toIndex);
    if (target && target !== source) target.position = source.position;
    source.position = action.toIndex;
  } else if (action.type === 'sort') {
    const totals = new Map();
    for (const slot of next.slots) totals.set(slot.itemId, (totals.get(slot.itemId) ?? 0) + slot.quantity);
    const entries = [...totals].sort(([a], [b]) => (catalog.find((item) => item.id === a)?.name ?? a).localeCompare(catalog.find((item) => item.id === b)?.name ?? b));
    let compact = { ...next, slots: [] };
    for (const [id, quantity] of entries) {
      const item = catalog.find((entry) => entry.id === id);
      if (!item) throw new Error('An item definition is missing.');
      compact = addItems(compact, item, quantity, Math.max(config.capacity, state.slots.length));
      if (!compact) throw new Error('Cannot sort until the bag has more space.');
    }
    next = compact;
  } else if (action.type === 'drop' || action.type === 'discard') {
    if (!(action.type === 'drop' ? config.allowDrop : config.allowDiscard)) throw new Error('This action is disabled by the creator.');
    const slot = next.slots.find((entry) => entry.key === action.slotKey);
    if (!slot || !Number.isInteger(action.quantity) || action.quantity < 1 || action.quantity > slot.quantity) throw new Error('Invalid quantity.');
    if (action.type === 'drop') {
      if (!validDropLocation(action.location) || next.drops.length >= 100) throw new Error('Cannot drop here, or too many items are on the ground.');
      next.drops.push({ id: action.dropId, itemId: slot.itemId, quantity: action.quantity, location: { map: action.location.map, inside: action.location.inside, x: action.location.x, y: action.location.y } });
    }
    slot.quantity -= action.quantity;
    next.slots = next.slots.filter((entry) => entry.quantity > 0);
  } else if (action.type === 'pickup') {
    const drop = next.drops.find((entry) => entry.id === action.dropId);
    if (!drop || !validDropLocation(action.location) || !nearbyDrop(drop, action.location)) throw new Error('Stand beside the dropped item to collect it.');
    const item = catalog.find((entry) => entry.id === drop.itemId);
    if (!item) throw new Error('This item definition is missing.');
    const added = addItems(next, item, drop.quantity, config.capacity);
    if (!added) throw new Error('Bag full. The item stays on the ground.');
    next = added; next.drops = next.drops.filter((entry) => entry.id !== drop.id);
  } else throw new Error('Unknown inventory action.');
  if (next.selectedId && !next.slots.some((slot) => slot.itemId === next.selectedId)) next.selectedId = null;
  next = syncInventoryPositions(next, config.hotbarSize);
  next.revision = state.revision + 1;
  return next;
}
export function validDropLocation(location) {
  return location && typeof location.map === 'string' && /^(main|m[0-9]{1,3})$/.test(location.map) && (location.inside === null || (typeof location.inside === 'string' && /^[0-9]{1,3},[0-9]{1,3}$/.test(location.inside)))
    && Number.isInteger(location.x) && Number.isInteger(location.y) && location.x >= 0 && location.y >= 0 && location.x < 128 && location.y < 129;
}
