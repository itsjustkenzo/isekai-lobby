import {INTERIOR_MAP_SIZES} from '../client/src/interiorMapSizes.js';
import {preserveArtwork} from './original-artwork.js';
import {fitSprite} from './pixelfit.js';
import {NATURE_SPRITE_SIZES} from '../client/src/world/natureSizes.js';
import { environmentVariants,environmentVariantIndex } from './environment-variants.js';
import { REFERENCE_ART_STYLE } from './reference-style.js';
import { PNG } from 'pngjs';
import { requestImage } from './sprite.js';
import { ObjectId } from 'mongodb';
import { toAssetSprite } from './assets.js';
import { generateTexture } from './textures.js';

export const MAP_PALETTE = [
  {color:[108,173,75],terrain:'g',object:'.',name:'grass #6cad4b'},
  {color:[170,115,67],terrain:'d',object:'.',name:'dirt paths #aa7343'},
  {color:[55,125,196],terrain:'w',object:'.',name:'water and other liquids (including lava, mud, acid or slime) #377dc4'},
  {color:[151,155,163],terrain:'s',object:'.',name:'stone paving #979ba3'},
  {color:[228,202,137],terrain:'a',object:'.',name:'sand #e4ca89'},
  {color:[35,90,44],terrain:'g',object:'T',name:'trees and forest #235a2c',asset:'Tree',size:[1,1]},
  {color:[233,119,170],terrain:'g',object:'F',name:'flowers #e977aa',asset:'Flowers',size:[1,1]},
  {color:[81,83,92],terrain:'s',object:'R',name:'rocks #51535c',asset:'Rock',size:[1,1]},
];
MAP_PALETTE.push({color:[76,129,57],terrain:'g',object:'.',name:'bushes and shrubs #4c8139',asset:'Bush',size:[1,1]});
MAP_PALETTE.push({color:[185,72,48],terrain:'s',object:'.',name:'buildings #b94830',asset:'Building',size:[4,3]});
export const INTERIOR_PALETTE = [
  {color:[170,115,67],terrain:'o',object:'.',name:'wood flooring #aa7343'},
  {color:[151,155,163],terrain:'s',object:'.',name:'stone flooring #979ba3'},
  {color:[174,79,113],terrain:'c',object:'.',name:'carpet flooring #ae4f71'},
  {color:[81,83,92],terrain:'s',object:'N',name:'plain stone walls and partitions #51535c'},
];
INTERIOR_PALETTE.push(
  {color:[70,110,190],terrain:'o',object:'.',name:'beds #466ebe',asset:'Bed',size:[2,2]},
  {color:[200,150,45],terrain:'o',object:'.',name:'tables and desks #c8962d',asset:'Table',size:[2,1]},
  {color:[100,65,120],terrain:'o',object:'.',name:'chairs and seats #644178',asset:'Chair',size:[1,1]},
  {color:[35,110,55],terrain:'o',object:'.',name:'potted plants #236e37',asset:'Potted plant',size:[1,1]}
);
export function dreamMapSize(width,height,kind='exterior',interiorSize='medium') {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192)throw new Error('Invalid reference size.');
  if(!['interior','exterior'].includes(kind))throw new Error('Choose interior or exterior.');
  if(kind==='interior'){
    if(!Object.hasOwn(INTERIOR_MAP_SIZES,interiorSize))throw new Error('Choose a small, medium or large interior.');
    return {...INTERIOR_MAP_SIZES[interiorSize]};
  }
  const long=Math.max(width,height)>1500?80:64;
  return {width:Math.max(16,Math.round(long*width/Math.max(width,height))),height:Math.max(16,Math.round(long*height/Math.max(width,height)))};
}
export function blueprintToMap(buffer,size,name='Dream map',kind='exterior') {
  const png=PNG.sync.read(buffer);
  if(png.width<8||png.height<8||png.width>4096||png.height>4096)throw new Error('Invalid generated map image.');
  const indoor=kind==='interior',palette=indoor?INTERIOR_PALETTE:MAP_PALETTE;
  const {width,height}=size,terrain=[],objects=[],hints={};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const votes=Array(palette.length).fill(0);
    for(const fy of [.25,.5,.75])for(const fx of [.25,.5,.75]){
      const sx=Math.min(png.width-1,Math.floor((x+fx)/width*png.width)),sy=Math.min(png.height-1,Math.floor((y+fy)/height*png.height));
      const i=(sy*png.width+sx)*4;
      let best=0,distance=Infinity;
      palette.forEach((entry,k)=>{const d=entry.color.reduce((sum,c,j)=>sum+(c-png.data[i+j])**2,0);if(d<distance){best=k;distance=d;}});
      votes[best]++;
    }
    const entry=palette[votes.indexOf(Math.max(...votes))];
    if(entry.asset) (hints[entry.asset]??=[]).push(y*width+x);
    // Preserve reference terrain all the way to the edge; never add a stock forest ring.
    terrain.push(entry.terrain);
    objects.push(indoor?(x===0||x===width-1||y===height-1?'X':y<3?'N':entry.object==='N'?'.':entry.object):entry.object);
  }
  if(indoor){
    const doorX=Math.floor(width/2);
    for(let y=height-3;y<height;y++){
      const i=y*width+doorX;
      objects[i]='.';terrain[i]='o';
      for(const kind of Object.keys(hints))hints[kind]=hints[kind].filter(cell=>cell!==i);
    }
  }
  let spawn=null,best=Infinity;
  for(let y=indoor?3:2;y<height-(indoor?1:2);y++)for(let x=indoor?1:2;x<width-(indoor?1:2);x++){
    const i=y*width+x,d=(x-width/2)**2+(y-height/2)**2;
    if(terrain[i]!=='w'&&['.','F'].includes(objects[i])&&d<best){best=d;spawn={x,y};}
  }
  if(!spawn){spawn={x:Math.floor(width/2),y:Math.floor(height/2)};for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const i=(spawn.y+dy)*width+spawn.x+dx;terrain[i]=indoor?'o':'g';objects[i]='.';}}
  return {...(indoor?{kind:'indoor',style:'stone',wallRows:3}:{}),name:name.trim().slice(0,40)||'Dream map',width,height,terrain:terrain.join(''),objects:objects.join(''),placed:[],npcs:[],interiors:{},links:{},spawn,assetHints:hints};
}
export async function generateDreamMap(reference,width,height,name,description='',kind='exterior') {
  const size=dreamMapSize(width,height,kind),palette=kind==='interior'?INTERIOR_PALETTE:MAP_PALETTE;
  const prompt=`Convert the attached image into a flat top-down editable RPG map blueprint. ${kind==='interior'?'This is an INTERIOR room or floor plan. Preserve room divisions, corridors, door openings and floor materials. Use plain walls only, never windows; mark visible furniture using the specified category colours.':'This is an EXTERIOR location. Preserve waterways, paths, clearings, forests and landmark positions, including the surrounding terrain at every edge. Do not add a forest border unless the reference actually shows one.'} ${description}. Target grid: ${size.width} columns by ${size.height} rows. Fill the whole square canvas with the blueprint; adapt the reference to this grid without a legend or margins. Use ONLY these flat colours: ${palette.map(p=>p.name).join('; ')}. Large clean colour regions, no texture, shading, outlines, labels, text, perspective or grid lines. ${kind==='interior'?'Make passages between rooms walkable floor. Mark visible beds, tables, chairs and plants in their category colours; no exterior terrain or windows.':'Mark buildings using the building colour.'} Do not draw realistic objects; this is a colour-coded terrain plan, not final artwork.`;
  const map=blueprintToMap(await requestImage(prompt,[reference],{background:'opaque'}),size,name,kind);
  return enrichDreamMap(map,reference,kind,description);
}

