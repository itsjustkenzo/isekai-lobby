import {drawInteriorLightingTile} from './interiorLighting.js';
import {drawInteriorBorderTile} from './interiorBorder.js';
import {interiorSpriteLayout} from '../interiorAssetScale.js';
import {INTERIOR_MAP_SIZES} from '../interiorMapSizes.js';
import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {api} from '../api.js';
import AssetImageUpload from './AssetImageUpload.jsx';
import {drawGroundTransitions} from './groundTransitions.js';

export default function DreamMapDesigner({onCreate,onClose}) {
  const [interiorSize,setInteriorSize]=useState('medium');
  const [name,setName]=useState(''),[image,setImage]=useState(null),[preview,setPreview]=useState(''),[dimensions,setDimensions]=useState(null),[selection,setSelection]=useState(null);
  const [busy,setBusy]=useState(false),[processing,setProcessing]=useState(false),[result,setResult]=useState(null),[notice,setNotice]=useState('');
  const canvasRef=useRef(null),dialogRef=useRef(null),pending=useRef(false),fileSequence=useRef(0);
  useEffect(()=>{const previous=document.activeElement;dialogRef.current?.focus();return()=>previous?.focus();},[]);
  useEffect(()=>{
    function key(event){
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!pending.current)onClose();}
      if(event.key==='Tab'){
        const nodes=[...dialogRef.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')];
        const first=nodes[0],last=nodes[nodes.length-1];
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialogRef.current)){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialogRef.current)){event.preventDefault();first?.focus();}
      }
    }
    window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
  },[onClose]);
  useEffect(()=>{
    if(!result||!canvasRef.current)return;
    let cancelled=false;
    const canvas=canvasRef.current;canvas.width=result.width*16;canvas.height=result.height*16;
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    const colors={o:'#aa7343',c:'#ae4f71',g:'#6cad4b',d:'#aa7343',w:'#377dc4',s:'#979ba3',a:'#e4ca89'};
    function load(url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Could not load map artwork preview.'));image.src=url;});}
    for(let i=0;i<result.terrain.length;i++){ctx.fillStyle=colors[result.terrain[i]];ctx.fillRect(i%result.width*16,Math.floor(i/result.width)*16,16,16);}
    const media=[...(result.textures??[]).map(t=>({id:t.id,url:t.image})),...(result.generatedAssets??[]).map(a=>({id:a.id,url:a.spriteUrl}))];
    Promise.all(media.map(async item=>[item.id,await load(item.url)])).then(entries=>{
      if(cancelled)return;const images=new Map(entries),assets=new Map((result.generatedAssets??[]).map(a=>[a.id,a]));
      for(const [index,paint] of Object.entries(result.paint??{})){const image=images.get(paint.id);if(image)ctx.drawImage(image,Number(index)%result.width*16,Math.floor(Number(index)/result.width)*16,16,16);}
      for(let y=0;y<result.height;y++)for(let x=0;x<result.width;x++)drawGroundTransitions(ctx,result,x,y,result.textures??[],id=>images.get(id));
      for(let y=0;y<result.height;y++)for(let x=0;x<result.width;x++)drawInteriorBorderTile(ctx,result,x,y);
      for(let y=0;y<result.height;y++)for(let x=0;x<result.width;x++)drawInteriorLightingTile(ctx,result,x,y,result.generatedAssets??[]);
      for(const p of [...(result.placed??[])].sort((a,b)=>a.y-b.y)){
        const image=images.get(p.a),asset=assets.get(p.a);if(!image||!asset)continue;
        const temp=document.createElement('canvas');temp.width=image.width;temp.height=image.height;
        const pixels=temp.getContext('2d');pixels.drawImage(image,0,0);
        const layout=interiorSpriteLayout(asset,pixels.getImageData(0,0,image.width,image.height).data,image.width,image.height);
        if(layout)ctx.drawImage(image,layout.x,layout.y,layout.width,layout.height,p.x*16+asset.width*8-layout.displayWidth/2,(p.y+1)*16-(p.elevation??0)-layout.displayHeight,layout.displayWidth,layout.displayHeight);
        else ctx.drawImage(image,p.x*16+(asset.width*16-image.width)/2,(p.y+1)*16-(p.elevation??0)-image.height);
      }
      ctx.fillStyle='#ffdf36';ctx.fillRect(result.spawn.x*16+5,result.spawn.y*16+5,6,6);
    }).catch(error=>{if(!cancelled)setNotice(error.message);});
    return()=>{cancelled=true;};
  },[result]);
  async function upload(event){
    const file=event.target.files?.[0];if(!file)return;
    const sequence=++fileSequence.current;setResult(null);setSelection(null);setImage(null);setPreview('');setNotice('');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024){setNotice('Choose a PNG, JPEG, or WebP under 10 MB.');return;}
    setProcessing(true);
    try{
      const bitmap=await createImageBitmap(file);
      if(bitmap.width>8192||bitmap.height>8192){bitmap.close();throw new Error('Use an image no larger than 8192 pixels per side.');}
      const original={width:bitmap.width,height:bitmap.height},scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const blob=await new Promise((resolve)=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('Could not read this image.');
      if(sequence!==fileSequence.current)return;
      setImage(blob);setDimensions(original);setPreview(canvas.toDataURL('image/png'));
      if(!name.trim())setName(file.name.replace(/\.[^.]+$/,'').slice(0,40));
    }catch(error){if(sequence===fileSequence.current)setNotice(error.message);}
    finally{if(sequence===fileSequence.current)setProcessing(false);}
  }
  async function generate(event){
    event.preventDefault();if(!image||!dimensions||!name.trim()||pending.current)return;
    pending.current=true;setBusy(true);setNotice('');
    try{
      const query=new URLSearchParams({name:name.trim(),width:String(dimensions.width),height:String(dimensions.height),interiorSize});
      const {ok,data}=await api(`/api/maps/dream?${query}`,{method:'POST',headers:{'Content-Type':'image/png'},body:image});
      if(!ok)throw new Error(data.error||'Map generation failed.');setResult(data.map);setSelection(data.selection);
    }catch(error){setNotice(error.message||'Could not reach the server.');}
    finally{pending.current=false;setBusy(false);}
  }
  return createPortal(<div className="modal-backdrop" onClick={()=>!pending.current&&onClose()}>
    <div className="modal dream-map-designer" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="dream-map-title" onClick={(event)=>event.stopPropagation()}>
      <div className="modal-head"><h2 id="dream-map-title">Generate your map</h2><button type="button" className="text-button" disabled={busy} onClick={onClose}>Close</button></div>
      <p className="designer-intro">Name your map and upload a picture. AI identifies the setting, chooses the best matching terrain from your Assets Builder collections, and arranges its saved artwork into an editable map.</p>
      <form className="login-form" onSubmit={generate}>
        <label>Map name<input required maxLength={40} value={name} disabled={busy} onChange={(event)=>setName(event.target.value)}/></label>
        <label>Interior map size<select disabled={busy} value={interiorSize} onChange={e=>setInteriorSize(e.target.value)}>{Object.entries(INTERIOR_MAP_SIZES).map(([key,size])=><option key={key} value={key}>{key[0].toUpperCase()+key.slice(1)} ? {size.width} ? {size.height} tiles</option>)}</select></label><p className="hint">Used when the image is identified as an interior. Exterior map sizing stays automatic.</p>
        <AssetImageUpload label="Your map image" image={preview} required disabled={busy||processing} onChange={upload}/>
        <p className="hint">The image controls terrain regions and prop positions. Saved terrain artwork supplies the materials and objects. Missing prop types are omitted. Liquids block movement. Your regular worlds and player progress stay separate.</p>
        <button type="submit" className="design-button" disabled={busy||processing||!image||!name.trim()}>{busy?'Assembling map from saved assets...':result?'Regenerate map':'Generate dream map'}</button>
        {busy&&<p className="hint" role="status"><span className="terrain-map-spinner" aria-hidden="true"/> AI is identifying the terrain and indoor/outdoor setting, then arranging the best matching saved assets. This uses layout-analysis credits and can take a few minutes.</p>}
        {notice&&<p className="notice" role="alert">{notice}</p>}
      </form>
      {result?.furnishingReport&&<p className="hint">Furnishing groups: {result.furnishingReport.completed} / {result.furnishingReport.requested} arranged; {result.furnishingReport.omitted} omitted where no safe layout fit.</p>}
      {result?.environmentReport&&<div className="hint"><p>Environment seed: {result.environmentReport.seed}. Added {result.environmentReport.added} environmental details from the selected terrain.</p>{result.environmentReport.missingAssets.length>0&&<p>Missing compatible assets: {result.environmentReport.missingAssets.join(', ')}. Add these to this terrain in Assets Builder for fuller results.</p>}</div>}
      {result&&<section className="dream-map-result"><h3>Editable tile preview</h3>{selection&&<p><strong>Selected terrain: {selection.title}</strong><br/>{selection.kind==='interior'?'Interior':'Exterior'} ? {selection.reason}</p>}<canvas ref={canvasRef} aria-label={`${result.width} by ${result.height} tile map preview`}/><p>{result.generatedAssets?.length??0} available assets ? {result.placed?.length??0} placed props ? {result.textures?.length??0} paint textures</p><p>{result.width} ? {result.height} tiles ? Spawn marked in gold</p><button className="design-button" type="button" disabled={busy} onClick={()=>{try{onCreate({...result,name:name.trim()||result.name});}catch(error){setNotice(error.message);}}}>Open in prototype editor</button><p className="hint">Opening this result saves it as a new map in your generated maps list. Further edits use Save prototype. Your regular Create world stays separate.</p></section>}
    </div>
  </div>,document.body);
}
