import { PLAY_ZOOM } from './playScale.js';
import { TILE } from './art.js';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function ItemGallery({ items, savedItems, draft, onDelete, onClose }) {
  const [search,setSearch]=useState(''),[category,setCategory]=useState('all');
  const [deleting,setDeleting]=useState(null),[confirmId,setConfirmId]=useState(null),[error,setError]=useState(''),[scale,setScale]=useState('play'),[dpr,setDpr]=useState(window.devicePixelRatio||1);
  useEffect(()=>{const resize=()=>setDpr(window.devicePixelRatio||1);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
  const previewSize=scale==='play'?TILE*PLAY_ZOOM/dpr:TILE;
  async function remove(item) {
    if(deleting)return;setDeleting(item.id);setError('');
    try {await onDelete(item.id);setConfirmId(null);}catch(err){setError(err.message||'Could not delete item.');}finally{setDeleting(null);}
  }
  const dialogRef=useRef(null),searchRef=useRef(null);
  const entries=[...items.map((item)=>({ ...item, status: savedItems.some((saved)=>saved.id===item.id&&JSON.stringify(saved)===JSON.stringify(item))?'Saved to game':savedItems.some((saved)=>saved.id===item.id)?'Unsaved changes':'Not saved yet' })),...(draft?[{...draft,id:'draft-preview',status:'Preview only - not added'}]:[])];
  const matches=entries.filter((item)=>(category==='all'||item.category===category)&&`${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase().trim()));
  useEffect(()=>{const previous=document.activeElement;searchRef.current?.focus();return()=>previous?.focus();},[]);
  useEffect(()=>{
    const onKey=(event)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!deleting)onClose();}
      if(event.key!=='Tab')return;
      const controls=[...dialogRef.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')],first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    window.addEventListener('keydown',onKey,true);return()=>window.removeEventListener('keydown',onKey,true);
  },[onClose,deleting]);
  return createPortal(<div className="modal-backdrop" role="presentation" onClick={()=>!deleting&&onClose()}>
    <div className="modal item-gallery" role="dialog" aria-modal="true" aria-labelledby="item-gallery-title" ref={dialogRef} onClick={(event)=>event.stopPropagation()}>
      <div className="modal-head"><h2 id="item-gallery-title">Game items</h2><button type="button" className="text-button" disabled={Boolean(deleting)} onClick={onClose}>Close</button></div>
      <p className="designer-intro">View your item artwork and save status. Use Save in the editor to save new or changed items to the game.</p>
      <div className="item-gallery-filters"><label>Search items<input type="search" ref={searchRef} value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search names or descriptions" /></label><label>Category<select value={category} onChange={(event)=>setCategory(event.target.value)}><option value="all">All categories</option><option value="seed">Seeds</option><option value="material">Materials</option><option value="usable">Usable items</option></select></label></div>
      <div className="item-gallery-scale"><label>Preview size<select value={scale} onChange={(event)=>setScale(event.target.value)}><option value="play">Play scale</option><option value="native">1? art size</option></select></label><span>{TILE} ? {TILE} art pixels{scale==='play'?` at ${PLAY_ZOOM}? game zoom`:' at 1?'}</span></div>
      {error&&<p className="notice" role="alert">{error}</p>}
      <p className="hint" role="status">{matches.length} {matches.length===1?'item':'items'} shown</p>
      <div className="item-gallery-grid">{matches.map((item)=><article className="item-gallery-card" key={item.id}>
        <div className="item-gallery-art">{item.image?<img src={item.image} alt={item.name||'Item asset preview'} width={previewSize} height={previewSize} style={{width:previewSize,height:previewSize}}/>:<span>Image missing</span>}</div>
        <div className="item-gallery-info"><span className={`item-save-status${item.status==='Saved to game'?' saved':''}`}>{item.status}</span><h3>{item.name||'Unnamed item'}</h3><span className="item-gallery-category">{item.category==='seed'?'Seeds':item.category==='material'?'Materials':'Usable items'}</span>{item.description&&<p>{item.description}</p>}{item.stackLimit&&<small>Stack limit: {item.stackLimit}</small>}</div>
        {item.id!=='draft-preview'&&<div className="item-gallery-delete">{confirmId===item.id?<>
          <p>Permanently delete {item.name}? Its artwork and all player copies will be removed.</p>
          <button type="button" disabled={Boolean(deleting)} onClick={()=>remove(item)}>{deleting===item.id?'Deleting...':'Delete permanently'}</button>
          <button type="button" disabled={Boolean(deleting)} onClick={()=>setConfirmId(null)}>Cancel</button>
        </>:<button type="button" disabled={Boolean(deleting)} onClick={()=>{setConfirmId(item.id);setError('');}}>Delete</button>}</div>}
      </article>)}</div>
      {!matches.length&&<p className="item-gallery-empty">{entries.length?'No items match these filters.':'No items yet. Generate or upload an image, then choose Add item definition.'}</p>}
    </div>
  </div>,document.body);
}
