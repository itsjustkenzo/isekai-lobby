import {isMajorFurniture,inferFurnitureAssembly,furnitureCandidates} from './interior-assemblies.js';
import {liquidCell} from '../client/src/world/liquidTextures.js';
import {mapError} from './map-analysis-errors.js';

export const FURNISHING_TYPES=['seating_rows','dining','sleeping','wall_storage','focal','corner_accent','service_counter'];
export function furnishingSchema(){
  const properties={type:{type:'string',enum:FURNISHING_TYPES},x:{type:'integer',description:'Preferred bottom-left anchor x from the reference, in full-map tiles.'},y:{type:'integer',description:'Preferred bottom-left anchor y from the reference, in full-map tiles.'},zone:{type:'string',enum:['north','west','east','centre','south','corners']},primaryAssetId:{type:'string'},secondaryAssetId:{type:'string'},accentAssetId:{type:'string',enum:[''],description:'Small decorations are disabled for new layouts.'},count:{type:'integer',minimum:1,maximum:6,description:'Number of complete assemblies distributed across this zone; for seating_rows, number of aligned rows.'}};
  return {type:'array',maxItems:12,description:'Functional furniture groups using exact saved asset IDs. Empty IDs omit optional members. Code calculates positions and preserves circulation.',items:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}};
}

