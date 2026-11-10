import { readFile } from 'node:fs/promises';
import { detectBlockSize, fitScale, fitSprite } from './pixelfit.js';
import { detectImageType, requestImage } from './sprite.js';

const referenceUrl = new URL('./references/props.png', import.meta.url);
const promptUrl = new URL('./prompts/asset-sprite.md', import.meta.url);

const TILE = 16; // keep in sync with TILE in client/src/world/art.js

// Footprints in tiles. Sprites get one extra tile of headroom so tall things (lamp posts, statues)
// can rise above the tiles they stand on.
export const ASSET_SIZES = {
  '1x1': { width: 1, height: 1 },
  '2x1': { width: 2, height: 1 },
  '1x2': { width: 1, height: 2 },
  '2x2': { width: 2, height: 2 },
};
export const MAX_ASSET_NAME = 60;
export const MAX_LIBRARY = 100;

// headroom: tiles of space above the footprint for parts that rise above it (a lamp post's top).
export function spriteSize(size, headroom = 1) {
  return { width: size.width * TILE, height: Math.round((size.height + headroom) * TILE) };
}

// Vertical versions already run up the map, so they only get half a tile of headroom.
export const SIDE_HEADROOM = 0.5;

export function generateAssetImage(description, size) {
  return readFile(promptUrl, 'utf8').then(async (masterPrompt) => {
    const reference = await readFile(referenceUrl);
    const shape = size.height > size.width ? 'taller than it is wide' : size.width > size.height ? 'wider than it is tall' : 'roughly as wide as it is tall, or a little taller';
    const request = `${masterPrompt}\n\nThe object to draw: "${description}". It should be ${shape}.`;
    return requestImage(request, [reference]);
  });
}

// The footprint when an asset is turned to run vertically (up and down the map): width and height swap.
export const turned = (size) => ({ width: size.height, height: size.width });

// Redraws an existing asset (its full-size original as Image 2) turned to run up and down the map, in the
// same style and viewpoint. Generated once per asset and shared by everyone who uses it.
export async function generateSideImage(description, original, size) {
  const [masterPrompt, reference] = await Promise.all([readFile(promptUrl, 'utf8'), readFile(referenceUrl)]);
  const side = turned(size);
  const shape = side.height > side.width ? 'taller than it is wide' : side.width > side.height ? 'wider than it is tall' : 'roughly as wide as it is tall';
  const request = `${masterPrompt}

Image 2 shows an object from this game: "${description}". Draw the SAME object (same materials, colours and details) turned 90 degrees so it runs up and down the map (north to south) instead of left to right, still seen from the same top-down front-and-above viewpoint as Image 1. For example, a fence turned this way is seen end-on and recedes upward, and a bench turned this way is seen from its side. It should be ${shape}. Use exactly the same pixel size as Image 2 (the same chunky blocks) and draw the object at the same scale as Image 2: do not enlarge it to fill the canvas, leave transparent space instead.`;
  return requestImage(request, [reference, original]);
}

// Converts a vertical version at the SAME art scale as the asset's normal sprite, so it isn't zoomed in:
// filling its own (tall, narrow) box would scale it differently from the normal one. The AI's pixel-block
// size can differ between the two drawings, so the scale is corrected by their ratio.
export function toSideSprite(original, sideOriginal, size) {
  const front = spriteSize(size);
  const frontScale = fitScale(original, front.width, front.height);
  const frontBlock = detectBlockSize(original);
  const sideBlock = detectBlockSize(sideOriginal);
  const scale = frontBlock && sideBlock ? frontScale * (sideBlock / frontBlock) : frontScale;
  const { width, height } = spriteSize(turned(size), SIDE_HEADROOM);
  return fitSprite(sideOriginal, width, height, { scale });
}

// Turns any image (AI output or a player upload) into an exact game-scale sprite for the given footprint.
export function toAssetSprite(imageBuffer, size, headroom = 1) {
  const type = detectImageType(imageBuffer)?.type;
  if (type !== 'image/png') throw new Error('Only PNG images can be converted');
  const { width, height } = spriteSize(size, headroom);
  return fitSprite(imageBuffer, width, height);
}

// Search words: lowercase letters and digits from the name.
export function keywordsFor(name) {
  return [...new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1))];
}
