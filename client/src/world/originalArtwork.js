export function artworkUrl(asset,fallback=asset.spriteUrl??asset.image){return asset.originalArtwork?.image??fallback;}
export function artworkLayout(asset){
  const a=asset.originalArtwork;if(!a)return null;
  const scale=Math.min(a.displayWidth/a.frame.width,a.displayHeight/a.frame.height);
  return {frame:a.frame,width:a.frame.width*scale,height:a.frame.height*scale};
}
export function frameArtwork(textures,key,asset){
  const a=asset.originalArtwork;if(!a||!textures.exists(key))return;
  const texture=textures.get(key);if(!texture.has('original'))texture.add('original',0,a.frame.x,a.frame.y,a.frame.width,a.frame.height);
}
export function drawOriginalArtwork(ctx,image,asset,cx,bottom){
  const layout=artworkLayout(asset);
  if(layout){const f=layout.frame;ctx.drawImage(image,f.x,f.y,f.width,f.height,cx-layout.width/2,bottom-layout.height,layout.width,layout.height);}
  else ctx.drawImage(image,cx-image.width/2,bottom-image.height);
}
export function drawTileRegion(ctx,source,sx,sy,sw,sh,dx,dy,dw,dh){
  const scaleX=(source.width??16)/16,scaleY=(source.height??16)/16;
  ctx.drawImage(source,sx*scaleX,sy*scaleY,sw*scaleX,sh*scaleY,dx,dy,dw,dh);
}
