import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainPreviewMap} from '../client/src/terrainPreviewMap.js';
import {setAssets,isBlocked} from '../client/src/world/world.js';
import {paintTextures,setPaintTextures} from '../client/src/world/paintTextures.js';

test('terrain preview composes selected saved textures and props with a clear spawn and path',()=>{
  const collection={title:'Grassland',textures:[{id:'grass',surface:'ground',terrainCode:'g'},{id:'soil',surface:'ground',terrainCode:'d'},{id:'water',surface:'ground',terrainCode:'w',liquid:true}],generatedAssets:['small','medium','large'].map(size=>({id:size,environmentKind:'Tree',sizeVariant:size,width:1,height:1,solid:true}))};
  const before=structuredClone(collection),previous=paintTextures();
  try{
    const world=createTerrainPreviewMap(collection);setAssets(world.generatedAssets);
    assert.equal(Object.keys(world.paint).length,world.width*world.height);
    assert.deepEqual(new Set(Object.values(world.paint).map(p=>p.id)),new Set(['grass','soil','water']));
    assert.deepEqual(new Set(world.placed.map(p=>p.a)),new Set(['small','medium','large']));
    assert.equal(isBlocked(world,world.spawn.x,world.spawn.y),false);
    assert.ok(world.objects.every(c=>c==='.'));
    for(const p of world.placed)assert.notEqual(world.paint[p.y*world.width+p.x].id,'water');
    world.generatedAssets[0].name='changed';assert.deepEqual(collection,before);
  }finally{setAssets([]);setPaintTextures(previous);}
});

test('terrain preview requires saved dry artwork and never invents trees for a barren collection',()=>{
  assert.throws(()=>createTerrainPreviewMap({textures:[],generatedAssets:[]}),/dry ground/);
  const previous=paintTextures();
  try{
    const world=createTerrainPreviewMap({title:'Desert',textures:[{id:'sand',surface:'ground',terrainCode:'a'}],generatedAssets:[]});
    assert.equal(world.placed.length,0);assert.ok(world.terrain.every(c=>c==='a'));
  }finally{setPaintTextures(previous);}
});

test('interior preview uses saved floor and wall paint, places furniture and leaves spawn clear',()=>{
  const previous=paintTextures();
  try{
    const collection={kind:'interior',title:'Tavern',textures:[{id:'floor',surface:'floor',terrainCode:'o'},{id:'wall',surface:'wall',terrainCode:'wall'}],generatedAssets:[{id:'table',assetKind:'Furniture',width:2,height:1,solid:true}]};
    const world=createTerrainPreviewMap(collection);setAssets(world.generatedAssets);
    assert.equal(world.interior,true);
    assert.deepEqual(new Set(Object.values(world.paint).map(p=>p.id)),new Set(['floor','wall']));
    assert.equal(world.placed[0].a,'table');
    assert.equal(isBlocked(world,world.spawn.x,world.spawn.y),false);
    assert.equal(isBlocked(world,0,0),true);
  }finally{setAssets([]);setPaintTextures(previous);}
});
