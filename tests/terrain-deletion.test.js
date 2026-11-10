import test from 'node:test';
import assert from 'node:assert/strict';
import {ObjectId} from 'mongodb';
import {pruneTerrainAsset,assertTerrainAssetsNotDeleted,deleteTerrainAsset,deleteTerrainCollection} from '../server/terrain-deletion.js';
import {mountTerrainBuilder} from '../server/terrain-builder.js';
import express from 'express';

test('cleanup removes artwork, nested placements, paint and inventory references while preserving unrelated data',()=>{
  const id=new ObjectId().toString();
  const original={generatedAssets:[{id,spriteUrl:'deleted image'},{id:'keep',spriteUrl:'keep image'}],textures:[{id,image:'deleted paint'}],placed:[{a:id,x:1,y:2},{a:'keep',x:3,y:4}],paint:{3:{id},4:{id:'keep'}},maps:{extra:{interiors:{house:{placed:[{a:id}]}}}},inventory:{items:[{id}],startingItems:[{itemId:id}]},state:{slots:[{itemId:id},{itemId:'keep'}],hotbar:[id,'keep',null],selectedId:id,drops:[{itemId:id}]},assetLibrary:[new ObjectId(id),'keep']};
  const cleaned=pruneTerrainAsset(original,id);
  assert.deepEqual(cleaned.generatedAssets,[original.generatedAssets[1]]);assert.deepEqual(cleaned.textures,[]);
  assert.deepEqual(cleaned.placed,[original.placed[1]]);assert.deepEqual(cleaned.paint,{4:{id:'keep'}});
  assert.deepEqual(cleaned.maps.extra.interiors.house.placed,[]);assert.deepEqual(cleaned.inventory,{items:[],startingItems:[]});
  assert.deepEqual(cleaned.state,{slots:[{itemId:'keep'}],hotbar:[null,'keep',null],selectedId:null,drops:[]});
  assert.deepEqual(cleaned.assetLibrary,['keep']);assert.equal(original.generatedAssets.length,2);
});

test('stale map and world saves reject deleted embedded images and nested references',async()=>{
  const id='deleted',session={},writes=[];
  const guards={updateOne:async(...args)=>writes.push(args),findOne:async()=>({deletedIds:[id]})};
  for(const map of [{generatedAssets:[{id,spriteUrl:'old'}]},{textures:[{id,image:'old'}]},{maps:{room:{placed:[{a:id}]}}},{inventory:{items:[{id:'item',assetId:id}]}}])await assert.rejects(assertTerrainAssetsNotDeleted(guards,map,session),error=>error.deletedTerrainAsset===true);
  await assertTerrainAssetsNotDeleted(guards,{placed:[{a:'keep'}]},session);assert.equal(writes[0][2].session,session);
});

test('non-owners and unknown asset IDs cannot mutate source artwork',async()=>{
  let writes=0;const terrains={findOne:async()=>null,updateMany:async()=>writes++};
  const database={collection:()=>terrains};assert.equal(await deleteTerrainAsset(database,'visitor','terrain','asset',{}),null);
  terrains.findOne=async()=>({generatedAssets:[{id:'keep'}]});assert.equal(await deleteTerrainAsset(database,'owner','terrain','unknown',{}),null);assert.equal(writes,0);
});

test('delete endpoint requires authentication and confirms only completed server deletion',async()=>{
  const userId=new ObjectId(),terrainId=new ObjectId(),assetId=new ObjectId().toString();let calls=0;
  const app=express();
  mountTerrainBuilder(app,{auth:(req,res,next)=>{if(req.headers['x-owner']!=='yes')return res.sendStatus(401);req.user={_id:userId};next();},terrains:{},generating:new Set(),deleteAsset:async(owner,terrain,asset)=>{
    calls++;assert.equal(owner,userId);assert.equal(String(terrain),String(terrainId));assert.equal(asset,assetId);
    return {terrain:{_id:terrainId,title:'Land',description:'Forest',generatedAssets:[],textures:[],completed:[]},cleaned:2};
  }});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{
    const base=`http://127.0.0.1:${server.address().port}/api/terrains/${terrainId}/assets/${assetId}`;
    assert.equal((await fetch(base,{method:'DELETE'})).status,401);assert.equal(calls,0);
    const response=await fetch(base,{method:'DELETE',headers:{'x-owner':'yes'}});assert.equal(response.status,200);
    const data=await response.json();assert.equal(data.ok,true);assert.equal(data.cleaned,2);assert.deepEqual(data.terrain.generatedAssets,[]);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('batch cleanup handles all terrain artwork and source links together',()=>{
  const map={sourceTerrainId:'land',generatedAssets:[{id:'tree'},{id:'rock'},{id:'other'}],textures:[{id:'grass',image:'paint'}],placed:[{a:'tree'},{a:'rock'},{a:'other'}],paint:{3:{id:'grass'}},inventory:{startingItems:[{itemId:'tree'},{itemId:'other'}]}};
  assert.deepEqual(pruneTerrainAsset(map,new Set(['land','tree','rock','grass'])),{generatedAssets:[{id:'other'}],textures:[],placed:[{a:'other'}],paint:{},inventory:{startingItems:[{itemId:'other'}]}});
});

test('terrain removal checks ownership before deleting any collection or artwork',async()=>{
  let writes=0;
  const database={collection:()=>({findOne:async()=>null,deleteOne:async()=>writes++,updateMany:async()=>writes++})};
  assert.equal(await deleteTerrainCollection(database,'visitor','land',{}),null);assert.equal(writes,0);
});

test('terrain endpoint rejects invalid IDs and reports database failures without claiming success',async()=>{
  const app=express(),owner=new ObjectId(),terrainId=new ObjectId();let calls=0;
  mountTerrainBuilder(app,{auth:(req,res,next)=>{req.user={_id:owner};next();},terrains:{},generating:new Set(),deleteTerrain:async()=>{calls++;throw new Error('Database unavailable');}});
  app.use((_error,_req,res,_next)=>res.status(500).json({error:'Deletion failed'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try{
    const base=`http://127.0.0.1:${server.address().port}/api/terrains`;
    assert.equal((await fetch(`${base}/invalid`,{method:'DELETE'})).status,400);assert.equal(calls,0);
    const failed=await fetch(`${base}/${terrainId}`,{method:'DELETE'});assert.equal(failed.status,500);assert.equal((await failed.json()).ok,undefined);assert.equal(calls,1);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
