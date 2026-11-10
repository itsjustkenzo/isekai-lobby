import test from 'node:test';
import assert from 'node:assert/strict';
import {ObjectId} from 'mongodb';
import express from 'express';
import {deleteBuildingAsset} from '../server/building-deletion.js';
import {assertTerrainAssetsNotDeleted} from '../server/terrain-deletion.js';
import {mountBuildingAssets} from '../server/building-assets.js';
test('Mongo cleanup removes source images, embedded artwork, placements and inventory references with a shared transaction',async()=>{
  const owner=new ObjectId(),id=new ObjectId(),assetId=String(id),session={},variant=String(new ObjectId());
  const data={buildingAssets:[{_id:id,userId:owner,spriteUrl:'source artwork',variants:[{id:variant,image:'variant artwork'}]}],generatedMapDrafts:[{_id:new ObjectId(),map:{generatedAssets:[{id:assetId,spriteUrl:'embedded artwork'},{id:variant,spriteUrl:'variant copy'},{id:'keep'}],placed:[{a:assetId},{a:variant},{a:'keep'}],maps:{nested:{placed:[{a:assetId}]}},inventory:{items:[{id:'linked',assetId}],startingItems:[{itemId:assetId}]}}}],worlds:[],playerInventories:[{_id:new ObjectId(),state:{slots:[{itemId:assetId},{itemId:'keep'}],hotbar:[assetId,'keep'],drops:[{itemId:variant}]}}],users:[{_id:owner,assetLibrary:[id]}],terrainCollections:[],terrainAssetDeletionGuards:[]};
  const matches=(row,q)=>Object.entries(q).every(([k,v])=>String(row[k])===String(v));
  const database={collection:name=>{
    data[name]??=[];return {
      findOne:async(q,options)=>{assert.equal(options?.session,session);return data[name].find(r=>matches(r,q))??null;},
      find:(_q,options)=>{assert.equal(options?.session,session);return (async function*(){for(const row of [...data[name]])yield row;})();},
      updateMany:async(_q,_u,options)=>{assert.equal(options.session,session);},
      updateOne:async(q,u,options)=>{assert.equal(options.session,session);let row=data[name].find(r=>matches(r,q));if(!row){row={...q};data[name].push(row);}Object.assign(row,u.$set??{});for(const key of Object.keys(u.$unset??{}))delete row[key];for(const [key,value] of Object.entries(u.$addToSet??{}))row[key]=[...new Set([...(row[key]??[]),...(value.$each??[value])])];return {matchedCount:1};},
      deleteOne:async(q,options)=>{assert.equal(options.session,session);const index=data[name].findIndex(r=>matches(r,q));if(index<0)return {deletedCount:0};data[name].splice(index,1);return {deletedCount:1};},
    };
  }};
  assert.equal(await deleteBuildingAsset(database,new ObjectId(),id,session),null);assert.equal(data.buildingAssets.length,1);
  const result=await deleteBuildingAsset(database,owner,id,session);assert.equal(data.buildingAssets.length,0);assert.equal(result.cleaned,3);
  assert.deepEqual(data.generatedMapDrafts[0].map.generatedAssets,[{id:'keep'}]);assert.deepEqual(data.generatedMapDrafts[0].map.placed,[{a:'keep'}]);assert.deepEqual(data.generatedMapDrafts[0].map.maps.nested.placed,[]);
  assert.deepEqual(data.playerInventories[0].state,{slots:[{itemId:'keep'}],hotbar:[null,'keep'],drops:[]});assert.deepEqual(data.users[0].assetLibrary,[]);
  assert.deepEqual(new Set(data.terrainAssetDeletionGuards[0].deletedIds),new Set([assetId,variant]));
  await assert.rejects(assertTerrainAssetsNotDeleted(database.collection('terrainAssetDeletionGuards'),{generatedAssets:[{id:assetId}]},session),e=>e.deletedTerrainAsset===true);
});
test('building deletion endpoint checks authentication and does not claim success on database failures',async()=>{
  const owner=new ObjectId(),id=new ObjectId();let mode='success',calls=0;
  const app=express();mountBuildingAssets(app,{auth:(req,res,next)=>{if(!req.headers['x-owner'])return res.sendStatus(401);req.user={_id:owner};next();},buildings:{},generating:new Set(),deleteBuilding:async(user,building)=>{calls++;assert.equal(user,owner);assert.equal(String(building),String(id));if(mode==='failure')throw new Error('database unavailable');if(mode==='missing')return null;return {cleaned:2};}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try{const url=`http://127.0.0.1:${server.address().port}/api/building-assets/${id}`,send=owner=>fetch(url,{method:'DELETE',headers:owner?{'x-owner':'yes'}:{}});
    assert.equal((await send(false)).status,401);assert.equal(calls,0);
    const response=await send(true);assert.deepEqual(await response.json(),{ok:true,cleaned:2});
    mode='failure';const failed=await send(true);assert.equal(failed.status,500);assert.equal((await failed.json()).ok,undefined);
    mode='missing';assert.equal((await send(true)).status,404);
  }finally{await new Promise(r=>server.close(r));}
});
