import {validOriginalArtwork} from './original-artwork.js';
import { PNG } from 'pngjs';
import { inventorySettings, itemCatalog, starterInventory } from '../client/src/world/inventory.js';
export function readInventoryConfig(raw, equipment) {
  if (raw === undefined) return inventorySettings(null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid inventory settings.');
  const config = inventorySettings({ inventory: raw });
  for (const key of ['enabled', 'allowDrop', 'allowDiscard']) if (typeof config[key] !== 'boolean') throw new Error('Invalid inventory toggle.');
  for (const [key, max] of [['capacity',100],['stackLimit',999],['hotbarSize',10]]) if (!Number.isInteger(config[key]) || config[key] < 1 || config[key] > max) throw new Error(`Invalid ${key}.`);
  if (!Array.isArray(config.items) || config.items.length > 100 || !Array.isArray(config.startingItems) || config.startingItems.length > 200) throw new Error('Too many item definitions or starting items.');
  const ids = new Set();
  config.items = config.items.map((item) => {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60 || !['seed','material','usable'].includes(item.category) || typeof item.description !== 'string' || item.description.length > 400 || !Number.isInteger(item.stackLimit) || item.stackLimit < 1 || item.stackLimit > 999) throw new Error('Invalid item definition.');
    ids.add(item.id);
    if (!item.image) throw new Error(`Asset image required for ${item.name}.`);
    if (item.image) {
      if (typeof item.image !== 'string' || item.image.length > 24000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(item.image)) throw new Error('Invalid item artwork.');
      const bytes = Buffer.from(item.image.split(',')[1], 'base64');
      if (bytes.length < 24 || bytes.readUInt32BE(16) > 64 || bytes.readUInt32BE(20) > 64) throw new Error('Item artwork is too large.');
      PNG.sync.read(bytes);
    }
    if(item.originalArtwork&&!validOriginalArtwork(item.originalArtwork,16,16))throw new Error('Invalid original item artwork.');
    return { id: item.id, name: item.name.trim(), category: item.category, description: item.description, stackLimit: item.stackLimit, ...(item.image ? { image: item.image } : {}),...(item.originalArtwork?{originalArtwork:item.originalArtwork}:{}) };
  });
  const world = { equipment, inventory: config }, catalog = itemCatalog(world);
  config.startingItems = config.startingItems.map((entry) => {
    if (!entry || !catalog.some((item) => item.id === entry.itemId) || !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 9999) throw new Error('Invalid starting item.');
    return { itemId: entry.itemId, quantity: entry.quantity };
  });
  starterInventory(world);
  return { enabled: config.enabled, capacity: config.capacity, stackLimit: config.stackLimit, hotbarSize: config.hotbarSize, allowDrop: config.allowDrop, allowDiscard: config.allowDiscard, items: config.items, startingItems: config.startingItems };
}
