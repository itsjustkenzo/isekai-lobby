export const DETAIL_TILE=48;
export const DETAIL_CHARACTER_HEIGHT=96;
export const DETAIL_ASSETS={
  floor:{label:'Stone floor',width:48,height:48,tile:true,brief:'seamless pale limestone floor with fine worn stone detail, top-down, opaque, full bleed, no objects'},
  wall:{label:'North wall',width:48,height:48,tile:true,brief:'seamless vertical stone wall face with restrained gold trim, front-facing, opaque, full bleed, no floor or objects'},
  throne:{label:'Throne',width:96,height:144,footprint:[2,1],brief:'one ornate throne, burgundy upholstery, navy panels and aged gold detailing, slightly elevated front view'},
  table:{label:'Table',width:96,height:72,footprint:[2,1],brief:'one carved dark wooden table with restrained gold fittings, slightly elevated front view'},
  chair:{label:'Chair',width:48,height:54,footprint:[1,1],brief:'one upholstered chair, burgundy cushion and dark wood, slightly elevated front view'},
  lamp:{label:'Candle stand',width:48,height:96,footprint:[1,1],brief:'one gilded candle stand with lit candles, slightly elevated front view, no baked background glow'},
};
export function detailedStyleScene(){
  return {width:16,height:16,spawn:{x:8,y:13},placed:[{id:'throne',x:7,y:5},{id:'table',x:3,y:9},{id:'chair',x:2,y:9},{id:'chair',x:5,y:9},{id:'lamp',x:2,y:5},{id:'lamp',x:12,y:5}]};
}
export function detailedStyleBlocked(scene,x,y){
  if(x<1||x>=scene.width-1||y<3||y>=scene.height-1)return true;
  return scene.placed.some(p=>{const [w,h]=DETAIL_ASSETS[p.id].footprint;return x>=p.x&&x<p.x+w&&y>p.y-h&&y<=p.y;});
}
