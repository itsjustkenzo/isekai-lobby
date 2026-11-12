import {terrainPropKind} from './terrain-prop-kind.js';

export const isMinorInteriorItem=a=>/\b(mugs?|tankards?|plates?|papers?|books?|buckets?|candles?|lamps?|lanterns?|chandeliers?|cups?|bottles?|vases?|flower pots?)\b/i.test(a?.name??'');
export const isMajorFurniture=a=>a&&!isMinorInteriorItem(a)&&(a.assetKind==='Furniture'||['Bed','Table','Chair'].includes(terrainPropKind(a)));
export function inferFurnitureAssembly(asset,collection,p){
  const kind=terrainPropKind(asset),others=collection.generatedAssets??[];
  if(kind==='Chair')return null; // Never scatter unattached spare seating.
  const type=kind==='Table'?'dining':kind==='Bed'?'sleeping':/\b(counter|bar|reception)\b/i.test(asset.name??'')?'service_counter':/\b(shelf|shelves|cabinet|cupboard|wardrobe|board|storage)\b/i.test(asset.name??'')?'wall_storage':'focal';
  const secondary=type==='dining'||type==='service_counter'?others.find(a=>terrainPropKind(a)==='Chair'):type==='sleeping'?others.find(a=>/\b(nightstand|bedside)\b/i.test(a.name??'')):null;
  return {type,zone:type==='wall_storage'||type==='service_counter'?'north':p.x<8?'west':'east',x:p.x,y:p.y,primaryAssetId:asset.id,secondaryAssetId:secondary?.id??'',accentAssetId:'',count:1};
}

// Each candidate is a complete assembly. Members are accepted or omitted together.
export function furnitureCandidates(g,assets,x,y){
  const a=assets.get(g.primaryAssetId),b=assets.get(g.secondaryAssetId),anchor={a:a.id,x,y};
  if(terrainPropKind(a)==='Chair'&&g.type!=='seating_rows')return [];
  if(g.type==='dining'){
    if(terrainPropKind(a)!=='Table'||!b||terrainPropKind(b)!=='Chair')return [];
    const side=[anchor,{a:b.id,x:x-b.width,y},{a:b.id,x:x+a.width,y}];
    const middle=x+Math.floor((a.width-b.width)/2);
    return [[...side,{a:b.id,x:middle,y:y-a.height},{a:b.id,x:middle,y:y+b.height}],side];
  }
  if(g.type==='service_counter'){
    if(!b||terrainPropKind(b)!=='Chair')return [[anchor]];
    const seats=[];for(let n=0;n<Math.min(3,Math.max(1,Math.floor(a.width/b.width)));n++)seats.push({a:b.id,x:x+n*b.width,y:y+b.height+1});
    return [[anchor,...seats],[anchor,seats[0]]];
  }
  if(g.type==='sleeping')return b?[[anchor,{a:b.id,x:x+a.width,y:y-a.height+b.height}],[anchor,{a:b.id,x:x-b.width,y:y-a.height+b.height}]]:[[anchor]];
  if(g.type==='seating_rows'){
    if(terrainPropKind(a)!=='Chair')return [];
    const candidates=[];
    for(let rows=g.count;rows>=1;rows--)candidates.push(Array.from({length:rows},(_,n)=>({a:a.id,x,y:y+n*(a.height+1)})));
    return candidates;
  }
  return [[anchor]];
}
