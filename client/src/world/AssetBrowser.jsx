import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const SIZES = [
  { key: '1x1', label: '1×1', hint: 'pot, lamp, sign' },
  { key: '2x1', label: '2×1', hint: 'bench, cart' },
  { key: '1x2', label: '1×2', hint: 'tall statue' },
  { key: '2x2', label: '2×2', hint: 'well, fountain' },
];
const MAX_NAME = 60;
const MAX_UPLOAD_SIDE = 1024;
const PREVIEW_SCALE = 2;
// Searches for these get a pointer to the built-in fences, which join up (AI assets are single pictures).
const CONNECTING = /\b(fence|fences|fencing|wall|walls|hedge|hedges|railing|railings|picket)\b/i;

// Draws any image the browser can open onto a canvas and returns it as a PNG (shrunk if very large),
// since the server only reads PNGs.
async function toPng(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_UPLOAD_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read image'))), 'image/png'));
}

function AssetCard({ asset, inLibrary, onAdd, busy }) {
  return (
    <div className="asset-card">
      <div className="asset-thumb">
        <img src={asset.spriteUrl} alt="" width={asset.width * 16 * PREVIEW_SCALE} height={(asset.height + 1) * 16 * PREVIEW_SCALE} />
      </div>
      <strong title={asset.name}>{asset.name}</strong>
      <small>{asset.width}×{asset.height}{asset.solid ? '' : ' · walk-through'}</small>
      {inLibrary
        ? <span className="asset-added">✓ In My assets</span>
        : <button type="button" onClick={() => onAdd(asset)} disabled={busy}>Add</button>}
    </div>
  );
}

