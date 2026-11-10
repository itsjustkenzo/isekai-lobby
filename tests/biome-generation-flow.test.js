import test from 'node:test';
import assert from 'node:assert/strict';
import {generateBiomeAssets} from '../client/src/biomeGeneration.js';
const terrain={id:'terrain',assetPlan:{items:[{id:'sand',name:'Sand',selected:true},{id:'cactus',name:'Columnar cactus',selected:true},{id:'pond',name:'Oasis',selected:false}]},planCompleted:[]};
test('automatic generation plans first, publishes progress and immediately generates selected items',async()=>{
  const paths=[],stages=[],updates=[];
  const result=await generateBiomeAssets({id:'terrain'},{onStage:s=>stages.push(s),onTerrain:t=>updates.push(t),request:async path=>{paths.push(path);return {ok:true,data:{terrain:{...terrain,planCompleted:path.endsWith('/sand/generate')?['sand']:path.endsWith('/cactus/generate')?['sand','cactus']:[]}}};}});
  assert.deepEqual(paths,['/api/terrains/terrain/plan','/api/terrains/terrain/plan/sand/generate','/api/terrains/terrain/plan/cactus/generate']);
  assert.deepEqual(stages,['Planning biome assets','Generating Sand','Generating Columnar cactus']);assert.equal(updates.length,3);assert.deepEqual(result.planCompleted,['sand','cactus']);
});
test('missing/stale endpoints and empty responses produce visible error text',async()=>{
  await assert.rejects(generateBiomeAssets({id:'terrain'},{request:async()=>({ok:false,status:404,data:{}})}),/Restart the project server/);
  await assert.rejects(generateBiomeAssets({id:'terrain'},{request:async()=>({ok:true,status:200,data:{}})}),/no usable biome asset plan/);
  await assert.rejects(generateBiomeAssets({id:'terrain'},{request:async()=>{throw new Error('Failed to fetch');}}),/Could not reach the server/);
  await assert.rejects(generateBiomeAssets({id:'terrain'},{request:async()=>({ok:false,status:402,data:{error:'Insufficient credits'}})}),/Insufficient credits/);
});
test('retry skips saved items and stops on failed artwork instead of showing success',async()=>{
  const paths=[];
  await assert.rejects(generateBiomeAssets({...terrain,planCompleted:['sand']},{request:async path=>{paths.push(path);return {ok:false,status:502,data:{error:'Artwork provider unavailable'}};}}),/Artwork provider unavailable/);
  assert.deepEqual(paths,['/api/terrains/terrain/plan/cactus/generate']);
});

test('one failed item does not prevent later items being generated and saved',async()=>{
  const paths=[],updates=[];
  await assert.rejects(generateBiomeAssets(terrain,{onTerrain:t=>updates.push(t),request:async path=>{
    paths.push(path);
    if(path.endsWith('/sand/generate'))return {ok:false,status:502,data:{error:'Provider failed'}};
    return {ok:true,data:{terrain:{...terrain,planCompleted:['cactus']}}};
  }}),/Generated 1 \/ 2 items.*Sand: Provider failed.*retry only unfinished items/);
  assert.equal(paths.length,2);
  assert.deepEqual(updates.at(-1).planCompleted,['cactus']);
});

test('credit failures stop the queue without starting more paid artwork',async()=>{
  let calls=0;
  await assert.rejects(generateBiomeAssets(terrain,{request:async()=>{
    calls++;return {ok:false,status:402,data:{error:'Insufficient credits'}};
  }}),/Insufficient credits/);
  assert.equal(calls,1);
});

test('an unconfirmed saved item cannot be reported as complete',async()=>{
  await assert.rejects(generateBiomeAssets(terrain,{request:async()=>({ok:true,data:{terrain}})}),/did not confirm/);
});
