import {furnishingSchema} from './interior-furnishing.js';
import {terrainPropKind} from './terrain-prop-kind.js';
import { mapError } from './map-analysis-errors.js';
import {regionSchema,composeTerrainRegions} from './terrain-composition.js';

export const PROP_KINDS=['Tree','Bush','Rock','Flowers','Potted plant','Log','Barrel','Building','Bed','Table','Chair','Furniture','Indoor prop'];
export function dressingSchema(size,kind){
  const point={type:'integer',description:'Zero-based map tile coordinate; keep it inside the target grid.'};
  return {
    ...(kind==='interior'?{furnishingGroups:furnishingSchema()}:{}),
    regions:regionSchema(),
    patches:{type:'array',description:'At most 24 ground patches.',items:{type:'object',properties:{terrain:{type:'string',enum:kind==='interior'?['o','s','c']:['g','d','s','a']},x:{...point,description:`x from 0 through ${size.width-1}`},y:{...point,description:`y from 0 through ${size.height-1}`},radius:{type:'integer',description:'Radius from 1 through 5 tiles.'}},required:['terrain','x','y','radius'],additionalProperties:false}},
    placements:{type:'array',description:'At most 300 prop placements. Buildings must choose a suitable saved building ID, using bottom-left footprint coordinates.',items:{type:'object',properties:{kind:{type:'string',enum:PROP_KINDS},assetId:{type:'string',description:'Exact saved prop asset id, or empty string when selecting by kind.'},buildingId:{type:'string',description:'Exact saved building id for Building placements; empty string for other props.'},x:{...point,description:`x from 0 through ${size.width-1}`},y:{...point,description:`y from 0 through ${size.height-1}`}},required:['kind','assetId','buildingId','x','y'],additionalProperties:false}},
  };
}

export function applyTerrainDressing(map,plan,collection,kind){
  map=composeTerrainRegions(map,plan?.regions,collection,kind);
  const patches=plan?.patches??[],placements=plan?.placements??[],indoor=kind==='interior';
  const validPoint=p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<map.width&&p.y<map.height;
  if(!Array.isArray(patches)||patches.length>24||!Array.isArray(placements)||placements.length>300)throw mapError('Invalid decoration plan returned by AI.');
  const terrain=[...map.terrain],codes=new Set((collection.textures??[]).map(t=>t.terrainCode));
  for(const patch of patches){
    if(!validPoint(patch)||!Number.isInteger(patch.radius)||patch.radius<1||patch.radius>5||!(indoor?['o','s','c']:['g','d','s','a']).includes(patch.terrain))throw mapError('Invalid ground patch returned by AI.');
    if(!codes.has(patch.terrain))continue;
    for(let dy=-patch.radius;dy<=patch.radius;dy++)for(let dx=-patch.radius;dx<=patch.radius;dx++){
      const x=patch.x+dx,y=patch.y+dy;if(x<0||y<0||x>=map.width||y>=map.height)continue;
      const i=y*map.width+x;
      if((indoor?!['o','s','c'].includes(terrain[i]):terrain[i]!=='g')||map.objects[i]!=='.')continue;
      // Stable, irregular one-tile edges instead of rectangular stamps.
      const noise=((Math.imul(x+1,73856093)^Math.imul(y+1,19349663))>>>0)%100/100;
      if(Math.hypot(dx,dy) > patch.radius-.65+noise*.9)continue;
      terrain[i]=patch.terrain;
    }
  }
  const available=new Set((collection.generatedAssets??[]).map(terrainPropKind)),kept=[],seen=new Set(),clear=new Set(map.clearingCells??[]),roads=new Set(map.referenceRoadCells??[...map.terrain].flatMap((code,i)=>code==='d'?[i]:[]));
  for(const p of [...(map.regionPlacements??[]),...placements]){
    if(!validPoint(p)||!PROP_KINDS.includes(p.kind))throw mapError('Invalid prop position returned by AI.');
    if(p.buildingId&&(p.kind!=='Building'||!collection.generatedAssets?.some(a=>a.id===p.buildingId&&(a.assetKind==='Building'||a.name==='Building'))))throw mapError('AI selected an unavailable building. Please retry layout analysis.');
    if(p.assetId&&!collection.generatedAssets?.some(a=>a.id===p.assetId&&terrainPropKind(a)===p.kind))throw mapError('AI selected an unavailable prop asset. Please retry layout analysis.');
    if(!available.has(p.kind))continue;
    const i=p.y*map.width+p.x,key=`${p.kind}:${i}`;
    if(clear.has(i)||seen.has(key)||terrain[i]==='w'||['N','M','L','X'].includes(map.objects[i]))continue;
    // Trees/bushes and props should not obstruct preserved roads or paved routes.
    if(!indoor&&roads.has(i)&&p.kind!=='Flowers')continue;
    seen.add(key);kept.push({...p});
  }
  return {...map,terrain:terrain.join(''),propPlacements:kept};
}
