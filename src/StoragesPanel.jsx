import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Plus, X, Save, Trash2, ArrowLeft, Copy, Eye, EyeOff, ShieldCheck } from 'lucide-react';

const emptyStorage = () => ({ name: '', type: 'container', capacity: '', pincode: '', description: '' });

export default function StoragesPanel({ isOwner, permissions = {}, accountType, onClose }) {
  const [storages, setStorages] = useState([]);
  const [users, setUsers] = useState([]);
  const [accessByStorage, setAccessByStorage] = useState({});
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [draft, setDraft] = useState(emptyStorage());
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [copiedOpen, setCopiedOpen] = useState(false);
  const [revealedId, setRevealedId] = useState(null);
  const [revealedTimer, setRevealedTimer] = useState(null);

  const canAdd = isOwner || permissions.canAdd === true;
  const canEdit = isOwner || permissions.canEdit === true;
  const canDelete = isOwner || permissions.canDelete === true;

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('storages').select('*').order('name');
    if (error) setNotice(error.message);
    else {
      setStorages(data || []);
      if (isOwner) {
        const ids = (data || []).map(item => item.id);
        if (ids.length) {
          const { data: access, error: accessError } = await supabase.from('storage_user_access').select('storage_id,user_id').in('storage_id', ids);
          if (accessError) setNotice(accessError.message);
          else {
            const grouped = {};
            (access || []).forEach(row => { (grouped[row.storage_id] ||= []).push(row.user_id); });
            setAccessByStorage(grouped);
          }
        } else setAccessByStorage({});
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (isOwner) {
      supabase.functions.invoke('manage-users', { body: { action: 'list' } }).then(({ data, error }) => {
        if (error) setNotice(data?.error || error.message);
        else setUsers((data?.users || []).filter(user => user.role !== 'owner' && user.account_type === 'knox'));
      });
    }
    return () => { if (revealedTimer) window.clearTimeout(revealedTimer); };
  }, []);

  const setField = (key, value) => setDraft(current => ({ ...current, [key]: value }));

  const openNew = () => {
    setDraft(emptyStorage());
    setSelectedUsers([]);
    setEditing('new');
  };

  const openEdit = storage => {
    setDraft({ name: storage.name, type: storage.type, capacity: String(storage.capacity), pincode: storage.pincode, description: storage.description || '' });
    setSelectedUsers(accessByStorage[storage.id] || []);
    setEditing(storage.id);
  };

  const save = async event => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.pincode.trim() || !Number.isInteger(Number(draft.capacity)) || Number(draft.capacity) < 1) {
      setNotice('Enter a name, pincode and a whole-number capacity greater than zero.');
      return;
    }
    setSaving(true);
    const payload = { name: draft.name.trim(), type: draft.type, capacity: Number(draft.capacity), pincode: draft.pincode.trim(), description: draft.description.trim() };
    let storageId = editing;
    let error;
    if (editing === 'new') {
      const result = await supabase.from('storages').insert({ ...payload, created_by: (await supabase.auth.getUser()).data.user?.id }).select('id').single();
      error = result.error;
      storageId = result.data?.id;
    } else {
      const result = await supabase.from('storages').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editing);
      error = result.error;
    }
    if (!error && isOwner) {
      const { error: clearError } = await supabase.from('storage_user_access').delete().eq('storage_id', storageId);
      error = clearError;
      if (!error && selectedUsers.length) {
        const { error: insertError } = await supabase.from('storage_user_access').insert(selectedUsers.map(userId => ({ storage_id: storageId, user_id: userId })));
        error = insertError;
      }
    } else if (!error && editing === 'new') {
      const user = (await supabase.auth.getUser()).data.user;
      const { error: accessError } = await supabase.from('storage_user_access').insert({ storage_id: storageId, user_id: user.id });
      error = accessError;
    }
    setSaving(false);
    if (error) { setNotice(error.message); return; }
    setEditing(null);
    setNotice('Storage saved successfully.');
    await load();
  };

  const remove = async storage => {
    if (!canDelete || !window.confirm(`Delete storage "${storage.name}"?`)) return;
    const { error } = await supabase.from('storages').delete().eq('id', storage.id);
    if (error) setNotice(error.message);
    else { setNotice('Storage deleted.'); await load(); }
  };

  const copyPin = async storage => {
    try {
      await navigator.clipboard.writeText(storage.pincode);
      if (revealedTimer) window.clearTimeout(revealedTimer);
      setRevealedId(storage.id);
      const timer = window.setTimeout(() => setRevealedId(null), 3000);
      setRevealedTimer(timer);
      setCopiedOpen(true);
    } catch {
      setNotice('Could not copy the pincode. Please check clipboard permissions.');
    }
  };

  if (accountType === 'customer') return null;

  return (
    <div className="crafting-page">
      <div className="crafting-heading">
        <div><div className="eyebrow">THE KNOX MAP • SECURE STORAGE DIRECTORY</div><h2>Storages</h2><p>Storage locations, capacity and access pincodes.</p></div>
        <button className="outline-btn" onClick={onClose}><ArrowLeft size={15}/> Back</button>
      </div>
      <div className="crafting-toolbar">
        <div className="eyebrow">{storages.length} VISIBLE STORAGE{storages.length === 1 ? '' : 'S'}</div>
        {canAdd && <button className="add-btn" onClick={openNew}><Plus size={16}/> Add storage</button>}
      </div>
      {notice && <div className="crafting-notice" role="status">{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}
      {loading ? <p>Loading storages...</p> : !storages.length ? <div className="crafting-empty">No storages have been assigned to your account.</div> : (
        <div className="recipe-grid">
          {storages.map(storage => (
            <article className="recipe-card" key={storage.id}>
              <div className="recipe-card-head">
                <div><div className="eyebrow">{storage.type === 'safe' ? 'SAFE' : 'CONTAINER'}</div><h3>{storage.name}</h3></div>
                <div className="recipe-actions">
                  {canEdit && <button className="outline-btn" onClick={() => openEdit(storage)}>Edit</button>}
                  {canDelete && <button className="danger-icon" onClick={() => remove(storage)} title="Delete storage"><Trash2 size={15}/></button>}
                </div>
              </div>
              <div className="recipe-output"><span>CAPACITY</span><strong>{storage.capacity.toLocaleString()}</strong></div>
              {storage.description && <p className="recipe-description">{storage.description}</p>}
              <div className="calculator-head"><ShieldCheck size={15}/> ACCESS PINCODE</div>
              <button type="button" className="outline-btn" style={{ width: '100%', justifyContent: 'space-between', letterSpacing: 3 }} onClick={() => copyPin(storage)} title="Copy pincode">
                <span style={{ filter: revealedId === storage.id ? 'none' : 'blur(6px)', userSelect: 'none', transition: 'filter .15s' }}>{storage.pincode}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, letterSpacing: 0 }}><Copy size={14}/>{revealedId === storage.id ? 'Copied' : 'Copy PIN'}</span>
              </button>
              <div className="eyebrow" style={{ marginTop: 8 }}>{revealedId === storage.id ? 'PIN VISIBLE FOR 3 SECONDS' : 'PIN HIDDEN • CLICK TO COPY'}</div>
            </article>
          ))}
        </div>
      )}
      {editing !== null && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }}>
        <div className="modal editor-modal recipe-modal">
          <button className="modal-close" onClick={() => setEditing(null)}><X/></button>
          <div className="eyebrow">{editing === 'new' ? 'NEW STORAGE' : 'EDIT STORAGE'}</div><h2>{editing === 'new' ? 'Add storage' : 'Edit storage'}</h2>
          <form onSubmit={save}>
            <label>Storage name<input required maxLength={100} value={draft.name} onChange={e => setField('name', e.target.value)}/></label>
            <label>Type<select value={draft.type} onChange={e => setField('type', e.target.value)}><option value="container">Container</option><option value="safe">Safe</option></select></label>
            <label>Capacity<input required type="number" min="1" step="1" value={draft.capacity} onChange={e => setField('capacity', e.target.value)} placeholder="e.g. 100"/></label>
            <label>Access pincode<input required maxLength={64} value={draft.pincode} onChange={e => setField('pincode', e.target.value)} placeholder="Enter pincode"/></label>
            <label>Description (optional)<textarea rows="3" value={draft.description} onChange={e => setField('description', e.target.value)} placeholder="Additional details..."/></label>
            {isOwner && <div style={{ border: '1px solid #59391f', borderRadius: 6, padding: 12, margin: '12px 0' }}>
              <h4 style={{ margin: '0 0 8px', color: '#ffad66' }}>Visible to Knox accounts</h4>
              <p style={{ fontSize: 12, color: '#b9a99a' }}>Only selected Knox accounts can see this storage. Leave everyone unchecked to make it owner-only.</p>
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {users.map(user => <label key={user.user_id} style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '6px 0', borderTop: '1px solid #49301e' }}>
                  <input type="checkbox" checked={selectedUsers.includes(user.user_id)} onChange={e => setSelectedUsers(current => e.target.checked ? [...current, user.user_id] : current.filter(id => id !== user.user_id))}/>
                  {user.username}
                </label>)}
                {!users.length && <p style={{ fontSize: 12 }}>No Knox accounts available.</p>}
              </div>
            </div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
              <button type="button" className="outline-btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="primary" disabled={saving}><Save size={15}/>{saving ? 'Saving...' : 'Save storage'}</button>
            </div>
          </form>
        </div>
      </div>}
      {copiedOpen && <div className="modal-backdrop" style={{ zIndex: 5000 }} onMouseDown={e => { if (e.target === e.currentTarget) setCopiedOpen(false); }}>
        <div className="modal" style={{ maxWidth: 360, textAlign: 'center' }}>
          <div className="brand-mark" style={{ margin: '0 auto 12px' }}><Copy size={20}/></div>
          <h2>Pincode copied!</h2><p>The storage pincode has been copied to your clipboard.</p>
          <button className="primary" onClick={() => setCopiedOpen(false)}>Got it</button>
        </div>
      </div>}
    </div>
  );
}
