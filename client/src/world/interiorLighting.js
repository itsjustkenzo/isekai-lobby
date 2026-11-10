import {emitsWarmLight} from '../interiorGeometry.js';
export function drawInteriorLightingTile(ctx,world,x,y,assets){
  if(!(world.indoorMap||world.kind==='indoor')||x===0||x===world.width-1||y<3||y===world.height-1)return;
  const byId=new Map(assets.map(a=>[a.id,a]));
  for(const p of world.placed??[]){
    const a=byId.get(p.a);if(!a)continue;
    if(emitsWarmLight(a)){
      const distance=Math.hypot(x+.5-(p.x+a.width/2),y+.5-(p.y+.5));
      if(distance<3.5){ctx.fillStyle=`rgba(255,184,80,${(.15*(1-distance/3.5)).toFixed(3)})`;ctx.fillRect(x*16,y*16,16,16);}
    }
    if(!p.supportAssetId&&a.assetKind==='Furniture'&&y===p.y&&x>=p.x&&x<p.x+a.width){
      ctx.fillStyle='rgba(24,18,30,.22)';ctx.fillRect(x*16+2,y*16+12,12,3);
      ctx.fillStyle='rgba(24,18,30,.10)';ctx.fillRect(x*16+1,y*16+15,14,1);
    }
  }
}
