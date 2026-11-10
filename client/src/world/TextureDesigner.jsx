import {isLiquidTexture} from './liquidTextures.js';
import { textureSurfaces, surfaceLabel } from './paintTextures.js';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';

export default function TextureDesigner({ interior, initialSurface = interior ? 'floor' : 'ground', onCreated, onPaint, onClose }) {
  const [liquid,setLiquid]=useState(false);
  const [surface, setSurface] = useState(initialSurface);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [created, setCreated] = useState(null);
  const dialogRef = useRef(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!submitting.current) onClose(); }
      if (event.key === 'Tab') {
        const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')];
        if (!controls.length) { event.preventDefault(); return; }
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  function pickFile(event) {
    const picked = event.target.files?.[0];
    setNotice('');
    if (!picked) { setFile(null); return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(picked.type) || picked.size > 10 * 1024 * 1024) {
      setNotice('Choose a PNG, JPEG, or WebP image, 10 MB or smaller.');
      event.target.value = ''; setFile(null); return;
    }
    setFile(picked);
  }

  async function design(event) {
    event.preventDefault();
    if (submitting.current) return;
    if (!name.trim()) { setNotice('Give your texture a name.'); return; }
    if (!description.trim() && !file) { setNotice('Describe your texture or upload an image.'); return; }
    submitting.current = true; setBusy(true); setNotice('');
    try {
      const query = new URLSearchParams({ name: name.trim(), description: description.trim(), surface, liquid:String(liquid||isLiquidTexture({name,description})) });
      const { ok, data } = await api(`/api/textures/generate?${query}`, {
        method: 'POST', headers: { 'Content-Type': file ? file.type : 'application/octet-stream' }, body: file ?? undefined,
      });
      if (!ok) { setNotice(data.error || 'Texture design failed. Please try again.'); return; }
      setCreated(data.texture);
      onCreated(data.texture, surface);
    } catch { setNotice('Could not reach the server. Please try again.'); }
    finally { submitting.current = false; setBusy(false); }
  }

  return createPortal(<div className="modal-backdrop" role="presentation" onClick={() => !submitting.current && onClose()}>
    <div className="modal texture-designer" role="dialog" aria-modal="true" aria-labelledby="texture-designer-title" tabIndex={-1} ref={dialogRef} onClick={(event) => event.stopPropagation()}>
      <div className="modal-head">
        <h2 id="texture-designer-title">{created ? 'Your new texture' : 'Design a texture'}</h2>
        {!busy && <button type="button" className="text-button" onClick={onClose} aria-label="Close">?</button>}
      </div>
      {created ? <div className="designer-result">
        <div className="sprite-frame texture-result"><img src={created.image} width={160} height={160} alt={`${created.name}, repeating ${created.surface} texture`} /></div>
        <p><strong>{created.name}</strong> was added to My textures.</p>
        <button type="button" className="login-button" onClick={() => onPaint(created, created.surface)}><span>Paint with this texture</span></button>
        <button type="button" className="text-button" onClick={() => { setCreated(null); setLiquid(false); setName(''); setDescription(''); setFile(null); setNotice(''); }}>Design another</button>
      </div> : <form className="login-form" onSubmit={design}>
        <p className="designer-intro">{interior ? 'Design an interior floor or wall texture.' : 'Design an exterior ground texture.'} Name your texture, then describe it, upload your design, or both. AI will turn it into a repeating texture in the game's pixel style.</p>
        <fieldset className="texture-surface" disabled={busy}>
          <legend>Texture for</legend>
          {textureSurfaces(interior).map((value) => <label key={value} className={surface === value ? 'selected' : ''}><input type="radio" name="texture-surface" value={value} checked={surface === value} onChange={() => setSurface(value)} />{surfaceLabel(value)}</label>)}
        </fieldset>
        <label>Name<input required value={name} maxLength={60} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder={surface === 'wall' ? 'e.g. Brick walls' : surface === 'ground' ? 'e.g. Mossy forest ground' : 'e.g. Mossed grey floor'} /></label>
        <label>Description<textarea value={description} rows={3} maxLength={800} disabled={busy} onChange={(e) => setDescription(e.target.value)} placeholder={surface === 'wall' ? 'e.g. Weathered red bricks with pale mortar and a little moss in the cracks' : surface === 'ground' ? 'e.g. Dark forest soil with patches of green moss, tiny pebbles and fallen leaves' : 'e.g. Uneven grey stone tiles with soft green moss between them'} /><small className="char-count">{description.length}/800</small></label>
        <label className="check-row"><input type="checkbox" checked={liquid||isLiquidTexture({name,description})} disabled={busy||isLiquidTexture({name,description})} onChange={(event)=>setLiquid(event.target.checked)}/>Liquid material ? animate waves, bubbles and ripples</label>
        <label className="upload">Texture image (optional)
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickFile} disabled={busy} />
          <span className="upload-drop">{preview ? <img src={preview} alt="Uploaded texture design" /> : <span>Click to choose a PNG, JPEG, or WebP (max 10 MB)</span>}</span>
        </label>
        {file && <button type="button" className="text-button" disabled={busy} onClick={() => setFile(null)}>Remove image</button>}
        <button className="login-button" type="submit" disabled={busy}><span>{busy ? 'Designing your texture...' : 'Design texture'}</span></button>
        {busy && <p className="hint" role="status">This can take a few minutes.</p>}
        {notice && <p className="notice" role="alert">{notice}</p>}
      </form>}
    </div>
  </div>, document.body);
}
