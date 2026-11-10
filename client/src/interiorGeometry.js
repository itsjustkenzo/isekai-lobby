export function interiorFootprint(asset){
  if(asset.assetKind==='Indoor prop')return {width:1,height:1};
  if(asset.assetKind!=='Furniture')return null;
  const name=asset.name??'';
  if(/\b(beds?|bunks?|cots?)\b/i.test(name))return {width:2,height:2};
  if(/\b(chairs?|armchairs?|stools?|ottomans?|poufs?|recliners?)\b/i.test(name))return {width:1,height:1};
  return {width:2,height:1};
}
export const supportsDecor=asset=>asset?.assetKind==='Furniture'&&/\b(tables?|desks?|counters?|nightstands?|bedside|shelves|shelf|cabinet|cupboard)\b/i.test(asset.name??'');
export const isSurfaceDecor=asset=>asset?.assetKind==='Indoor prop'&&!/\b(floor|standing|chandelier)\b/i.test(asset.name??'')&&/\b(lamps?|candles?|books?|plates?|bowls?|cups?|vases?|bottles?|lanterns?)\b/i.test(asset.name??'');
export const emitsWarmLight=asset=>/\b(lamps?|candles?|lanterns?|torches?|chandeliers?)\b/i.test(asset?.name??'');
export function validSurfacePlacement(p,placements,assets){
  if(!p.supportAssetId)return true;
  const get=id=>assets.find(a=>a.id===id),asset=get(p.a),support=get(p.supportAssetId);
  return isSurfaceDecor(asset)&&supportsDecor(support)&&Number.isInteger(p.supportX)&&Number.isInteger(p.supportY)&&Number.isInteger(p.elevation)&&p.elevation>=4&&p.elevation<=20&&placements.some(q=>!q.supportAssetId&&q.a===p.supportAssetId&&q.x===p.supportX&&q.y===p.supportY)&&p.x>=p.supportX&&p.x<p.supportX+support.width&&p.y===p.supportY;
}
