import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { Plus, X, Save, Trash2, Pencil, ArrowLeft } from 'lucide-react';

const blank = { name: '', description: '', price: '0.00', image_url: '', category_id: '' };
const money = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value || 0));

export default function CataloguePanel({ isOwner, onClose }) {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(blank);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [itemUsers, setItemUsers] = useState([]);

  const permission = id => permissions.find(p => p.category_id === id);
  const canAdd = id => isOwner || permission(id)?.can_add;
  const canEdit = id => isOwner || permission(id)?.can_edit;
  const canDelete = id => isOwner || permission(id)?.can_delete;

  const load = async () => {
    const [{ data: cats, error: ce }, { data: its, error: ie }, { data: perms, error: pe }] = await Promise.all([
      supabase.from('catalogue_categories').select('*').order('name'),
      supabase.from('catalogue_items').select('*').order('name'),
      supabase.from('catalogue_category_permissions').select('category_id,can_add,can_edit,can_delete')
    ]);
    if (ce || ie || pe) { setNotice(ce?.message || ie?.message || pe?.message || 'Could not load catalogue'); return; }
    setCategories(cats || []); setItems(its || []); setPermissions(perms || []);
    if (isOwner) {
      const { data } = await supabase.from('user_profiles').select('user_id,username,account_type').order('username');
      setAccounts(data || []);
    }
  };
  useEffect(() => { load(); }, []);

  const visibleItems = useMemo(() => items.filter(item => selectedCategory === 'all' || item.category_id === selectedCategory), [items, selectedCategory]);
  const openNew = categoryId => { setEditing('new'); setDraft({ ...blank, category_id: categoryId || categories[0]?.id || '' }); setItemUsers([]); };
  const openEdit = async item => {
    setEditing(item.id); setDraft({ name:item.name, description:item.description || '', price:String(item.price ?? 0), image_url:item.image_url || '', category_id:item.category_id });
    const { data } = await supabase.from('catalogue_item_access').select('user_id').eq('item_id', item.id);
    setItemUsers((data || []).map(x => x.user_id));
  };
  const save = async e => {
    e.preventDefault();
    if (!draft.name.trim() || !draft.category_id || !Number.isFinite(Number(draft.price)) || Number(draft.price) < 0) return setNotice('Enter an item name, category and valid non-negative price.');
    setBusy(true); setNotice('');
    const payload = { name:draft.name.trim(), description:draft.description, price:Number(draft.price), image_url:draft.image_url.trim(), category_id:draft.category_id };
    const result = editing === 'new'
      ? await supabase.from('catalogue_items').insert({ ...payload, created_by:(await supabase.auth.getUser()).data.user?.id }).select().single()
      : await supabase.from('catalogue_items').update(payload).eq('id', editing).select().single();
    if (result.error) { setNotice(result.error.message); setBusy(false); return; }
    if (isOwner) {
      const id = result.data.id;
      await supabase.from('catalogue_item_access').delete().eq('item_id', id);
      if (itemUsers.length) {
        const { error } = await supabase.from('catalogue_item_access').insert(itemUsers.map(user_id => ({ item_id:id, user_id })));
        if (error) setNotice('Item saved, but account visibility could not be updated: ' + error.message);
      }
    }
    setEditing(null); setBusy(false); await load();
  };
  const remove = async item => {
    if (!confirm('Delete this catalogue item?')) return;
    const { error } = await supabase.from('catalogue_items').delete().eq('id', item.id);
    if (error) setNotice(error.message); else await load();
  };
  const addCategory = async () => {
    const name = prompt('New catalogue category name');
    if (!name?.trim()) return;
    const { error } = await supabase.from('catalogue_categories').insert({ name:name.trim() });
    if (error) setNotice(error.message); else await load();
  };
  const renameCategory = async category => {
    const name = prompt('Category name', category.name);
    if (!name?.trim()) return;
    const { error } = await supabase.from('catalogue_categories').update({ name:name.trim() }).eq('id', category.id);
    if (error) setNotice(error.message); else await load();
  };
  const deleteCategory = async category => {
    if (!confirm('Delete this category and all its items?')) return;
    const { error } = await supabase.from('catalogue_categories').delete().eq('id', category.id);
    if (error) setNotice(error.message); else { setSelectedCategory('all'); await load(); }
  };

  return <div className="catalogue-shell">
    <div className="catalogue-header"><div><div className="eyebrow">THE KNOX MAP • PRICE LIST</div><h2>Catalogue</h2><p>Browse available items and prices. Orders are managed separately.</p></div><button className="outline-btn" onClick={onClose}><ArrowLeft size={15}/> Back</button></div>
    {notice && <div className="toast" role="status">{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}
    <div className="catalogue-toolbar">
      <button className={selectedCategory==='all'?'catalogue-chip active':'catalogue-chip'} onClick={()=>setSelectedCategory('all')}>All items</button>
      {categories.map(c=><button key={c.id} className={selectedCategory===c.id?'catalogue-chip active':'catalogue-chip'} onClick={()=>setSelectedCategory(c.id)}>{c.name}</button>)}
      {isOwner && <button className="catalogue-chip" onClick={addCategory}><Plus size={14}/> Category</button>}
    </div>
    {isOwner && <div className="catalogue-category-admin">{categories.map(c=><span key={c.id}>{c.name} <button onClick={()=>renameCategory(c)} title="Rename"><Pencil size={12}/></button><button onClick={()=>deleteCategory(c)} title="Delete"><Trash2 size={12}/></button></span>)}</div>}
    <div className="catalogue-grid">
      {visibleItems.map(item=><article className="catalogue-card" key={item.id}>
        {item.image_url ? <img src={item.image_url} alt={item.name}/> : <div className="catalogue-placeholder">K</div>}
        <div className="catalogue-card-body"><small>{categories.find(c=>c.id===item.category_id)?.name || 'ITEM'}</small><h3>{item.name}</h3>{item.description && <p>{item.description}</p>}<strong>{money(item.price)}</strong>
        {(canEdit(item.category_id)||canDelete(item.category_id)) && <div className="catalogue-card-actions">{canEdit(item.category_id)&&<button onClick={()=>openEdit(item)}><Pencil size={13}/> Edit</button>}{canDelete(item.category_id)&&<button onClick={()=>remove(item)}><Trash2 size={13}/> Delete</button>}</div>}</div>
      </article>)}
      {visibleItems.length===0 && <p className="catalogue-empty">No catalogue items in this category yet.</p>}
    </div>
    {categories.filter(c=>canAdd(c.id)).map(c=><button key={c.id} className="primary catalogue-add" onClick={()=>openNew(c.id)}><Plus size={15}/> Add item to {c.name}</button>)}
    {editing!==null && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={()=>setEditing(null)}><X/></button><div className="eyebrow">CATALOGUE ITEM</div><h2>{editing==='new'?'Add item':'Edit item'}</h2><form onSubmit={save}>
      <label>Item name<input required value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
      <label>Category<select value={draft.category_id} onChange={e=>setDraft({...draft,category_id:e.target.value})}>{categories.filter(c=>canAdd(c.id)||c.id===draft.category_id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Price (£)<input required type="number" min="0" step="0.01" value={draft.price} onChange={e=>setDraft({...draft,price:e.target.value})}/></label>
      <label>Description<textarea value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
      <label>Image URL (optional)<input value={draft.image_url} onChange={e=>setDraft({...draft,image_url:e.target.value})}/></label>
      {isOwner && <fieldset><legend>Visible to accounts</legend><p>Leave everyone unticked to show this item to everyone who can view its category. Select accounts to make it exclusive.</p>{accounts.map(a=><label className="catalogue-account-option" key={a.user_id}><input type="checkbox" checked={itemUsers.includes(a.user_id)} onChange={e=>setItemUsers(old=>e.target.checked?[...old,a.user_id]:old.filter(x=>x!==a.user_id))}/>{a.username} ({a.account_type})</label>)}</fieldset>}
      <button className="primary wide" disabled={busy}><Save size={15}/> Save item</button>
    </form></div></div>}
  </div>;
}
