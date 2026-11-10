import React,{useEffect,useRef,useState} from 'react';
import NpcPreview from './NpcPreview.jsx';
import {api} from './api.js';
import AssetImageUpload from './world/AssetImageUpload.jsx';
import './assets-builder.css';

export default function NpcAssetsBuilder({onBack}){
  const [npcs,setNpcs]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[notice,setNotice]=useState('');
  const [mode,setMode]=useState('random'),[gender,setGender]=useState('female'),[appearance,setAppearance]=useState(''),[file,setFile]=useState(null),[photo,setPhoto]=useState('');
  const [previewNpc,setPreviewNpc]=useState(null);
  const [editing,setEditing]=useState(null),[limit,setLimit]=useState(20),pending=useRef(false);
  useEffect(()=>{let live=true;api('/api/npcs').then(({ok,data})=>{if(!ok)throw new Error(data.error||'Could not load NPCs.');if(live){setNpcs(data.npcs);setLimit(data.max??20);}}).catch(e=>{if(live)setNotice(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[]);
  useEffect(()=>{if(!file){setPhoto('');return;}const url=URL.createObjectURL(file);setPhoto(url);return()=>URL.revokeObjectURL(url);},[file]);
  useEffect(()=>{if(!busy)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
  async function upload(e){
    const next=e.target.files?.[0];if(!next||pending.current)return;
    setFile(null);setNotice('');
    if(!['image/png','image/jpeg','image/webp'].includes(next.type)||next.size>10*1024*1024){setNotice('Choose a PNG, JPEG or WebP photo under 10 MB.');return;}
    pending.current=true;setBusy('Preparing photo');let bitmap;
    try{
      bitmap=await createImageBitmap(next,{imageOrientation:'from-image'});
      if(bitmap.width>8192||bitmap.height>8192)throw new Error('Use a photo no larger than 8192 pixels per side.');
      const scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!png)throw new Error('Could not prepare this photo. Try exporting it as PNG or JPEG.');
      setFile(png);
    }catch(error){setNotice(error.message||'Could not read this photo.');}
    finally{bitmap?.close();pending.current=false;setBusy('');}
  }
  async function generate(e){
    e.preventDefault();if(pending.current)return;pending.current=true;setBusy('Generating NPC appearance');setNotice('');
    try{
      const query=new URLSearchParams({mode,gender,name:'Unnamed NPC',appearance:mode==='prompt'?appearance:''});
      const {ok,data}=await api(`/api/npcs?${query}`,{method:'POST',headers:{'Content-Type':mode==='photo'?file.type:'application/octet-stream'},body:mode==='photo'?file:new Uint8Array()});
      if(!ok||!data.npc)throw new Error(data.error||'NPC generation failed.');
      setNpcs(rows=>[...rows,data.npc]);setEditing(data.npc);setNotice('Appearance generated and saved. Add the NPC’s name, description and prompt below.');
    }catch(e){setNotice(e.message||'Could not reach the server.');}finally{pending.current=false;setBusy('');}
  }
  async function save(e){
    e.preventDefault();if(pending.current||!editing)return;pending.current=true;setBusy('Saving NPC details');setNotice('');
    try{
      const {ok,data}=await api(`/api/npcs/${editing.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:editing.name,description:editing.description,prompt:editing.prompt})});
      if(!ok)throw new Error(data.error||'Could not save NPC.');setNpcs(rows=>rows.map(n=>n.id===data.npc.id?data.npc:n));setEditing(data.npc);setNotice('NPC details saved to your collection.');
    }catch(e){setNotice(e.message||'Could not reach the server.');}finally{pending.current=false;setBusy('');}
  }
  return <section className="native-assets-builder" aria-busy={Boolean(busy)||loading}>
    <header className="native-builder-head"><button className="back-button" disabled={Boolean(busy)} onClick={onBack}>Back to greeting</button><h1>NPC Assets</h1></header>
    <p>Create an NPC appearance randomly, from a description, or from an uploaded photo. Then give your NPC a name, description and prompt. Saved NPCs are available in the world editor’s character collection.</p>
    {notice&&<p className="notice" role="status">{notice}</p>}
    {busy&&<div className="native-generation-status" role="status"><span className="native-builder-spinner" aria-hidden="true"/><div><strong>{busy}…</strong><p>{busy.startsWith('Generating')?'This may take a few minutes. The appearance is saved when generation finishes.':'Saving your changes.'}</p></div></div>}
    <div className="mechanics-builder-layout"><form className="native-terrain-form login-form" onSubmit={generate}>
      <h2>Create NPC appearance</h2><label>Appearance source<select disabled={Boolean(busy)} value={mode} onChange={e=>setMode(e.target.value)}><option value="random">Random appearance</option><option value="prompt">Describe appearance</option><option value="photo">Upload a photo</option></select></label>
      <label>Character base<select disabled={Boolean(busy)} value={gender} onChange={e=>setGender(e.target.value)}><option value="female">Female</option><option value="male">Male</option></select></label>
      {mode==='prompt'&&<label>Appearance description<textarea required maxLength={1000} rows={4} disabled={Boolean(busy)} value={appearance} onChange={e=>setAppearance(e.target.value)} placeholder="An elderly merchant with silver hair, round glasses and an emerald coat."/></label>}
      {mode==='photo'&&<AssetImageUpload label="NPC reference photo" required image={photo} disabled={Boolean(busy)} onChange={upload}/>}
      <p>Uses image-generation credits. Each click creates a new saved NPC. {npcs.length} / {limit} NPCs.</p>
      <button className="design-button" type="submit" disabled={Boolean(busy)||loading||npcs.length>=limit||mode==='photo'&&!file||mode==='prompt'&&!appearance.trim()}>{mode==='random'?'Generate random NPC':'Generate NPC appearance'}</button>
    </form>
    {editing&&<form className="native-terrain-form login-form" onSubmit={save}><h2>NPC details</h2><button className="design-button" type="button" disabled={Boolean(busy)} onClick={()=>setPreviewNpc({...editing})}>Preview in game</button><div className="sprite-frame"><img src={editing.spriteUrl} alt={`${editing.name} appearance`}/></div>{['name','description','prompt'].map(field=><label key={field}>{field==='name'?'Name':field==='description'?'Description':'NPC prompt'}{field==='name'?<input required maxLength={40} disabled={Boolean(busy)} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/>:<textarea rows={3} maxLength={field==='description'?300:1000} disabled={Boolean(busy)} value={editing[field]??''} onChange={e=>setEditing({...editing,[field]:e.target.value})} placeholder={field==='prompt'?'Describe the NPC’s personality, role and how they should interact.':'Describe who this NPC is.'}/>}</label>)}<p>The prompt is saved as NPC data. It does not automatically create dialogue or gameplay mechanics.</p><button className="design-button" disabled={Boolean(busy)||!editing.name.trim()}>Save NPC details</button></form>}</div>
    {previewNpc&&<NpcPreview key={previewNpc.id} npc={previewNpc} onClose={()=>setPreviewNpc(null)}/>}
    <section className="mechanics-library"><h2>Your NPCs ({npcs.length})</h2>{loading?<p role="status">Loading NPCs…</p>:!npcs.length?<p>No NPCs yet. Generate an appearance to start.</p>:<div className="native-asset-grid">{npcs.map(n=><figure key={n.id}><div><img src={n.spriteUrl} alt={n.name}/></div><figcaption><strong>{n.name}</strong><p>{n.description}</p><button className="design-button" type="button" disabled={Boolean(busy)} onClick={()=>setPreviewNpc({...n})}>Preview in game</button><button className="design-button" disabled={Boolean(busy)} onClick={()=>{if(!editing||editing.id===n.id||window.confirm('Switch NPC? Unsaved detail changes will be discarded.'))setEditing({...n});}}>Edit NPC details</button></figcaption></figure>)}</div>}</section>
  </section>;
}
