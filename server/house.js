import { readFile } from 'node:fs/promises';
import { fitSprite } from './pixelfit.js';
import { detectImageType, requestImage } from './sprite.js';

const referenceUrl = new URL('./references/house.png', import.meta.url);
const promptUrl = new URL('./prompts/house-sprite.md', import.meta.url);

// Custom houses use the same footprint and sprite size as the built-in Cottage (5×4 tiles, 80×96px)
// so they line up with the tile grid. Keep in sync with CUSTOM_HOUSE in client/src/world/world.js.
export const HOUSE_SPRITE = { width: 80, height: 96 };
export const MAX_HOUSES = 10;
export const MAX_DESCRIPTION = 400;

export async function generateHouse(description, upload) {
  if (upload && !detectImageType(upload)) throw new Error('Unsupported image type');
  const [reference, masterPrompt] = await Promise.all([readFile(referenceUrl), readFile(promptUrl, 'utf8')]);
  const request = [
    masterPrompt,
    upload ? 'Image 2 is the player\'s house concept.' : 'There is no Image 2; use the description only.',
    description ? `The player describes their house as: "${description}"` : '',
  ].filter(Boolean).join('\n\n');
  return requestImage(request, upload ? [reference, upload] : [reference]);
}

// Converts the generated image into an exact game-size house sprite, sitting on the footprint's bottom edge.
export function pixelateHouse(pngBuffer) {
  return fitSprite(pngBuffer, HOUSE_SPRITE.width, HOUSE_SPRITE.height);
}
