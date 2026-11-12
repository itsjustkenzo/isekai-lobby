import React,{useEffect,useMemo,useRef,useState} from 'react';
import {api} from '../api.js';
import {buildArt,toolPreview} from './art.js';
import {createPixelGame} from './pixelGame.js';
import {WorldScene} from './WorldScene.js';
import {applyTool,fromSaved,toSaved,snapshot,restore,TERRAIN_TOOLS,FLOOR_TOOLS,DECOR_TOOLS,ERASER,SPAWN_TOOL,canSpawnAt,findSpawn} from './world.js';
import {setPaintTextures,paintTextures} from './paintTextures.js';
import {setAssets,libraryAssets,assetTool,setAssetOrientation} from './world.js';
import DreamMapDesigner from './DreamMapDesigner.jsx';
import PlayView from './PlayView.jsx';

export default function GeneratedMapEditor({user,onBack,initialMap,mapKind='exterior'}) {
  const hostRef=useRef(null),sceneRef=useRef(null),mapRef=useRef(null),toolRef=useRef('g'),brushRef=useRef(1),strokeRef=useRef(null),versionRef=useRef(0);
  const undoRef=useRef([]),redoRef=useRef([]),mapIdRef=useRef(null),openSequenceRef=useRef(0);
  const [maps,setMaps]=useState([]);
  const [furnishingSummary,setFurnishingSummary]=useState(null);
  const [session,setSession]=useState(0),[loaded,setLoaded]=useState(false),[designer,setDesigner]=useState(false),[dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[tool,setTool]=useState('g'),[brush,setBrush]=useState(1),[grid,setGrid]=useState(true),[preview,setPreview]=useState(false),[,refresh]=useState(0);
  toolRef.current=tool;brushRef.current=brush;
  const art=useMemo(buildArt,[]);
  const changed=()=>{versionRef.current++;setDirty(true);refresh((n)=>n+1);};
  function openMap(data,isNew,id){
    mapIdRef.current=id;setFurnishingSummary(data.furnishingReport??null);
    setAssets(data.generatedAssets??[]);setPaintTextures(data.textures??[]);setAssetOrientation({turn:null,flipped:false});
    mapRef.current=fromSaved(data);undoRef.current=[];redoRef.current=[];strokeRef.current=null;
    setTool(mapRef.current.interior?'o':'g');setDirty(isNew);versionRef.current++;setSession((n)=>n+1);
  }
  useEffect(()=>{
    const previousAssets=libraryAssets(),previousTextures=paintTextures();
    let cancelled=false;
    api('/api/generated-map').then(({ok,data})=>{
      if(cancelled)return;
      if(!ok)throw new Error(data.error||'Could not load your prototype.');
      setMaps((data.maps||[]).filter(m=>(m.kind==='indoor')===(mapKind==='interior')));
      if(initialMap)acceptGenerated(initialMap);else setDesigner(true);
    }).catch((error)=>{if(!cancelled)setNotice(error.message);}).finally(()=>{if(!cancelled)setLoaded(true);});
    return()=>{cancelled=true;openSequenceRef.current++;setAssets(previousAssets);setPaintTextures(previousTextures);};
  },[]);
  useEffect(()=>{
    if(!loaded||!mapRef.current)return;
    const map=mapRef.current;
    const scene=new WorldScene({world:map,heroUrl:user.character?.spriteUrl,showGrid:grid,getTool:()=>toolRef.current,getBrush:()=>brushRef.current,
      onPaint:(x,y)=>{
        if(toolRef.current===SPAWN_TOOL){if(canSpawnAt(map,x,y)){map.spawn={x,y};scene.setMarkers({areas:[],spawn:map.spawn});changed();}return [];}
        if(!strokeRef.current)strokeRef.current={before:snapshot(map),changed:false};
        const indices=applyTool(map,toolRef.current,x,y,brushRef.current);if(indices.length)strokeRef.current.changed=true;return indices;
      },onStrokeEnd:()=>{
        const stroke=strokeRef.current;strokeRef.current=null;if(!stroke?.changed)return;
        undoRef.current=[...undoRef.current.slice(-49),stroke.before];redoRef.current=[];changed();
      },onArea:()=>[]});
    sceneRef.current=scene;scene.setMarkers({areas:[],spawn:findSpawn(map)});
    const destroy=createPixelGame(hostRef.current,scene);return()=>{sceneRef.current=null;destroy();};
  },[loaded,session,user.character?.spriteUrl]);
  useEffect(()=>{sceneRef.current?.setShowGrid(grid);},[grid]);
  useEffect(()=>{if(!dirty)return;const warn=(event)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function history(from,to){const state=from.current.pop();if(!state)return;to.current.push(snapshot(mapRef.current));restore(mapRef.current,state);sceneRef.current?.redrawAll();changed();}
  async function awaitOpen(id){
    const sequence=++openSequenceRef.current;
    try{const {ok,data}=await api(`/api/generated-map?id=${encodeURIComponent(id)}`);if(sequence!==openSequenceRef.current)return;if(!ok)throw new Error(data.error||'Could not open map.');openMap(data.map,false,id);setNotice('');}
    catch(error){setNotice(error.message);}
  }
  async function acceptGenerated(result){
    const id=Array.from(crypto.getRandomValues(new Uint8Array(12)),(n)=>n.toString(16).padStart(2,'0')).join('');
    openMap(result,true,id);setDesigner(false);
    await save();
  }
  async function save(){
    if(!mapRef.current||saving)return;setSaving(true);setNotice('');const version=versionRef.current,id=mapIdRef.current,payload=toSaved(mapRef.current);
    try{const {ok,data}=await api('/api/generated-map',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,prototypeId:id})});if(!ok)throw new Error(data.error||'Could not save prototype.');if(version===versionRef.current)setDirty(false);setMaps((rows)=>[{id,name:payload.name,width:payload.width,height:payload.height,kind:payload.kind,updatedAt:data.updatedAt},...rows.filter((row)=>row.id!==id)]);setNotice('Map saved to your generated maps list.');}
    catch(error){setNotice(error.message);}finally{setSaving(false);}
  }
  async function deleteMap(entry){
    if(saving||!window.confirm(`Permanently delete "${entry.name||'Untitled map'}" and all of its generated assets and paint textures? This cannot be undone.`))return;
    setSaving(true);setNotice('');openSequenceRef.current++;
    try{
      const {ok,data}=await api(`/api/generated-map/${entry.id}`,{method:'DELETE'});
      if(!ok)throw new Error(data.error||'Could not delete map.');
      setMaps((rows)=>rows.filter((row)=>row.id!==entry.id));
      if(mapIdRef.current===entry.id){
        mapRef.current=null;mapIdRef.current=null;undoRef.current=[];redoRef.current=[];strokeRef.current=null;
        setAssets([]);setPaintTextures([]);setDirty(false);setPreview(false);versionRef.current++;setSession((n)=>n+1);
      }
      setNotice('Map and its generated artwork permanently deleted.');
    }catch(error){setNotice(error.message);}finally{setSaving(false);}
  }
  const map=mapRef.current,tools=map?.interior?FLOOR_TOOLS:[...TERRAIN_TOOLS,...DECOR_TOOLS];
  return <section className="editor generated-map-editor" aria-label="Generated map prototype editor">
    <div className="editor-head"><button type="button" className="back-button" onClick={()=>{if(!dirty||window.confirm('Leave this prototype without saving changes?'))onBack();}}>Back</button><h2>{mapKind==='interior'?'Interior':'Exterior'} Map Editor <span className="preview-badge">Prototype</span></h2><div className="generated-editor-actions"><button type="button" className="design-button" disabled={!map||saving} onClick={()=>setPreview(true)}>Preview</button><button type="button" className="design-button" disabled={!map||saving} onClick={save}>{saving?'Saving...':'Save prototype'}</button></div></div>
    <div className="generated-editor-scope">Separate workspace and save. Your regular Create world and player progress are not changed.</div>
    {furnishingSummary&&<p className="generated-editor-scope" role="status">Furnishing groups: {furnishingSummary.completed} / {furnishingSummary.requested} arranged. {furnishingSummary.omitted>0?`${furnishingSummary.omitted} omitted because they could not fit safely.`:'Entrance and walking access checked.'}</p>}
    <div className="editor-body"><aside className="toolbar"><div className="side-panel">
      <div className="tool-group"><h3>Image-generated map</h3><button type="button" className="design-button" disabled={saving} onClick={()=>{if(!dirty||window.confirm('Generate another map? Current unsaved prototype changes will be replaced when you accept the new result.'))setDesigner(true);}}>Generate from image</button><p className="hint">Each map opened from the generator is saved separately. Save prototype updates the map you are editing.</p></div>
      <div className="tool-group"><h3>{mapKind==='interior'?'Interior':'Exterior'} maps ({maps.length})</h3><div className="generated-map-list">{maps.map((entry)=><div className="generated-map-entry" key={entry.id}><button type="button" className={`design-button secondary${mapIdRef.current===entry.id?' active':''}`} disabled={saving} aria-pressed={mapIdRef.current===entry.id} onClick={()=>{if(entry.id!==mapIdRef.current&&(!dirty||window.confirm('Open another map without saving current changes?')))awaitOpen(entry.id);}}><strong>{entry.name||'Untitled map'}</strong><span>{entry.kind==='indoor'?'Interior':'Exterior'} ? {entry.width} ? {entry.height}</span></button><button type="button" className="design-button generated-map-delete" disabled={saving} aria-label={`Delete ${entry.name||'Untitled map'}`} onClick={()=>deleteMap(entry)}>Delete map</button></div>)}{!maps.length&&<p className="hint">Your generated maps will appear here after saving.</p>}</div></div>
      {map&&<>
        <label className="entrance-name">Map name<input maxLength={40} value={map.name??''} onChange={(event)=>{map.name=event.target.value;changed();}}/></label>
        <p className="hint">{map.interior?'Interior':'Exterior'} - {map.width} ? {map.height} tiles</p>
        <div className="tool-group"><h3>{map.interior?'Floor materials':'Terrain and decorations'}</h3><div className="tool-grid">{tools.map((entry)=><button type="button" key={entry.id} className={`tool${tool===entry.id?' active':''}`} aria-pressed={tool===entry.id} onClick={()=>setTool(entry.id)}><img src={toolPreview(art,map.interior||TERRAIN_TOOLS.some((t)=>t.id===entry.id)?'terrain':'decor',entry.id)} alt=""/><span>{entry.label}</span></button>)}<button type="button" className={`tool${tool===ERASER?' active':''}`} onClick={()=>setTool(ERASER)}>Remove decoration</button><button type="button" className={`tool${tool===SPAWN_TOOL?' active':''}`} onClick={()=>setTool(SPAWN_TOOL)}>Player spawn</button></div></div>
        <div className="tool-group"><h3>Reference assets ({map.generatedAssets?.length??0})</h3><div className="tool-grid">{(map.generatedAssets??[]).map((asset)=><button type="button" className={`tool${tool===assetTool(asset)?' active':''}`} key={asset.id} onClick={()=>setTool(assetTool(asset))}><img src={asset.spriteUrl} alt=""/><span>{asset.name}</span></button>)}</div></div>
        <div className="tool-group"><h3>Reference paint ({map.textures?.length??0})</h3><div className="tool-grid">{(map.textures??[]).map((texture)=>{const id=`texture:${texture.surface}:${texture.id}`;return <button type="button" key={texture.id} className={`tool${tool===id?' active':''}`} onClick={()=>setTool(id)}><img src={texture.image} alt=""/><span>{texture.name}</span></button>;})}</div></div>
        <label className="check-row"><input type="checkbox" checked={grid} onChange={(event)=>setGrid(event.target.checked)}/>Show grid</label><label className="entrance-name">Brush size<select value={brush} onChange={(event)=>setBrush(Number(event.target.value))}>{[1,3,5].map((n)=><option key={n} value={n}>{n} ? {n} tiles</option>)}</select></label>
        <div className="map-buttons"><button type="button" className="design-button secondary" disabled={!undoRef.current.length} onClick={()=>history(undoRef,redoRef)}>Undo</button><button type="button" className="design-button secondary" disabled={!redoRef.current.length} onClick={()=>history(redoRef,undoRef)}>Redo</button></div>
      </>}
      <p className="hint" role="status">{notice||(dirty?'Unsaved prototype changes':'')}</p>
    </div></aside><div className="stage"><div className="stage-canvas" ref={hostRef}/>{!map&&<p className="stage-message">{loaded?'Upload an image to generate a prototype map.':'Loading prototype...'}</p>}<p className="stage-hint">Drag to paint | Scroll to zoom | Right-drag to pan</p></div></div>
    {designer&&<DreamMapDesigner mapKind={mapKind} onClose={()=>setDesigner(false)} onCreate={acceptGenerated}/>}
    {preview&&map&&<div className="preview-overlay"><PlayView user={user} preview={{world:map,map:'main',inside:null}} onBack={()=>setPreview(false)}/></div>}
  </section>;
}