function SizeAndSolid({ size, setSize, solid, setSolid, disabled }) {
  return (
    <>
      <fieldset className="size-picker" disabled={disabled}>
        <legend>Size in tiles</legend>
        {SIZES.map((s) => (
          <label key={s.key} className={size === s.key ? 'selected' : ''} title={s.hint}>
            <input type="radio" name="asset-size" value={s.key} checked={size === s.key} onChange={() => setSize(s.key)} />
            <span>{s.label}</span>
          </label>
        ))}
      </fieldset>
      <label className="check-row">
        <input type="checkbox" checked={solid} onChange={(e) => setSolid(e.target.checked)} disabled={disabled} />
        <span>Solid (players can't walk through it)</span>
      </label>
    </>
  );
}

// "Add asset": search the shared pool (or generate a new asset with AI), or upload your own image.
export default function AssetBrowser({ libraryIds, onAdded, onClose }) {
  const [tab, setTab] = useState('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [size, setSize] = useState('1x1');
  const [solid, setSolid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [uploadName, setUploadName] = useState('');

  useEffect(() => { search(''); }, []);

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

  async function search(q) {
    setSearching(true);
    setNotice('');
    try {
      const { ok, data } = await api(`/api/assets/search?q=${encodeURIComponent(q)}`);
      setResults(ok ? data.results : []);
      if (!ok) setNotice(data.error || 'Search failed. Please try again.');
    } catch {
      setNotice('Could not reach the server. Please try again.');
    } finally {
      setSearching(false);
    }
  }

  async function run(request, failure) {
    setBusy(true);
    setNotice('');
    try {
      const { ok, data } = await request();
      if (!ok) return setNotice(data.error || failure);
      onAdded(data.asset);
      return data.asset;
    } catch {
      setNotice('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const add = (asset) => run(() => api(`/api/assets/${asset.id}/library`, { method: 'POST' }), 'Could not add that asset.');

  async function generate() {
    const name = query.trim();
    if (!name) return setNotice('Type what you want in the search box first, e.g. "wooden flower pot with tulips".');
    const params = new URLSearchParams({ name, size, solid: solid ? '1' : '0' });
    const asset = await run(() => api(`/api/assets/generate?${params}`, { method: 'POST' }), 'Asset creation failed. Please try again.');
    if (asset) setResults((list) => [asset, ...(list ?? [])]);
  }

  function pickFile(event) {
    const picked = event.target.files?.[0];
    setNotice('');
    if (!picked) return setFile(null);
    if (!picked.type.startsWith('image/')) return setNotice('Please choose an image file.');
    setFile(picked);
    if (!uploadName) setUploadName(picked.name.replace(/\.[^.]+$/, '').slice(0, MAX_NAME));
  }

  async function upload(event) {
    event.preventDefault();
    if (!file) return setNotice('Choose an image to upload.');
    if (!uploadName.trim()) return setNotice('Give your asset a name.');
    let png;
    try {
      png = await toPng(file);
    } catch {
      return setNotice('Could not read that image. Try a PNG or JPEG.');
    }
    const params = new URLSearchParams({ name: uploadName.trim(), size, solid: solid ? '1' : '0' });
    const asset = await run(() => api(`/api/assets/upload?${params}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png }), 'Upload failed. Please try again.');
    if (asset) { setFile(null); setUploadName(''); setTab('search'); setResults((list) => [asset, ...(list ?? [])]); }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="asset-browser-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="asset-browser-title">Add asset</h2>
          {!busy && <button type="button" className="text-button" onClick={onClose} aria-label="Close">✕</button>}
        </div>
        <div className="segmented tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'search'} className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')} disabled={busy}>🔍 Search</button>
          <button type="button" role="tab" aria-selected={tab === 'upload'} className={tab === 'upload' ? 'active' : ''} onClick={() => setTab('upload')} disabled={busy}>⬆ Upload</button>
        </div>

        {tab === 'search' ? (
          <>
            <form className="asset-search" onSubmit={(e) => { e.preventDefault(); search(query); }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={MAX_NAME} placeholder="Search assets, e.g. fence, flower pot, lamp" aria-label="Search assets" disabled={busy} />
              <button type="submit" disabled={busy || searching}>{searching ? '…' : 'Search'}</button>
            </form>
            {CONNECTING.test(query) && (
              <p className="connect-tip">Looking for fences or walls that join up? Assets from search are single pictures and don't connect. Use <strong>Build → Wood fence, Picket fence or Stone wall</strong>: drag to paint, and corners join automatically.</p>
            )}
            <div className="asset-results" aria-busy={searching}>
              {results?.length === 0 && <p className="hint">No assets found{query ? ` for "${query}"` : ''}. Generate one below.</p>}
              {results?.map((asset) => <AssetCard key={asset.id} asset={asset} inLibrary={libraryIds.has(asset.id)} onAdd={add} busy={busy} />)}
            </div>
            <div className="generate-box">
              <h3>Can't find it? Create it with AI</h3>
              <p className="hint">Uses your search text as the description. Takes up to a minute, and everyone can then find it in search.</p>
              <SizeAndSolid size={size} setSize={setSize} solid={solid} setSolid={setSolid} disabled={busy} />
              <button type="button" className="login-button" onClick={generate} disabled={busy}>
                <span className="button-spark" aria-hidden="true">✧</span><span>{busy ? 'Creating your asset… (up to a minute)' : `Generate "${query.trim() || '…'}"`}</span>
              </button>
            </div>
          </>
        ) : (
          <form className="login-form" onSubmit={upload}>
            <p className="designer-intro">Upload your own image. A transparent PNG works best; plain backgrounds are removed automatically. It will be converted to the game's pixel scale and kept private to you.</p>
            <label className="upload">Image
              <input type="file" accept="image/*" onChange={pickFile} disabled={busy} />
              <span className="upload-drop">
                {preview ? <img src={preview} alt="Asset to upload" /> : <span>Click to choose an image</span>}
              </span>
            </label>
            <label>Name<input value={uploadName} onChange={(e) => setUploadName(e.target.value)} maxLength={MAX_NAME} placeholder="e.g. Picket fence" disabled={busy} /></label>
            <SizeAndSolid size={size} setSize={setSize} solid={solid} setSolid={setSolid} disabled={busy} />
            <button type="submit" className="login-button" disabled={busy}><span className="button-spark" aria-hidden="true">✧</span><span>{busy ? 'Uploading…' : 'Upload asset'}</span></button>
          </form>
        )}
        {notice && <p className="notice" role="status">{notice}</p>}
      </div>
    </div>
  );
}
