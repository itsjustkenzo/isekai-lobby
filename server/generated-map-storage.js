// Both operations write the same guard in a transaction, so concurrent stale saves
// cannot recreate a deleted map. Guards retain IDs only, never map artwork.
export async function saveGeneratedMap(drafts,guards,userId,id,map,session){
  const options={session};
  const guard=await guards.findOneAndUpdate({_id:id},{$inc:{revision:1},$setOnInsert:{userId}},{...options,upsert:true,returnDocument:'after'});
  if(String(guard.userId)!==String(userId))return 404;
  if(guard.deleted)return 410;
  const existing=await drafts.findOne({_id:id},options);
  if(existing&&String(existing.userId)!==String(userId))return 404;
  const updatedAt=new Date();
  await drafts.updateOne({_id:id,userId},{$set:{map,updatedAt},$setOnInsert:{createdAt:updatedAt}}, {...options,upsert:true});
  return updatedAt;
}
export async function deleteGeneratedMap(drafts,guards,userId,id,session){
  const options={session};
  const existing=await drafts.findOne({_id:id,userId},options);
  if(!existing)return false;
  await guards.updateOne({_id:id},{$inc:{revision:1},$set:{userId,deleted:true}}, {...options,upsert:true});
  const result=await drafts.deleteOne({_id:id,userId},options);
  return result.deletedCount===1;
}
