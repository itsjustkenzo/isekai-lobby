import {CURRENT_ART_STYLE} from '../client/src/gameArtStyle.js';
import {validSurfacePlacement} from '../client/src/interiorGeometry.js';
import {validOriginalArtwork} from './original-artwork.js';
import {NATURE_SPRITE_SIZES} from '../client/src/world/natureSizes.js';
import {TREE_HEIGHTS} from '../client/src/world/treeSizes.js';
import { ENVIRONMENT_KINDS } from './environment-variants.js';
import { PNG } from 'pngjs';
import { validTextureLibrary } from './textures.js';
import {validBuildingGeometry} from '../client/src/buildingGeometry.js';

// Prototype artwork lives inside its map document, never in the shared asset library.
export function readGeneratedMedia(body,map){
  const assets=body.generatedAssets??[],textures=body.textures??[];
  if(JSON.stringify([assets,textures]).length>12*1024*1024)return null;
  let environmentReport;
  if(body.environmentReport!==undefined){
    const r=body.environmentReport;
    if(!r||!Number.isInteger(r.seed)||r.seed<0||r.seed>4294967295||typeof r.biome!=='string'||r.biome.length>128||![r.added,r.patchCells].every(n=>Number.isInteger(n)&&n>=0&&n<=map.width*map.height)||!Array.isArray(r.missingAssets)||r.missingAssets.length>64||r.missingAssets.some(s=>typeof s!=='string'||s.length>120))return null;
    environmentReport={seed:r.seed,biome:r.biome,added:r.added,patchCells:r.patchCells,missingAssets:[...r.missingAssets]};
  }
  if(!Array.isArray(assets)||assets.length>64||!validTextureLibrary(textures))return null;
  const ids=new Set();
  const cleaned=[];
  for(const asset of assets){
    if(!asset||typeof asset.id!=='string'||!/^[a-f0-9]{24}$/.test(asset.id)||ids.has(asset.id)||typeof asset.name!=='string'||!asset.name.trim()||asset.name.length>60||![asset.width,asset.height].every((n)=>Number.isInteger(n)&&n>=1&&n<=8)||typeof asset.solid!=='boolean'||typeof asset.spriteUrl!=='string'||asset.spriteUrl.length>(asset.pixelScale===3?450000:100000)||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(asset.spriteUrl))return null;
    try{
      const buffer=Buffer.from(asset.spriteUrl.split(',')[1],'base64');if(buffer.length<24)return null;
      if(asset.pixelScale!==undefined&&![1,3].includes(asset.pixelScale))return null;
      const scale=asset.pixelScale===3?3:1,nativeWidth=buffer.readUInt32BE(16),nativeHeight=buffer.readUInt32BE(20);
      const width=nativeWidth/scale,height=nativeHeight/scale;
      const tree=asset.environmentKind==='Tree',nature=NATURE_SPRITE_SIZES[asset.environmentKind]?.[asset.sizeVariant];
      if(tree){if(width<1||width>64||![32,TREE_HEIGHTS[asset.sizeVariant]].includes(height))return null;}
      else if(nature){if(!(width===nature[0]&&height===nature[1])&&!(width===16&&height===32))return null;}
      else if(asset.building){if(!validBuildingGeometry(asset)||width!==asset.width*16||height!==asset.building.artHeight)return null;}
      else if(width!==asset.width*16||height!==(asset.height+1)*16)return null;
      if(asset.originalArtwork&&!validOriginalArtwork(asset.originalArtwork,nativeWidth,nativeHeight))return null;
      const png=PNG.sync.read(buffer);if(png.width!==nativeWidth||png.height!==nativeHeight)return null;
    }catch{return null;}
    if(asset.environmentKind!==undefined&&(!ENVIRONMENT_KINDS.includes(asset.environmentKind)||!['small','medium','large'].includes(asset.sizeVariant)))return null;
    if(asset.assetKind!==undefined&&!['Tree','Bush','Rock','Flowers','Potted plant','Log','Barrel','Building','Furniture','Indoor prop'].includes(asset.assetKind))return null;
    if(asset.placement!==undefined&&(typeof asset.placement!=='string'||asset.placement.length>400))return null;
    if(asset.planItemId!==undefined&&(typeof asset.planItemId!=='string'||!/^[a-f0-9]{24}$/.test(asset.planItemId)))return null;
    if(asset.artStyle!==undefined&&asset.artStyle!==CURRENT_ART_STYLE)return null;
    ids.add(asset.id);cleaned.push({... (asset.artStyle?{artStyle:asset.artStyle}:{}),...(asset.pixelScale?{pixelScale:asset.pixelScale}:{}),id:asset.id,name:asset.name,width:asset.width,height:asset.height,solid:asset.solid,...(asset.environmentKind?{environmentKind:asset.environmentKind,sizeVariant:asset.sizeVariant}:{}),...(asset.assetKind?{assetKind:asset.assetKind}:{}),...(asset.building?{building:{sourceId:asset.id,type:asset.building.type,setting:asset.building.setting,width:asset.width,height:asset.height,floors:asset.building.floors,artHeight:asset.building.artHeight,entranceX:asset.building.entranceX,clearance:1}}:{}),...(asset.placement?{placement:asset.placement}:{}),...(asset.planItemId?{planItemId:asset.planItemId}:{}),...(asset.originalArtwork?{originalArtwork:asset.originalArtwork}:{}),spriteUrl:asset.spriteUrl});
  }
  if(map.placed.some((p)=>{const asset=cleaned.find((a)=>a.id===p.a);return !asset||p.r||p.t||p.f||p.x+asset.width>map.width||p.y-asset.height+1<0;}))return null;
  if(map.placed.some(p=>!validSurfacePlacement(p,map.placed,cleaned)))return null;
  const textureIds=new Map(textures.map((t)=>[t.id,t]));
  if(Object.values(map.paint).some((p)=>!textureIds.has(p.id)||textureIds.get(p.id).surface!==p.surface))return null;
  return {generatedAssets:cleaned,textures:textures.map(({id,name,image,surface,description,liquid,originalArtwork,artStyle,pixelScale})=>({id,name,image,surface,...(pixelScale?{pixelScale}:{}),...(artStyle===CURRENT_ART_STYLE?{artStyle}:{}),...(originalArtwork?{originalArtwork}:{}),...(liquid!==undefined?{liquid}:{}),...(description?{description}:{})})),...(environmentReport?{environmentReport}:{})};
}
