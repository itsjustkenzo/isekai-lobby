export function validBuildingGeometry(asset){
  const b=asset?.building;
  return Boolean(b&&asset.assetKind==='Building'&&b.sourceId===asset.id&&/^[a-f0-9]{24}$/.test(b.sourceId)&&typeof b.type==='string'&&b.type.length<=80&&typeof b.setting==='string'&&b.setting.length<=400&&Number.isInteger(b.artHeight)&&b.artHeight===(asset.height+b.floors+2)*16&&Number.isInteger(b.entranceX)&&b.entranceX>=0&&b.entranceX<asset.width&&b.clearance===1&&Number.isInteger(b.floors)&&b.floors>=1&&b.floors<=3&&b.width===asset.width&&b.height===asset.height&&asset.width>=2&&asset.width<=8&&asset.height>=2&&asset.height<=6);
}
