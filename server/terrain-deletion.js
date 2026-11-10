import { ObjectId } from 'mongodb';
import {removeItemReferences} from './item-deletion.js';

// Asset IDs are globally unique. Remove embedded artwork and all persisted uses,
// including nested maps/interiors, paint cells, libraries and inventory shortcuts.
const REMOVED=Symbol('removed');
const referenceKeys=new Set(['a','assetId','textureId','itemId','buildingId','sourceBuildingId','supportAssetId']);
export function pruneTerrainAsset(document,assetId){
  const ids=assetId instanceof Set?assetId:new Set(Array.isArray(assetId)?assetId:[assetId]);
  function clean(value,key){
    if(value instanceof ObjectId&&ids.has(String(value)))return REMOVED;
    if(Array.isArray(value))return value.map(entry=>{const next=clean(entry);return next===REMOVED&&key==='hotbar'?null:next;}).filter(v=>v!==REMOVED);
    if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype){
      if(ids.has(value.id)||[...referenceKeys].some(key=>ids.has(value[key])))return REMOVED;
      const result={};
      for(const [key,entry] of Object.entries(value)){
        const next=clean(entry,key);if(next!==REMOVED)result[key]=next;else if(key==='selectedId')result[key]=null;
      }
      return result;
    }
    return ids.has(value)?REMOVED:value;
  }
  const result=clean(document);return result===REMOVED?null:result;
}

export async function assertTerrainAssetsNotDeleted(guards,map,session){
  await guards.updateOne({_id:'terrain-media'},{$inc:{revision:1},$setOnInsert:{deletedIds:[]}},{upsert:true,session});
  const guard=await guards.findOne({_id:'terrain-media'},{session});
  const deleted=new Set(guard?.deletedIds??[]);
  function contains(value){
    if(typeof value==='string')return deleted.has(value);
    if(Array.isArray(value))return value.some(contains);
    if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)return Object.values(value).some(contains);
    return false;
  }
  if(contains(map))throw Object.assign(new Error('This map contains a permanently deleted asset. Reopen the map to load the cleaned version.'),{deletedTerrainAsset:true});
}

export async function deleteTerrainAsset(database,userId,terrainId,assetId,session){
  const terrains=database.collection('terrainCollections'),options={session};
  const terrain=await terrains.findOne({_id:terrainId,userId},options);
  if(!terrain)return null;
  const asset=[...(terrain.generatedAssets??[]),...(terrain.textures??[])].find(a=>a.id===assetId);
  if(!asset)return null;
  const cleaned=await purgeTerrainAssets(database,[assetId],session);
  return {terrain:await terrains.findOne({_id:terrainId,userId},options),cleaned};
}

export async function deleteTerrainCollection(database,userId,terrainId,session){
  const terrains=database.collection('terrainCollections'),options={session};
  const terrain=await terrains.findOne({_id:terrainId,userId},options);
  if(!terrain)return null;
  const assetIds=[...(terrain.generatedAssets??[]),...(terrain.textures??[])].map(a=>a.id);
  // Include the source ID so saved prototypes lose their dead collection link too.
  const cleaned=await purgeTerrainAssets(database,[...assetIds,String(terrainId)],session);
  const removed=await terrains.deleteOne({_id:terrainId,userId},options);
  if(removed.deletedCount!==1)throw new Error('Terrain deletion was not confirmed');
  return {cleaned,assets:assetIds.length};
}

export async function purgeTerrainAssets(database,assetIds,session){
  const terrains=database.collection('terrainCollections'),options={session},ids=new Set(assetIds);
  const guards=database.collection('terrainAssetDeletionGuards');
  await guards.updateOne({_id:'terrain-media'},{$inc:{revision:1},$addToSet:{deletedIds:{$each:assetIds}}},{...options,upsert:true});
  await terrains.updateMany({$or:[{'generatedAssets.id':{$in:assetIds}},{'textures.id':{$in:assetIds}}]},{$pull:{generatedAssets:{id:{$in:assetIds}},textures:{id:{$in:assetIds}}},$set:{updatedAt:new Date()}},options);
  let cleaned=0;
  for(const [name,fields] of [['generatedMapDrafts',['map']],['worlds',['sourceTerrainId','placed','maps','interiors','generatedAssets','textures','paint','inventory','equipment','restpoints']],['playerInventories',['state']],['users',['assetLibrary']]]){
    const collection=database.collection(name),projection=Object.fromEntries(fields.map(f=>[f,1]));
    const rows=collection.find({},{...options,projection});
    for await(const row of rows){
      const changes={},unset={};
      const itemIds=name==='worlds'?(row.inventory?.items??[]).filter(item=>JSON.stringify(pruneTerrainAsset(item,ids))!==JSON.stringify(item)).map(item=>item.id):[];
      for(const field of fields){
        if(!(field in row))continue;
        let next=pruneTerrainAsset(row[field],ids);
        for(const itemId of itemIds)next=pruneTerrainAsset(next,itemId);
        if(JSON.stringify(next)!==JSON.stringify(row[field])){if(next===null)unset[field]='';else changes[field]=next;}
      }
      if(Object.keys(changes).length||Object.keys(unset).length){await collection.updateOne({_id:row._id},{$set:{...changes,updatedAt:new Date()},...(Object.keys(unset).length?{$unset:unset}:{})},options);cleaned++;}
      if(itemIds.length){
        const world=await collection.findOne({_id:row._id},{...options,projection:{userId:1}});
        await database.collection('itemDeletionGuards').updateOne({userId:world.userId},{$inc:{revision:1},$addToSet:{deletedIds:{$each:itemIds}}},{...options,upsert:true});
        const inventories=database.collection('playerInventories');
        for await(const record of inventories.find({worldId:row._id},options)){
          let state=record.state;for(const itemId of itemIds)state=removeItemReferences(state,itemId);
          await inventories.updateOne({_id:record._id},{$set:{state,updatedAt:new Date()}},options);
        }
      }
    }
  }
  return cleaned;
}
