import {supportsDecor,isSurfaceDecor} from '../client/src/interiorGeometry.js';
import {liquidCell} from '../client/src/world/liquidTextures.js';
import {mapError} from './map-analysis-errors.js';

export const FURNISHING_TYPES=['seating_rows','dining','sleeping','wall_storage','focal','corner_accent'];
export function furnishingSchema(){
  const properties={type:{type:'string',enum:FURNISHING_TYPES},x:{type:'integer',description:'Preferred bottom-left anchor x from the reference, in full-map tiles.'},y:{type:'integer',description:'Preferred bottom-left anchor y from the reference, in full-map tiles.'},zone:{type:'string',enum:['north','west','east','centre','south','corners']},primaryAssetId:{type:'string'},secondaryAssetId:{type:'string'},accentAssetId:{type:'string'},count:{type:'integer',minimum:1,maximum:6}};
  return {type:'array',maxItems:12,description:'Functional furniture groups using exact saved asset IDs. Empty IDs omit optional members. Code calculates positions and preserves circulation.',items:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}};
}

export function furnishInterior(map,groups,collection,{preserveReference=false}={}){
  const assets=new Map((collection.generatedAssets??[]).map(a=>[a.id,a])),w=map.width,h=map.height,doorX=Math.floor(w/2);
  if(groups===undefined)groups=[];
  if(!Array.isArray(groups)||groups.length>12)throw mapError('Invalid interior furnishing groups.');
  for(const g of groups){
    if(!g||!FURNISHING_TYPES.includes(g.type)||!['north','west','east','centre','south','corners'].includes(g.zone)||!Number.isInteger(g.count)||g.count<1||g.count>6||!assets.has(g.primaryAssetId)||[g.secondaryAssetId,g.accentAssetId].some(id=>typeof id!=='string'||id&&!assets.has(id)))throw mapError('Invalid interior furnishing group or saved asset reference.');
  }
  const hasAisle=groups.some(g=>g.type==='seating_rows');
  for(const g of groups)if((g.x!==undefined||g.y!==undefined)&&(!Number.isInteger(g.x)||!Number.isInteger(g.y)||g.x<0||g.x>=w||g.y<0||g.y>=h))throw mapError('Invalid furnishing group reference anchor.');
  const grouped=new Set(groups.flatMap(g=>[g.primaryAssetId,g.secondaryAssetId,g.accentAssetId]).filter(Boolean));
  let placed=[];const occupied=new Set();
  const cells=p=>{const a=assets.get(p.a),out=[];for(let dy=0;dy<a.height;dy++)for(let dx=0;dx<a.width;dx++)out.push({x:p.x+dx,y:p.y-dy});return out;};
  const floor=(x,y)=>x>0&&x<w-1&&y>=3&&y<h&&!(y===h-1&&x!==doorX)&&!['N','M','L','X'].includes(map.objects[y*w+x])&&!liquidCell(map,x,y,map.textures);
  const flood=solid=>{
    const start=(h-1)*w+doorX,seen=new Set();if(solid.has(start)||!floor(doorX,h-1))return seen;
    const queue=[start];seen.add(start);
    for(let k=0;k<queue.length;k++){const i=queue[k],x=i%w,y=Math.floor(i/w);for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){const n=ny*w+nx;if(floor(nx,ny)&&!solid.has(n)&&!seen.has(n)){seen.add(n);queue.push(n);}}}
    return seen;
  };
  const baseReach=flood(new Set());
  function commit(batch){
    const used=new Set(occupied),solid=new Set(placed.filter(p=>!p.supportAssetId&&assets.get(p.a)?.solid).flatMap(p=>cells(p).map(c=>c.y*w+c.x)));
    for(const p of batch){
      const a=assets.get(p.a);if(!a)return false;
      for(const {x,y} of cells(p)){
        const i=y*w+x;
        if(!floor(x,y)||used.has(i)||Math.abs(x-doorX)<=1&&y>=(hasAisle?7:h-3)||Math.abs(x-map.spawn.x)<=1&&Math.abs(y-map.spawn.y)<=1)return false;
        used.add(i);if(a.solid)solid.add(i);
      }
    }
    const reachable=flood(solid);
    if([...baseReach].some(i=>!solid.has(i)&&!reachable.has(i)))return false;
    if([...placed,...batch].filter(p=>!p.supportAssetId).some(p=>!cells(p).some(({x,y})=>[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([nx,ny])=>reachable.has(ny*w+nx)))))return false;
    placed.push(...batch);for(const i of used)occupied.add(i);return true;
  }
  const anchors=(zone,preferred)=>{
    const target=preferred&&Number.isInteger(preferred.x)?[preferred.x,preferred.y]:{north:[w/2,4],west:[3,h/2],east:[w-5,h/2],centre:[w/2,h/2],south:[w/2,h-5],corners:[2,4]}[zone],out=[];
    for(let y=4;y<h-2;y++)for(let x=2;x<w-2;x++){
      if(!preferred&&(zone==='west'&&x>=doorX-1||zone==='east'&&x<=doorX+1||zone==='north'&&y>7||zone==='south'&&y<h-7||zone==='corners'&&!(x<=3||x>=w-5)))continue;
      out.push({x,y,d:Math.abs(x-target[0])+Math.abs(y-target[1])});
    }
    if(preserveReference&&preferred)return out.filter(p=>p.d<=3).sort((a,b)=>a.d-b.d||a.y-b.y||a.x-b.x);
    return out.sort((a,b)=>a.d-b.d||a.y-b.y||a.x-b.x);
  };
  let completed=0;
  for(const g of groups){
    const a=assets.get(g.primaryAssetId),b=assets.get(g.secondaryAssetId),c=assets.get(g.accentAssetId);
    for(const {x,y} of anchors(g.zone,Number.isInteger(g.x)?g:undefined)){
      const batch=[{a:a.id,x,y}];
      if(g.type==='seating_rows')for(let n=1;n<g.count;n++)batch.push({a:a.id,x,y:y+n*(a.height+1)});
      if(g.type==='dining'&&b){batch.push({a:b.id,x:x-b.width,y},{a:b.id,x:x+a.width,y});}
      if(g.type==='sleeping'&&b)batch.push({a:b.id,x:x+a.width,y:y-a.height+b.height});
      if(c&&!isSurfaceDecor(c))batch.push({a:c.id,x:x+a.width+1,y});
      let accepted=commit(batch);
      while(!accepted&&g.type==='seating_rows'&&batch.length>1){batch.pop();accepted=commit(batch);}
      if(accepted){
        const support=[...batch].find(p=>supportsDecor(assets.get(p.a)));
        if(c&&isSurfaceDecor(c)&&support)placed.push({a:c.id,x:support.x,y:support.y,supportAssetId:support.a,supportX:support.x,supportY:support.y,elevation:10});
        completed++;break;
      }
    }
  }
  // Keep valid reference landmarks and finishing touches; omit unsafe ones.
  for(const p of map.placed??[])if(!grouped.has(p.a)){
    if(isSurfaceDecor(assets.get(p.a))){
      const support=placed.filter(q=>!q.supportAssetId&&supportsDecor(assets.get(q.a))).sort((a,b)=>(Math.abs(a.x-p.x)+Math.abs(a.y-p.y))-(Math.abs(b.x-p.x)+Math.abs(b.y-p.y)))[0];
      if(support&&!placed.some(q=>q.supportAssetId===support.a&&q.supportX===support.x&&q.supportY===support.y)){placed.push({...p,x:support.x,y:support.y,supportAssetId:support.a,supportX:support.x,supportY:support.y,elevation:10});continue;}
    }
    if(commit([p]))continue;
    if(preserveReference)continue;
    const nearby=anchors('centre').sort((a,b)=>(Math.abs(a.x-p.x)+Math.abs(a.y-p.y))-(Math.abs(b.x-p.x)+Math.abs(b.y-p.y)));
    for(const point of nearby)if(commit([{...p,x:point.x,y:point.y}]))break;
  }
  return {...map,placed,furnishingReport:{requested:groups.length,completed,omitted:groups.length-completed}};
}
