import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { inventoryAction, inventorySettings, starterInventory } from './inventory.js';

export default function usePlayerInventory(world, preview) {
  const enabled = Boolean(world && inventorySettings(world).enabled);
  const [state, setState] = useState(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [reload, setReload] = useState(0);
  const current = useRef(null), pending = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const commit = (value) => { current.current = value; setState(value); };
  useEffect(() => {
    let cancelled = false;
    commit(null);setNotice('');
    if (!enabled) return;
    if (preview) {
      try { commit(starterInventory(world)); } catch (error) { setNotice(error.message); }
      return;
    }
    setBusy(true);
    api('/api/play/inventory').then(({ ok, data }) => {
      if (cancelled) return;
      if (!ok || !data.state) throw new Error(data.error || 'Could not load inventory.');
      commit(data.state);
    }).catch((error) => { if (!cancelled) setNotice(error.message); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [enabled, world, preview, reload]);
  const act = useCallback(async (action) => {
    if (!enabled || !current.current || pending.current) return;
    pending.current = true;setBusy(true);setNotice('');
    try {
      if (preview) {
        const next = inventoryAction(current.current, { ...action, ...(action.type === 'drop' ? { dropId: crypto.randomUUID() } : {}) }, world);
        if (alive.current) { current.current=next;setState(next);setNotice('Preview inventory updated.'); }
      } else {
        const { ok, data } = await api('/api/play/inventory', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:current.current.revision,action}) });
        if (!alive.current) return;
        if (data.state) { current.current=data.state;setState(data.state); }
        if (!ok) throw new Error(data.error || 'Could not save inventory.');
        setNotice('Inventory saved.');
      }
    } catch (error) { if (alive.current) setNotice(error.message); }
    finally { pending.current=false;if(alive.current)setBusy(false); }
  }, [enabled, preview, world]);
  return { enabled,state,busy,notice,act,retry:()=>setReload((n)=>n+1) };
}
