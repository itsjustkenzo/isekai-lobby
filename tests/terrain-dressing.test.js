import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { PNG } from 'pngjs';
import {applyTerrainDressing} from '../server/terrain-dressing.js';
import {assembleTerrainMap,generateMapFromTerrain} from '../server/terrain-map.js';
import {setAssets,fromSaved,toSaved,isBlocked} from '../client/src/world/world.js';
import {readGeneratedMedia} from '../server/generated-map-media.js';

function image(width,height){const p=new PNG({width,height});p.data.fill(255);return `data:image/png;base64,${PNG.sync.write(p).toString('base64')}`;}
function collection(){return {_id:new ObjectId(),title:'Grassland',generatedAssets:[...['small','medium','large'].map((size,i)=>({id:new ObjectId().toString(),name:`Tree (${size})`,environmentKind:'Tree',sizeVariant:size,width:1,height:1,solid:true,spriteUrl:image([24,36,48][i],[32,48,64][i])})),{id:new ObjectId().toString(),name:'Barrel',width:1,height:1,solid:true,spriteUrl:image(16,32)}],textures:['g','d','w'].map(code=>({id:new ObjectId().toString(),name:code,surface:'ground',terrainCode:code,...(code==='w'?{liquid:true}:{}),image:image(16,16)}))};}
function base(){return {width:32,height:24,name:'Meadow',terrain:'g'.repeat(768),objects:'.'.repeat(768),spawn:{x:16,y:12},placed:[],npcs:[],interiors:{},links:{},assetHints:{}};}

test('patches have stable irregular outlines and preserve existing roads and water',()=>{
  const map=base(),tiles=[...map.terrain];tiles[8*32+8]='w';tiles[8*32+9]='d';map.terrain=tiles.join('');
  const c=collection(),plan={patches:[{terrain:'d',x:8,y:8,radius:4}]};
  const result=applyTerrainDressing(map,plan,c,'exterior');
  assert.equal(result.terrain[8*32+8],'w');assert.equal(result.terrain[8*32+9],'d');
  assert.ok([...result.terrain].filter(t=>t==='d').length>10);assert.ok([...result.terrain].filter(t=>t==='d').length<81);
  assert.deepEqual(result,applyTerrainDressing(map,plan,c,'exterior'));assert.equal(map.terrain[0],'g');
});

test('explicit trees and nearby props use saved sprites and survive editor save/load',()=>{
  const c=collection(),plan={patches:[{terrain:'d',x:24,y:16,radius:3}],placements:[{kind:'Tree',x:6,y:6},{kind:'Tree',x:7,y:6},{kind:'Barrel',x:9,y:7},{kind:'Tree',x:16,y:12},{kind:'Flowers',x:4,y:4}]};
  const result=assembleTerrainMap(applyTerrainDressing(base(),plan,c,'exterior'),c,'exterior');
  assert.equal(result.placed.length,3);assert.ok(result.placed.every(p=>c.generatedAssets.some(a=>a.id===p.a)));
  assert.ok(readGeneratedMedia(result,result));setAssets(result.generatedAssets);const world=fromSaved(result);
  assert.equal(isBlocked(world,6,6),true);assert.deepEqual(toSaved(world).placed,result.placed);assert.ok(Object.values(result.paint).some(p=>p.id===c.textures.find(t=>t.terrainCode==='d').id));
});

test('invalid coordinates are rejected and absent assets are never invented',()=>{
  const c=collection();
  assert.throws(()=>applyTerrainDressing(base(),{placements:[{kind:'Tree',x:-1,y:5}]},c,'exterior'),/Invalid prop position/);
  assert.throws(()=>applyTerrainDressing(base(),{patches:[{terrain:'d',x:5,y:5,radius:50}]},c,'exterior'),/Invalid ground patch/);
  const result=applyTerrainDressing(base(),{placements:[{kind:'Bush',x:5,y:5}],patches:[{terrain:'a',x:6,y:6,radius:3}]},c,'exterior');
  assert.equal(result.propPlacements.length,0);assert.equal(result.terrain,base().terrain);
});

test('generation carries the separate AI decoration layer into the final map',async()=>{
  const c=collection();
  const map=await generateMapFromTerrain(Buffer.from('ref'),640,480,'Meadow','','exterior',c,async(_reference,size,_kind,description)=>{
    assert.match(description,/Available saved collection inventory/);assert.match(description,/Barrel/);
    const p=new PNG({width:size.width,height:size.height});for(let i=0;i<p.data.length;i+=4)p.data.set([108,173,75,255],i);
    const buffer=PNG.sync.write(p);buffer.dressing={patches:[{terrain:'d',x:24,y:20,radius:3}],placements:[{kind:'Tree',x:5,y:5},{kind:'Barrel',x:9,y:7}]};return buffer;
  });
  assert.ok(map.placed.some(p=>p.x===5&&p.y===5));assert.ok(map.placed.some(p=>p.x===9&&p.y===7));assert.ok(map.placed.length>2);assert.ok(map.terrain.includes('d'));assert.ok(readGeneratedMedia(map,map));
});
