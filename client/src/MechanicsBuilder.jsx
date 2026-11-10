import React,{useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import './assets-builder.css';
import MechanicPreview from './MechanicPreview.jsx';
const empty={name:'',description:'',category:'interaction',target:'nearby',cooldown:0,range:1};
export default function MechanicsBuilder({onBack,user}){
  const [rows,setRows]=useState([]),[draft,setDraft]=useState(empty),[editing,setEditing]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState('');
  const pending=useRef(false);
  const [objects,setObjects]=useState([]);
  useEffect(()=>{let live=true;api('/api/objects').then(({ok,data})=>{if(ok&&live)setObjects(data.objects??[]);}).catch(()=>{});return()=>{live=false;};},[]);
  const [preview,setPreview]=useState(null);
  useEffect(()=>{let live=true;api('/api/mechanics').then(({ok,data})=>{if(!ok||!Array.isArray(data.mechanics))throw new Error(data.error||'Could not load mechanics. Restart the project server and retry.');if(live)setRows(data.mechanics);}).catch(e=>{if(live)setNotice(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[]);
  const change=(key,value)=>setDraft(p=>({...p,[key]:value}));
  async function generate(){
    if(pending.current)return;pending.current=true;setBusy(true);setNotice('Generating action behavior?');
    try{const {ok,data}=await api('/api/mechanics/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({description:draft.description,objectId:draft.objectId??null})});if(!ok||!data.mechanic)throw new Error(data.error||'AI mechanic generation failed. Restart the server and try again.');setDraft(data.mechanic);setPreview(data.mechanic);setNotice('Mechanic generated. Test it, adjust settings if needed, then save the action.');}catch(e){setNotice(e.message);}finally{pending.current=false;setBusy(false);}
  }
  async function save(e){e.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setNotice('');
    try{const {ok,data}=await api(editing?`/api/mechanics/${editing}`:'/api/mechanics',{method:editing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});if(!ok||!data.mechanic)throw new Error(data.error||'Could not save this mechanic.');setRows(r=>[data.mechanic,...r.filter(x=>x.id!==data.mechanic.id)]);setDraft(empty);setEditing(null);setNotice('Character action saved.');}
    catch(error){setNotice(error.message);}finally{pending.current=false;setBusy(false);}
  }
  async function remove(row){if(pending.current||!window.confirm(`Delete action "${row.name}"?`))return;pending.current=true;setBusy(true);setNotice('');
    try{const {ok,data}=await api(`/api/mechanics/${row.id}`,{method:'DELETE'});if(!ok||!data.ok)throw new Error(data.error||'Could not delete this mechanic.');setRows(r=>r.filter(x=>x.id!==row.id));if(editing===row.id){setEditing(null);setDraft(empty);}setNotice('Character action deleted.');}catch(e){setNotice(e.message);}finally{pending.current=false;setBusy(false);}
  }
  return <section className="native-assets-builder" aria-busy={busy||loading}><header className="native-builder-head"><button type="button" className="back-button" disabled={busy} onClick={onBack}>Back to greeting</button><div><span className="native-builder-kicker">ISEKAI ZERO · CREATOR TOOLS</span><h1>Mechanics Builder</h1></div></header>
    <p className="native-builder-intro">Define reusable actions for your characters: interacting, attacking, gathering, movement abilities, emotes and custom actions.</p><p>Save actions and test their category behavior, targeting, range and cooldown in an isolated practice arena.</p>
    {notice&&<p className="notice" role="status">{notice}</p>}
    {preview&&<MechanicPreview key={JSON.stringify(preview)} mechanic={preview} heroUrl={user?.character?.spriteUrl} object={objects.find(o=>o.id===preview.objectId)} onClose={()=>setPreview(null)}/>}
    <div className="mechanics-builder-layout"><form className="native-terrain-form login-form" onSubmit={save}><h2>{editing?'Edit action':'Create action'}</h2>
      <label>Action name<input required maxLength={60} disabled={busy} value={draft.name} onChange={e=>change('name',e.target.value)} placeholder="Chop wood"/></label>
      <label>What does the character do?<textarea required rows={4} maxLength={1500} disabled={busy} value={draft.description} onChange={e=>change('description',e.target.value)} placeholder="Swing an equipped axe at a nearby tree to gather wood."/></label>
      <label>Use generated object<select disabled={busy} value={draft.objectId??''} onChange={e=>change('objectId',e.target.value||null)}><option value="">No object</option>{objects.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      {draft.objectId&&objects.find(o=>o.id===draft.objectId)&&<img className="mechanic-object-preview" src={objects.find(o=>o.id===draft.objectId).image} alt="Selected action object"/>}
      <button type="button" className="design-button" disabled={busy||!draft.description.trim()} onClick={generate}>{busy?'Working?':'Generate mechanism and preview'}</button><p>AI turns your description into supported action effects and animation settings. Uses analysis credits.</p>
      <label>Action category<select disabled={busy} value={draft.category} onChange={e=>change('category',e.target.value)}>{['interaction','combat','gathering','movement','emote','custom'].map(v=><option key={v}>{v}</option>)}</select></label>
      <label>Target<select disabled={busy} value={draft.target} onChange={e=>change('target',e.target.value)}><option value="self">Self</option><option value="nearby">Nearby object or character</option><option value="direction">Facing direction</option></select></label>
      <label>Cooldown (seconds)<input required disabled={busy} type="number" min="0" max="3600" step="0.1" value={draft.cooldown} onChange={e=>change('cooldown',Number(e.target.value))}/></label>
      <label>Range (tiles)<input required disabled={busy} type="number" min="0" max="32" step="0.5" value={draft.range} onChange={e=>change('range',Number(e.target.value))}/></label>
      <button type="button" className="design-button secondary" disabled={busy||!draft.name.trim()} onClick={()=>setPreview({...draft})}>Preview action</button>
      <button className="design-button" disabled={busy} type="submit">{busy?'Saving changes…':editing?'Save action':'Create action'}</button>{editing&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setEditing(null);setDraft(empty);}}>Cancel editing</button>}
    </form><section className="mechanics-library"><h2>Your character actions ({rows.length})</h2>{loading?<p role="status">Loading saved actions…</p>:!rows.length?<p>No actions yet. Create your first mechanic.</p>:rows.map(row=><article className="mechanic-card" key={row.id}><h3>{row.name}</h3><p>{row.description}</p><p className="hint">{row.category} · {row.target} · {row.cooldown}s cooldown · {row.range} tile range</p><div className="mechanic-actions"><button type="button" className="design-button" onClick={()=>setPreview({...row})}>Test action</button><button type="button" className="design-button secondary" disabled={busy} onClick={()=>{setEditing(row.id);setDraft({...row});}}>Edit action</button><button type="button" className="native-delete-asset" disabled={busy} onClick={()=>remove(row)}>Delete action</button></div></article>)}</section></div>
  </section>;
}
