import {createHash} from 'node:crypto';
import {environmentRegistry,STRUCTURE_KINDS} from './environment-rules.js';
import {isLiquidTexture,liquidCell} from '../client/src/world/liquidTextures.js';

export function environmentSeed(value){return createHash('sha256').update(String(value)).digest().readUInt32LE(0);}
export function sample(seed,x,y,channel=0){let v=(seed^Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(channel+1,1274126177))>>>0;v=Math.imul(v^(v>>>13),1274126177);return ((v^(v>>>16))>>>0)/4294967296;}
export function densityNoise(seed,x,y,scale=9,channel=0){
  const ix=Math.floor(x/scale),iy=Math.floor(y/scale),smooth=t=>t*t*(3-2*t),fx=smooth(x/scale-ix),fy=smooth(y/scale-iy);
  const a=sample(seed,ix,iy,channel),b=sample(seed,ix+1,iy,channel),c=sample(seed,ix,iy+1,channel),d=sample(seed,ix+1,iy+1,channel);
  return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
}
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

// Global-coordinate noise and hash priorities make chunk boundaries invisible.
// The chunks only bound work; spacing lookups always include neighbouring chunks.
export function populateEnvironment(map,collection,kind,layout={},seed=environmentSeed(`${map.name}:${collection._id}:${map.terrain}`),options={}){
  const registry=environmentRegistry(collection,kind),{width:w,height:h}=map,assets=new Map(map.generatedAssets.map(a=>[a.id,a]));
  const terrain=[...map.terrain],paint={...map.paint},placed=map.placed.map(p=>({...p})),occupied=new Set(),solid=new Set(),bins=new Map(),reserved=new Set([...(layout.clearingCells??[]),...(layout.referenceRoadCells??[])]);
  const zoneDensity=new Float32Array(w*h).fill(1);
  for(const zone of layout.environmentZones??[])for(const i of zone.cells)zoneDensity[i]=zone.density;
  const roleFor=a=>STRUCTURE_KINDS.has(a?.environmentKind??a?.assetKind??a?.name)?'structure':registry.entries.find(e=>e.asset.id===a?.id)?.rule.role;
  const addBin=(p,rule)=>{const key=`${Math.floor(p.x/4)},${Math.floor(p.y/4)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push({...p,role:rule?.role,spacing:rule?.spacing??1});};
  const nearby=(x,y,r)=>{const found=[];for(let by=Math.floor((y-r)/4);by<=Math.floor((y+r)/4);by++)for(let bx=Math.floor((x-r)/4);bx<=Math.floor((x+r)/4);bx++)for(const p of bins.get(`${bx},${by}`)??[])if(Math.hypot(x-p.x,y-p.y)<=r)found.push(p);return found;};
  for(const p of placed){const a=assets.get(p.a);for(let dy=0;dy<(a?.height??1);dy++)for(let dx=0;dx<(a?.width??1);dx++){const i=(p.y-dy)*w+p.x+dx;occupied.add(i);if(a?.solid)solid.add(i);}addBin(p,{role:roleFor(a),spacing:registry.entries.find(e=>e.asset.id===a?.id)?.rule.spacing??1});}
  for(const p of placed){const a=assets.get(p.a);if(!a?.building)continue;for(let y=p.y-a.height;y<=p.y+1;y++)for(let x=p.x-1;x<=p.x+a.width;x++)if(x>=0&&y>=0&&x<w&&y<h)reserved.add(y*w+x);}
  const safe=i=>{
    const x=i%w,y=Math.floor(i/w);
    return x>=0&&y>=0&&x<w&&y<h&&!(kind==='exterior'&&(x<3||x>=w-3||y<5||y>=h-3))&&!reserved.has(i)&&Math.hypot(x-map.spawn.x,y-map.spawn.y)>3&&!liquidCell(map,x,y,map.textures)&&['.','F'].includes(map.objects[i]);
  };
  // A solid addition must leave all formerly connected sides connected around
  // its footprint. This conservatively protects narrow routes and doorways.
  const keepsAccess=(x,y,a)=>{
    if(!a.solid)return true;
    const ring=new Set();
    for(let py=y-a.height;py<=y+1;py++)for(let px=x-1;px<=x+a.width;px++){
      if(px<0||py<0||px>=w||py>=h||(px>=x&&px<x+a.width&&py>y-a.height&&py<=y))continue;
      const j=py*w+px;if(!solid.has(j)&&!liquidCell(map,px,py,map.textures)&&['.','F','G','E'].includes(map.objects[j]))ring.add(j);
    }
    if(!ring.size)return false;const q=[ring.values().next().value],seen=new Set(q);
    for(let k=0;k<q.length;k++){const i=q[k],px=i%w;for(const j of [px?i-1:-1,px<w-1?i+1:-1,i-w,i+w])if(ring.has(j)&&!seen.has(j)){seen.add(j);q.push(j);}}
    return seen.size===ring.size;
  };
  const materials=map.textures.filter(t=>t.surface===(kind==='interior'?'floor':'ground')&&!isLiquidTexture(t));
  const byTexture=new Map(map.textures.map(t=>[t.id,t]));
  let patchCells=0;
  // Only explicitly compatible material groups blend. Legacy collections use
  // their base ground plus a modest amount of their own saved soil/stone paint.
  for(let i=0;i<w*h;i++){
    if(!safe(i)||occupied.has(i))continue;
    const x=i%w,y=Math.floor(i/w),current=byTexture.get(paint[i]?.id);
    const compatible=registry.surfaces[current?.terrainCode]?.alternatives??[];
    const choices=materials.filter(t=>t.id!==current?.id&&compatible.includes(t.terrainCode));
    if(!choices.length)continue;
    const field=.75*densityNoise(seed,x,y,10,12)+.25*densityNoise(seed,x,y,3,13);
    if(field>1-clamp(registry.profile.patchCoverage,0,.4)){
      const t=choices[Math.floor(sample(seed,Math.floor(x/12),Math.floor(y/12),14)*choices.length)];
      paint[i]={id:t.id,surface:t.surface};if(t.terrainCode)terrain[i]=t.terrainCode;patchCells++;
    }
  }
  const candidates=[],chunkSize=clamp(options.chunkSize??16,4,64);
  for(let cy=0;cy<h;cy+=chunkSize)for(let cx=0;cx<w;cx+=chunkSize)for(let y=cy;y<Math.min(h,cy+chunkSize);y++)for(let x=cx;x<Math.min(w,cx+chunkSize);x++){
    const i=y*w+x;if(safe(i)&&!occupied.has(i))candidates.push({x,y,i,priority:sample(seed,x,y,1)});
  }
  candidates.sort((a,b)=>a.priority-b.priority||a.i-b.i);
  let added=0;
  for(const {x,y,i} of candidates){
    if(placed.length>=Math.min(1500,Math.floor(w*h*.4)))break;
    const local=nearby(x,y,8),density=clamp(registry.profile.density*zoneDensity[i],.0,.35),field=densityNoise(seed,x,y,9,2),fine=densityNoise(seed,x,y,3,3);
    // Low-frequency empty areas and dense pockets are intentional; existing
    // landmarks bias associated details without saturating their surroundings.
    if(sample(seed,x,y,4)>density*(.25+field*1.9+fine*.5))continue;
    const eligible=registry.entries.filter(({asset:a,rule:r})=>{
      if(r.terrainCodes&&!r.terrainCodes.includes(terrain[i]))return false;
      if(r.surfaceIds&&!r.surfaceIds.includes(paint[i]?.id))return false;
      if(r.nearRole&&!local.some(p=>p.role===r.nearRole&&Math.hypot(x-p.x,y-p.y)<=(r.nearDistance??4)))return false;
      if(local.some(p=>Math.hypot(x-p.x,y-p.y)<Math.max(clamp(r.spacing,1,8),p.spacing)))return false;
      for(let dy=0;dy<a.height;dy++)for(let dx=0;dx<a.width;dx++){
        const px=x+dx,py=y-dy,j=py*w+px;
        if(px>=w||py<0||!safe(j)||occupied.has(j))return false;
      }
      return keepsAccess(x,y,a);
    });
    const weighted=eligible.map(e=>({e,weight:Math.max(0,e.rule.weight)*(e.rule.sizeWeights?.[e.asset.sizeVariant]??1)*(.15+(1-e.rule.cluster)+densityNoise(seed,x,y,7,environmentSeed(e.rule.role??e.key))*e.rule.cluster*2)*(local.some(p=>p.role===e.rule.role)?1.4:1)}));
    let total=weighted.reduce((s,e)=>s+e.weight,0),roll=sample(seed,x,y,5)*total;if(!total)continue;
    const chosen=weighted.find(e=>(roll-=e.weight)<=0)?.e??weighted.at(-1).e,a=chosen.asset,p={a:a.id,x,y};
    placed.push(p);added++;addBin(p,chosen.rule);
    for(let dy=0;dy<a.height;dy++)for(let dx=0;dx<a.width;dx++){const j=(y-dy)*w+x+dx;occupied.add(j);if(a.solid)solid.add(j);}
  }
  placed.sort((a,b)=>a.y-b.y||a.x-b.x||a.a.localeCompare(b.a));
  return {...map,terrain:terrain.join(''),paint,placed,environmentReport:{seed,biome:registry.biome,added,patchCells,missingAssets:registry.missing}};
}
