import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const referenceUrl = (gender) => new URL(`./references/${gender}.png`, import.meta.url);
const promptUrl = new URL('./prompts/character-sprite.md', import.meta.url);

export const GENDERS = ['male', 'female'];

export function availableGenders() {
  return GENDERS.filter((gender) => existsSync(referenceUrl(gender)));
}

const SIGNATURES = [
  { type: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/webp', ext: 'webp', test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

export function detectImageType(buffer) {
  return SIGNATURES.find((signature) => buffer.length > 12 && signature.test(buffer)) ?? null;
}

const dataUrl = (type, buffer) => `data:${type};base64,${buffer.toString('base64')}`;

// Generates a transparent PNG from a prompt and reference images (in order: the prompt's Image 1, Image 2, ...).
export async function requestImage(prompt, references, options = {}) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not configured');
  const res = await fetch('https://openrouter.ai/api/v1/images', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.SPRITE_IMAGE_MODEL || 'openai/gpt-image-2.5-sunburst',
      prompt,
      input_references: references.map((buffer) => ({ type: 'image_url', image_url: { url: dataUrl(detectImageType(buffer).type, buffer) } })),
      aspect_ratio: '1:1',
      quality: process.env.SPRITE_IMAGE_QUALITY || 'high',
      background: options.background ?? 'transparent',
      output_format: 'png',
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error=new Error(`OpenRouter image request failed (${res.status}): ${data.error?.message ?? 'unknown error'}`);
    error.imageStatus=res.status;
    throw error;
  }
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenRouter returned no image');
  const image = Buffer.from(b64, 'base64');
  if (detectImageType(image)?.type !== 'image/png') throw new Error('OpenRouter returned a non-PNG image');
  return image;
}

export async function generateSprite(gender, upload, {conceptPrompt='',imageRequest=requestImage}={}) {
  if (!detectImageType(upload)) throw new Error('Unsupported image type');
  const [reference, masterPrompt] = await Promise.all([readFile(referenceUrl(gender)), readFile(promptUrl, 'utf8')]);
  // The prompt calls the reference Image 1 (master) and the upload Image 2 (concept).
  return imageRequest(`${masterPrompt}\n\nThe character is ${gender}.${conceptPrompt?`\n\n${conceptPrompt}`:''}`, [reference, upload]);
}
