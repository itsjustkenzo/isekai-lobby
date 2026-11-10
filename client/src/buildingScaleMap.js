import {fromSaved} from './world/world.js';
export function createBuildingScaleMap(building){
  building=structuredClone(building);
  const artTiles=Math.ceil((building.building?.artHeight??(building.height+2)*16)/16),width=Math.max(16,building.width+8),bottom=Math.max(artTiles+1,building.height+2),height=bottom+6;
  const x=Math.floor((width-building.width)/2),y=bottom,entranceX=x+(building.building?.entranceX??Math.floor(building.width/2));
  const terrain=Array(width*height).fill('g');for(let row=y+1;row<height-1;row++)terrain[row*width+entranceX]='d';
  return fromSaved({name:'Building scale preview',width,height,terrain:terrain.join(''),objects:'.'.repeat(width*height),placed:[{a:building.id,x,y}],generatedAssets:[building],paint:{},spawn:{x:entranceX,y:y+2},npcs:[],interiors:{},links:{}});
}
