import React, { Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import './styles.css';

const DetailedStylePrototype = lazy(() => import('./DetailedStylePrototype.jsx'));
const WorldEditor = lazy(() => import('./world/WorldEditor.jsx'));
const BuildingAssetsBuilder = lazy(() => import('./BuildingAssetsBuilder.jsx'));
const NpcAssetsBuilder = lazy(() => import('./NpcAssetsBuilder.jsx'));
const AssetsBuilder = lazy(() => import('./AssetsBuilder.jsx'));
const GeneratedMapEditor = lazy(() => import('./world/GeneratedMapEditor.jsx'));
const PlayView = lazy(() => import('./world/PlayView.jsx'));

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function Spark() {
  return <span className="button-spark" aria-hidden="true">✧</span>;
}

function LoginForm({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const { ok, data } = await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      if (ok) onLogin(data.user);
      else setNotice(data.error || 'Login failed. Please try again.');
    } catch {
      setNotice('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (<>
    <h2>Ready, player?</h2>
    <p>Your adventure is one click away.</p>
    <form className="login-form" onSubmit={login}>
      <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      <button className="login-button" type="submit" disabled={busy}><Spark /><span>{busy ? 'Opening portal…' : 'Login with Isekai Zero account'}</span><span aria-hidden="true">↗</span></button>
    </form>
    {notice && <p className="notice" role="status">{notice}</p>}
  </>);
}

function CharacterCreator({ user, onUpdate, onSaved, onCancel }) {
  const [gender, setGender] = useState(user.characterDraft?.gender ?? user.availableGenders[0] ?? 'male');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!file) return setPreview('');
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFile(event) {
    const picked = event.target.files?.[0];
    setNotice('');
    if (!picked) return setFile(null);
    if (!ACCEPTED_TYPES.includes(picked.type)) return setNotice('Please choose a PNG, JPEG, or WebP image.');
    if (picked.size > MAX_UPLOAD_BYTES) return setNotice('Image must be 10 MB or smaller.');
    setFile(picked);
  }

  async function run(request, fallbackError, onSuccess) {
    setBusy(true);
    setNotice('');
    try {
      const { ok, data } = await request();
      if (ok) onSuccess(data.user);
      else setNotice(data.error || fallbackError);
    } catch {
      setNotice('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function generate(event) {
    event?.preventDefault();
    if (!file) return setNotice('Upload a character image first.');
    run(() => api(`/api/character?gender=${gender}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file }),
      'Character creation failed. Please try again.', onUpdate);
  }

  const save = () => run(() => api('/api/character/save', { method: 'POST' }), 'Could not save your character. Please try again.', onSaved);
  const discardDraft = () => api('/api/character/draft', { method: 'DELETE' }).then(({ ok, data }) => ok && onUpdate(data.user)).catch(() => {});
  const cancel = () => { if (user.characterDraft) discardDraft(); onCancel(); };

  if (user.characterDraft) {
    return (<>
      <h2>Meet your hero</h2>
      <p>Happy with how they turned out? Save to make them yours.</p>
      <div className="sprite-frame"><img src={user.characterDraft.spriteUrl} alt="Generated character preview" /></div>
      <button className="login-button" onClick={save} disabled={busy}><Spark /><span>{busy ? 'Working…' : 'Save character'}</span><span aria-hidden="true">✓</span></button>
      {!busy && <div className="choice-row">
        {file && <button type="button" className="text-button" onClick={() => generate()}>Try again (same image)</button>}
        <button type="button" className="text-button" onClick={discardDraft}>{file ? 'Use a different image' : 'Try again'}</button>
      </div>}
      {onCancel && !busy && <button type="button" className="text-button" onClick={cancel}>Keep my current character</button>}
      {busy && <p className="notice" role="status">This can take up to a minute…</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
    </>);
  }

  return (<>
    <h2>Create your hero</h2>
    <p>Pick a base, then upload your character. We'll turn it into a pixel sprite.</p>
    <form className="login-form" onSubmit={generate}>
      <fieldset className="gender-picker" disabled={busy}>
        <legend>Base</legend>
        {['male', 'female'].map((option) => {
          const available = user.availableGenders.includes(option);
          return (
            <label key={option} className={gender === option ? 'selected' : ''}>
              <input type="radio" name="gender" value={option} checked={gender === option} disabled={!available} onChange={() => setGender(option)} />
              <span>{option === 'male' ? '♂ Male' : '♀ Female'}</span>
              {!available && <small>Coming soon</small>}
            </label>
          );
        })}
      </fieldset>
      <label className="upload">Character image
        <input type="file" accept={ACCEPTED_TYPES.join(',')} onChange={pickFile} disabled={busy} />
        <span className="upload-drop">
          {preview ? <img src={preview} alt="Uploaded character preview" /> : <span>Click to choose a PNG, JPEG, or WebP (max 10 MB)</span>}
        </span>
      </label>
      <button className="login-button" type="submit" disabled={busy || !file}><Spark /><span>{busy ? 'Summoning your hero… (up to a minute)' : 'Create character'}</span><span aria-hidden="true">↗</span></button>
      {onCancel && !busy && <button type="button" className="text-button" onClick={cancel}>Keep my current character</button>}
    </form>
    {notice && <p className="notice" role="status">{notice}</p>}
  </>);
}

function CharacterCard({ user, onPlay, onCreateWorld, onGenerateExteriorMap, onGenerateInteriorMap, onAssetsBuilder, onDetailedStyle, onInteriorAssetsBuilder, onNpcAssetsBuilder, onBuildingAssetsBuilder, onRecreate, onLogout }) {
  return (<>
    <h2>Welcome, {user.username}!</h2>
    <p>Your hero is ready. What's next?</p>
    <div className="sprite-frame"><img src={user.character.spriteUrl} alt={`${user.username}'s character sprite`} /></div>
    <div className="choice-grid">
      <button className="choice" onClick={onPlay}><strong>▶ Play</strong><small>Explore your world</small></button>
      <button className="choice" onClick={onCreateWorld}><strong>✦ Create</strong><small>Build your own world</small></button>
    </div>
    <button type="button" className="choice portal-generate-map" onClick={onGenerateExteriorMap}><strong>Generate Exterior Map</strong><small>Upload a landscape or outdoor reference image</small></button>
    <button type="button" className="choice portal-generate-map" onClick={onGenerateInteriorMap}><strong>Generate Interior Map</strong><small>Upload an interior reference image</small></button>
    <button type="button" className="choice portal-generate-map" onClick={onAssetsBuilder}><strong>Assets Builder</strong><small>Create terrain collections and reusable game assets</small></button>
    <button type="button" className="choice portal-generate-map" onClick={onBuildingAssetsBuilder}><strong>Building Assets Builder</strong><small>Create reusable pixel-art buildings</small></button>
    <button type="button" className="choice portal-generate-map" onClick={onInteriorAssetsBuilder}><strong>Interior Asset Builder</strong><small>Create floor paint, walls, furniture and indoor props</small></button>
    <button type="button" className="choice portal-generate-map" onClick={onDetailedStyle}><strong>Detailed style prototype</strong><small>Test 48px world tiles and a 96px character</small></button>
    <button type="button" className="choice portal-generate-map" onClick={onNpcAssetsBuilder}><strong>NPC Assets</strong><small>Create NPC appearances, names and character prompts</small></button>
    <button type="button" className="text-button" onClick={onRecreate}>Recreate character</button>
    <button type="button" className="text-button" onClick={onLogout}>Log out</button>
  </>);
}


function App() {
  const [user, setUser] = useState(undefined);
  const [recreating, setRecreating] = useState(false);
  // Which full-page view is open from the character screen: null, 'world' (editor) or 'play'.
  const [generatorKind,setGeneratorKind]=useState('exterior');
  const [prototypeMap,setPrototypeMap]=useState(null);
  const [view, setView] = useState(null);

  useEffect(() => {
    api('/api/me').then(({ ok, data }) => setUser(ok ? data.user : null)).catch(() => setUser(null));
  }, []);

  async function logout() {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setRecreating(false);
    setView(null);
  }

  const step = user === undefined ? 'loading' : !user ? 'login' : !user.character || recreating ? 'create' : view ?? 'ready';
  const stepLabel = { loading: '01 / LOGIN', login: '01 / LOGIN', create: '02 / CREATE', ready: '03 / READY' }[step];

  if (step === 'world' || step === 'play' || step === 'generated' || step === 'assets' || step === 'buildings' || step === 'npcs' || step === 'interior-assets' || step === 'detailed-style') {
    return (
      <main className={(step === 'assets' || step === 'buildings' || step === 'npcs' || step === 'interior-assets' || step === 'detailed-style') ? 'assets-page' : 'editor-page'}>
        <Suspense fallback={<p className="editor-loading">Opening your world…</p>}>
          {step === 'detailed-style' ? <DetailedStylePrototype user={user} onBack={()=>setView(null)}/> : step === 'interior-assets' ? <AssetsBuilder key="interior" interior user={user} onPrototype={map=>{setPrototypeMap(map);setGeneratorKind('interior');setView('generated');}} onBack={()=>setView(null)}/> : step === 'npcs' ? <NpcAssetsBuilder onBack={()=>setView(null)}/> : step === 'buildings' ? <BuildingAssetsBuilder user={user} onBack={()=>setView(null)}/> : step === 'assets' ? <AssetsBuilder user={user} onBack={()=>setView(null)}/> : step === 'generated' ? <GeneratedMapEditor key={generatorKind} mapKind={generatorKind} user={user} initialMap={prototypeMap} onBack={()=>{setPrototypeMap(null);setView(null);}}/> : step === 'world'
            ? <WorldEditor user={user} onBack={() => setView(null)} />
            : <PlayView user={user} onBack={() => setView(null)} onCreateWorld={() => setView('world')} />}
        </Suspense>
      </main>
    );
  }

  return (
    <main className="world">
      <header className="header">
        <a className="brand" href="/" aria-label="Isekai Zero home"><span className="brand-icon">✦</span><span>ISEKAI<span className="brand-zero">ZERO</span></span></a>
        <span className="header-label"><span className="status-dot" /> A NEW WORLD AWAITS</span>
      </header>
      <section className="portal" aria-labelledby="welcome-title">
        <div className="eyebrow"><span /> YOUR NEXT ADVENTURE STARTS HERE</div>
        <h1 id="welcome-title">Different world.<br />Same <span>you.<svg viewBox="0 0 220 20" aria-hidden="true"><path d="M4 14 Q100 -2 215 9 M22 19 Q120 6 195 14" /></svg></span></h1>
        <p className="intro">Big adventures. Unexpected friends.<br />A whole new world to call your own.</p>
        <div className="login-card">
          <div className="card-top"><span className="little-star">✦</span><span>PLAYER PORTAL</span><span className="card-number">{stepLabel}</span></div>
          {step === 'loading' && <p>Opening the portal…</p>}
          {step === 'login' && <LoginForm onLogin={setUser} />}
          {step === 'create' && <CharacterCreator user={user} onUpdate={setUser} onSaved={(next) => { setUser(next); setRecreating(false); }} onCancel={user.character ? () => setRecreating(false) : null} />}
          {step === 'ready' && <CharacterCard user={user} onPlay={() => setView('play')} onCreateWorld={() => setView('world')} onGenerateExteriorMap={()=>{setPrototypeMap(null);setGeneratorKind('exterior');setView('generated');}} onGenerateInteriorMap={()=>{setPrototypeMap(null);setGeneratorKind('interior');setView('generated');}} onDetailedStyle={()=>setView('detailed-style')} onAssetsBuilder={()=>setView('assets')} onInteriorAssetsBuilder={()=>setView('interior-assets')} onNpcAssetsBuilder={()=>setView('npcs')} onBuildingAssetsBuilder={()=>setView('buildings')} onRecreate={() => setRecreating(true)} onLogout={logout} />}
          {step === 'create' && <button type="button" className="text-button" onClick={logout}>Log out</button>}
          <div className="login-note"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="7" width="8" height="7" rx="2" /><path d="M5.5 7V4a2.5 2.5 0 0 1 5 0v3" /></svg>One account. Every adventure.</div>
        </div>
        <div className="under-card"><span>✦</span> A LITTLE MAGIC. A LOT OF POSSIBILITY.</div>
      </section>

      <div className="art-label" aria-hidden="true"><span>WELCOME TO YOUR</span><strong>next chapter.</strong><span className="label-star">✦</span></div>
      <footer><span>© {new Date().getFullYear()} ISEKAI ZERO</span><span>MADE FOR THE ADVENTURER IN YOU <b>✦</b></span></footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
