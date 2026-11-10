import React,{useEffect,useRef,useState} from 'react';
import {DetailedStyleScene} from './DetailedStyleScene.js';
import {createPixelGame} from './world/pixelGame.js';
import PlayerHud from './world/PlayerHud.jsx';
import './detailed-style-play.css';

export default function DetailedStylePlay({user,assets,onClose}){
  const host=useRef(null),sceneRef=useRef(null),[paused,setPaused]=useState(false),[muted,setMuted]=useState(false),[message,setMessage]=useState('Click nearby furniture to interact.');
  useEffect(()=>{
    const scene=new DetailedStyleScene({assets,heroUrl:user.character?.spriteUrl,onAction:setMessage});sceneRef.current=scene;
    const destroy=createPixelGame(host.current,scene);host.current.focus();
    return()=>{destroy();sceneRef.current=null;};
  },[assets,user.character?.spriteUrl]);
  useEffect(()=>{if(sceneRef.current)sceneRef.current.muted=muted;},[muted]);
  useEffect(()=>{const scene=sceneRef.current;if(scene?.scene){if(paused)scene.scene.pause();else scene.scene.resume();}if(!paused)host.current?.focus();},[paused]);
  useEffect(()=>{const key=e=>{if(e.key==='Escape'){e.preventDefault();setPaused(p=>!p);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  return <div className="detailed-style-play" role="dialog" aria-modal="true" aria-label="Detailed style gameplay preview">
    <div ref={host} className="detailed-play-canvas" tabIndex={0} aria-label="Walkable detailed-style game" onPointerDown={()=>{if(!paused)host.current.focus();}} onFocus={()=>{if(sceneRef.current?.input.keyboard)sceneRef.current.input.keyboard.enabled=true;}} onBlur={()=>{const k=sceneRef.current?.input.keyboard;if(k){k.enabled=false;k.resetKeys();}}} onKeyDown={e=>{if(e.key.startsWith('Arrow'))e.preventDefault();}}/>
    <header className="detailed-play-toolbar"><span>Detailed style · temporary playtest</span><button className="back-button" aria-pressed={muted} onClick={()=>setMuted(m=>!m)}>{muted?'Unmute footsteps':'Mute footsteps'}</button><button className="back-button" onClick={()=>setPaused(p=>!p)}>{paused?'Resume':'Pause'}</button><button className="back-button" onClick={onClose}>Exit playtest</button></header>
    <div className="detailed-play-instructions">WASD / arrows: walk · Left-click: interact · Mouse wheel: zoom · Esc: pause</div>
    <PlayerHud spriteUrl={user.character?.spriteUrl} name={user.username} health={100} maxHealth={100}/>
    <p className="detailed-play-message" role="status">{message}</p>
    {paused&&<div className="detailed-play-paused"><div><h2>Paused</h2><p>This test does not save player position or change your worlds.</p><button className="design-button" onClick={()=>setPaused(false)}>Resume</button><button className="text-button" onClick={onClose}>Return to style builder</button></div></div>}
  </div>;
}
