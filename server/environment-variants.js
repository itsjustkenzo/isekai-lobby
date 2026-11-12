import {TREE_HEIGHTS} from '../client/src/world/treeSizes.js';
import { PNG } from 'pngjs';
import { ObjectId } from 'mongodb';
export const ENVIRONMENT_KINDS=['Tree','Rock','Bush','Flowers','Potted plant'];
export const ENVIRONMENT_SIZES=[['Small',0.65],['Medium',0.82],['Large',1]];
export function treeSprite(source,size='medium',pixelScale=1){
  let left=source.width,top=source.height,right=-1,bottom=-1;
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(source.data[(y*source.width+x)*4+3]>=128){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<left)throw new Error('Tree has no visible pixels');
  const height=(TREE_HEIGHTS[size]??TREE_HEIGHTS.medium)*pixelScale,cropWidth=right-left+1,cropHeight=bottom-top+1;
  // Never enlarge raster pixels. Missing detail cannot be recovered by stretching.
  const scale=Math.min(1,height/cropHeight,(64*pixelScale)/cropWidth);
  const width=Math.max(1,Math.round(cropWidth*scale)),drawHeight=Math.max(1,Math.round(cropHeight*scale)),output=new PNG({width,height});
  for(let y=0;y<drawHeight;y++)for(let x=0;x<width;x++){
    const from=((top+Math.min(cropHeight-1,Math.floor(y/scale)))*source.width+left+Math.min(cropWidth-1,Math.floor(x/scale)))*4;
    source.data.copy(output.data,((height-drawHeight+y)*width+x)*4,from,from+4);
  }
  return output;
}
// Bake size into crisp pixels, anchored at the same bottom centre. Every variant
// uses one tile for placement and collision, with independent visual headroom for tall trees.
export function environmentVariants(sprite,asset){
  if(!ENVIRONMENT_KINDS.includes(asset.name))return [{...asset,spriteUrl:`data:image/png;base64,${sprite.toString('base64')}`}];
  const source=PNG.sync.read(sprite);
  return ENVIRONMENT_SIZES.map(([size,scale])=>{
    const output=asset.name==='Tree'?treeSprite(source,size.toLowerCase()):new PNG({width:16,height:32});
    const fit=Math.min(16/source.width,32/source.height)*scale;
    const width=Math.max(1,Math.round(source.width*fit)),height=Math.max(1,Math.round(source.height*fit));
    const left=Math.floor((16-width)/2),top=32-height;
    if(asset.name!=='Tree')for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const from=(Math.min(source.height-1,Math.floor(y/height*source.height))*source.width+Math.min(source.width-1,Math.floor(x/width*source.width)))*4;
      source.data.copy(output.data,((top+y)*16+left+x)*4,from,from+4);
    }
    return {...asset,width:1,height:1,id:new ObjectId().toString(),name:`${asset.name} (${size.toLowerCase()})`,environmentKind:asset.name,sizeVariant:size.toLowerCase(),spriteUrl:`data:image/png;base64,${PNG.sync.write(output).toString('base64')}`};
  });
}
// Stable per-position choices prevent sizes changing between reloads or previews.
export function environmentVariantIndex(x,y,count){return ((Math.imul(x+1,73856093)^Math.imul(y+1,19349663))>>>0)%count;}

// Upgrade existing generated environmental artwork on open/save without changing IDs
// or removing reusable definitions. Buildings and furniture retain their intended sizes.
export function normalizeEnvironmentFootprints(map){
  if(!map?.generatedAssets)return map;
  return {...map,generatedAssets:map.generatedAssets.map((asset)=>{
    const kind=asset.environmentKind??ENVIRONMENT_KINDS.find((name)=>asset.name===name||asset.name?.startsWith(`${name} (`));
    if(!kind)return asset;
    if(kind!=='Tree'&&asset.width===1&&asset.height===1)return asset;
    const source=PNG.sync.read(Buffer.from(asset.spriteUrl.split(',')[1],'base64'));
    if(kind==='Tree'){
      const size=asset.sizeVariant??['small','medium','large'].find((value)=>asset.name?.includes(value))??'medium';
      if(asset.width===1&&asset.height===1&&source.height===TREE_HEIGHTS[size]*(asset.pixelScale===3?3:1))return asset;
      return {...asset,width:1,height:1,environmentKind:'Tree',sizeVariant:size,spriteUrl:`data:image/png;base64,${PNG.sync.write(treeSprite(source,size,asset.pixelScale===3?3:1)).toString('base64')}`};
    }
    const output=new PNG({width:16,height:32}),scale=Math.min(16/source.width,32/source.height);
    const width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale)),left=Math.floor((16-width)/2),top=32-height;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const from=(Math.min(source.height-1,Math.floor(y/height*source.height))*source.width+Math.min(source.width-1,Math.floor(x/width*source.width)))*4;
      source.data.copy(output.data,((top+y)*16+left+x)*4,from,from+4);
    }
    return {...asset,width:1,height:1,spriteUrl:`data:image/png;base64,${PNG.sync.write(output).toString('base64')}`};
  })};
}


// Recover only the known legacy-migration damage, using the exact original ID.
// Never replace intact map-local artwork or resurrect a deleted source asset.
export function restoreShrunkNatureSprites(map,sourceCollection){
  const sources=new Map((sourceCollection?.generatedAssets??[]).map(a=>[a.id,a]));
  return {...map,generatedAssets:(map.generatedAssets??[]).map(asset=>{
    if(asset.pixelScale!==3||asset.environmentKind!=='Tree')return asset;
    const source=sources.get(asset.id),expected=TREE_HEIGHTS[asset.sizeVariant]*3;
    if(!source||source.pixelScale!==3||source.sizeVariant!==asset.sizeVariant||source.environmentKind!=='Tree')return asset;
    try{
      const current=PNG.sync.read(Buffer.from(asset.spriteUrl.split(',')[1],'base64')),original=PNG.sync.read(Buffer.from(source.spriteUrl.split(',')[1],'base64'));
      if(current.height<expected&&original.height===expected)return {...asset,width:1,height:1,spriteUrl:source.spriteUrl};
    }catch{return asset;}
    return asset;
  })};
}
