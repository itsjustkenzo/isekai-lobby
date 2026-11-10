import React,{useEffect,useRef} from 'react';
import {PlayScene} from './world/PlayScene.js';
import {createPixelGame} from './world/pixelGame.js';
import {fromSaved} from './world/world.js';
import {TILE} from './world/art.js';

class NpcPreviewScene extends PlayScene{
  create(){
    super.create();this.input.keyboard.clearCaptures();this.input.keyboard.enabled=true;
    const grid=this.add.graphics().setDepth(-.4);grid.lineStyle(.5,0xffffff,.18);
    for(let x=0;x<=this.world.width;x++)grid.lineBetween(x*TILE,0,x*TILE,this.world.height*TILE);
    for(let y=0;y<=this.world.height;y++)grid.lineBetween(0,y*TILE,this.world.width*TILE,y*TILE);
  }
}

export default function NpcPreview({npc,onClose}){
  const host=useRef(null),sceneRef=useRef(null);
  useEffect(()=>{
    const width=20,height=14,terrain=Array(width*height).fill('g');
    for(let y=6;y<=7;y++)for(let x=0;x<width;x++)terrain[y*width+x]='d';
    const world=fromSaved({name:'NPC appearance preview',width,height,terrain:terrain.join(''),objects:'.'.repeat(width*height),placed:[],paint:{},spawn:{x:10,y:7},npcs:[],interiors:{},links:{}});
    const scene=new NpcPreviewScene({world,heroUrl:npc.spriteUrl,spawn:world.spawn,muted:true,ambienceVolume:0,time:{mode:'off'},weather:{mode:'off'}});
    sceneRef.current=scene;const destroy=createPixelGame(host.current,scene);
    host.current.scrollIntoView({block:'nearest'});host.current.focus();
    return()=>{destroy();sceneRef.current=null;};
  },[npc.id,npc.spriteUrl]);
  function focus(){host.current.focus();if(sceneRef.current?.input.keyboard)sceneRef.current.input.keyboard.enabled=true;}
  return <section className="mechanic-preview"><div className="native-asset-list-head"><h2>{npc.name}: in-game preview</h2><button className="text-button" type="button" onClick={onClose}>Close preview</button></div><p>Preview this NPC at the normal 32px character height, using the game renderer. Each grid tile is 16px. Click the map and use WASD or arrow keys to walk as this NPC. This test does not save positions or change your worlds.</p><div ref={host} className="mechanic-map-host building-scale-host" tabIndex={0} role="region" aria-label={`${npc.name} in-game preview map`} onPointerDown={focus} onFocus={()=>{if(sceneRef.current?.input.keyboard)sceneRef.current.input.keyboard.enabled=true;}} onBlur={()=>{const keyboard=sceneRef.current?.input.keyboard;if(keyboard){keyboard.enabled=false;keyboard.resetKeys();}}} onKeyDown={e=>{if(e.key.startsWith('Arrow'))e.preventDefault();}}/></section>;
}
