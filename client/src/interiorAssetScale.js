// Artwork bounds in native game pixels, relative to a 32px-tall character.
// Collision footprints remain the authored size.
export function interiorAssetBounds(asset){
  if(asset.assetKind==='Indoor prop')return {width:12,height:12};
  if(asset.assetKind!=='Furniture')return null;
  const name=asset.name??'';
  if(/\b(stools?|ottomans?|poufs?)\b/i.test(name))return {width:12,height:12};
  if(/\b(sofas?|couches|couch|loveseats?|settees?|benches|bench|sectionals?)\b/i.test(name))return {width:28,height:16};
  if(/\b(chairs?|armchairs?|seats?|seating|recliners?)\b/i.test(name))return {width:16,height:18};
  if(/\b(wardrobe|cabinet|cupboard|shelf|shelves|bookcase|refrigerator)\b/i.test(asset.name??''))return {width:32,height:32};
  return {width:32,height:24};
}

export function interiorSpriteLayout(asset,data,width,height){
  const bounds=interiorAssetBounds(asset);if(!bounds)return null;
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>=128){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<left)return null;
  const w=right-left+1,h=bottom-top+1,scale=Math.min(1,bounds.width/w,bounds.height/h);
  return {x:left,y:top,width:w,height:h,displayWidth:Math.max(1,Math.round(w*scale)),displayHeight:Math.max(1,Math.round(h*scale))};
}
