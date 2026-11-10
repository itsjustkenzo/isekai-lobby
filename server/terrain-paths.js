import {isLiquidTexture,liquidCell} from '../client/src/world/liquidTextures.js';
import {mapError} from './map-analysis-errors.js';
import {ENVIRONMENT_RULES} from './environment-rules.js';

// Route on the finished footprint layer. Vegetation is a removable cost; water,
// buildings and the physical tree border are hard obstacles.
export function connectTerrainPaths(map,layout={}){
  const {width:w,height:h}=map,n=w*h,assets=new Map(map.generatedAssets.map(a=>[a.id,a]));
  const neighbours=i=>[i%w?i-1:-1,i%w<w-1?i+1:-1,i>=w?i-w:-1,i<n-w?i+w:-1].filter(i=>i>=0);
  const oldBorder=i=>i%w<2||i%w>=w-2||Math.floor(i/w)<4||Math.floor(i/w)>=h-2;
  const trees=new Set(map.placed.filter(p=>assets.get(p.a)?.environmentKind==='Tree'&&assets.get(p.a)?.solid).map(p=>p.y*w+p.x));
  // Preserve existing physical tree walls, but do not impose their old footprint
  // on new maps whose edges are ordinary playable terrain.
  let treeWall=true;for(let i=0;i<n;i++)if(oldBorder(i)&&!trees.has(i)){treeWall=false;break;}
  const boundary=i=>treeWall&&oldBorder(i);
  const footprint=p=>{const a=assets.get(p.a),cells=[];for(let dy=0;dy<(a?.height??1);dy++)for(let dx=0;dx<(a?.width??1);dx++)cells.push((p.y-dy)*w+p.x+dx);return cells;};
  const removable=new Set(layout.environmentRemovableIds??[]);
  const natural=p=>removable.has(p.a)||Boolean(ENVIRONMENT_RULES[assets.get(p.a)?.environmentKind??assets.get(p.a)?.assetKind??assets.get(p.a)?.name]);
  const hard=new Set(),soft=new Set();
  for(let i=0;i<n;i++)if(boundary(i)||liquidCell(map,i%w,Math.floor(i/w),map.textures)||!['.','F','G','E','T','R'].includes(map.objects[i]))hard.add(i);
  for(const p of map.placed)if(assets.get(p.a)?.solid){for(const i of footprint(p))(natural(p)&&!boundary(i)?soft:hard).add(i);}
  const groups=cells=>{const pending=new Set(cells.filter(i=>i>=0&&i<n&&!hard.has(i))),out=[];while(pending.size){const q=[pending.values().next().value];pending.delete(q[0]);for(let k=0;k<q.length;k++)for(const j of neighbours(q[k]))if(pending.delete(j))q.push(j);out.push(q);}return out;};
  const representative=cells=>{const cx=cells.reduce((s,i)=>s+i%w,0)/cells.length,cy=cells.reduce((s,i)=>s+Math.floor(i/w),0)/cells.length;return cells.reduce((a,b)=>Math.hypot(b%w-cx,Math.floor(b/w)-cy)<Math.hypot(a%w-cx,Math.floor(a/w)-cy)?b:a);};
  const targets=[];
  for(const p of map.placed){const a=assets.get(p.a);if((a?.environmentKind??a?.assetKind??a?.name)!=='Building')continue;const cells=footprint(p),rim=[...new Set(cells.flatMap(neighbours))].filter(i=>!cells.includes(i)&&!hard.has(i));if(!rim.length)throw mapError('A building has no dry entrance. Try a reference with more space around buildings.',422);const front=(p.y+1)*w+p.x+(a.building?.entranceX??Math.floor(a.width/2));targets.push(rim.includes(front)?front:representative(rim));}
  for(const group of groups(layout.clearingCells??[]))if(group.length>=4)targets.push(representative(group));
  const roads=layout.referenceRoadCells??[],roadSet=new Set(roads);
  for(const group of groups(roads))if(group.length>=3)targets.push(representative(group));
  const start=map.spawn.y*w+map.spawn.x;
  if(hard.has(start))throw mapError('No dry starting point is available for the path network.',422);
  const network=new Set([start]);
  // Binary heap keeps repeated grid searches inexpensive on larger maps.
  for(const target of [...new Set(targets)]){
    const dist=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),heap=[];
    const push=(i,d)=>{let k=heap.length;heap.push([i,d]);while(k){const p=(k-1)>>1;if(heap[p][1]<=d)break;heap[k]=heap[p];k=p;}heap[k]=[i,d];};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let k=0;while(k*2+1<heap.length){let c=k*2+1;if(c+1<heap.length&&heap[c+1][1]<heap[c][1])c++;if(heap[c][1]>=last[1])break;heap[k]=heap[c];k=c;}heap[k]=last;}return first;};
    dist[target]=0;push(target,0);let end=-1;
    while(heap.length){const [i,d]=pop();if(d!==dist[i])continue;if(network.has(i)){end=i;break;}for(const j of neighbours(i)){if(hard.has(j))continue;const cost=(roadSet.has(j)?1:3)+(soft.has(j)?5:0),nd=d+cost;if(nd<dist[j]){dist[j]=nd;prev[j]=i;push(j,nd);}}}
    if(end<0)throw mapError('Water or walls separate an important map destination. Try a reference with connected dry land and entrances.',422);
    for(let i=end;i!==-1;i=prev[i])network.add(i);
  }
  // Two-tile corridors and a one-tile canopy setback keep paths readable.
  const corridor=new Set(network);
  for(const i of network){const j=i%w<w-1?i+1:-1;if(j>=0&&!hard.has(j))corridor.add(j);}
  const setback=new Set([...corridor].flatMap(i=>[i,...neighbours(i)]));
  const placed=map.placed.filter(p=>!natural(p)||footprint(p).every(i=>boundary(i)||!setback.has(i)));
  const terrain=[...map.terrain],objects=[...map.objects],paint={...map.paint};
  const dry=map.textures.filter(t=>t.surface==='ground'&&!isLiquidTexture(t));
  const texture=dry.find(t=>t.terrainCode==='d')??dry.find(t=>t.terrainCode==='s')??dry[0];
  for(const i of corridor){objects[i]='.';if(texture){terrain[i]=['g','d','s','a'].includes(texture.terrainCode)?texture.terrainCode:'g';paint[i]={id:texture.id,surface:'ground'};}}
  // Verify actual final collisions, rather than trusting the planning costs.
  const blocked=new Set(hard);for(const p of placed)if(assets.get(p.a)?.solid)for(const i of footprint(p))blocked.add(i);
  const seen=new Set([start]),queue=[start];for(let k=0;k<queue.length;k++)for(const i of neighbours(queue[k]))if(!blocked.has(i)&&!seen.has(i)){seen.add(i);queue.push(i);}
  if(targets.some(i=>!seen.has(i)))throw mapError('The generated walking network is blocked. Please retry with more open space.',422);
  return {...map,terrain:terrain.join(''),objects:objects.join(''),paint,placed};
}
