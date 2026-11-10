import {interiorFootprint} from './interiorGeometry.js';
import {paintTextures,setPaintTextures} from './world/paintTextures.js';
import {fromSaved,libraryAssets,setAssets} from './world/world.js';

// A temporary composition of saved artwork; no AI calls or persisted world state.
export function createTerrainPreviewMap(collection){
  if(collection.kind==='interior')return createInteriorPreviewMap(collection);
  const textures=structuredClone(collection.textures??[]),assets=structuredClone(collection.generatedAssets??[]);
  const base=textures.find(t=>t.surface==='ground'&&!t.liquid&&t.terrainCode==='g')??textures.find(t=>t.surface==='ground'&&!t.liquid)??textures.find(t=>t.surface==='floor'&&!t.liquid);
  if(!base)throw new Error('Generate a dry ground or floor texture before previewing this terrain.');
  const width=40,height=28,spawn={x:20,y:23},terrain=Array(width*height).fill(base.terrainCode??'g'),paint={},placed=[];
  const materials=textures.filter(t=>t.surface===base.surface&&!t.liquid&&t.id!==base.id);
  const liquid=textures.find(t=>t.surface===base.surface&&t.liquid);
  const path=materials.find(t=>t.terrainCode==='d');
  const occupied=new Set();
  const pathY=x=>19+Math.round(Math.sin(x/7)*2);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let texture=base;
    for(let n=0;n<materials.length;n++){
      const cx=7+(n*13)%29,cy=7+(n*7)%13;
      if(((x-cx)/5)**2+((y-cy)/3)**2<1+.15*Math.sin(x+y))texture=materials[n];
    }
    if(liquid&&((x-31)/5)**2+((y-8)/3)**2<1+.1*Math.sin(x*2+y))texture=liquid;
    if(Math.abs(y-pathY(x))<=1&&path)texture=path;
    const i=y*width+x;terrain[i]=texture.terrainCode??base.terrainCode??'g';paint[i]={id:texture.id,surface:base.surface};
  }
  const safe=(x,y,a)=>{
    if(x<2||x+a.width>width-2||y-a.height<1||y>=height-2)return false;
    for(let yy=y-a.height+1;yy<=y;yy++)for(let xx=x;xx<x+a.width;xx++){
      const i=yy*width+xx,t=textures.find(t=>t.id===paint[i].id);
      if(t?.liquid||occupied.has(i)||Math.abs(yy-pathY(xx))<=2||Math.hypot(xx-spawn.x,yy-spawn.y)<4)return false;
    }
    return true;
  };
  const place=(a,x,y)=>{if(!safe(x,y,a))return;placed.push({a:a.id,x,y});for(let yy=y-a.height+1;yy<=y;yy++)for(let xx=x;xx<x+a.width;xx++)occupied.add(yy*width+xx);};
  // Species share groves, with size variants interleaved along their treelines.
  const trees=assets.filter(a=>a.environmentKind==='Tree');
  for(let y=5;y<17;y+=3)for(let x=3;x<width-3;x+=3){
    if(trees.length&&((x<15&&y<14)||(x>23&&y>10)))place(trees[(x+y)%trees.length],x,y);
  }
  const props=assets.filter(a=>a.environmentKind!=='Tree');
  for(let n=0;n<props.length;n++){
    const a=props[n];for(let k=0;k<(a.width>1?1:3);k++)place(a,3+(n*7+k*11)%33,5+(n*5+k*7)%20);
  }
  // Give every saved variant a representative placement when space permits.
  for(const a of assets)if(!placed.some(p=>p.a===a.id)){
    let done=false;
    for(let y=5;y<height-2&&!done;y+=2)for(let x=2;x<width-2;x+=2)if(safe(x,y,a)){place(a,x,y);done=true;break;}
  }
  const previousAssets=libraryAssets(),previousTextures=paintTextures();
  try{
    setAssets(assets);
    return fromSaved({...(base.surface==='floor'?{kind:'indoor'}:{}),name:`${collection.title} preview`,width,height,terrain:terrain.join(''),objects:'.'.repeat(width*height),paint,placed,spawn,generatedAssets:assets,textures,npcs:[],interiors:{},links:{}});
  }finally{setAssets(previousAssets);setPaintTextures(previousTextures);}
}

function createInteriorPreviewMap(collection){
  const textures=structuredClone(collection.textures??[]),assets=structuredClone(collection.generatedAssets??[]).map(a=>({...a,...interiorFootprint(a)}));
  const floors=textures.filter(t=>t.surface==='floor'&&!t.liquid),wall=textures.find(t=>t.surface==='wall');
  if(!floors.length||!wall)throw new Error('Generate floor and wall paint before previewing this interior.');
  const width=32,height=24,terrain=[],objects=[],paint={},placed=[],occupied=new Set(),spawn={x:16,y:20};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const border=y<3||x===0||x===width-1||y===height-1;
    const floor=floors.length>1&&x>10&&x<22&&y>8&&y<17?floors[1]:floors[0];
    const texture=border?wall:floor,i=y*width+x;
    terrain.push(floor.terrainCode??'o');objects.push(border?'N':'.');paint[i]={id:texture.id,surface:border?'wall':'floor'};
  }
  for(const a of assets){
    let done=false;
    for(let y=Math.max(5,a.height+3);y<height-3&&!done;y+=3)for(let x=3;x<width-a.width-2;x+=3){
      const cells=[];
      for(let dy=0;dy<a.height;dy++)for(let dx=0;dx<a.width;dx++)cells.push((y-dy)*width+x+dx);
      if(cells.some(i=>occupied.has(i)||i%width>=14&&i%width<=18||Math.floor(i/width)>=18))continue;
      placed.push({a:a.id,x,y});for(const i of cells)occupied.add(i);done=true;break;
    }
  }
  const previousAssets=libraryAssets(),previousTextures=paintTextures();
  try{
    setAssets(assets);
    return fromSaved({name:`${collection.title} preview`,kind:'indoor',wallRows:3,width,height,terrain:terrain.join(''),objects:objects.join(''),paint,placed,spawn,generatedAssets:assets,textures,npcs:[],interiors:{},links:{}});
  }finally{setAssets(previousAssets);setPaintTextures(previousTextures);}
}
