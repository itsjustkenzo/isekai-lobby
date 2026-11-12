import {interiorFootprint} from '../client/src/interiorGeometry.js';
import {PNG} from 'pngjs';
import {mapError} from './map-analysis-errors.js';
export function normalizeInteriorCollection(collection){
  return {...collection,generatedAssets:(collection.generatedAssets??[]).map(asset=>{
    const footprint=interiorFootprint(asset);
    if(!footprint||asset.width===footprint.width&&asset.height===footprint.height)return structuredClone(asset);
    // Saved sprites already have transparency and outlines. Running background
    // removal again can erase valid pale furniture entirely.
    let image;
    try{
      const source=PNG.sync.read(Buffer.from(asset.spriteUrl.split(',')[1],'base64'));
      const width=footprint.width*16*(asset.pixelScale??1),height=(footprint.height+1)*16*(asset.pixelScale??1),out=new PNG({width,height});
      let left=source.width,top=source.height,right=-1,bottom=-1;
      for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(source.data[(y*source.width+x)*4+3]>=128){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      if(right<left)throw new Error('Empty saved sprite');
      const scale=Math.min(1,(width-2)/(right-left+1),(height-2)/(bottom-top+1));
      const w=Math.max(1,Math.round((right-left+1)*scale)),h=Math.max(1,Math.round((bottom-top+1)*scale)),ox=Math.floor((width-w)/2),oy=height-h;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const sx=Math.min(right,left+Math.floor(x/scale)),sy=Math.min(bottom,top+Math.floor(y/scale)),i=(sy*source.width+sx)*4;
        out.data.set(source.data.subarray(i,i+4),((oy+y)*width+ox+x)*4);
      }
      image=PNG.sync.write(out);
    }catch{throw mapError(`Could not prepare saved furniture "${asset.name}". Regenerate that asset in Interior Asset Builder, then retry the map.`);}
    const {originalArtwork,...rest}=asset;
    return {...rest,...footprint,spriteUrl:`data:image/png;base64,${image.toString('base64')}`};
  })};
}
