import { PNG } from 'pngjs';
import { fitSprite } from './pixelfit.js';
import { NATURE_SPRITE_SIZES } from '../client/src/world/natureSizes.js';

export function fitNativeTree(buffer,size){
  const dimensions=NATURE_SPRITE_SIZES.Tree[size];
  if(!dimensions)throw new Error('Invalid tree size');
  const [width,height]=dimensions;
  const sprite=fitSprite(buffer,width,height,{scale:1});
  const png=PNG.sync.read(sprite);let top=height,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(png.data[(y*width+x)*4+3]>=128){top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(bottom-top+1<height)throw Object.assign(new Error(`The ${size} tree needs ${height} visible pixels (${height/16} tiles), not empty space around a smaller tree. Draw a taller, narrower silhouette with more native detail.`),{shortTree:true});
  return sprite;
}
