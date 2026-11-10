import React,{useEffect,useRef,useState} from 'react';
import {PlayScene} from './world/PlayScene.js';
import {createPixelGame} from './world/pixelGame.js';
import {setAssets,libraryAssets} from './world/world.js';
import {TILE} from './world/art.js';
import {createBuildingScaleMap} from './buildingScaleMap.js';
class BuildingScaleScene extends PlayScene{
  create(){
    super.create();this.input.keyboard.clearCaptures();this.input.keyboard.enabled=true;
    const grid=this.add.graphics().setDepth(-.4);grid.lineStyle(.5,0xffffff,.25);
    for(let x=0;x<=this.world.width;x++)grid.lineBetween(x*TILE,0,x*TILE,this.world.height*TILE);
    for(let y=0;y<=this.world.height;y++)grid.lineBetween(0,y*TILE,this.world.width*TILE,y*TILE);
    const p=this.world.placed[0],asset=this.world.generatedAssets[0],overlay=this.add.graphics().setDepth(10000);
    overlay.lineStyle(1,0xffd854,.9).strokeRect(p.x*TILE,(p.y-asset.height+1)*TILE,asset.width*TILE,asset.height*TILE);
    overlay.fillStyle(0x48eb8a,.8).fillRect((p.x+(asset.building?.entranceX??Math.floor(asset.width/2)))*TILE,(p.y+1)*TILE,TILE,TILE);
  }
  follow(){if(!this.cameras?.main)return;const cam=this.cameras.main,w=this.world.width*TILE,h=this.world.height*TILE,zoom=Math.max(1,Math.floor(Math.min(cam.width/(w+16),cam.height/(h+16))));this.setView(zoom,(w-cam.width/zoom)/2,(h-cam.height/zoom)/2);}
}
export default function BuildingScalePreview({building,user,onClose}){
  const hostRef=useRef(null),sceneRef=useRef(null),[reset,setReset]=useState(0);
  useEffect(()=>{
    const previous=libraryAssets();setAssets([building]);const world=createBuildingScaleMap(building);
    const scene=new BuildingScaleScene({world,heroUrl:user?.character?.spriteUrl,spawn:world.spawn,muted:true,ambienceVolume:0,time:{mode:'off'},weather:{mode:'off'}});sceneRef.current=scene;
    const destroy=createPixelGame(hostRef.current,scene);hostRef.current.scrollIntoView({block:'nearest'});hostRef.current.focus();
    return()=>{sceneRef.current=null;destroy();setAssets(previous);};
  },[building,user?.character?.spriteUrl,reset]);
  return <section className="mechanic-preview"><div className="native-asset-list-head"><h2>{building.name}: map scale preview</h2><button type="button" className="text-button" onClick={onClose}>Close preview</button></div><p>{building.width} × {building.height} tile footprint. Each grid square is one 16px game tile. Gold outlines the collision footprint; green marks the entrance approach.</p><p>Your avatar uses the same scale as map playtesting. Click the map and walk with WASD or arrow keys to compare sizes. This preview does not save player positions or change worlds.</p>{!user?.character?.spriteUrl&&<p role="alert">Create a character to preview it beside the building.</p>}
    <div ref={hostRef} className="mechanic-map-host building-scale-host" tabIndex={0} role="region" aria-label="Building and player scale preview map" onPointerDown={()=>{hostRef.current.focus();if(sceneRef.current?.input.keyboard)sceneRef.current.input.keyboard.enabled=true;}} onFocus={()=>{if(sceneRef.current?.input.keyboard)sceneRef.current.input.keyboard.enabled=true;}} onBlur={()=>{const k=sceneRef.current?.input.keyboard;if(k){k.enabled=false;k.resetKeys();}}} onKeyDown={e=>{if(e.key.startsWith('Arrow'))e.preventDefault();}}/>
    <button type="button" className="text-button" onClick={()=>setReset(n=>n+1)}>Reset player position</button>
  </section>;
}
