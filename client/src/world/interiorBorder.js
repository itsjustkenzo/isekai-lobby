export const INTERIOR_BORDER={fill:'#2b2333',outline:'#514556',wood:'#946039',door:'#8f4140'};

// Shared by generated-map thumbnails, editor and playtesting. North-wall paint
// remains visible; only the side and south cutaway edges use this fixed finish.
export function drawInteriorBorderTile(ctx,world,x,y){
  if(!(world.kind==='indoor'||world.indoorMap))return false;
  const left=x===0,right=x===world.width-1,bottom=y===world.height-1;
  if(!left&&!right&&!bottom)return false;
  const px=x*16,py=y*16,door=bottom&&x===Math.floor(world.width/2);
  const fill=(color,dx,dy,w,h)=>{ctx.fillStyle=color;ctx.fillRect(px+dx,py+dy,w,h);};
  if(door){
    fill(INTERIOR_BORDER.wood,0,0,16,16);
    fill(INTERIOR_BORDER.door,3,1,10,15);
    for(let row=4;row<16;row+=4)fill('#653137',3,row,10,1);
    fill('#c39756',1,0,1,16);fill('#573b2e',14,0,1,16);
    return true;
  }
  fill(INTERIOR_BORDER.fill,0,0,16,16);
  if(left)fill(INTERIOR_BORDER.outline,0,0,2,16);
  if(right)fill(INTERIOR_BORDER.outline,14,0,2,16);
  if(bottom)fill(INTERIOR_BORDER.outline,0,14,16,2);
  if(y===0)fill(INTERIOR_BORDER.outline,0,0,16,2);
  return true;
}
