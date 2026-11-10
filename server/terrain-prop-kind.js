// Older room collections use named furniture kinds; the interior builder stores
// reusable Furniture definitions. Give both the same layout vocabulary.
export function terrainPropKind(asset){
  const kind=asset.environmentKind??asset.assetKind??asset.name;
  if(kind!=='Furniture')return kind;
  const name=asset.name??'';
  if(/\b(bed|beds|bunk|cot)\b/i.test(name))return 'Bed';
  if(/\b(table|tables|desk|desks)\b/i.test(name))return 'Table';
  if(/\b(chair|chairs|seat|seats|stool|stools|sofa|bench)\b/i.test(name))return 'Chair';
  return 'Furniture';
}
