import React,{useEffect,useRef,useState} from 'react';
import {createPixelGame} from './world/pixelGame.js';
import {MechanicMapScene} from './MechanicMapScene.js';
import {initialMechanicPreview} from './mechanicPreview.js';
export default function MechanicPreview({mechanic,onClose,heroUrl,object}){
  const hostRef=useRef(null),sceneRef=useRef(null);
  const [state,setState]=useState(initialMechanicPreview),[target,setTarget]=useState('dummy'),[now,setNow]=useState(Date.now()),[revision,setRevision]=useState(0),[error,setError]=useState(''),[ready,setReady]=useState(false);
  useEffect(()=>{
    setReady(false);setError('');setState(initialMechanicPreview());
    let live=true;
    const scene=new MechanicMapScene({mechanic,heroUrl,object,onState:value=>{if(live)setState(value);},onReady:value=>{sceneRef.current=value;value.input.keyboard.enabled=document.activeElement===hostRef.current;if(live)setReady(true);},onError:value=>{if(live)setError(value);}});
    const destroy=createPixelGame(hostRef.current,scene);hostRef.current.focus();
    const timer=setInterval(()=>setNow(Date.now()),100);
    return()=>{live=false;sceneRef.current=null;clearInterval(timer);destroy();};
  },[mechanic,heroUrl,object,revision]);
  function focusMap(){const scene=sceneRef.current;if(scene?.input.keyboard)scene.input.keyboard.enabled=true;}
  function blurMap(){const keyboard=sceneRef.current?.input.keyboard;if(keyboard){keyboard.enabled=false;keyboard.resetKeys();}}
  const remaining=state.lastUsed===null?0:Math.max(0,mechanic.cooldown-(now-state.lastUsed)/1000);
  return <section className="mechanic-preview"><div className="native-asset-list-head"><h2>Test map: {mechanic.name||'Untitled action'}</h2><button type="button" className="text-button" onClick={onClose}>Close preview</button></div>
    <p>A small game map using the same terrain, avatar, equipment and movement renderer as map preview. Click the map, walk with WASD or arrow keys, then left-click the practice tree or rock to perform the action.</p>
    <p>The grid and highlighted tiles show range. All test effects stay in this temporary map.</p>
    {object&&<p>Held object: {object.name}</p>}{mechanic.behavior&&<p>Effect: {mechanic.behavior.effect} ? Amount: {mechanic.behavior.amount}</p>}
    {!heroUrl&&<p role="alert">Create a character first to test avatar actions.</p>}{error&&<p role="alert">{error}</p>}
    <div ref={hostRef} className="mechanic-map-host" tabIndex={0} role="region" aria-label="Mechanic practice map. Move with WASD or arrow keys and left-click to act." onFocus={focusMap} onBlur={blurMap} onPointerDown={()=>{hostRef.current.focus();focusMap();}} onKeyDown={e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();}}/>
    <div className="mechanic-preview-controls"><label>Practice target<select value={target} onChange={e=>setTarget(e.target.value)}><option value="dummy">Practice rock</option><option value="tree">Practice tree</option></select></label><button type="button" className="design-button" disabled={!ready||!heroUrl||remaining>0} onClick={()=>{setError('');sceneRef.current?.perform(target);}}>{remaining>0?`Cooldown ${remaining.toFixed(1)}s`:'Perform action'}</button><button type="button" className="text-button" onClick={()=>{setRevision(v=>v+1);setTarget('dummy');}}>Reset test map</button></div>
    <p role="status" aria-live="polite">{state.message}</p><p>Practice health: {state.health}/10 ? Resources: {state.resources} ? Interactions: {state.interactions} ? Emotes: {state.emotes} ? Signals: {state.signals}</p>
  </section>;
}
