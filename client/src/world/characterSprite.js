// Includes two pixels of outline: the original two-tile character height.
export const PLAYER_SPRITE_HEIGHT = 32;
export const PLAYER_HAND_OFFSET = 1;
const DEFAULT_BODY_HEIGHT = 30;
const OUTLINE_COLOR = [31, 28, 40, 255];

// Frame metadata only: the game retains the full original image texture.
export function avatarFrame(data,width,height){
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  return right<left?{x:0,y:0,width,height}:{x:left,y:top,width:right-left+1,height:bottom-top+1};
}
export function originalAvatarFrame(image){
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  return avatarFrame(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
}

export function pixelateSprite(image, {height=DEFAULT_BODY_HEIGHT}={}) {
  const source = document.createElement('canvas');
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const sctx = source.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(image, 0, 0);
  const { data, width } = sctx.getImageData(0, 0, source.width, source.height);

  // Crop to the character so no output pixels are spent on empty space.
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] >= 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
  }
  if (x1 < 0) return source;
  const scale = (y1 - y0 + 1) / height;
  const w = Math.max(1, Math.round((x1 - x0 + 1) / scale));
  const h = height;

  // Output canvas has a 1px border for the outline.
  const out = document.createElement('canvas');
  out.width = w + 2;
  out.height = h + 2;
  const octx = out.getContext('2d');
  const pixels = octx.createImageData(out.width, out.height);
  const inset = scale * 0.2; // ignore block edges, where neighbouring art pixels bleed in
  for (let oy = 0; oy < h; oy++) {
    for (let ox = 0; ox < w; ox++) {
      let opaque = 0;
      let clear = 0;
      const buckets = new Map();
      for (let y = Math.floor(y0 + oy * scale + inset); y < Math.ceil(y0 + (oy + 1) * scale - inset); y++) {
        for (let x = Math.floor(x0 + ox * scale + inset); x < Math.ceil(x0 + (ox + 1) * scale - inset); x++) {
          const i = (y * width + x) * 4;
          if (data[i + 3] < 128) { clear++; continue; }
          opaque++;
          const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
          const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
          bucket.n++; bucket.r += data[i]; bucket.g += data[i + 1]; bucket.b += data[i + 2];
          buckets.set(key, bucket);
        }
      }
      if (opaque <= clear) continue;
      let best = null;
      for (const bucket of buckets.values()) if (!best || bucket.n > best.n) best = bucket;
      pixels.data.set([best.r / best.n, best.g / best.n, best.b / best.n, 255].map(Math.round), ((oy + 1) * out.width + ox + 1) * 4);
    }
  }

  const solid = (x, y) => x >= 0 && y >= 0 && x < out.width && y < out.height && pixels.data[(y * out.width + x) * 4 + 3] === 255;
  const edge = [];
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push((y * out.width + x) * 4);
    }
  }
  for (const i of edge) pixels.data.set(OUTLINE_COLOR, i);
  octx.putImageData(pixels, 0, 0);
  return out;
}

