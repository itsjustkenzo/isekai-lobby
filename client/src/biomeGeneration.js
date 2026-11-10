// Keep the automatic sequence separate from rendering so failed requests never
// disappear as empty notices, and completed items remain resumable.
export async function generateBiomeAssets(terrain,{request,onTerrain=()=>{},onStage=()=>{}}){
  async function post(path){
    let response;
    try{response=await request(path,{method:'POST'});}catch{throw new Error('Could not reach the server. Check that npm run dev is running, then try again.');}
    if(!response.ok){
      const error=new Error(response.data?.error||(response.status===404?'Biome generation endpoint was not found. Restart the project server with npm.cmd run dev, refresh this page, and try again.':`Biome generation failed (HTTP ${response.status??'unknown'}). Please try again.`));
      error.status=response.status;throw error;
    }
    const next=response.data?.terrain;
    if(!next?.id||!Array.isArray(next.assetPlan?.items)||!next.assetPlan.items.some(p=>p.selected))throw new Error('The server returned no usable biome asset plan. Restart the project server and try again.');
    onTerrain(next);return next;
  }
  if(!terrain.assetPlan){onStage('Planning biome assets');terrain=await post(`/api/terrains/${terrain.id}/plan`);}
  if(!Array.isArray(terrain.assetPlan?.items)||!terrain.assetPlan.items.some(p=>p.selected))throw new Error('This terrain has no selected biome assets. Create a new terrain with a biome description.');
  const items=terrain.assetPlan.items.filter(p=>p.selected);
  const failures=[];
  for(const item of items){
    if(terrain.planCompleted?.includes(item.id))continue;
    onStage(`Generating ${item.name}`);
    try{
      terrain=await post(`/api/terrains/${terrain.id}/plan/${item.id}/generate`);
      if(!terrain.planCompleted?.includes(item.id))throw new Error('The server did not confirm this item was saved.');
    }catch(error){
      // Do not retry paid artwork automatically. Continue independent items only
      // for generation failures; authentication, credits and storage need attention.
      if(error.status!==502)throw error;
      failures.push(`${item.name}: ${error.message}`);
    }
  }
  if(failures.length)throw new Error(`Generated ${items.filter(item=>terrain.planCompleted?.includes(item.id)).length} / ${items.length} items. Some items failed: ${failures.join('; ')}. Use Generate remaining biome assets to retry only unfinished items.`);
  return terrain;
}
