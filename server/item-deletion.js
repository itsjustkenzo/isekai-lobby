import { syncInventoryPositions } from '../client/src/world/inventory.js';
export function removeItemReferences(state, itemId) {
  const positioned = syncInventoryPositions(state, state.hotbar.length);
  return syncInventoryPositions({ ...positioned, slots: positioned.slots.filter((slot) => slot.itemId !== itemId),
    hotbar: state.hotbar.map((id) => id === itemId ? null : id),
    selectedId: state.selectedId === itemId ? null : state.selectedId,
    drops: state.drops.filter((drop) => drop.itemId !== itemId), revision: state.revision + 1 }, state.hotbar.length);
}

export function assertItemsNotDeleted(items, deletedIds) {
  if (items.some((item) => deletedIds.includes(item.id))) {
    const error = new Error('This world includes a permanently deleted item. Reload before saving.');
    error.deletedItem = true;
    throw error;
  }
}
