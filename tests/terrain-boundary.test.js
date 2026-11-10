import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {ObjectId} from 'mongodb';
import {addTreeBoundary} from '../server/terrain-boundary.js';
import {setAssets,fromSaved,toSaved,isBlocked} from '../client/src/world/world.js';
import {readGeneratedMedia} from '../server/generated-map-media.js';
import {generateMapFromTerrain} from '../server/terrain-map.js';
import {MAP_PALETTE} from '../server/dream-map.js';
function image(w,h){const p=new PNG({width:w,height:h});p.data.fill(255);return `data:image/png;base64,${PNG.sync.write(p).toString('base64')}`;}
function fixture(){const tree={id:new ObjectId().toString(),name:'Tree (small)',environmentKind:'Tree',sizeVariant:'small',width:1,height:1,solid:true,spriteUrl:image(24,32)},ground={id:new ObjectId().toString(),name:'Grass',terrainCode:'g',surface:'ground',image:image(16,16)};return {width:32,height:24,terrain:'g'.repeat(768),objects:'.'.repeat(768),paint:{},generatedAssets:[tree],textures:[ground],placed:[],spawn:{x:16,y:12},interiors:{},links:{}};}
test('newly generated outdoor maps preserve edge terrain without automatic tree walls',async()=>{
  const source=fixture(),collection={_id:new ObjectId(),generatedAssets:source.generatedAssets,textures:source.textures};
  const map=await generateMapFromTerrain(Buffer.from('reference'),640,480,'Open landscape','','exterior',collection,async(_ref,size,_kind,description)=>{
    assert.match(description,/Do not add an automatic tree-wall border/);
    const png=new PNG({width:size.width,height:size.height});for(let i=0;i<size.width*size.height;i++)png.data.set([...MAP_PALETTE[0].color,255],i*4);return PNG.sync.write(png);
  });
  assert.ok(!map.placed.some(p=>p.x<2||p.x>=map.width-2||p.y<4||p.y>=map.height-2));
  setAssets(map.generatedAssets);const world=fromSaved(map);assert.equal(isBlocked(world,-1,12),true);assert.equal(isBlocked(world,map.width,12),true);
});
test('all four map edges have physical one-tile trees and remain blocked after save/load',()=>{
  const map=fixture(),result=addTreeBoundary(map);assert.ok(readGeneratedMedia(result,result));setAssets(result.generatedAssets);const world=fromSaved(result);
  for(let y=0;y<24;y++)for(let x=0;x<32;x++)if(x<2||x>=30||y<4||y>=22){
    const placements=result.placed.filter(p=>p.x===x&&p.y===y);assert.equal(placements.length,1);assert.equal(placements[0].a,map.generatedAssets[0].id);assert.equal(isBlocked(world,x,y),true);
  }
  assert.equal(isBlocked(world,16,12),false);assert.deepEqual(toSaved(world).placed,result.placed);assert.equal(result.generatedAssets[0].width,1);assert.equal(map.placed.length,0);
});
test('border replaces liquid/paint at the edge, preserves inner liquid and relocates an edge spawn',()=>{
  const map=fixture(),terrain=[...map.terrain];terrain[0]='w';terrain[10*32+10]='w';map.terrain=terrain.join('');map.spawn={x:1,y:1};
  const result=addTreeBoundary(map);assert.equal(result.terrain[0],'g');assert.equal(result.terrain[10*32+10],'w');assert.ok(result.spawn.x>=2&&result.spawn.y>=4);
  setAssets(result.generatedAssets);assert.equal(isBlocked(fromSaved(result),result.spawn.x,result.spawn.y),false);
});
test('border uses only saved trees and keeps placements inside the save limit',()=>{
  assert.throws(()=>addTreeBoundary({...fixture(),generatedAssets:[]}),/Generate tree assets/);
  const map=fixture();map.placed=Array.from({length:1500},(_,i)=>({a:map.generatedAssets[0].id,x:3+i%25,y:5+Math.floor(i/25)%15}));
  assert.ok(addTreeBoundary(map).placed.length<=1500);
});
