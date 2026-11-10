import {drawTileRegion} from './originalArtwork.js';
// Shared detection keeps old saved water textures animated even without metadata.
export function isLiquidTexture(texture){
  if(texture?.liquid===false)return false;
  return Boolean(texture&&(texture.liquid===true||/\b(water|liquid|mud|muds|muddy|quicksand|swamp|marsh|lava|magma|acid|slime|sewage|river|ocean|sea|pond|lake|stream|pool|molten|oil|blood|potion|honey|juice|milk)\b/i.test(`${texture.name??''} ${texture.description??''}`)));
}
export function animatedLiquidAt(world,index,textures){
  const finish=world.paint?.[index],texture=finish&&textures.find((entry)=>entry.id===finish.id);
  return Boolean(texture&&(world.terrain[index]==='w'||isLiquidTexture(texture)));
}
export function liquidPalette(pixels){
  let r=0,g=0,b=0,n=0;
  for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<128)continue;r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];n++;}
  const base=n?[r/n,g/n,b/n]:[100,130,160];
  return [0.25,0.5,0.75].map((amount)=>`rgb(${base.map((c)=>Math.round(c+(255-c)*amount)).join(',')})`);
}
const noise=(x,y,s)=>{const n=Math.sin(x*127.1+y*311.7+s*74.7)*43758.5453;return n-Math.floor(n);};
// Animate the reference tile itself; highlights inherit its colours, including lava and acid.
export function drawLiquidTile(ctx,source,x,y,tick,palette){
  const tx=x*16,ty=y*16;
  ctx.imageSmoothingEnabled=false;
  for(let row=0;row<16;row++){
    const shift=[0,1,0,15][(Math.floor(row/4)+tick)%4];
    drawTileRegion(ctx,source,shift,row,16-shift,1,tx,ty+row,16-shift,1);
    if(shift)drawTileRegion(ctx,source,0,row,shift,1,tx+16-shift,ty+row,shift,1);
  }
  const phase=(tick+Math.floor(noise(x,y,1)*14))%14,cycle=Math.floor((tick+Math.floor(noise(x,y,1)*14))/14);
  if(phase>4||noise(x,y,cycle+20)>.3)return;
  const cx=tx+5+Math.floor(noise(x,y,cycle+40)*6),cy=ty+5+Math.floor(noise(x,y,cycle+60)*6);
  ctx.fillStyle=palette[1];
  if(phase===0){ctx.fillRect(cx,cy-1,2,2);ctx.fillStyle=palette[2];ctx.fillRect(cx,cy-1,1,1);return;}
  if(phase===1){ctx.fillStyle=palette[2];ctx.fillRect(cx,cy,1,1);for(const [dx,dy] of [[-1,-1],[1,-1],[-1,1],[1,1]])ctx.fillRect(cx+dx,cy+dy,1,1);return;}
  ctx.fillStyle=palette[4-phase];
  for(let dy=-phase;dy<=phase;dy++)for(let dx=-phase;dx<=phase;dx++)if(Math.abs(Math.hypot(dx,dy*1.7)-phase)<.55)ctx.fillRect(cx+dx,cy+dy,1,1);
}

export function liquidCell(world,x,y,textures){
  if(x<0||y<0||x>=world.width||y>=world.height)return false;
  const i=y*world.width+x;
  return world.terrain[i]==='w'||animatedLiquidAt(world,i,textures);
}
// Each cutout stays inside the liquid tile, so redraw order never paints over props
// or neighbouring tiles. Coordinates refer to the dry neighbour's own material.
export function shorelinePixels(world,x,y,textures){
  const dry=(dx,dy)=>x+dx>=0&&y+dy>=0&&x+dx<world.width&&y+dy<world.height&&!liquidCell(world,x+dx,y+dy,textures);
  const n=dry(0,-1),s=dry(0,1),w=dry(-1,0),e=dry(1,0);
  const corners=[[-1,-1],[1,-1],[-1,1],[1,1]].filter(([dx,dy])=>dry(dx,dy));
  if(!n&&!s&&!w&&!e&&!corners.length)return [];
  const cuts=[];
  for(let py=0;py<16;py++)for(let px=0;px<16;px++){
    let edge=null,depth=-Infinity;
    const consider=(distance,reach,dx,dy)=>{if(distance<reach&&reach-distance>depth){depth=reach-distance;edge={dx,dy};}};
    // Global shoreline coordinates keep the little steps joined across tile seams.
    if(n)consider(py,2+Math.floor(noise(x*16+px,0,101)*3),0,-1);
    if(s)consider(15-py,2+Math.floor(noise(x*16+px,0,102)*3),0,1);
    if(w)consider(px,2+Math.floor(noise(0,y*16+py,103)*3),-1,0);
    if(e)consider(15-px,2+Math.floor(noise(0,y*16+py,104)*3),1,0);
    for(const [dx,dy] of corners){
      const a=dx<0?px:15-px,b=dy<0?py:15-py;
      const sideX=dx<0?w:e,sideY=dy<0?n:s;
      // Round exposed corners generously; soften an isolated diagonal notch too.
      const radius=sideX&&sideY?12:sideX||sideY?5:3;
      if(a<radius&&b<radius){const inward=Math.hypot(radius-a,radius-b)-radius;if(inward>0)consider(0,inward,dx,dy);}
    }
    if(edge)cuts.push({px,py,...edge});
  }
  return cuts;
}
export function drawShoreline(ctx,x,y,cuts,sourceFor,palette,tick){
  const cutSet=new Set(cuts.map(({px,py})=>py*16+px));
  ctx.imageSmoothingEnabled=false;
  for(const {px,py,dx,dy} of cuts){
    const source=sourceFor(dx,dy);if(!source)continue;
    drawTileRegion(ctx,source,px,py,1,1,x*16+px,y*16+py,1,1);
    // A one-pixel bank shadow gives the ground edge depth without a heavy outline.
    if([[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>px+a>=0&&py+b>=0&&px+a<16&&py+b<16&&!cutSet.has((py+b)*16+px+a))){
      ctx.fillStyle='rgba(15,20,12,0.22)';ctx.fillRect(x*16+px,y*16+py,1,1);
    }
  }
  // Small moving highlights follow the water side of the bank, in the liquid palette.
  ctx.fillStyle=palette[0];ctx.save();ctx.globalAlpha=.55;
  for(const {px,py} of cuts)for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const nx=px+a,ny=py+b;
    if(nx>=0&&ny>=0&&nx<16&&ny<16&&!cutSet.has(ny*16+nx)&&(nx+ny+tick)%4===0)ctx.fillRect(x*16+nx,y*16+ny,1,1);
  }
  ctx.restore();
}
