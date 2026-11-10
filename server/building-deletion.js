import {purgeTerrainAssets} from './terrain-deletion.js';

// The caller supplies a Mongo transaction: source artwork, persisted copies and
// stale-save guards must commit together, or all remain intact.
export async function deleteBuildingAsset(database,userId,buildingId,session){
  const collection=database.collection('buildingAssets'),owner={_id:buildingId,userId},options={session};
  const building=await collection.findOne(owner,options);if(!building)return null;
  const ids=[String(buildingId),...(building.variants??[]).map(v=>v.id).filter(id=>typeof id==='string')];
  const cleaned=await purgeTerrainAssets(database,ids,session);
  const result=await collection.deleteOne(owner,options);
  if(result.deletedCount!==1)throw new Error('Building database deletion was not confirmed');
  return {cleaned};
}
