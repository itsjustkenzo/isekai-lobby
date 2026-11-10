import DetailedStylePlay from './DetailedStylePlay.jsx';
import React,{useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import {DETAIL_ASSETS} from './detailedStyleSpec.js';
import {DetailedStyleScene} from './DetailedStyleScene.js';
import {createPixelGame} from './world/pixelGame.js';
import './assets-builder.css';

export default function DetailedStylePrototype({user,onBack}){
  const [playing,setPlaying]=useState(false);
  const [assets,setAssets]=useState([]),[busy,setBusy]=useState(false),[stage,setStage]=useState(''),[notice,setNotice]=useState(''),[description,setDescription]=useState('An ornate fantasy hall: pale limestone, navy and burgundy upholstery, aged gold, carved wood and candlelight.');
  const host=useRef(null),sceneRef=useRef(null),pending=useRef(false);
  useEffect(()=>{
    if(playing)return;
    const scene=new DetailedStyleScene({assets,heroUrl:user.character?.spriteUrl});sceneRef.current=scene;
    const destroy=createPixelGame(host.current,scene);return()=>{destroy();sceneRef.current=null;};
  },[assets,user.character?.spriteUrl,playing]);
  useEffect(()=>{if(!busy)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
  async function generate(){
    if(pending.current)return;pending.current=true;setBusy(true);setNotice('');const failures=[];
    try{
      for(const [id,spec] of Object.entries(DETAIL_ASSETS)){
        if(assets.some(a=>a.id===id))continue;setStage(spec.label);
        const {ok,data}=await api('/api/style-prototype/assets/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({description})});
        if(!ok||!data.asset){failures.push(spec.label+': '+(data.error||'Generation failed'));continue;}
        setAssets(rows=>[...rows.filter(a=>a.id!==id),data.asset]);
      }
      setNotice(failures.length?failures.join('; '):'Detailed environment ready. Click the map and walk around to compare character, furniture and floor detail.');
    }catch(error){setNotice(error.message||'Could not reach the server. Completed artwork remains available in this session.');}
    finally{pending.current=false;setBusy(false);setStage('');}
  }
  return <section className="native-assets-builder"><header className="native-builder-head"><button className="back-button" disabled={busy} onClick={onBack}>Back to greeting</button><h1>Detailed style prototype</h1></header>
    <p>48 × 48px tiles · 96px character artwork · separate movement, collision and camera. Your current avatar is reused; regenerate it in avatar creation to apply the new male/female reference style.</p>
    <p>This is a temporary visual test. Artwork stays in this page’s memory and is lost when you leave or refresh. Existing worlds, assets and player progress are unchanged.</p>
    <label className="login-form">Environment direction<textarea rows={3} maxLength={800} disabled={busy||assets.length>0} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <div className="native-asset-list-head"><button className="design-button" disabled={busy||assets.length===6} onClick={generate}>{assets.length?'Generate remaining artwork':'Generate environment artwork (6 images)'}</button><button className="text-button" disabled={busy||!assets.length} onClick={()=>{setAssets([]);setNotice('Environment cleared. You can change the direction and generate another set.');}}>Clear test artwork</button><span>{assets.length} / 6 assets ready</span></div>
    <p>Uses image-generation credits: one request per missing asset, with no automatic paid retries. Before generation, solid placeholders show scale only.</p>
    {busy&&<div className="native-generation-status" role="status"><span className="native-builder-spinner"/><strong>Generating {stage}…</strong></div>}{notice&&<p className="notice" role="status">{notice}</p>}
    <button type="button" className="design-button" disabled={busy} onClick={()=>setPlaying(true)}>Play detailed-style preview</button>
    {playing&&<DetailedStylePlay user={user} assets={assets} onClose={()=>setPlaying(false)}/>}
    <p>Click the map; walk with WASD or arrow keys. The camera follows your character. Furniture blocks movement at its floor footprint.</p>
    <div ref={host} className="mechanic-map-host building-scale-host" tabIndex={0} role="region" aria-label="48 pixel world and 96 pixel character style test" onPointerDown={()=>host.current.focus()} onFocus={()=>{if(sceneRef.current?.input.keyboard)sceneRef.current.input.keyboard.enabled=true;}} onBlur={()=>{const keyboard=sceneRef.current?.input.keyboard;if(keyboard){keyboard.enabled=false;keyboard.resetKeys();}}} onKeyDown={e=>{if(e.key.startsWith('Arrow'))e.preventDefault();}}/>
  </section>;
}
