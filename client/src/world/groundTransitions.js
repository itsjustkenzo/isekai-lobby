import {drawTileRegion} from './originalArtwork.js';
// Crisp pixel cut-ins sample neighbouring saved artwork; no blur, new colours,
// sprite scaling or changes to collision/paint data. Liquid shores have their own renderer.
import {liquidCell} from './liquidTextures.js';
export function drawGroundTransitions(ctx,world,x,y,textures,sourceFor){
  if(!world.sourceTerrainId||liquidCell(world,x,y,textures))return;
  const finish=world.paint?.[y*world.width+x];if(finish?.surface!=='ground')return;
  const jitter=(a,b)=>((Math.imul(a+1,73856093)^Math.imul(b+1,19349663))>>>0)%3+1;
  ctx.imageSmoothingEnabled=false;
  for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
    const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=world.width||ny>=world.height||liquidCell(world,nx,ny,textures))continue;
    const other=world.paint?.[ny*world.width+nx];
    if(other?.surface!=='ground'||other.id>=finish.id)continue;
    const source=sourceFor(other.id);if(!source)continue;
    for(let t=0;t<16;t++){
      const depth=jitter(x*16+(dx?0:t),y*16+(dy?0:t));
      const px=dx<0?0:dx>0?16-depth:t,py=dy<0?0:dy>0?16-depth:t,sw=dx?depth:1,sh=dy?depth:1;
      drawTileRegion(ctx,source,px,py,sw,sh,x*16+px,y*16+py,sw,sh);
    }
  }
}
