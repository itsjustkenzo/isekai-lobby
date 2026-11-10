import ItemGallery from './ItemGallery.jsx';
import { api } from '../api.js';
import AssetImageUpload from './AssetImageUpload.jsx';
import React, { useRef, useState } from 'react';
import { inventorySettings } from './inventory.js';

export default function ItemsPanel({ world, savedItems = [], onDelete, onChange, onOpenInventory }) {
  const [viewItems,setViewItems] = useState(false);
  const config = inventorySettings(world);
  const [name, setName] = useState(''), [category, setCategory] = useState('seed'), [description, setDescription] = useState('');
  const [originalArtwork,setOriginalArtwork]=useState(null);
  const [image, setImage] = useState(''), [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const generationPending = useRef(false);
  const busy = uploading || generating;
  const patch = (value) => onChange({ ...config, ...value });
  async function generateImage(item = { name, description, category }, onImage = (image,artwork)=>{setImage(image);setOriginalArtwork(artwork??null);}) {
    if (generationPending.current || uploading) return;
    if (!item.name.trim()) { setNotice('Name your item before generating its asset image.');return; }
    generationPending.current = true;setGenerating(true);setNotice('');
    try {
      const { ok, data } = await api('/api/items/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: item.name, description: item.description, category: item.category }) });
      if (!ok || !data.image) throw new Error(data.error || 'Could not generate the item image.');
      onImage(data.image,data.originalArtwork);setNotice('Asset image generated. Review the preview before adding or saving your item.');
    } catch (error) { setNotice(error.message || 'Could not reach the server.'); }
    finally { generationPending.current=false;setGenerating(false); }
  }
  async function upload(event, onImage = (image,artwork)=>{setImage(image);setOriginalArtwork(artwork??null);}) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 10*1024*1024) {
      setNotice('Choose a PNG, JPEG, or WebP under 10 MB.');event.target.value='';return;
    }
    setUploading(true);
    try {
      const bitmap = await createImageBitmap(file), canvas = document.createElement('canvas');
      canvas.width = canvas.height = 48;
      const scale = Math.min(48 / bitmap.width, 48 / bitmap.height), w = bitmap.width * scale, h = bitmap.height * scale;
      canvas.getContext('2d').drawImage(bitmap, (48-w)/2, (48-h)/2, w, h);bitmap.close();
      onImage(canvas.toDataURL('image/png'));setNotice('');
    } catch { setNotice('Could not read the asset image. Please choose another image.'); }
    finally { setUploading(false); }
  }
  return <div className="tool-group inventory-settings items-settings">
    <div className="items-panel-heading"><h3>Items <span className="count">{config.items.length}/100</span></h3><button type="button" onClick={()=>setViewItems(true)}>View items</button></div>
    <p className="hint">{config.items.filter((item)=>savedItems.some((saved)=>saved.id===item.id&&JSON.stringify(saved)===JSON.stringify(item))).length} saved to game. Open View items to see artwork and pending changes.</p>
    {viewItems&&<ItemGallery onDelete={onDelete} items={config.items} savedItems={savedItems} draft={image?{name,description,category,image}:null} onClose={()=>setViewItems(false)}/>}
    <p className="hint">Define seeds, materials, and usable items here. Generate an asset image with AI, or optionally upload your own design. Every finished item needs an image. Choose which items players receive in Inventory ? Starter Kit.</p>
    <div className="inventory-fields">
        <label>Default stack limit<input type="number" min={1} max={999} value={config.stackLimit} onChange={(e) => patch({ stackLimit: Math.max(1,Math.min(999,Number(e.target.value)||1)) })} /></label>
    </div>
      <h4>Item definitions</h4>
      <form className="login-form" onSubmit={(e) => {
        e.preventDefault();if (!name.trim() || busy) return;
        if (!image) { setNotice('Generate an asset image or upload your own design first.');return; }
        patch({ items: [...config.items, { id: crypto.randomUUID(), name: name.trim(), category, description: description.trim(), stackLimit: config.stackLimit, image,...(originalArtwork?{originalArtwork}:{}) }] });
        const fileInput=e.currentTarget.querySelector('input[type=file]');if(fileInput)fileInput.value='';
        setName('');setDescription('');setImage('');setNotice('Item definition added. Add it to Starter Kit to give it to players.');
      }}>
        <label>Name<input required value={name} maxLength={60} disabled={busy} onChange={(e) => setName(e.target.value)} placeholder="Carrot seeds" /></label>
        <label>Category<select value={category} disabled={busy} onChange={(e) => setCategory(e.target.value)}><option value="seed">Seeds</option><option value="material">Materials</option><option value="usable">Usable items</option></select></label>
        <label>Description<textarea value={description} maxLength={400} rows={2} disabled={busy} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the item for players" /></label>
        <div className="item-image-generator">
          <span className="asset-upload-heading">AI asset image</span>
          <p className="hint">Use the name and description above to design your item artwork.</p>
          <button type="button" className="design-button" disabled={busy || !name.trim()} onClick={() => generateImage()}>{generating ? 'Generating asset image...' : image ? 'Regenerate with AI' : 'Generate asset image'}</button>
          {image && <div className="item-generated-preview"><img src={image} width={80} height={80} alt="Current item asset preview" /></div>}
          {generating && <p className="hint" role="status">Creating your pixel-art item. This can take a few minutes.</p>}
        </div>
        <AssetImageUpload image={image} label="Use your own design (optional)" disabled={busy} onChange={(event) => upload(event)} />
        <button type="submit" className="design-button" disabled={config.items.length >= 100 || !image || busy}>Add item definition</button>
        {notice && <p className="hint" role="status">{notice}</p>}
      </form>
      <div className="inventory-definition-list">{config.items.map((item, index) => <div className="item-definition" key={item.id}>
        <strong>{item.name}</strong>
        {!item.image && <p className="notice" role="alert">Asset image required. Generate one or upload your design before saving.</p>}
        <AssetImageUpload compact image={item.image} label="Item artwork" required={!item.image} disabled={busy} onChange={(event) => upload(event, (nextImage) => patch({ items: config.items.map((entry, i) => i === index ? { ...entry, image: nextImage,originalArtwork:null } : entry) }))} />
        <button type="button" className="design-button" disabled={busy} onClick={() => generateImage(item, (nextImage,originalArtwork) => {
          const latest = inventorySettings(world);
          onChange({ ...latest, items: latest.items.map((entry) => entry.id === item.id ? { ...entry, image: nextImage,originalArtwork } : entry) });
        })}>{item.image ? 'Regenerate asset with AI' : 'Generate asset image'}</button>
        <label>{item.category} - stack limit<input aria-label={`${item.name} stack limit`} type="number" min={1} max={999} value={item.stackLimit} onChange={(event) => patch({ items: config.items.map((entry, i) => i === index ? { ...entry, stackLimit: Math.max(1,Math.min(999,Number(event.target.value)||1)) } : entry) })} /></label>
      </div>)}</div>
      <p className="hint">Your {world.equipment?.length ?? 0} generated equipment designs are also available as items.</p>
    <button type="button" className="design-button" onClick={onOpenInventory}>Configure Starter Kit in Inventory</button>
  </div>;
}
