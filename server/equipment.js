import {preserveArtwork,validOriginalArtwork} from './original-artwork.js';
import { PNG } from 'pngjs';
import { requestImage } from './sprite.js';
import { toAssetSprite } from './assets.js';
import { EQUIPMENT_TYPES } from '../client/src/world/equipment.js';

export async function generateEquipment(name, description, kind, reference) {
  const label = EQUIPMENT_TYPES.find((t) => t.id === kind)?.label;
  if (!label) throw new Error('Invalid equipment type');
  const prompt = `Draw one handheld ${label} for a cozy top-down pixel-art RPG. Name: ${name}. Design: ${description}. This is an EQUIPMENT ITEM, not furniture or scenery. One isolated object with transparent background, no character, no hands, no text, no shadow, no display stand. Crisp chunky pixels, restrained colours, readable at 16x32 art pixels. Upright with handle at bottom and working end at top, suitable for a character holding and swinging it. ${reference ? 'Adapt the attached reference design, preserving its materials, colours and identity.' : ''}`;
  const original=await requestImage(prompt, reference ? [reference] : []);
  const sprite=toAssetSprite(original,{width:1,height:1});sprite.originalArtwork=preserveArtwork(original,16,32);return sprite;
}

export function validEquipmentLibrary(list) {
  if (!Array.isArray(list) || list.length > 64) return false;
  const ids = new Set();
  return list.every((item) => {
    if (!item || typeof item.id !== 'string' || !/^[a-f0-9]{24}$/.test(item.id) || ids.has(item.id)
      || !EQUIPMENT_TYPES.some((t) => t.id === item.kind) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60
      || typeof item.description !== 'string' || item.description.length > 800 || typeof item.image !== 'string'
      || item.image.length > 8192 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(item.image)) return false;
    if(item.originalArtwork&&!validOriginalArtwork(item.originalArtwork,16,32))return false;
    ids.add(item.id);
    try {
      const buffer = Buffer.from(item.image.split(',')[1], 'base64');
      if (buffer.length < 24 || buffer.readUInt32BE(16) !== 16 || buffer.readUInt32BE(20) !== 32) return false;
      PNG.sync.read(buffer);
      return true;
    } catch { return false; }
  });
}
