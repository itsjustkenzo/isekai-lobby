import {mapError} from './map-analysis-errors.js';
import {sample,environmentSeed} from './environment-generation.js';

export const REGION_TYPES=['ground','forest','grove','treeline','clearing','bushes','flowers','rocks'];
export function regionSchema(){return {type:'array',description:'Up to 24 coherent landscape regions, not individual scattered objects. Polygons describe ground, forest, grove or clearing areas. Treelines use an ordered polyline.',items:{type:'object',properties:{type:{type:'string',enum:REGION_TYPES},terrain:{type:'string',enum:['keep','g','d','s','a','o','c']},points:{type:'array',items:{type:'object',properties:{x:{type:'integer'},y:{type:'integer'}},required:['x','y'],additionalProperties:false}},width:{type:'integer',description:'Treeline half-width in tiles, 1 to 6; use 1 for polygons.'},density:{type:'string',enum:['dense','medium','sparse']}},required:['type','terrain','points','width','density'],additionalProperties:false}};}

const noise=(x,y,s=0)=>((Math.imul(x+1,73856093)^Math.imul(y+1,19349663)^Math.imul(s+1,83492791))>>>0)%1000/1000;
function polygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
}return inside;}
function distance(x,y,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);}

export function composeTerrainRegions(map,regions,collection,kind){
  if(regions===undefined||(Array.isArray(regions)&&regions.length===0))return map;
  if(!Array.isArray(regions)||regions.length>24)throw mapError('Invalid landscape regions returned by AI.');
  const indoor=kind==='interior',terrain=[...map.terrain],objects=[...map.objects],available=new Set((collection.generatedAssets??[]).map(a=>a.environmentKind??a.name)),codes=new Set((collection.textures??[]).map(t=>t.terrainCode));
  const masks=regions.map(region=>{
    if(!region||!REGION_TYPES.includes(region.type)||!['dense','medium','sparse'].includes(region.density)||!['keep','g','d','s','a','o','c'].includes(region.terrain)||!Number.isInteger(region.width)||region.width<1||region.width>6||!Array.isArray(region.points)||region.points.length<(region.type==='treeline'?2:3)||region.points.length>20||region.points.some(p=>!p||!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x>map.width||p.y>map.height))throw mapError('Invalid landscape region shape returned by AI.');
    const cells=[];
    for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
      const inside=region.type==='treeline'?region.points.slice(1).some((p,k)=>distance(x+.5,y+.5,region.points[k],p)<=region.width-.25+noise(x>>1,y>>1)*.6):polygon(x+.5,y+.5,region.points);
      if(inside)cells.push(y*map.width+x);
    }
    return {...region,cells};
  });
  const clear=new Set(masks.filter(r=>r.type==='clearing').flatMap(r=>r.cells));
  const structural=i=>['N','M','L','X','H','C','K','#'].includes(objects[i]);
  // Paint whole reference regions, including the soil beneath tree symbols. Keep
  // original roads, shorelines and liquid cells intact instead of erasing them.
  for(const region of masks){
    if(region.terrain==='keep'||!codes.has(region.terrain))continue;
    if(indoor?!['o','s','c'].includes(region.terrain):!['g','d','s','a'].includes(region.terrain))continue;
    for(const i of region.cells){
      if(terrain[i]==='w'||structural(i)||(!indoor&&map.terrain[i]==='d'))continue;
      if(clear.has(i)&&region.type!=='clearing')continue;
      if(region.type!=='clearing'&&!['g',region.terrain].includes(terrain[i])&&!indoor)continue;
      terrain[i]=region.terrain;
    }
  }
  for(const i of clear)if(['T','P','B','R','F','S'].includes(objects[i]))objects[i]='.';
  const protectedCells=new Set();
  for(const i of map.assetHints?.Building??[])for(let dy=-2;dy<=1;dy++)for(let dx=-1;dx<=4;dx++)protectedCells.add(i+dy*map.width+dx);
  const dryFree=(x,y)=>{
    if(x<0||y<0||x>=map.width||y>=map.height)return false;const i=y*map.width+x;
    if(clear.has(i)||protectedCells.has(i)||structural(i)||terrain[i]==='w'||map.terrain[i]==='d')return false;
    if(Math.abs(x-map.spawn.x)<=2&&Math.abs(y-map.spawn.y)<=2)return false;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<map.width&&ny<map.height&&['w','d'].includes(map.terrain[ny*map.width+nx]))return false;}
    return true;
  };
  const additions=[],used=new Set(),seed=environmentSeed(`${map.name}:${collection._id}:${map.terrain}`);
  function place(kind,x,y){const i=y*map.width+x;if(!available.has(kind)||used.has(i)||!dryFree(x,y))return;used.add(i);additions.push({kind,x,y});}
  for(let r=0;r<masks.length;r++){
    const region=masks[r];if(indoor||!['forest','grove','treeline','bushes','flowers','rocks'].includes(region.type))continue;
    const kind=({bushes:'Bush',flowers:'Flowers',rocks:'Rock'})[region.type]??'Tree';
    const spacing=region.density==='dense'?2:region.density==='medium'?3:4;
    const cellSet=new Set(region.cells);
    for(const i of region.cells){
      const x=i%map.width,y=Math.floor(i/map.width);
      // Jitter each sampling stratum independently, avoiding repeated rows while
      // retaining the reference's stand/treeline silhouette and density.
      const bx=Math.floor(x/spacing),by=Math.floor(y/spacing);
      if(x%spacing===Math.floor(sample(seed,bx,by,r*2)*spacing)&&y%spacing===Math.floor(sample(seed,bx,by,r*2+1)*spacing))place(kind,x,y);
    }
    if(['forest','grove','treeline'].includes(region.type))for(const i of region.cells){
      const x=i%map.width,y=Math.floor(i/map.width),edge=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!cellSet.has((y+dy)*map.width+x+dx));
      if(edge&&noise(x,y,r)>.82)place('Bush',x,y);
      else if(!edge&&noise(x,y,r+30)>.985)place('Rock',x,y);
    }
  }
  const vegetation=new Set(masks.filter(r=>['forest','grove','treeline','bushes','flowers','rocks'].includes(r.type)).flatMap(r=>r.cells));
  const hints=Object.fromEntries(Object.entries(map.assetHints??{}).map(([name,cells])=>[name,cells.filter(i=>!clear.has(i)&&(!['Tree','Bush','Rock','Flowers'].includes(name)||!vegetation.has(i)))]));
  for(const i of vegetation)if(['T','P','B','R','F'].includes(objects[i]))objects[i]='.';
  return {...map,terrain:terrain.join(''),objects:objects.join(''),assetHints:hints,regionPlacements:additions.slice(0,1200),environmentZones:masks.map(r=>({cells:r.cells,density:r.type==='clearing'?0:({dense:1.7,medium:1,sparse:.45})[r.density]})),clearingCells:[...clear],referenceRoadCells:[...map.terrain].flatMap((code,i)=>code==='d'?[i]:[])};
}
