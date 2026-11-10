import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { EQUIPMENT_TYPES } from './equipment.js';

export default function EquipmentPanel({ equipment, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState('hoe');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [created, setCreated] = useState(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function design(event) {
    event.preventDefault();
    if (submitting.current) return;
    if (!name.trim() || (!description.trim() && !file)) { setNotice('Name your equipment, then describe it or upload a reference.'); return; }
    submitting.current = true; setBusy(true); setNotice('');
    try {
      const query = new URLSearchParams({ name: name.trim(), description: description.trim(), kind });
      const { ok, data } = await api(`/api/equipment/generate?${query}`, { method: 'POST', headers: { 'Content-Type': file ? file.type : 'application/octet-stream' }, body: file ?? undefined });
      if (!ok) { setNotice(data.error || 'Equipment design failed.'); return; }
      onCreated(data.equipment); setCreated(data.equipment); setNotice('Added to this world. Open Preview and choose it from Equipment to equip it.');
    } catch { setNotice('Could not reach the server. Please try again.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <>
    <div className="tool-group equipment-panel">
      <h3>Design equipment</h3>
      <p className="hint">Create tools and weapons for this game. Start with a Hoe to test farming. Other types can be held; their gameplay actions will come later.</p>
      <form className="login-form" onSubmit={design}>
        <label>Equipment type<select value={kind} disabled={busy} onChange={(e) => setKind(e.target.value)}>{EQUIPMENT_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
        <label>Name<input required maxLength={60} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder="e.g. My garden hoe" /></label>
        <label>Description<textarea rows={3} maxLength={800} value={description} disabled={busy} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. A rustic wooden handle with a small iron hoe blade" /><small className="char-count">{description.length}/800</small></label>
        <label className="upload">Reference image (optional)
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => {
            const picked = e.target.files?.[0]; setNotice('');
            if (picked && (!['image/png','image/jpeg','image/webp'].includes(picked.type) || picked.size > 10*1024*1024)) { setNotice('Choose a PNG, JPEG, or WebP, 10 MB or smaller.'); e.target.value='';setFile(null);return; }
            setFile(picked ?? null);
          }} />
          <span className="upload-drop">{preview ? <img src={preview} alt="Equipment reference" /> : <span>Choose a PNG, JPEG, or WebP (max 10 MB)</span>}</span>
        </label>
        {file && <button type="button" className="text-button" disabled={busy} onClick={() => setFile(null)}>Remove reference</button>}
        <button type="submit" className="design-button" disabled={busy || equipment.length >= 64}>{busy ? 'Designing equipment...' : 'Design equipment'}</button>
        {busy && <p className="hint" role="status">Creating your equipment. This can take a few minutes.</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
      </form>
      {created && <div className="equipment-result"><img src={created.image} alt={created.name} width={48} height={96} /><strong>{created.name}</strong></div>}
    </div>
    <div className="tool-group">
      <h3>My equipment <span className="count">{equipment.length}/64</span></h3>
      <div className="equipment-library">{equipment.map((item) => <div key={item.id} className="equipment-card"><img src={item.image} width={32} height={64} alt="" /><div><strong>{item.name}</strong><small>{EQUIPMENT_TYPES.find((type) => type.id === item.kind)?.label}</small></div></div>)}</div>
      {!equipment.length && <p className="hint">Design a hoe above, then select it in Preview to till farmable grass.</p>}
    </div>
  </>;
}
