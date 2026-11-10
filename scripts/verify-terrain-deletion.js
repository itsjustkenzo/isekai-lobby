import 'dotenv/config';
import dns from 'node:dns';
import assert from 'node:assert/strict';
import {MongoClient,ObjectId} from 'mongodb';
import {deleteTerrainAsset,deleteTerrainCollection,assertTerrainAssetsNotDeleted} from '../server/terrain-deletion.js';
dns.setServers(['8.8.8.8','8.8.4.4']);
const name=`iz_deltest_${new ObjectId()}`;
if(!/^iz_deltest_[a-f0-9]{24}$/.test(name))throw new Error('Unsafe diagnostic database name');
const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000,connectTimeoutMS:10000,socketTimeoutMS:20000,maxPoolSize:1});
let db;
try{
  await client.connect();db=client.db(name);console.log("Isolated diagnostic database: "+name);
  const owner=new ObjectId(),terrainId=new ObjectId(),assetId=new ObjectId().toString(),worldId=new ObjectId();
  const source={id:assetId,name:'Test tree',width:1,height:1,spriteUrl:'DELETE_ME_IMAGE'};
  await db.collection('terrainCollections').insertOne({_id:terrainId,userId:owner,title:'Test',generatedAssets:[source],textures:[]});
  await db.collection('generatedMapDrafts').insertOne({userId:owner,map:{generatedAssets:[source],placed:[{a:assetId,x:1,y:1}],textures:[{id:assetId,image:'DELETE_ME_IMAGE'}],paint:{3:{id:assetId}}}});
  await db.collection('worlds').insertOne({_id:worldId,userId:owner,placed:[{a:assetId}],maps:{extra:{generatedAssets:[source]}},inventory:{items:[{id:'linked-item',assetId}],startingItems:[{itemId:'linked-item'}]}});
  await db.collection('playerInventories').insertOne({worldId,state:{slots:[{key:'a',itemId:'linked-item',quantity:1}],hotbar:['linked-item',null],selectedId:'linked-item',drops:[{itemId:'linked-item'}],revision:0}});
  await db.collection('users').insertOne({assetLibrary:[new ObjectId(assetId)]});
  const session=client.startSession();
  try{
    const denied=await session.withTransaction(()=>deleteTerrainAsset(db,new ObjectId(),terrainId,assetId,session));assert.equal(denied,null);
    const result=await session.withTransaction(()=>deleteTerrainAsset(db,owner,terrainId,assetId,session));assert.ok(result);assert.deepEqual(result.terrain.generatedAssets,[]);
    for(const collection of ['terrainCollections','generatedMapDrafts','worlds','playerInventories','users']){
      const content=JSON.stringify(await db.collection(collection).find({}).toArray());
      assert.ok(!content.includes(assetId),`${collection} retains asset references`);assert.ok(!content.includes('DELETE_ME_IMAGE'),`${collection} retains image data`);
    }
    const state=(await db.collection('playerInventories').findOne({worldId})).state;assert.deepEqual(state.slots,[]);assert.deepEqual(state.drops,[]);assert.equal(state.selectedId,null);
    await assert.rejects(session.withTransaction(()=>assertTerrainAssetsNotDeleted(db.collection('terrainAssetDeletionGuards'),{generatedAssets:[source]},session)),error=>error.deletedTerrainAsset===true);
    assert.ok((await db.collection('itemDeletionGuards').findOne({userId:owner})).deletedIds.includes('linked-item'));
    const wholeId=new ObjectId(),treeId=new ObjectId().toString(),paintId=new ObjectId().toString(),keepId=new ObjectId();
    await db.collection('terrainCollections').insertMany([{_id:wholeId,userId:owner,title:'Whole terrain',generatedAssets:[{id:treeId,spriteUrl:'WHOLE_TREE'}],textures:[{id:paintId,image:'WHOLE_PAINT'}]},{_id:keepId,userId:owner,title:'Keep me',generatedAssets:[],textures:[]}]);
    const mapId=(await db.collection('generatedMapDrafts').insertOne({userId:owner,map:{name:'Keep this map',sourceTerrainId:String(wholeId),generatedAssets:[{id:treeId,spriteUrl:'WHOLE_TREE'}],textures:[{id:paintId,image:'WHOLE_PAINT'}],placed:[{a:treeId}],paint:{1:{id:paintId}}}})).insertedId;
    assert.equal(await session.withTransaction(()=>deleteTerrainCollection(db,new ObjectId(),wholeId,session)),null);
    const whole=await session.withTransaction(()=>deleteTerrainCollection(db,owner,wholeId,session));
    assert.equal(whole.assets,2);assert.equal(await db.collection('terrainCollections').findOne({_id:wholeId}),null);
    assert.ok(await db.collection('terrainCollections').findOne({_id:keepId}));
    const cleanedMap=(await db.collection('generatedMapDrafts').findOne({_id:mapId})).map;
    assert.equal(cleanedMap.name,'Keep this map');assert.equal(cleanedMap.sourceTerrainId,undefined);assert.deepEqual(cleanedMap.generatedAssets,[]);assert.deepEqual(cleanedMap.textures,[]);assert.deepEqual(cleanedMap.placed,[]);assert.deepEqual(cleanedMap.paint,{});
    for(const stale of [{sourceTerrainId:String(wholeId)},{generatedAssets:[{id:treeId}]},{textures:[{id:paintId}]}])await assert.rejects(session.withTransaction(()=>assertTerrainAssetsNotDeleted(db.collection('terrainAssetDeletionGuards'),stale,session)),error=>error.deletedTerrainAsset===true);
    const empty=await session.withTransaction(()=>deleteTerrainCollection(db,owner,keepId,session));assert.equal(empty.assets,0);assert.equal(await db.collection('terrainCollections').findOne({_id:keepId}),null);
    console.log('Verified full-terrain deletion, ownership, all artwork/paint cleanup, preserved maps, empty terrains and stale-save protection.');
    console.log('Verified ownership, transactional MongoDB cleanup, linked inventories and stale-save protection in an isolated diagnostic database.');
  }finally{await session.endSession();}
}finally{
  try{if(db&&db.databaseName===name&&/^iz_deltest_[a-f0-9]{24}$/.test(name))await db.dropDatabase();}finally{await client.close();}
}
