import AssetImageUpload from './world/AssetImageUpload.jsx';
import React,{useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import {TERRAIN_CATEGORIES} from './terrain-spec.js';
import {NATURE_SPRITE_SIZES} from './world/natureSizes.js';
import './assets-builder.css';
import TerrainPreview from './TerrainPreview.jsx';
import {generateBiomeAssets} from './biomeGeneration.js';

export default function AssetsBuilder({onBack,user,interior=false,onPrototype}) {
  const categories=interior?[
    {id:'floors',name:'Floor paint',description:'Room floors and rugs'},
    {id:'walls',name:'Wall paint',description:'Interior wall finishes'},
    {id:'liquid',name:'Liquid paint',description:'Indoor liquids, when requested'},
    {id:'furniture',name:'Furniture',description:'Tables, chairs, beds, shelves and other furniture'},
    {id:'decor',name:'Indoor decorations',description:'Small props and potted plants'},
  ]:TERRAIN_CATEGORIES;
  function categoryAssets(terrain,category){
    const textures=terrain.textures??[],assets=terrain.generatedAssets??[];
    if(interior)return category==='floors'?textures.filter(t=>t.surface==='floor'&&!t.liquid):category==='walls'?textures.filter(t=>t.surface==='wall'):category==='liquid'?textures.filter(t=>t.liquid):category==='furniture'?assets.filter(a=>a.assetKind==='Furniture'):assets.filter(a=>a.assetKind!=='Furniture');
    return category==='paint'?textures.filter(t=>!t.liquid):category==='liquid'?textures.filter(t=>t.liquid):category==='trees'?assets.filter(a=>a.environmentKind==='Tree'):category==='nature'?assets.filter(a=>a.environmentKind&&a.environmentKind!=='Tree'):assets.filter(a=>!a.environmentKind);
  }
  const [terrains,setTerrains]=useState([]),[selected,setSelected]=useState(null),[creating,setCreating]=useState(false);
  const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[category,setCategory]=useState(''),[notice,setNotice]=useState('');
  const [deletingId,setDeletingId]=useState(null),[showAssets,setShowAssets]=useState(false);
  const [referenceFile,setReferenceFile]=useState(null),[referencePreview,setReferencePreview]=useState('');
  useEffect(()=>{if(!referenceFile){setReferencePreview('');return;}const url=URL.createObjectURL(referenceFile);setReferencePreview(url);return()=>URL.revokeObjectURL(url);},[referenceFile]);
  const [previewTerrain,setPreviewTerrain]=useState(null);
  const assetListRef=useRef(null);
  useEffect(()=>{if(showAssets){assetListRef.current?.focus({preventScroll:true});assetListRef.current?.scrollIntoView({block:'start',behavior:'smooth'});}},[showAssets]);
  const blocked=busy||Boolean(deletingId);
  const pending=useRef(false),statusRef=useRef(null),active=terrains.find(t=>t.id===selected);
  useEffect(()=>{if(busy||notice)statusRef.current?.scrollIntoView({block:'nearest',behavior:'smooth'});},[busy,notice]);
  useEffect(()=>{let cancelled=false;api('/api/terrains').then(({ok,data})=>{if(!ok)throw new Error(data.error||'Could not load terrain assets.');if(!cancelled)setTerrains(data.terrains.filter(t=>(t.kind==='interior')===interior));}).catch(e=>{if(!cancelled)setNotice(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[interior]);
  useEffect(()=>{if(!busy)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[busy]);
  function update(terrain){setTerrains(rows=>[terrain,...rows.filter(t=>t.id!==terrain.id)]);setSelected(terrain.id);}
  async function generateBiome(terrain){
    if(pending.current)return;pending.current=true;setBusy(true);setNotice('');
    try{
      await generateBiomeAssets(terrain,{request:api,onTerrain:update,onStage:setCategory});
      setNotice(interior?'Interior assets are ready. Preview your collection below.':'Biome assets are ready. You can now preview the terrain.');
    }catch(e){setNotice(e.message||'Biome generation failed. Please check the server and try again.');}finally{pending.current=false;setBusy(false);setCategory('');}
  }
  async function generate(terrain){
    if(pending.current)return;pending.current=true;setBusy(true);setNotice('');
    try {
      for(const entry of TERRAIN_CATEGORIES){
        if(terrain.completed?.includes(entry.id))continue;setCategory(entry.id);
        const {ok,data}=await api(`/api/terrains/${terrain.id}/generate/${entry.id}`,{method:'POST'});
        if(!ok)throw new Error(data.error||'Could not generate assets.');terrain=data.terrain;update(terrain);
      }
      setNotice('Terrain assets are ready. Use this collection in Generate your map.');
    }catch(e){setNotice(e.message);}finally{pending.current=false;setBusy(false);setCategory('');}
  }
  async function uploadReference(event){
    const file=event.target.files?.[0];if(!file||pending.current)return;setReferenceFile(null);
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024){setNotice('Choose a PNG, JPEG or WebP under 10 MB.');return;}
    pending.current=true;setBusy(true);setCategory('Preparing interior reference');setNotice('');let bitmap;
    try{
      bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
      if(bitmap.width>8192||bitmap.height>8192)throw new Error('Use an image no larger than 8192 pixels per side.');
      const scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!png||png.size>2*1024*1024)throw new Error('Could not prepare this image under 2 MB. Try a smaller reference.');
      setReferenceFile(png);
    }catch(error){setNotice(error.message||'Could not read this reference.');}
    finally{bitmap?.close();pending.current=false;setBusy(false);setCategory('');}
  }
  async function create(event){
    event.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setNotice('');let terrain;
    try{if(interior&&referenceFile)setCategory('AI identifying interior and planning assets');
      const {ok,data}=await (interior&&referenceFile?api('/api/terrains/from-interior-image?'+new URLSearchParams({notes:(title+' '+description).trim().slice(0,2000)}),{method:'POST',headers:{'Content-Type':'image/png'},body:referenceFile}):api('/api/terrains',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,description,kind:interior?'interior':'exterior'})}));if(!ok)throw new Error(data.error||'Could not create terrain. Restart the project server and try again.');if(!data.terrain?.id)throw new Error('The server returned no terrain. Restart the project server and try again.');terrain=data.terrain;update(terrain);setCreating(false);}
    catch(e){setNotice(e.message);}finally{pending.current=false;setBusy(false);}
    if(terrain)await generateBiome(terrain);
  }
  async function regenerate(){
    if(pending.current||!active)return;
    pending.current=true;setBusy(true);setCategory('Planning regenerated collection');setNotice('');let next;
    try{
      const {ok,data}=await api('/api/terrains/'+active.id+'/regenerate',{method:'POST'});
      if(!ok||!data.terrain)throw new Error(data.error||'Could not regenerate this collection.');
      next=data.terrain;update(next);setPreviewTerrain(null);
    }catch(error){setNotice(error.message||'Could not reach the server.');}
    finally{pending.current=false;setBusy(false);setCategory('');}
    if(next)await generateBiome(next);
  }
  async function createPrototype(){
    if(pending.current||!active)return;pending.current=true;setBusy(true);setCategory('AI interior layout');setNotice('');
    try{
      const {ok,data}=await api('/api/terrains/'+active.id+'/interior-prototype',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({size:'auto'})});
      if(!ok||!data.map)throw new Error(data.error||'Could not generate the interior prototype.');
      onPrototype(data.map);
    }catch(error){setNotice(error.message||'Could not reach the server.');}
    finally{pending.current=false;setBusy(false);setCategory('');}
  }
  async function deleteAsset(asset,terrain=active){
    if(pending.current||!terrain)return;
    if(!window.confirm(`Permanently delete "${asset.name}"? This removes its saved artwork, placed copies and paint from all affected maps. This cannot be undone.`))return;
    pending.current=true;setDeletingId(asset.id);setNotice('');
    try{
      const {ok,data}=await api(`/api/terrains/${terrain.id}/assets/${asset.id}`,{method:'DELETE'});
      if(!ok)throw new Error(data.error||'Could not delete this asset.');
      update(data.terrain);setNotice(`Asset permanently deleted. ${data.cleaned} affected saved records cleaned.`);
    }catch(error){setNotice(error.message||'Deletion failed. The asset remains in this view.');}
    finally{pending.current=false;setDeletingId(null);}
  }
  async function deleteTerrain(terrain){
    if(pending.current)return;
    const count=(terrain.generatedAssets?.length??0)+(terrain.textures?.length??0);
    if(!window.confirm(`Permanently delete terrain "${terrain.title}" and all ${count} assets and textures? Saved maps will lose its artwork, placements and paint. This cannot be undone.`))return;
    pending.current=true;setDeletingId(terrain.id);setNotice('');
    try{
      const {ok,data}=await api(`/api/terrains/${terrain.id}`,{method:'DELETE'});
      if(!ok)throw new Error(data.error||'Could not delete this terrain.');
      setTerrains(rows=>rows.filter(row=>row.id!==terrain.id));
      if(selected===terrain.id)setSelected(null);
      setNotice(`Terrain permanently deleted with its ${data.assets} assets and textures. Affected saved references were cleaned.`);
    }catch(error){setNotice(error.message||'Deletion failed. The terrain remains in this view.');}
    finally{pending.current=false;setDeletingId(null);}
  }
  function renderAssetCategories(collections){
    return categories.map(entry=>{const media=collections.flatMap(terrain=>{const active=terrain;return categoryAssets(active,entry.id).map(asset=>({...asset,sourceTerrain:terrain}));});return <section className="native-asset-category" data-category={entry.id} key={entry.id}><h3>{entry.name} ({media.length}){category===entry.id&&<span className="native-builder-spinner small" aria-hidden="true"/>}</h3><p>{entry.description}</p><div className="native-asset-grid">{media.map(asset=><figure key={asset.id}><div className={asset.environmentKind==='Tree'?'native-tree-preview':undefined}><img src={asset.image??asset.spriteUrl} alt={asset.name} style={asset.environmentKind==='Tree'?{width:NATURE_SPRITE_SIZES.Tree[asset.sizeVariant][0]*4,height:NATURE_SPRITE_SIZES.Tree[asset.sizeVariant][1]*4,minWidth:0}:undefined}/></div><figcaption>{asset.name}<small className="native-tree-size">{asset.sourceTerrain.title}</small>{asset.environmentKind==='Tree'&&<small className="native-tree-size">{NATURE_SPRITE_SIZES.Tree[asset.sizeVariant][1]/16} tiles high ? {NATURE_SPRITE_SIZES.Tree[asset.sizeVariant][1]*(asset.pixelScale??1)}px</small>}</figcaption><button type="button" className="native-delete-asset" disabled={blocked} onClick={()=>deleteAsset(asset,asset.sourceTerrain)} aria-label={`Permanently delete ${asset.name}`}>{deletingId===asset.id?'Deleting?':asset.image?'Delete texture':'Delete asset'}</button></figure>)}</div>{!media.length&&<p>{category===entry.id?'Generating this category…':'No assets generated in this category yet.'}</p>}</section>;});
  }
  const complete=active?.completed?.length??0;
  const progressTotal=active?.assetPlan?active.assetPlan.items.filter(p=>p.selected).length:TERRAIN_CATEGORIES.length;
  const progressReady=active?.assetPlan?(active.planCompleted?.length??0):complete;
  return <section className="native-assets-builder" aria-busy={blocked||loading}>
    <header className="native-builder-head"><button className="back-button" disabled={blocked} onClick={onBack}>Back to greeting</button><div><span className="native-builder-kicker">ISEKAI ZERO · CREATOR TOOLS</span><h1>{interior?'Interior Asset Builder':'Assets Builder'}</h1></div><button type="button" className="design-button secondary" disabled={loading} aria-expanded={showAssets} aria-controls="terrain-assets-list" onClick={()=>setShowAssets(value=>!value)}>{interior?'List of interior assets':'List of terrain assets'}</button><button className="design-button" disabled={blocked} onClick={()=>{setCreating(true);setReferenceFile(null);setTitle('');setDescription('');setNotice('');}}>{interior?'+ Create new interior':'+ Create new terrain'}</button></header>
    <p className="native-builder-intro">{interior?'Describe an interior to generate reusable floor paint, wall finishes, furniture and indoor decorations.':'Build your terrain collection first. Your maps will use its saved texture paint, trees, nature and environmental props.'}</p>
    <div ref={statusRef}>{notice&&<p className="notice" role="alert">{notice}</p>}</div>
    {busy&&<div className="native-generation-status" role="status" aria-live="polite"><span className="native-builder-spinner" aria-hidden="true"/><div><strong>{category?`Generating ${(categories.find(c=>c.id===category)?.name??category)}…`:'Creating your terrain…'}</strong><p>Each item can take a few minutes. Completed artwork is saved automatically.</p><progress value={progressReady} max={progressTotal}/><small>{progressReady} / {progressTotal} items ready</small></div></div>}
    {creating&&<form className="native-terrain-form login-form" onSubmit={create}><h2>{interior?'Create new interior':'Create new terrain'}</h2>{interior&&<><AssetImageUpload label="Interior reference picture (optional)" image={referencePreview} disabled={blocked} onChange={uploadReference}/>{referenceFile&&<button type="button" className="text-button" disabled={blocked} onClick={()=>setReferenceFile(null)}>Remove reference picture</button>}<p>Upload a picture to let AI identify the interior type, materials and furnishings. Title and description become optional notes; otherwise describe the interior below.</p></>}<label>Title<input autoFocus required={!referenceFile} maxLength={80} disabled={blocked} value={title} onChange={e=>setTitle(e.target.value)} placeholder={interior?'Rustic tavern':'Grassland Plains'}/></label><label>{interior?'Interior description':'Terrain description'}<textarea required={!referenceFile} rows={4} maxLength={2000} disabled={blocked} value={description} onChange={e=>setDescription(e.target.value)} placeholder={interior?'Warm timber floors, plaster walls, oak tables and chairs, candle lamps and shelves.':'A terrain full of green grass, leafy trees, wildflowers and dirt paths.'}/></label><p>Generates new detailed fantasy pixel-art assets using the current male and female character style references, with 48px material tiles and three-times-resolution prop artwork. AI chooses suitable materials and assets, then generates their artwork automatically. Uses analysis and image-generation credits.</p><div><button className="design-button" type="submit" disabled={blocked||(!referenceFile&&(!title.trim()||!description.trim()))}>{interior?'Generate interior assets':'Generate biome assets'}</button><button className="text-button" type="button" disabled={blocked} onClick={()=>setCreating(false)}>Cancel</button></div></form>}
 {showAssets&&<section id="terrain-assets-list" className="native-terrain-asset-list" ref={assetListRef} tabIndex={-1} aria-label="All generated terrain assets"><div className="native-asset-list-head"><h2>{interior?'All interior assets':'All terrain assets'}</h2><button type="button" className="text-button" onClick={()=>setShowAssets(false)}>Close list</button></div>{renderAssetCategories(terrains)}</section>}
    {previewTerrain&&<TerrainPreview key={previewTerrain.id} terrain={previewTerrain} user={user} onClose={()=>setPreviewTerrain(null)}/>}
    <div className="native-builder-layout"><aside><h2>{interior?'Your interiors':'Your terrains'}</h2>{loading&&<p role="status">Loading terrain collections…</p>}{!loading&&!terrains.length&&<p>Create a terrain to start generating assets.</p>}{terrains.map(t=><div className="native-terrain-entry" key={t.id}><button className={`native-terrain-card${selected===t.id?' selected':''}`} key={t.id} disabled={blocked} onClick={()=>setSelected(t.id)}><strong>{t.title}</strong><small>{t.assetPlan?`${t.planCompleted.length} / ${t.assetPlan.items.filter(p=>p.selected).length} items`:`${t.completed?.length??0} / ${TERRAIN_CATEGORIES.length} categories`}</small></button><button type="button" className="native-delete-asset native-delete-terrain" disabled={blocked} onClick={()=>deleteTerrain(t)} aria-label={`Permanently delete terrain ${t.title}`}>{deletingId===t.id?'Deleting terrain...':'Delete terrain'}</button></div>)}</aside>
    <div>{active?<><div className="native-terrain-heading"><div><h2>{active.title}</h2><p>{active.description}</p><small>{active.pixelScale===3?'High resolution: 48px tiles':active.artStyle==='detailed-fantasy-v1'?'Detailed fantasy art direction':'Earlier collection: regenerate assets to adopt the current detailed fantasy style.'}</small></div>{active.assetPlan?<button className="design-button" disabled={blocked||!active.textures.length||active.assetPlan.items.some(p=>p.selected&&!active.planCompleted.includes(p.id))} onClick={()=>setPreviewTerrain(active)}>{interior?'Preview interior':'Preview terrain'}</button>:!active.generatedAssets.length&&!active.textures.length?<button className="design-button" disabled={blocked} onClick={()=>generateBiome(active)}>{interior?'Generate interior assets':'Generate biome assets'}</button>:complete<TERRAIN_CATEGORIES.length?<button className="design-button" disabled={blocked} onClick={()=>generate(active)}>Generate remaining assets</button>:<button className="design-button" disabled={blocked} onClick={()=>setPreviewTerrain(active)}>{interior?'Preview interior':'Preview terrain'}</button>}</div>
      <div className="native-asset-category"><button type="button" className="design-button" disabled={blocked} onClick={regenerate}>Regenerate assets</button><p>Creates a fresh high-resolution collection using the same description and reference picture. Keeps this collection and its existing maps. Uses analysis and image-generation credits.</p></div>
      {active.assetPlan&&<section className="native-asset-category"><h3>{interior?'Interior collection':'Biome collection'}</h3><p>{active.assetPlan.interpretation}</p><p>{progressReady} / {progressTotal} items generated. Nature items include separate small, medium and large artwork.</p>{active.assetPlan.items.some(p=>p.selected&&!active.planCompleted.includes(p.id))&&<button type="button" className="design-button" disabled={blocked} onClick={()=>generateBiome(active)}>{interior?'Generate remaining interior assets':'Generate remaining biome assets'}</button>}</section>}
      {interior&&<section className="native-asset-category"><h3>AI interior prototype</h3><p>AI arranges this collection?s saved floors, walls and furnishings into an editable room. No picture upload or new artwork generation. Uses layout-analysis credits.</p><p>AI automatically chooses the room size from the description, reference and saved furnishings.</p><button type="button" className="design-button" disabled={blocked||!active.textures.some(t=>t.surface==='floor'&&!t.liquid)||!active.textures.some(t=>t.surface==='wall')} onClick={createPrototype}>Create prototype interior map</button></section>}
      <section className="native-terrain-asset-list" aria-label={`Assets in ${active.title}`}><h3>Assets in {active.title} ({active.textures.length+active.generatedAssets.length})</h3>{renderAssetCategories([active])}</section>
    </>:<div className="native-builder-empty"><h2>{interior?'Your interior starts here':'Your terrain starts here'}</h2><p>{interior?'Create an interior, describe the room and generate its reusable assets. Preview the collection without uploading a picture.':'Create new terrain, describe its environment and generate reusable assets. Then upload a picture in Generate your map to build a layout using this artwork.'}</p></div>}</div></div>
  </section>;
}
