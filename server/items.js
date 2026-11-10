import {preserveArtwork} from './original-artwork.js';
import { requestImage } from './sprite.js';
import { toAssetSprite } from './assets.js';

export async function generateItemImage(name, description, category) {
  if (!['seed', 'material', 'usable'].includes(category)) throw new Error('Invalid item category');
  const prompt = `Create one inventory item icon for a cozy top-down pixel-art RPG. Item name: ${name}. Category: ${category}. Appearance: ${description || name}. Draw only the item, centred and readable at a logical 16 by 16 pixel size. Crisp chunky pixels, restrained colours, transparent background. No characters, hands, scenery, lettering, frame, UI, or display stand. ${category === 'seed' ? 'Show a recognisable small seed packet or a few seeds appropriate to this item.' : ''}`;
  const original = await requestImage(prompt, []);
  const icon=toAssetSprite(original,{width:1,height:1},0);icon.originalArtwork=preserveArtwork(original,16,16);return icon;
}
