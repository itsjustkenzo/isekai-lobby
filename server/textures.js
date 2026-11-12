import {preserveArtwork,validOriginalArtwork} from './original-artwork.js';
import { REFERENCE_ART_STYLE } from './reference-style.js';
import { PNG } from 'pngjs';
import { requestImage } from './sprite.js';

// New collections use 48px material tiles; legacy callers retain the 16px default.
export function toTextureTile(buffer, size=16) {
  const source = PNG.sync.read(buffer, { checkCRC: true });
  if (source.width > 4096 || source.height > 4096) throw new Error('Texture image is too large');
  const tile = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sx = Math.min(source.width - 1, Math.floor((x + 0.5) * source.width / size));
    const sy = Math.min(source.height - 1, Math.floor((y + 0.5) * source.height / size));
    const i = (sy * source.width + sx) * 4;
    const j = (y * size + x) * 4;
    const alpha = source.data[i + 3] / 255;
    for (let c = 0; c < 3; c++) tile.data[j + c] = Math.round(source.data[i + c] * alpha + 100 * (1 - alpha));
    tile.data[j + 3] = 255;
  }
  // Match opposite edges so repeated tiles don't have a hard boundary.
  const match = (a, b) => { for (let c = 0; c < 3; c++) tile.data[a + c] = tile.data[b + c] = Math.round((tile.data[a + c] + tile.data[b + c]) / 2); };
  for (let y = 0; y < size; y++) match(y * size*4, (y * size+size-1)*4);
  for (let x = 0; x < size; x++) match(x * 4, ((size-1)*size+x)*4);
  return PNG.sync.write(tile);
}

export async function generateTexture(prompt, reference, surface = 'floor') {
  const description = `Create ONE seamless repeating ${reference ? 'reference-matched' : 'pixel-art'} material tile for a top-down ${reference ? 'game' : 'cozy RPG'}. Surface: ${surface === 'wall' ? 'vertical wall cladding seen straight-on, with courses of bricks or panels aligned horizontally' : surface === 'ground' ? 'exterior ground material seen directly from above, for outdoor terrain' : 'interior floor material seen directly from above'}. Material: ${prompt}. Fill the entire square edge to edge with opaque material. No scene, room, objects, windows, border, text, perspective, lighting gradients, or transparency. ${reference ? 'Keep lighting consistent across tile boundaries, and preserve the reference palette and edge treatment.' : 'Flat even lighting, chunky crisp pixels, a restrained palette.'} Tileable on all four edges. Design at a logical 16 by 16 pixel resolution. ${reference ? 'Use the attached user design as the material reference, preserving its colours, pattern and identity while adapting it into a seamless game tile. ' + REFERENCE_ART_STYLE : ''}`;
  const original=await requestImage(description, reference ? [reference] : [], { background: 'opaque' });
  const tile=toTextureTile(original);tile.originalArtwork=preserveArtwork(original,16,16,{tile:true});return tile;
}

export function validTextureLibrary(textures) {
  if (!Array.isArray(textures) || textures.length > 64) return false;
  const ids = new Set();
  return textures.every((t) => {
    if (!t || typeof t.id !== 'string' || !/^[a-f0-9]{24}$/.test(t.id) || ids.has(t.id) || typeof t.name !== 'string' || t.name.length > 300 || typeof t.image !== 'string' || t.image.length >= (t.pixelScale===3?100000:4096) || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(t.image)) return false;
    if (t.liquid !== undefined && typeof t.liquid !== 'boolean') return false;
    if (t.surface !== undefined && !['wall', 'floor', 'ground'].includes(t.surface)) return false;
    if (t.description !== undefined && (typeof t.description !== 'string' || t.description.length > 800)) return false;
    if(t.originalArtwork&&!validOriginalArtwork(t.originalArtwork,16,16))return false;
    if(t.pixelScale!==undefined&&![1,3].includes(t.pixelScale))return false;
    const size=t.pixelScale===3?48:16;
    ids.add(t.id);
    try {
      const buffer = Buffer.from(t.image.split(',')[1], 'base64');
      if (buffer.length < 24 || buffer.readUInt32BE(16) !== size || buffer.readUInt32BE(20) !== size) return false;
      const tile = PNG.sync.read(buffer);
      return tile.width === size && tile.height === size;
    } catch { return false; }
  });
}
