import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {enrichDreamMap,blueprintToMap} from '../server/dream-map.js';
import {readGeneratedMedia} from '../server/generated-map-media.js';
import {setAssets,fromSaved,toSaved,canSpawnAt,canPaintTexture,isLocked} from '../client/src/world/world.js';

function image(width=32,height=32){const png=new PNG({width,height});for(let i=0;i<png.data.length;i+=4)png.data.set([108,173,75,255],i);return PNG.sync.write(png);}
function sprite(){const png=new PNG({width:64,height:64});for(let y=16;y<48;y++)for(let x=16;x<48;x++)png.data.set([100,70,50,255],(y*64+x)*4);return PNG.sync.write(png);}
function base(indoor=false){const width=16,height=16;return {width,height,name:'Reference',terrain:(indoor?'o':'g').repeat(width*height),objects:Array.from({length:width*height},(_,i)=>indoor&&i<48?'N':'.').join(''),spawn:{x:8,y:8},placed:[],npcs:[],interiors:{},links:{},...(indoor?{kind:'indoor',wallRows:3}:{}),assetHints:{[indoor?'Bed':'Building']:[85,86,101,102]}};}
for(const indoor of [false,true])test(`${indoor?'interior':'exterior'} reference artwork is placed, painted, validated and survives save/load`,async()=>{
  const requests=[],map=await enrichDreamMap(base(indoor),image(),indoor?'interior':'exterior','',async(prompt)=>{requests.push(prompt);return sprite();},async(_prompt,_reference,surface)=>{assert.match(_prompt,/STRICT REFERENCE ART STYLE/);requests.push(surface);return image(16,16);});
  assert.match(requests[0],/STRICT REFERENCE ART STYLE/);assert.doesNotMatch(requests[0],/Cozy top-down RPG/);
  assert.equal(map.generatedAssets.length,1);assert.equal(map.placed.length,1);assert.equal(map.assetHints,undefined);
  assert.equal(map.textures.length,indoor?2:1);assert.ok(Object.keys(map.paint).length>0);
  assert.ok(readGeneratedMedia(map,map));
  setAssets(map.generatedAssets);const loaded=fromSaved(map);assert.equal(loaded.placed.length,1);assert.ok(canSpawnAt(loaded,map.spawn.x,map.spawn.y));
  const saved=toSaved(loaded);assert.deepEqual(saved.generatedAssets,map.generatedAssets);assert.deepEqual(saved.textures,map.textures);assert.deepEqual(saved.paint,map.paint);
  assert.ok(readGeneratedMedia(saved,saved));
  if(indoor){assert.equal(map.paint[20].surface,'wall');assert.equal(map.paint[200].surface,'floor');}
});
test('prototype saves reject shared asset references and remote images',()=>{
  const map={...base(),paint:{},generatedAssets:[],textures:[]};
  assert.equal(readGeneratedMedia(map,{...map,placed:[{a:'123456789012345678901234',x:1,y:5}]}),null);
  assert.equal(readGeneratedMedia({...map,generatedAssets:[{id:'123456789012345678901234',name:'Bad',width:1,height:1,solid:true,spriteUrl:'https://example.com/a.png'}]},map),null);
  assert.equal(readGeneratedMedia(map,{...map,paint:{10:{id:'123456789012345678901234',surface:'ground'}}}),null);
});
test('failed artwork generation fails the operation rather than returning an incomplete map',async()=>{
  await assert.rejects(enrichDreamMap(base(),image(),'exterior','',async()=>{throw new Error('provider failed');},async()=>image(16,16)),/provider failed/);
});
test('blueprint identifies visible furniture separately from wall and floor',()=>{
  const png=new PNG({width:16,height:16});for(let i=0;i<png.data.length;i+=4)png.data.set([70,110,190,255],i);
  const map=blueprintToMap(PNG.sync.write(png),{width:16,height:16},'Room','interior');assert.ok(map.assetHints.Bed.length>0);assert.equal(map.objects[20],'N');
});

