import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_DESCRIPTION = 400;
const PREVIEW_SCALE = 2;

// Lets a player describe and/or upload a house; the server's AI turns it into a pixel-art house sprite.
export default function HouseDesigner({ onCreated, onPlace, onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (!file) return setPreview('');
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  function pickFile(event) {
    const picked = event.target.files?.[0];
    setNotice('');
    if (!picked) return setFile(null);
    if (!ACCEPTED_TYPES.includes(picked.type)) return setNotice('Please choose a PNG, JPEG, or WebP image.');
    if (picked.size > MAX_UPLOAD_BYTES) return setNotice('Image must be 10 MB or smaller.');
    setFile(picked);
  }

  async function design(event) {
    event.preventDefault();
    if (!description.trim() && !file) return setNotice('Describe your house or upload a picture of one.');
    setBusy(true);
    setNotice('');
    try {
      const query = new URLSearchParams({ name: name.trim(), description: description.trim() });
      const { ok, data } = await api(`/api/houses?${query}`, {
        method: 'POST',
        headers: { 'Content-Type': file ? file.type : 'application/octet-stream' },
        body: file ?? undefined,
      });
      if (!ok) return setNotice(data.error || 'House design failed. Please try again.');
      setCreated(data.house);
      onCreated(data.house);
    } catch {
      setNotice('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setCreated(null);
    setName('');
    setDescription('');
    setFile(null);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="designer-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="designer-title">{created ? 'Your new house' : 'Design a house'}</h2>
          {!busy && <button type="button" className="text-button" onClick={onClose} aria-label="Close">✕</button>}
        </div>

        {created ? (
          <div className="designer-result">
            <div className="sprite-frame">
              <img src={created.spriteUrl} alt={`${created.name}, generated house`} width={80 * PREVIEW_SCALE} height={96 * PREVIEW_SCALE} />
            </div>
            <p><strong>{created.name}</strong> was added to My houses.</p>
            <button type="button" className="login-button" onClick={() => onPlace ? onPlace(created) : onClose()}><span className="button-spark" aria-hidden="true">✧</span><span>{onPlace?'Place it in my world':'Back to building assets'}</span></button>
            <button type="button" className="text-button" onClick={startOver}>Design another</button>
          </div>
        ) : (
          <form className="login-form" onSubmit={design}>
            <p className="designer-intro">Describe the house you want, upload a picture for inspiration, or both. It will be redrawn in the game's pixel style.</p>
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="My house" disabled={busy} /></label>
            <label>Description
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={MAX_DESCRIPTION} rows={3} disabled={busy}
                placeholder="e.g. a cosy mushroom cottage with a red spotted roof and a round green door" />
              <small className="char-count">{description.length}/{MAX_DESCRIPTION}</small>
            </label>
            <label className="upload">Picture (optional)
              <input type="file" accept={ACCEPTED_TYPES.join(',')} onChange={pickFile} disabled={busy} />
              <span className="upload-drop">
                {preview ? <img src={preview} alt="Uploaded house inspiration" /> : <span>Click to choose a PNG, JPEG, or WebP (max 10 MB)</span>}
              </span>
            </label>
            <button className="login-button" type="submit" disabled={busy}>
              <span className="button-spark" aria-hidden="true">✧</span><span>{busy ? 'Building your house… (up to a minute)' : 'Design house'}</span>
            </button>
            {notice && <p className="notice" role="status">{notice}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
