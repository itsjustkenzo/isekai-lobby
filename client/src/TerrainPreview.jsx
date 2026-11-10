import React,{useEffect,useRef,useState} from 'react';
import {PlayScene} from './world/PlayScene.js';
import {createPixelGame} from './world/pixelGame.js';
import {setAssets,libraryAssets} from './world/world.js';
import {setPaintTextures,paintTextures} from './world/paintTextures.js';
import {createTerrainPreviewMap} from './terrainPreviewMap.js';

class TerrainPreviewScene extends PlayScene{
  create(){super.create();this.input.keyboard.clearCaptures();this.input.keyboard.enabled=true;}
}

export default function TerrainPreview({terrain,user,onClose}){
  const host=useRef(null),sceneRef=useRef(null),[error,setError]=useState('');
  useEffect(()=>{
    const previousAssets=libraryAssets(),previousTextures=paintTextures();let destroy;
    try{
      const world=createTerrainPreviewMap(terrain);setAssets(world.generatedAssets);setPaintTextures(world.textures);
      const scene=new TerrainPreviewScene({world,heroUrl:user?.character?.spriteUrl,spawn:world.spawn,muted:true,ambienceVolume:0,time:{mode:'off'},weather:{mode:'off'}});
      sceneRef.current=scene;destroy=createPixelGame(host.current,scene);host.current.focus();host.current.scrollIntoView({block:'nearest'});
    }catch(e){setError(e.message);}
    return()=>{destroy?.();sceneRef.current=null;setAssets(previousAssets);setPaintTextures(previousTextures);};
  },[terrain,user?.character?.spriteUrl]);
  return <section className="mechanic-preview"><div className="native-asset-list-head"><h2>{terrain.title}: terrain preview</h2><button className="text-button" type="button" onClick={onClose}>Close preview</button></div><p>A sample landscape made only from this terrain’s saved artwork. Walk with WASD or arrow keys. This preview uses no generation credits and does not save maps or player positions.</p>{error&&<p role="alert">{error}</p>}<div ref={host} className="mechanic-map-host building-scale-host" tabIndex={0} aria-label="Terrain preview map" onFocus={()=>{if(sceneRef.current?.input.keyboard)sceneRef.current.input.keyboard.enabled=true;}} onBlur={()=>{const keyboard=sceneRef.current?.input.keyboard;if(keyboard){keyboard.enabled=false;keyboard.resetKeys();}}} onKeyDown={e=>{if(e.key.startsWith('Arrow'))e.preventDefault();}}/></section>;
}