export function furnishInterior(map,groups,collection,{preserveReference=false,packed=false}={}){
  const assets=new Map((collection.generatedAssets??[]).map(a=>[a.id,a])),w=map.width,h=map.height,doorX=Math.floor(w/2);
  if(groups===undefined)groups=[];
  if(!Array.isArray(groups)||groups.length>12)throw mapError('Invalid interior furnishing groups.');
  for(const g of groups){
    if(!g||!FURNISHING_TYPES.includes(g.type)||!['north','west','east','centre','south','corners'].includes(g.zone)||!Number.isInteger(g.count)||g.count<1||g.count>6||!assets.has(g.primaryAssetId)||[g.secondaryAssetId,g.accentAssetId].some(id=>typeof id!=='string'||id&&!assets.has(id)))throw mapError('Invalid interior furnishing group or saved asset reference.');
  }
  const explicitIds=new Set(groups.flatMap(g=>[g.primaryAssetId,g.secondaryAssetId]));
  let converted=0,ignoredFurniture=0;
  const generated=[];
  for(const p of map.placed??[]){
    const asset=assets.get(p.a);if(!isMajorFurniture(asset)||explicitIds.has(p.a))continue;
    const inferred=inferFurnitureAssembly(asset,collection,p);
    if(inferred&&groups.length+generated.length<24){generated.push(inferred);converted++;}else ignoredFurniture++;
  }
  groups=[...groups,...generated];
  const hasAisle=groups.some(g=>g.type==='seating_rows');
  for(const g of groups)if((g.x!==undefined||g.y!==undefined)&&(!Number.isInteger(g.x)||!Number.isInteger(g.y)||g.x<0||g.x>=w||g.y<0||g.y>=h))throw mapError('Invalid furnishing group reference anchor.');
  let placed=[];const occupied=new Set(),assemblyBounds=[];
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
    const footprint=batch.flatMap(cells);
    const bounds={left:Math.min(...footprint.map(c=>c.x)),right:Math.max(...footprint.map(c=>c.x)),top:Math.min(...footprint.map(c=>c.y)),bottom:Math.max(...footprint.map(c=>c.y))};
    // Keep a tile of circulation between complete sets, not between their members.
    const gap=packed?0:1;
    if(assemblyBounds.some(b=>bounds.left<=b.right+gap&&bounds.right>=b.left-gap&&bounds.top<=b.bottom+gap&&bounds.bottom>=b.top-gap))return false;
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
    placed.push(...batch);assemblyBounds.push(bounds);for(const i of used)occupied.add(i);return true;
  }
  const anchors=(zone,preferred)=>{
    const target=preferred&&Number.isInteger(preferred.x)?[preferred.x,preferred.y]:{north:[w/2,4],west:[3,h/2],east:[w-5,h/2],centre:[w/2,h/2],south:[w/2,h-5],corners:[2,4]}[zone],out=[];
    for(let y=3;y<h-2;y++)for(let x=1;x<w-1;x++){
      if(!preferred&&(zone==='west'&&x>=doorX-1||zone==='east'&&x<=doorX+1||zone==='north'&&y>7||zone==='south'&&y<h-7||zone==='corners'&&!(x<=3||x>=w-5)))continue;
      out.push({x,y,d:Math.abs(x-target[0])+Math.abs(y-target[1])});
    }
    if(preserveReference&&preferred)return out.filter(p=>p.d<=3).sort((a,b)=>a.d-b.d||a.y-b.y||a.x-b.x);
    return out.sort((a,b)=>a.d-b.d||a.y-b.y||a.x-b.x);
  };
  // Repetition is explicit in the plan: a busy hall can request several dining
  // sets without prescribing every chair coordinate. Sparse scenes stay sparse.
  const expanded=groups.flatMap(g=>{
    if(g.type==='seating_rows'||g.count===1)return [g];
    const west=g.zone==='west',east=g.zone==='east';
    const left=west?2:east?doorX+2:2,right=west?doorX-3:east?w-4:w-4;
    const wallBound=g.type==='wall_storage'||g.type==='service_counter';
    const columns=wallBound&&!west&&!east?g.count:west||east?1:Math.min(2,g.count),rows=Math.ceil(g.count/columns);
    const asset=assets.get(g.primaryAssetId),inset=g.type==='service_counter'?3:1;
    return Array.from({length:g.count},(_,i)=>({...g,count:1,
      x:wallBound&&west?inset:wallBound&&east?w-inset-asset.width:Math.round(left+(right-left)*(i%columns+.5)/columns),
      y:wallBound&&!west&&!east?asset.height+(g.type==='service_counter'?4:2):Math.round(4+(h-9)*(Math.floor(i/columns)+.5)/rows),
      // Wall groups still obey their wall alignment checks below.
    }));
  });
  let completed=0;
  for(const g of expanded){
    const a=assets.get(g.primaryAssetId);
    if(!isMajorFurniture(a))continue;
    for(const {x,y} of anchors(g.zone,Number.isInteger(g.x)?g:undefined)){
      if(g.type==='wall_storage'&&!(x===1||x+a.width===w-1||y-a.height+1===3))continue;
      if(g.type==='service_counter'&&!(x===3||x+a.width===w-3||y-a.height+1===5))continue;
      const candidates=furnitureCandidates(g,assets,x,y);
      let accepted=false;
      for(const candidate of candidates)if(commit(candidate)){accepted=true;break;}
      if(accepted){
        completed++;break;
      }
    }
  }
  // Busy dining rooms need a measured density pass, not just a prompt asking
  // for more furniture. Count complete set envelopes (including seating), while
  // commit still enforces real collision, circulation and interaction access.
  const brief=`${collection.title??''} ${collection.description??''}`;
  const dining=expanded.filter(g=>g.type==='dining'&&placed.some(p=>p.a===g.primaryAssetId));
  const sparse=/\b(empty|sparse|sparsely|unfurnished|open floor|dance floor)\b/i.test(brief);
  const busy=!sparse&&(packed||dining.length>=3||/\b(tavern|inn|guild|canteen|dining hall|banquet|restaurant|mess hall)\b/i.test(brief));
  const envelopeArea=()=>assemblyBounds.reduce((n,b)=>n+(b.right-b.left+1)*(b.bottom-b.top+1),0);
  const targetCoverage=busy?(packed?65:42):0;
  const targetArea=Math.ceil(baseReach.size*targetCoverage/100);
  let added=0;
  const repeatable=packed?expanded.filter(g=>['dining','sleeping'].includes(g.type)&&placed.some(p=>p.a===g.primaryAssetId)):dining;
  if(busy&&repeatable.length){
    for(let attempt=0;attempt<48&&envelopeArea()<targetArea;attempt++){
      let accepted=false;
      for(let offset=0;offset<repeatable.length&&!accepted;offset++){
        const g=repeatable[(attempt+offset)%repeatable.length];
        const tableAnchors=placed.filter(p=>p.a===g.primaryAssetId);
        const positions=anchors('centre').map(p=>({...p,aligned:tableAnchors.some(t=>t.x===p.x)&&tableAnchors.some(t=>(p.y-t.y)%4===0)?1:0,space:Math.min(...assemblyBounds.map(b=>Math.abs(p.x-(b.left+b.right)/2)+Math.abs(p.y-(b.top+b.bottom)/2)))})).sort((a,b)=>b.aligned-a.aligned||b.space-a.space||a.y-b.y||a.x-b.x);
        for(const {x,y} of positions){
          if(furnitureCandidates(g,assets,x,y).slice(0,1).some(candidate=>commit(candidate))){accepted=true;added++;break;}
        }
      }
      if(!accepted)break; // All remaining gaps are too small or unsafe.
    }
  }
  if(packed&&busy){
    const storage=[...assets.values()].filter(a=>isMajorFurniture(a)&&/\b(shelf|shelves|cabinet|cupboard|wardrobe|storage|bookcase|notice board)\b/i.test(a.name));
    for(const a of storage){
      let copies=0;
      for(const {x,y} of anchors('centre')){
        if(envelopeArea()>=targetArea||copies>=4)break;
        if(!(x===1||x+a.width===w-1||y-a.height+1===3))continue;
        if(commit([{a:a.id,x,y}])){added++;copies++;}
      }
    }
  }
  // Never fill spare floor with loose chairs or small decorations.
  return {...map,placed,furnishingReport:{requested:expanded.length,completed,omitted:expanded.length-completed,converted,ignoredFurniture,addedForDensity:added,coverage:Math.round(envelopeArea()/Math.max(1,baseReach.size)*100),targetCoverage}};
}
