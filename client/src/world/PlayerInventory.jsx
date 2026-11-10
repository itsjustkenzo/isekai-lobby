import InventoryHeading from './InventoryHeading.jsx';
import InventorySlot from './InventorySlot.jsx';
import PlayerHud from './PlayerHud.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { inventorySettings, itemCatalog, nearbyDrop } from './inventory.js';

export default function PlayerInventory({ world, inventory, open, onOpenChange, blocked, getLocation, preview, actionNotice, hero, visible = true }) {
  const { state,busy,notice,act,retry }=inventory, config=inventorySettings(world), catalog=itemCatalog(world);
  const [inspectKey,setInspectKey]=useState(null),[quantity,setQuantity]=useState(1),[confirmDiscard,setConfirmDiscard]=useState(false);
  const dialogRef=useRef(null);
  const slot=state?.slots.find((entry)=>entry.key===inspectKey), item=catalog.find((entry)=>entry.id===slot?.itemId);
  const [movingKey,setMovingKey]=useState(null);
  const positionOf=(slot,index)=>slot.position??index;
  const atPosition=(position)=>state?.slots.find((slot,index)=>positionOf(slot,index)===position);
  const location=getLocation();
  const nearby=state?.drops.filter((drop)=>nearbyDrop(drop,location)) ?? [];
  useEffect(()=>{setQuantity(1);setConfirmDiscard(false);},[inspectKey]);
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement;dialogRef.current?.focus();
    return()=>previous?.focus();
  },[open]);
  useEffect(()=>{
    function onKey(event){
      const target=event.target;
      if(event.key==='Escape' && open){event.preventDefault();event.stopPropagation();onOpenChange(false);return;}
      if(event.key==='Tab' && open){
        const controls=[...dialogRef.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialogRef.current)){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialogRef.current)){event.preventDefault();first?.focus();}return;
      }
      if(blocked||target?.matches('input,textarea,select')||target?.isContentEditable||event.ctrlKey||event.metaKey||event.altKey)return;
      if(event.key.toLowerCase()==='i'){event.preventDefault();event.stopPropagation();onOpenChange(!open);return;}
      if(open||busy)return;
      const index=event.code==='Digit0'?9:/^Digit[1-9]$/.test(event.code)?Number(event.code.slice(5))-1:-1;
      if(index>=0&&index<config.hotbarSize){event.preventDefault();const id=state?.slots.find((slot,i)=>(slot.position??i)===index)?.itemId;if(id)act({type:'select',itemId:id});}
    }
    window.addEventListener('keydown',onKey,true);return()=>window.removeEventListener('keydown',onKey,true);
  },[open,blocked,busy,state,config.hotbarSize,act,onOpenChange]);
  const moveTo=(slotKey,toIndex)=>{if(!slotKey||busy)return;act({type:'move',slotKey,toIndex});setMovingKey(null);};
  const bagSlot=(position)=>{
    const entry=atPosition(position),definition=catalog.find((item)=>item.id===entry?.itemId),quick=position<config.hotbarSize;
    return <InventorySlot key={position} item={definition} quantity={entry?.quantity} shortcut={quick?(position===9?0:position+1):undefined} active={Boolean(entry&&(entry.key===inspectKey||entry.key===movingKey))} equipped={Boolean(entry&&state.selectedId===entry.itemId)} disabled={busy} allowEmptyInteraction draggable label={entry?`${definition?.name??'Unknown item'}, ${entry.quantity}${quick?`, shortcut ${position+1}`:''}`:`Empty ${quick?'hotbar':'bag'} slot ${position+1}`} onClick={()=>{if(movingKey)moveTo(movingKey,position);else if(entry)setInspectKey(entry.key);}} onDragStart={(event)=>{event.dataTransfer.setData('text/plain',entry.key);event.dataTransfer.effectAllowed='move';setMovingKey(entry.key);}} onDragEnd={()=>setMovingKey(null)} onDragOver={(event)=>{if(!busy){event.preventDefault();event.dataTransfer.dropEffect='move';}}} onDrop={(event)=>{event.preventDefault();moveTo(event.dataTransfer.getData('text/plain'),position);}}/>;
  };
  const hotbar = (inBag = false) => <div className="player-hud-hotbar" style={{'--hotbar-columns': Math.min(5,config.hotbarSize)}} role="group" aria-label={inBag?'Inventory first row: hotbar':'Item hotbar'}>{Array.from({length:config.hotbarSize},(_,i)=>{
    const firstRowSlot=atPosition(i),id=firstRowSlot?.itemId,entry=catalog.find((definition)=>definition.id===id),count=firstRowSlot?.quantity??0;
    return <InventorySlot key={i} hotbar item={entry} quantity={count} shortcut={i===9?0:i+1} disabled={blocked||busy} active={Boolean(id&&state?.selectedId===id)} equipped={Boolean(id&&state?.selectedId===id)} label={`${i===9?0:i+1}: ${entry?.name??'Empty slot'}${entry?`, ${count}`:''}`} onClick={()=>{act({type:'select',itemId:id});if(inBag)setInspectKey(state.slots.find((slot)=>slot.itemId===id)?.key??null);}}/>;
  })}</div>;
  return <>
    <PlayerHud {...hero} visible={visible}>
      <section className="player-hud-inventory" aria-label="Inventory shortcuts">
        <span className="player-hud-section-label">QUICK ITEMS</span>
        <div className="player-hud-first-row">
          {hotbar()}
          <button className="player-hud-bag" type="button" disabled={blocked} onClick={()=>onOpenChange(!open)} aria-label={`Open full inventory${state?`, ${state.slots.length} of ${config.capacity} slots used`:''}`} aria-haspopup="dialog" aria-expanded={open} title="Open full inventory (I)">
            <svg viewBox="0 0 16 16" width="28" height="28" fill="none" shapeRendering="crispEdges" aria-hidden="true"><path d="M5 2H11V3H12V6H14V8H15V15H1V8H2V6H4V3H5V2Z" fill="#292338"/><path d="M6 3H10V4H11V6H9V4H7V6H5V4H6V3Z" fill="#f6d377"/><path d="M3 7H13V9H14V14H2V9H3V7Z" fill="#aa7044"/><path d="M3 7H13V9H3V7Z" fill="#d49a58"/><path d="M4 10H12V14H4V10Z" fill="#855134"/><path d="M5 10H11V11H5V10Z" fill="#edc477"/><path d="M7 8H9V12H7V8Z" fill="#292338"/><path d="M7 9H9V11H7V9Z" fill="#ffdf36"/></svg>
            <small>I</small><span>{state?`${state.slots.length}/${config.capacity}`:'Bag'}</span>
          </button>
        </div>
        {(actionNotice||notice)&&<p className="player-hud-feedback" role="status">{actionNotice||notice}</p>}
      </section>
    </PlayerHud>
    {open && createPortal(<div className="modal-backdrop inventory-pixel-backdrop" role="presentation" onClick={()=>onOpenChange(false)}>
      <div className="modal player-inventory" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="player-inventory-title" onClick={(event)=>event.stopPropagation()}>
        <div className="modal-head inventory-pixel-head"><InventoryHeading level={2} id="player-inventory-title" text="Inventory"/><button className="inventory-close" type="button" aria-label="Close inventory" title="Close inventory (Esc)" onClick={()=>onOpenChange(false)}>X</button></div>
        {!state ? <><p role="status">{busy?'Loading inventory...':notice||'Inventory unavailable.'}</p><button type="button" disabled={busy} onClick={retry}>Retry loading</button></> : <>
          <div className="inventory-summary"><strong>{state.slots.length} / {config.capacity} slots</strong><span>{preview?'Preview bag':'Adventure bag'}</span><div className="inventory-capacity-track" role="progressbar" aria-label="Bag capacity used" aria-valuemin={0} aria-valuemax={Math.max(config.capacity,state.slots.length)} aria-valuenow={state.slots.length}><span style={{width:`${Math.min(100,state.slots.length/config.capacity*100)}%`}}/></div></div>
          {state.slots.length>config.capacity&&<p className="notice">Your bag exceeds its new capacity. Existing items are kept; make space before collecting more.</p>}
          <div className="inventory-bag-actions"><button type="button" disabled={busy} onClick={()=>act({type:'sort'})}>Sort bag</button><button type="button" disabled={busy||!state.selectedId} onClick={()=>act({type:'select',itemId:null})}>Unequip / clear selection</button></div>
          <section className="inventory-first-row" aria-label="Hotbar first row"><InventoryHeading text="First row - Hotbar"/><div className="inventory-position-row" style={{'--bag-columns':config.hotbarSize}}>{Array.from({length:Math.min(config.hotbarSize,config.capacity)},(_,i)=>bagSlot(i))}</div><p className="hint">Move items into this row to assign their number keys automatically. Drag to move or swap, or select an item and choose Move item.</p></section>
          {movingKey&&<div className="inventory-move-notice" role="status">Choose a destination slot.<button type="button" onClick={()=>setMovingKey(null)}>Cancel move</button></div>}
          <InventoryHeading text="Bag storage"/>
          <div className="inventory-bag-grid" style={{'--bag-columns':config.hotbarSize}}>{Array.from({length:Math.max(config.capacity,...state.slots.map((slot,i)=>positionOf(slot,i)+1))-Math.min(config.hotbarSize,config.capacity)},(_,i)=>bagSlot(i+Math.min(config.hotbarSize,config.capacity)))}</div>
          {slot&&item&&<section className="inventory-inspect" aria-label="Item details">
            <InventoryHeading text={item.name}/><p>{item.description||item.category} - Quantity: {slot.quantity} - Stack limit: {item.stackLimit}</p>
            <button type="button" disabled={busy} onClick={()=>act({type:'select',itemId:item.id})}>{item.category==='equipment'?'Equip':'Select item'}</button>
            {item.category!=='equipment'&&<p className="hint">Seeds and usable items can be selected now. Their planting or use effects will be added with the matching gameplay mechanic.</p>}
            <button type="button" disabled={busy} onClick={()=>setMovingKey(slot.key)}>Move item</button>
            {(config.allowDrop||config.allowDiscard)&&<label>Quantity<input type="number" min={1} max={slot.quantity} value={quantity} onChange={(e)=>setQuantity(Math.max(1,Math.min(slot.quantity,Number(e.target.value)||1)))}/></label>}
            {config.allowDrop&&<button type="button" disabled={busy} onClick={()=>act({type:'drop',slotKey:slot.key,quantity,location:getLocation()})}>Drop nearby</button>}
            {config.allowDiscard&&(confirmDiscard?<><p>This permanently removes {quantity} {item.name}.</p><button type="button" disabled={busy} onClick={()=>{act({type:'discard',slotKey:slot.key,quantity});setConfirmDiscard(false);}}>Confirm discard</button><button type="button" onClick={()=>setConfirmDiscard(false)}>Cancel</button></>:<button type="button" disabled={busy} onClick={()=>setConfirmDiscard(true)}>Discard...</button>)}
          </section>}

          {nearby.length>0&&<section className="inventory-nearby"><InventoryHeading text="Dropped nearby"/>{nearby.map((drop)=><button key={drop.id} type="button" disabled={busy} onClick={()=>act({type:'pickup',dropId:drop.id,location:getLocation()})}>Collect {catalog.find((d)=>d.id===drop.itemId)?.name??'item'} ? {drop.quantity}</button>)}</section>}
          {busy&&<p role="status">Saving...</p>}{notice&&<p className="notice" role="status">{notice}</p>}
        </>}
      </div>
    </div>,document.body)}
  </>;
}
