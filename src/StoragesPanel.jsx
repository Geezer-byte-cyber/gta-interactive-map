import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { Plus, X, Save, Trash2, ArrowLeft, Copy, ShieldCheck, Package, History, Minus, RefreshCw } from 'lucide-react';

const emptyStorage = () => ({ name: '', type: 'container', capacity: '', pincode: '', description: '' });
const emptyItem = () => ({ name: '', quantity: '1', unitWeight: '' });

export default function StoragesPanel({ isOwner, permissions = {}, accountType, onClose }) {
  const [storages, setStorages] = useState([]);
  const [users, setUsers] = useState([]);
  const [accessByStorage, setAccessByStorage] = useState({});
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [draft, setDraft] = useState(emptyStorage());
  const [editing, setEditing] = useState(null);
  const [selectedStorage, setSelectedStorage] = useState(null);
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [itemDraft, setItemDraft] = useState(emptyItem());
  const [itemAction, setItemAction] = useState('add');
  const [itemBusy, setItemBusy] = useState(false);
  const [rowActions, setRowActions] = useState({});
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

  const loadInventory = async storage => {
    const [{ data: itemData, error: itemError }, { data: movementData, error: movementError }] = await Promise.all([
      supabase.from('storage_items').select('*').eq('storage_id', storage.id).order('name'),
      supabase.from('storage_item_movements').select('*').eq('storage_id', storage.id).order('created_at', { ascending: false }).limit(100)
    ]);
    if (itemError || movementError) {
      setNotice(itemError?.message || movementError?.message);
      return;
    }
    setItems(itemData || []);
    setMovements(movementData || []);
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

  useEffect(() => {
    if (selectedStorage) loadInventory(selectedStorage);
  }, [selectedStorage?.id]);

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
      storageId = crypto.randomUUID();
      const result = await supabase.from('storages').insert({ id: storageId, ...payload, created_by: (await supabase.auth.getUser()).data.user?.id });
      error = result.error;
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
    if (!canDelete || !window.confirm(`Delete storage "${storage.name}" and its inventory history?`)) return;
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

  const submitMovement = async (name, action, quantity, unitWeight = null) => {
    if (!selectedStorage) return;
    const count = Number(quantity);
    if (!name.trim() || !Number.isInteger(count) || count < 1) {
      setNotice('Enter an item name and a whole-number quantity greater than zero.');
      return;
    }
    if (action === 'add' && unitWeight !== null && (!Number.isInteger(Number(unitWeight)) || Number(unitWeight) < 0)) {
      setNotice('Enter a valid per-item weight (zero or greater).');
      return;
    }
    setItemBusy(true);
    const { error } = await supabase.rpc('adjust_storage_item', {
      p_storage_id: selectedStorage.id,
      p_item_name: name.trim(),
      p_action: action,
      p_quantity: count,
      p_unit_weight: unitWeight === null || unitWeight === '' ? null : Number(unitWeight)
    });
    setItemBusy(false);
    if (error) setNotice(error.message);
    else {
      setNotice(`${count} × ${name.trim()} ${action === 'add' ? 'added to' : 'removed from'} storage.`);
      setItemDraft(emptyItem());
      setRowActions(current => ({ ...current, [name]: { action: 'add', quantity: '1' } }));
      await loadInventory(selectedStorage);
    }
  };

  const usedCapacity = items.reduce((total, item) => total + Number(item.quantity) * Number(item.unit_weight), 0);
  const availableCapacity = Number(selectedStorage?.capacity || 0) - usedCapacity;
  const formatWeight = value => Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });

  if (accountType === 'customer') return null;

  return (
    <div className="crafting-page">
      {!selectedStorage ? <>
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
              <article className="recipe-card storage-card" key={storage.id} onClick={() => setSelectedStorage(storage)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedStorage(storage); }}>
                <div className="recipe-card-head">
                  <div><div className="eyebrow">{storage.type === 'safe' ? 'SAFE' : 'CONTAINER'}</div><h3>{storage.name}</h3></div>
                  <div className="recipe-actions" onClick={e => e.stopPropagation()}>
                    {canEdit && <button className="outline-btn" onClick={() => openEdit(storage)}>Edit</button>}
                    {canDelete && <button className="danger-icon" onClick={() => remove(storage)} title="Delete storage"><Trash2 size={15}/></button>}
                  </div>
                </div>
                <div className="recipe-output"><span>MAX CAPACITY</span><strong>{storage.capacity.toLocaleString()}</strong></div>
                {storage.description && <p className="recipe-description">{storage.description}</p>}
                <div className="calculator-head"><ShieldCheck size={15}/> ACCESS PINCODE</div>
                <button type="button" className="outline-btn" style={{ width: '100%', justifyContent: 'space-between', letterSpacing: 3 }} onClick={e => { e.stopPropagation(); copyPin(storage); }} title="Copy pincode">
                  <span style={{ filter: revealedId === storage.id ? 'none' : 'blur(6px)', userSelect: 'none', transition: 'filter .15s' }}>{storage.pincode}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, letterSpacing: 0 }}><Copy size={14}/>{revealedId === storage.id ? 'Copied' : 'Copy PIN'}</span>
                </button>
                <div className="eyebrow" style={{ marginTop: 8 }}>{revealedId === storage.id ? 'PIN VISIBLE FOR 3 SECONDS' : 'PIN HIDDEN • CLICK TO COPY'}</div>
                <div className="storage-open-hint"><Package size={14}/> CLICK TO VIEW CONTENTS & LOG MOVEMENTS</div>
              </article>
            ))}
          </div>
        )}
      </> : <>
        <div className="crafting-heading">
          <div><div className="eyebrow">STORAGE INVENTORY & MOVEMENT LOG</div><h2>{selectedStorage.name}</h2><p>{selectedStorage.type === 'safe' ? 'Safe' : 'Container'} · {selectedStorage.description || 'Track items stored here'}</p></div>
          <button className="outline-btn" onClick={() => { setSelectedStorage(null); setNotice(''); }}><ArrowLeft size={15}/> All storages</button>
        </div>
        {notice && <div className="crafting-notice" role="status">{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}
        <div className="storage-capacity">
          <div><span>MAX CAPACITY</span><strong>{formatWeight(selectedStorage.capacity)}</strong></div>
          <div><span>WEIGHT IN USE</span><strong>{formatWeight(usedCapacity)}</strong></div>
          <div><span>AVAILABLE</span><strong className={availableCapacity < 0 ? 'storage-over-capacity' : ''}>{formatWeight(availableCapacity)}</strong></div>
          <div className="storage-capacity-bar"><span style={{ width: `${Math.min(100, Math.max(0, usedCapacity / Number(selectedStorage.capacity) * 100))}%` }}/></div>
        </div>
        <div className="storage-inventory-layout">
          <section className="storage-inventory-panel">
            <div className="storage-panel-title"><h3><Package size={17}/> Items in storage</h3><button className="outline-btn" onClick={() => loadInventory(selectedStorage)}><RefreshCw size={13}/> Refresh</button></div>
            {!items.length ? <div className="crafting-empty">This storage is empty. Add the first item below.</div> : items.map(item => {
              const row = rowActions[item.id] || { action: 'remove', quantity: '1' };
              return <div className="storage-item-row" key={item.id}>
                <div className="storage-item-info"><strong>{item.name}</strong><span>{item.quantity.toLocaleString()} in stock · {formatWeight(item.unit_weight)} weight each · {formatWeight(item.quantity * item.unit_weight)} total weight</span></div>
                <div className="storage-item-controls">
                  <select aria-label={`Action for ${item.name}`} value={row.action} onChange={e => setRowActions(current => ({ ...current, [item.id]: { ...row, action: e.target.value } }))}><option value="remove">Remove</option><option value="add">Add</option></select>
                  <input aria-label={`Quantity for ${item.name}`} type="number" min="1" step="1" value={row.quantity} onChange={e => setRowActions(current => ({ ...current, [item.id]: { ...row, quantity: e.target.value } }))}/>
                  <button className="small-btn" disabled={itemBusy} onClick={() => submitMovement(item.name, row.action, row.quantity)}>{row.action === 'add' ? <Plus size={13}/> : <Minus size={13}/>} {row.action}</button>
                </div>
              </div>;
            })}
            <form className="storage-add-form" onSubmit={e => { e.preventDefault(); submitMovement(itemDraft.name, 'add', itemDraft.quantity, itemDraft.unitWeight); }}>
              <h4><Plus size={15}/> Add item</h4>
              <label>Item name<input required value={itemDraft.name} onChange={e => setItemDraft(current => ({ ...current, name: e.target.value }))} placeholder="e.g. Metal scraps"/></label>
              <div className="storage-add-fields">
                <label>Quantity<input required type="number" min="1" step="1" value={itemDraft.quantity} onChange={e => setItemDraft(current => ({ ...current, quantity: e.target.value }))}/></label>
                <label>Weight per item<input required type="number" min="0" step="1" value={itemDraft.unitWeight} onChange={e => setItemDraft(current => ({ ...current, unitWeight: e.target.value }))} placeholder="e.g. 2"/></label>
              </div>
              <p className="storage-form-hint">If this item name already exists, its existing unit weight is kept and the quantity is combined.</p>
              <button className="primary" disabled={itemBusy}><Plus size={14}/>{itemBusy ? 'Saving...' : 'Add to storage'}</button>
            </form>
          </section>
          <section className="storage-history-panel">
            <div className="storage-panel-title"><h3><History size={17}/> Movement history</h3><span className="eyebrow">LATEST 100</span></div>
            {!movements.length ? <p className="storage-history-empty">No movements logged yet.</p> : movements.map(move => <div className="storage-movement" key={move.id}>
              <span className={move.action === 'add' ? 'storage-movement-add' : 'storage-movement-remove'}>{move.action === 'add' ? '+' : '−'}{move.quantity}</span>
              <div><strong>{move.item_name}</strong><span>{move.action === 'add' ? 'Added' : 'Removed'} · {formatWeight(move.unit_weight)} each · {formatWeight(move.quantity * move.unit_weight)} total weight</span><small>{new Date(move.created_at).toLocaleString()}</small></div>
            </div>)}
          </section>
        </div>
      </>}
      {editing !== null && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }}>
        <div className="modal editor-modal recipe-modal">
          <button className="modal-close" onClick={() => setEditing(null)}><X/></button>
          <div className="eyebrow">{editing === 'new' ? 'NEW STORAGE' : 'EDIT STORAGE'}</div><h2>{editing === 'new' ? 'Add storage' : 'Edit storage'}</h2>
          <form onSubmit={save}>
            <label>Storage name<input required maxLength={100} value={draft.name} onChange={e => setField('name', e.target.value)}/></label>
            <label>Type<select value={draft.type} onChange={e => setField('type', e.target.value)}><option value="container">Container</option><option value="safe">Safe</option></select></label>
            <label>Capacity<input required type="number" min="1" step="1" value={draft.capacity} onChange={e => setField('capacity', e.target.value)} placeholder="e.g. 100"/></label>
            <label>Access pincode<input required type="text" maxLength={64} value={draft.pincode} onChange={e => setField('pincode', e.target.value)} placeholder="Enter pincode"/></label>
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
