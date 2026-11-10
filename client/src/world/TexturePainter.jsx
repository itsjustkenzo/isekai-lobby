import { textureSurfaces, surfaceLabel } from './paintTextures.js';
import React, { useEffect, useState } from 'react';
import TextureDesigner from './TextureDesigner.jsx';

export default function TexturePainter({ interior, textures, tool, onSelect, onCreated }) {
  const [search, setSearch] = useState('');
  const [surface, setSurface] = useState(interior ? 'floor' : 'ground');
  const [designing, setDesigning] = useState(false);
  const surfaces = textureSurfaces(interior);
  useEffect(() => {
    if (tool.startsWith('texture:') && !textureSurfaces(interior).includes(tool.split(':')[1])) onSelect(`texture:${interior ? 'floor' : 'ground'}:select`);
  }, [interior, tool, onSelect]);
  const matches = textures.filter((t) => (!t.surface || t.surface === surface) && t.name.toLowerCase().includes(search.toLowerCase().trim()));
  return <div className="tool-group texture-painter">
    <p className="hint">{interior ? 'Interior map: design floors and walls.' : 'Exterior map: design ground textures.'}</p>
    <h3>My textures <span className="count">{textures.length}/64</span></h3>
    <button type="button" className="design-button" disabled={textures.length >= 64} onClick={() => setDesigning(true)}>+ Design a texture</button>
    <div className="segmented" role="group" aria-label="Paint surface">
      {surfaces.map((value) => <button key={value} type="button" className={surface === value ? 'active' : ''} aria-pressed={surface === value} onClick={() => { setSurface(value); if (tool.startsWith('texture:')) { const first = textures.find((t) => !t.surface || t.surface === value); onSelect(`texture:${value}:${first?.id ?? 'select'}`); } }}>{surfaceLabel(value)}</button>)}
    </div>
    <label>Search my textures<input type="search" value={search} maxLength={60} placeholder="Search by name" onChange={(e) => setSearch(e.target.value)} /></label>
    <div className="tool-grid asset-grid">
      {matches.map((texture) => <button type="button" key={texture.id} className={`tool${tool === `texture:${surface}:${texture.id}` ? ' active' : ''}`} aria-pressed={tool === `texture:${surface}:${texture.id}`} title={texture.name} onClick={() => onSelect(`texture:${surface}:${texture.id}`)}><img src={texture.image} alt="" /><span>{texture.name}</span></button>)}
    </div>
    {!matches.length && <p className="hint">{search ? 'No textures match this name.' : `Design a texture to add it to your ${surface} collection.`}</p>}
    <button type="button" className={`toggle${tool === `texture:${surface}:clear` ? ' active' : ''}`} aria-pressed={tool === `texture:${surface}:clear`} onClick={() => onSelect(`texture:${surface}:clear`)}>Remove custom {surface} finish</button>
    <p className="hint">Choose a texture, then brush over the matching surface. Textures save with your world.</p>
    {designing && <TextureDesigner interior={interior} initialSurface={surface} onClose={() => setDesigning(false)} onCreated={(texture, target) => { setSurface(target); setSearch(''); onCreated(texture, target); }} onPaint={(texture, target) => { setSurface(target); onSelect(`texture:${target}:${texture.id}`); setDesigning(false); }} />}
  </div>;
}
