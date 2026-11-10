import React, { useId } from 'react';

export default function AssetImageUpload({ image, label = 'Asset image', required = false, disabled = false, onChange, compact = false }) {
  const helpId = useId();
  return <label className={`asset-image-upload${compact ? ' compact' : ''}`}>
    <span className="asset-upload-heading"><span>{label}</span>{required && <span className="asset-upload-required">Required</span>}</span>
    <input type="file" accept="image/png,image/jpeg,image/webp" required={required && !image} disabled={disabled} onChange={onChange} aria-describedby={helpId} />
    <span className={`asset-upload-card${image ? ' has-image' : ''}`} aria-busy={disabled}>
      <span className="asset-upload-preview">
        {image ? <img src={image} alt="Selected item asset" width={64} height={64} /> : <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true"><rect x="4" y="5" width="28" height="26" rx="4" fill="#fff9e9" stroke="#292338" strokeWidth="2"/><circle cx="12" cy="13" r="3" fill="#ed428b"/><path d="M6 27L15 18L21 24L25 20L30 27" fill="#a6cf79" stroke="#292338" strokeWidth="2" strokeLinejoin="round"/><path d="M28 2V10M24 6H32" stroke="#ed428b" strokeWidth="2" strokeLinecap="round"/></svg>}
      </span>
      <span className="asset-upload-copy"><strong>{disabled ? 'Preparing your image...' : image ? 'Your asset is ready' : 'Give your item a look'}</strong><span>{image ? 'Use a different image anytime.' : 'Choose artwork from your own designs.'}</span></span>
      <span className="asset-upload-button">{disabled ? 'Processing...' : image ? 'Change image' : 'Choose image'}<span aria-hidden="true"> +</span></span>
      <span className="asset-upload-help" id={helpId}>PNG, JPEG or WebP ? Up to 10 MB</span>
    </span>
  </label>;
}
