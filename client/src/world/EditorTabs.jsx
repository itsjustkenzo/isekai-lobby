import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const EDITOR_TABS = [
  { id: 'maps', label: 'Maps', description: 'Maps, interiors, travel points, time and weather' },
  { id: 'paint', label: 'Paint', description: 'Ground, floors, walls, textures and decorations' },
  { id: 'create', label: 'Create', description: 'Design houses and add assets to your world' },
  { id: 'hud', label: 'HUD', description: 'Player clock, minimap and health display' },
  { id: 'game', label: 'Game', description: 'Tabletop games' },
  { id: 'restpoint', label: 'Restpoint', description: 'Highlight areas where players can sleep' },
  { id: 'gameplay', label: 'Gameplay Mechanics', description: 'Farming, farmable areas and gameplay rules' },
  { id: 'equipment', label: 'Equipment', description: 'Generate hoes, tools and weapons' },
  { id: 'items', label: 'Items', description: 'Define seeds, materials, usable items, artwork and stack limits' },
  { id: 'inventory', label: 'Inventory', description: 'Bag capacity, Starter Kit, hotbar, dropping and saving' },
  { id: 'characters', label: 'Characters', description: 'Create and place NPC characters' },
];

function TabPicker({ selected, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const dialogRef = useRef(null);
  const matches = EDITOR_TABS.filter((tab) => `${tab.label} ${tab.description}`.toLowerCase().includes(query.toLowerCase().trim()));
  useEffect(() => {
    const previous = document.activeElement;
    searchRef.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = [...dialogRef.current.querySelectorAll('button,input')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(<div className="modal-backdrop" role="presentation" onClick={onClose}>
    <div className="modal editor-tab-picker" role="dialog" aria-modal="true" aria-labelledby="all-editor-tabs-title" ref={dialogRef} onClick={(event) => event.stopPropagation()}>
      <div className="modal-head"><h2 id="all-editor-tabs-title">All editor tabs</h2><button type="button" className="text-button" onClick={onClose} aria-label="Close tab picker">Close</button></div>
      <label className="tab-picker-search">Search tabs<input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tabs, farming, textures..." /></label>
      <p className="hint" role="status">{matches.length} {matches.length === 1 ? 'tab' : 'tabs'} found</p>
      <div className="tab-picker-grid">{matches.map((tab) => <button type="button" key={tab.id} aria-current={selected === tab.id ? 'page' : undefined} onClick={() => { onSelect(tab.id); onClose(); }}><strong>{tab.label}{selected === tab.id && <span className="tab-current">Current</span>}</strong><span>{tab.description}</span></button>)}</div>
      {!matches.length && <p className="tab-picker-empty">No tabs match your search. Try another word.</p>}
    </div>
  </div>, document.body);
}

export default function EditorTabs({ selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const stripRef = useRef(null);
  const buttonsRef = useRef(new Map());
  useEffect(() => {
    const strip = stripRef.current;
    function onWheel(event) {
      if (event.ctrlKey || strip.scrollWidth <= strip.clientWidth) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const amount = delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1);
      const next = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, strip.scrollLeft + amount));
      if (next !== strip.scrollLeft) { event.preventDefault(); strip.scrollLeft = next; }
    }
    strip.addEventListener('wheel', onWheel, { passive: false });
    return () => strip.removeEventListener('wheel', onWheel);
  }, []);
  useEffect(() => { buttonsRef.current.get(selected)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [selected]);
  function onKey(event, index) {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % EDITOR_TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + EDITOR_TABS.length) % EDITOR_TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = EDITOR_TABS.length - 1;
    else return;
    event.preventDefault();
    onSelect(EDITOR_TABS[next].id);
    buttonsRef.current.get(EDITOR_TABS[next].id)?.focus();
  }
  return <>
    <div className="editor-tabs-head"><span>Editor tabs</span><button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>View all</button></div>
    <div className="side-tabs" ref={stripRef} role="tablist" aria-label="Tool sections" aria-orientation="horizontal">
      {EDITOR_TABS.map((tab, index) => <button type="button" key={tab.id} ref={(element) => { if (element) buttonsRef.current.set(tab.id, element); else buttonsRef.current.delete(tab.id); }} role="tab" id={`side-tab-${tab.id}`} aria-selected={selected === tab.id} aria-controls="side-panel" tabIndex={selected === tab.id ? 0 : -1} className={selected === tab.id ? 'active' : ''} onClick={() => onSelect(tab.id)} onKeyDown={(event) => onKey(event, index)}>{tab.label}</button>)}
    </div>
    {open && <TabPicker selected={selected} onSelect={onSelect} onClose={() => setOpen(false)} />}
  </>;
}