test('exterior blueprint keeps shoreline and sand at the edges instead of adding forest',()=>{
  const png=new PNG({width:16,height:16});for(let y=0;y<16;y++)for(let x=0;x<16;x++)png.data.set(x<4?[55,125,196,255]:[228,202,137,255],(y*16+x)*4);
  const map=blueprintToMap(PNG.sync.write(png),{width:16,height:16},'Beach');
  assert.equal(map.terrain[0],'w');assert.equal(map.terrain[15],'a');assert.equal(map.terrain[255],'a');assert.ok(!map.objects.includes('T'));
});
test('reference forest assets and paint reach the map perimeter and survive reload',async()=>{
  const png=new PNG({width:16,height:16});for(let y=0;y<16;y++)for(let x=0;x<16;x++)png.data.set(x<3?[35,90,44,255]:[108,173,75,255],(y*16+x)*4);
  const draft=blueprintToMap(PNG.sync.write(png),{width:16,height:16},'Forest');
  const treePrompts=[];
  const map=await enrichDreamMap(draft,image(),'exterior','',async(prompt)=>{treePrompts.push(prompt);return sprite();},async()=>image(16,16));
  assert.equal(treePrompts.length,3);
  for(const size of ['small','medium','large'])assert.ok(treePrompts.some((prompt)=>prompt.includes(`ONE ${size} tree`)&&prompt.includes('never larger pixel blocks')));
  setAssets(map.generatedAssets);const loaded=fromSaved(map);
  assert.equal(map.generatedAssets.length,3);
  assert.ok(map.generatedAssets.every((asset)=>asset.environmentKind==='Tree'));
  const {TREE_HEIGHTS}=await import('../client/src/world/treeSizes.js');
  for(const asset of map.generatedAssets){const png=PNG.sync.read(Buffer.from(asset.spriteUrl.split(',')[1],'base64'));assert.equal(png.height,TREE_HEIGHTS[asset.sizeVariant]);}
  assert.ok(map.generatedAssets.every((asset)=>asset.width===1&&asset.height===1));
  assert.ok(map.placed.length>32);
  assert.equal(new Set(loaded.placed.map((p)=>p.a)).size,3);
  assert.ok(readGeneratedMedia(map,map));
  assert.ok(loaded.placed.some((p)=>p.x===0));assert.ok(!loaded.objects.includes('T'));
  assert.equal(isLocked(loaded,0,5),false);assert.equal(canPaintTexture(loaded,'ground',0,5),true);
  assert.ok(loaded.paint[80]);assert.equal(toSaved(loaded).placed.length,map.placed.length);
});
test('generated interior paints every boundary wall without changing its collision',async()=>{
  const draft=base(true);draft.objects=[...draft.objects].map((v,i)=>i%16===0||i%16===15||i>=240?'X':v).join('');
  const map=await enrichDreamMap(draft,image(),'interior','',async()=>sprite(),async()=>image(16,16));
  setAssets(map.generatedAssets);const loaded=fromSaved(map);
  for(const i of [0,15,80,95,240,255]){assert.equal(map.paint[i].surface,'wall');assert.equal(canPaintTexture(loaded,'wall',i%16,Math.floor(i/16)),true);assert.equal(canSpawnAt(loaded,i%16,Math.floor(i/16)),false);}
});
test('water at generated map edges gets reference paint, while normal world paint rules remain unchanged',async()=>{
  const draft=base();draft.terrain='w'.repeat(16)+draft.terrain.slice(16);draft.assetHints={};
  const map=await enrichDreamMap(draft,image(),'exterior','',async()=>sprite(),async()=>image(16,16));
  setAssets([]);const loaded=fromSaved(map);assert.equal(map.textures.length,2);assert.ok(map.paint[0]);assert.equal(canPaintTexture(loaded,'ground',0,0),true);
  delete loaded.generatedAssets;assert.equal(canPaintTexture(loaded,'ground',0,0),false);
});

test('bushes and other nature props are separately authored in three native sizes with one-tile bases',async()=>{
 const draft=base();draft.assetHints={Bush:[80,81,82,83,84,85,86],Rock:[100],Flowers:[110]};
 const prompts=[],map=await enrichDreamMap(draft,image(),'exterior','',async(prompt)=>{prompts.push(prompt);return sprite();},async()=>image(16,16));
 const {NATURE_SPRITE_SIZES}=await import('../client/src/world/natureSizes.js');
 assert.equal(map.generatedAssets.length,9);assert.equal(prompts.length,9);
 for(const asset of map.generatedAssets){const png=PNG.sync.read(Buffer.from(asset.spriteUrl.split(',')[1],'base64'));assert.deepEqual([png.width,png.height],NATURE_SPRITE_SIZES[asset.environmentKind][asset.sizeVariant]);assert.equal(asset.width,1);assert.equal(asset.height,1);}
 assert.ok(prompts.filter((prompt)=>prompt.includes('full, dense, broad shrub')).length===3);
 assert.ok(readGeneratedMedia(map,map));setAssets(map.generatedAssets);const saved=toSaved(fromSaved(map));assert.deepEqual(saved.generatedAssets,map.generatedAssets);assert.ok(readGeneratedMedia(saved,saved));
});
