import {environmentVariantIndex} from './environment-variants.js';
import {isLiquidTexture,liquidCell} from '../client/src/world/liquidTextures.js';

// A physical ring, not an invisible lock: every border cell has a one-tile tree.
// Four rows at the top keep full-height canopies visible inside the map canvas.
export function addTreeBoundary(map){
  const assets=map.generatedAssets.map(a=>a.environmentKind==='Tree'?{...a,width:1,height:1,solid:true}:a);
  const trees=assets.filter(a=>a.environmentKind==='Tree');
  if(!trees.length)throw new Error('Generate tree assets for this terrain before creating an outdoor map with tree walls.');
  const ground=map.textures.find(t=>t.surface==='ground'&&!isLiquidTexture(t));
  if(!ground)throw new Error('Generate texture paint for this terrain first');
  const width=map.width,height=map.height,mask=new Set(),terrain=[...map.terrain],objects=[...map.objects],paint=structuredClone(map.paint??{});
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x<2||x>=width-2||y<4||y>=height-2){
    const i=y*width+x;mask.add(i);terrain[i]=['g','d','s','a'].includes(ground.terrainCode)?ground.terrainCode:'g';objects[i]='.';paint[i]={id:ground.id,surface:'ground'};
  }
  const byId=new Map(assets.map(a=>[a.id,a]));
  function footprint(p){const a=byId.get(p.a);if(!a)return [];const cells=[];for(let dy=0;dy<a.height;dy++)for(let dx=0;dx<a.width;dx++)cells.push((p.y-dy)*width+p.x+dx);return cells;}
  const interior=map.placed.filter(p=>!footprint(p).some(i=>mask.has(i)));
  const remaining=Math.max(0,1500-mask.size);
  const placed=interior.slice(0,remaining);
  for(const i of mask){const x=i%width,y=Math.floor(i/width),tree=trees[environmentVariantIndex(x,y,trees.length)];placed.push({a:tree.id,x,y});}
  const result={...map,terrain:terrain.join(''),objects:objects.join(''),paint,generatedAssets:assets,placed};
  const solid=new Set(placed.filter(p=>byId.get(p.a)?.solid).flatMap(footprint));
  const walkable=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&!mask.has(y*width+x)&&!solid.has(y*width+x)&&!liquidCell(result,x,y,result.textures)&&['.','F','G','E'].includes(objects[y*width+x]);
  if(!walkable(map.spawn.x,map.spawn.y)){
    let best=null,distance=Infinity;
    for(let y=4;y<height-2;y++)for(let x=2;x<width-2;x++)if(walkable(x,y)){
      const d=Math.abs(x-map.spawn.x)+Math.abs(y-map.spawn.y);if(d<distance){distance=d;best={x,y};}
    }
    if(!best)throw new Error('The tree border leaves no safe spawn. Use a reference with a larger dry clearing.');
    result.spawn=best;
  }
  return result;
}
