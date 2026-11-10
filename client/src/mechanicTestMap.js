import {fromSaved} from './world/world.js';
export function createMechanicTestMap(state){
  const width=12,height=8,terrain=Array(width*height).fill('g'),objects=Array(width*height).fill('.');
  for(let x=1;x<width-1;x++)terrain[5*width+x]='d';
  for(const t of state.targets)if(t.health>0)objects[t.y*width+t.x]=t.id==='tree'?'T':'R';
  return fromSaved({name:'Mechanic practice map',width,height,terrain:terrain.join(''),objects:objects.join(''),spawn:{x:3,y:4},placed:[],paint:{},generatedAssets:[],npcs:[],interiors:{},links:{}});
}
