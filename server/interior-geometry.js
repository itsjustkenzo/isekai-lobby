import {interiorFootprint} from '../client/src/interiorGeometry.js';
import {fitSprite} from './pixelfit.js';
export function normalizeInteriorCollection(collection){
  return {...collection,generatedAssets:(collection.generatedAssets??[]).map(asset=>{
    const footprint=interiorFootprint(asset);
    if(!footprint||asset.width===footprint.width&&asset.height===footprint.height)return structuredClone(asset);
    const image=fitSprite(Buffer.from(asset.spriteUrl.split(',')[1],'base64'),footprint.width*16,(footprint.height+1)*16);
    const {originalArtwork,...rest}=asset;
    return {...rest,...footprint,spriteUrl:`data:image/png;base64,${image.toString('base64')}`};
  })};
}