// A bounded number of independent image requests avoids overwhelming the image provider.
async function runJobs(jobs){
  let next=0;
  const results=await Promise.allSettled(Array.from({length:Math.min(3,jobs.length)},async()=>{while(next<jobs.length){const job=jobs[next++];await job();}}));
  const failure=results.find((result)=>result.status==='rejected');if(failure)throw failure.reason;
}
export async function enrichDreamMap(map,reference,kind,description='',imageRequest=requestImage,textureRequest=generateTexture){
  const indoor=kind==='interior',palette=indoor?INTERIOR_PALETTE:MAP_PALETTE;
  const hints=map.assetHints??{};delete map.assetHints;
  const terrain=[...map.terrain],objects=[...map.objects],assets=[],textures=[],paint={},jobs=[];
  for(const entry of palette.filter((p)=>p.asset&&hints[p.asset]?.length)){
    if(NATURE_SPRITE_SIZES[entry.asset]){
      for(const [size,[width,height]] of Object.entries(NATURE_SPRITE_SIZES[entry.asset]))jobs.push(async()=>{
        const raw=await imageRequest(`Draw ONE ${size} ${entry.asset.toLowerCase()} matching the ${entry.asset.toLowerCase()} in the attached reference. This is a separately drawn ${width} by ${height} logical-pixel sprite with a single-tile placement footprint. Its artwork may overhang the base. Fill the sprite with the subject, leaving only a one-pixel transparent margin; do not draw a tiny prop floating in a large empty canvas. ${entry.asset==='Bush'?'Draw a full, dense, broad shrub with a substantial leafy canopy; medium and large bushes should visibly extend beyond one tile.':''} Larger nature props contain MORE individually drawn leaves, branches, flowers or material detail, never larger pixel blocks. Use the SAME one-art-pixel grid, one-pixel outlines and detail scale at all three sizes. Do not zoom, scale up a smaller sprite, double pixels, blur, antialias or draw thick stepped outlines. Keep the original reference colours, species, shading and design. Transparent background, no ground or other objects. ${description}. ${REFERENCE_ART_STYLE}`,[reference]);
        const image=fitSprite(raw,width,height,{scale:1});
        assets.push({id:new ObjectId().toString(),name:`${entry.asset} (${size})`,environmentKind:entry.asset,sizeVariant:size,width:1,height:1,solid:entry.asset!=='Flowers',originalArtwork:preserveArtwork(raw,width,height),spriteUrl:`data:image/png;base64,${image.toString('base64')}`});
      });
      continue;
    }
    jobs.push(async()=>{
      const [width,height]=entry.size,id=new ObjectId().toString();
      const raw=await imageRequest(`Create ONE isolated ${entry.asset} matching the ${entry.asset.toLowerCase()} visible in the reference image. Preserve its colours, materials and design. ${description}. Game-ready art viewed from above and slightly in front, transparent background. No ground, room, other objects, characters, labels or text. Footprint ${width} by ${height} tiles, each tile 16 pixels. Buildings include their roof and facade. Plain walls never include windows. ${REFERENCE_ART_STYLE}`,[reference]);const image=toAssetSprite(raw,{width,height});
      assets.push(...environmentVariants(image,{id,name:entry.asset,width,height,solid:entry.asset!=='Flowers',originalArtwork:preserveArtwork(raw,width*16,(height+1)*16)}));
    });
  }
  const materials={w:'liquid surface (water, lava, mud, acid or whichever liquid the reference actually shows)',g:'grass',d:'dirt path',s:'stone',a:'sand',o:'wood boards',c:'carpet'};
  for(const code of [...new Set(terrain)].filter((code)=>materials[code])){
    const surface=indoor?'floor':'ground';
    jobs.push(async()=>{const id=new ObjectId().toString(),name=`Reference ${materials[code]}`;
      const image=await textureRequest(`Extract the ${materials[code]} surface visible in the reference scene; match its material, colour and wear. Ignore all other objects and surfaces. ${description}. ${REFERENCE_ART_STYLE}`,reference,surface);
      textures.push({id,name,surface,...(code==='w'?{liquid:true}:{}),...(image.originalArtwork?{originalArtwork:image.originalArtwork}:{}),image:`data:image/png;base64,${image.toString('base64')}`});
      terrain.forEach((value,i)=>{if(value===code&&!['N','M','L','X'].includes(objects[i]))paint[i]={id,surface};});
    });
  }
  if(indoor)jobs.push(async()=>{const id=new ObjectId().toString(),surface='wall';const image=await textureRequest(`Extract the plain wall material visible in the reference; match its colour, pattern and wear. No windows, doors or furniture. ${description}. ${REFERENCE_ART_STYLE}`,reference,surface);textures.push({id,name:'Reference wall',surface,...(image.originalArtwork?{originalArtwork:image.originalArtwork}:{}),image:`data:image/png;base64,${image.toString('base64')}`});objects.forEach((value,i)=>{if(['N','M','L','X'].includes(value))paint[i]={id,surface};});});
  await runJobs(jobs);
  assets.sort((a,b)=>a.name.localeCompare(b.name));textures.sort((a,b)=>a.name.localeCompare(b.name));
  const occupied=new Set(),placed=[];
  for(const entry of palette.filter((p)=>p.asset&&hints[p.asset]?.length)){
    const variants=assets.filter((asset)=>(asset.environmentKind??asset.name)===entry.asset);
    const cells=new Set(hints[entry.asset]),seen=new Set();
    for(const seed of cells){
      if(seen.has(seed))continue;
      const component=[],queue=[seed];seen.add(seed);
      for(let k=0;k<queue.length;k++){const i=queue[k];component.push(i);const x=i%map.width,y=Math.floor(i/map.width);for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){const n=ny*map.width+nx;if(nx>=0&&ny>=0&&nx<map.width&&ny<map.height&&cells.has(n)&&!seen.has(n)){seen.add(n);queue.push(n);}}}
      // Environmental regions fill individual tiles; each furniture/building region becomes one prop.
      const seeds=['Tree','Flowers','Bush','Rock'].includes(entry.asset)?component.filter((_,index)=>index%Math.max(1,Math.ceil(component.length/1200))===0):[component[Math.floor(component.length/2)]];
      if(!seeds.length)seeds.push(component[0]);
      for(const i of seeds){
        if(placed.length>=1500)break;
        const asset=variants[environmentVariantIndex(i%map.width,Math.floor(i/map.width),variants.length)];
        const x=Math.max(0,Math.min(map.width-asset.width,i%map.width)),y=Math.max(indoor?asset.height+2:asset.height-1,Math.min(map.height-1,Math.floor(i/map.width)));
        const footprint=[];for(let dy=0;dy<asset.height;dy++)for(let dx=0;dx<asset.width;dx++)footprint.push((y-dy)*map.width+x+dx);
        if(footprint.some((n)=>occupied.has(n)||terrain[n]==='w'||['N','X'].includes(objects[n])||(Math.abs(n%map.width-map.spawn.x)<=1&&Math.abs(Math.floor(n/map.width)-map.spawn.y)<=1)))continue;
        footprint.forEach((n)=>{occupied.add(n);objects[n]='.';});placed.push({a:asset.id,x,y});
      }
    }
    // Replace procedural symbols only at source regions for this generated category.
    for(const i of cells)if(['T','F','R'].includes(objects[i]))objects[i]='.';
  }
  return {...map,objects:objects.join(''),placed,generatedAssets:assets,textures,paint};
}
