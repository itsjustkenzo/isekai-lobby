// Rules describe relationships, not a generator per named biome. A selected
// terrain collection is the authority for compatible artwork and materials.
export const ENVIRONMENT_RULES={
  Tree:{role:'canopy',weight:1,spacing:2.4,cluster:1,sizeWeights:{small:2,medium:4,large:2},settings:['exterior']},
  Bush:{role:'understory',weight:1.3,spacing:1.7,cluster:.8,sizeWeights:{small:4,medium:3,large:1},settings:['exterior']},
  Rock:{role:'mineral',weight:.65,spacing:1.5,cluster:.65,sizeWeights:{small:5,medium:3,large:1},settings:['exterior']},
  Flowers:{role:'detail',weight:2,spacing:1.1,cluster:.75,sizeWeights:{small:5,medium:3,large:1},settings:['exterior']},
  'Potted plant':{role:'constructed',weight:.3,spacing:3,cluster:.3,sizeWeights:{small:3,medium:2,large:1},settings:['interior'],nearRole:'structure',nearDistance:4},
  Log:{role:'debris',weight:.2,spacing:3,cluster:.8,settings:['exterior'],nearRole:'canopy',nearDistance:4},
  Barrel:{role:'constructed',weight:.2,spacing:3,cluster:.3,settings:['exterior','interior'],nearRole:'structure',nearDistance:4},
};
export const STRUCTURE_KINDS=new Set(['Building','Bed','Table','Chair']);
export function environmentRegistry(collection,kind){
  const overrides=collection.environmentRules??{},entries=[],missing=[];
  for(const asset of collection.generatedAssets??[]){
    const key=asset.environmentKind??asset.assetKind??asset.name,rule=overrides.assets?.[key]??ENVIRONMENT_RULES[key];
    if(!rule||!rule.settings?.includes(kind)||rule.disabled)continue;
    entries.push({asset,rule:{weight:1,spacing:2,cluster:.7,...rule},key});
  }
  for(const key of overrides.requiredAssets??[])if(!entries.some(e=>e.key===key))missing.push(key);
  if(!entries.length)missing.push(`Compatible ${kind} environmental assets`);
  return {entries,missing,profile:{density:kind==='interior'?.025:.12,patchCoverage:.22,...overrides.profile},surfaces:{g:{alternatives:['g','d']},...overrides.surfaces},biome:String(collection._id??collection.title??'terrain')};
}
