import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { Plus, X, Save, Trash2, Pencil, ArrowLeft, Search, Package, Tag } from 'lucide-react';

const blank = { name: '', description: '', price: '0.00', image_url: '', category_id: '' };
const money = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value || 0));

export default function CataloguePanel({ isOwner, onClose, previewReadOnly = false, previewCategories = null }) {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(blank);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categoryEditor, setCategoryEditor] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);

  const permission = id => permissions.find(p => p.category_id === id);
  const canAdd = id => !previewReadOnly && (isOwner || permission(id)?.can_add === true);
  const canEdit = id => !previewReadOnly && (isOwner || permission(id)?.can_edit === true);
  const canDelete = id => !previewReadOnly && (isOwner || permission(id)?.can_delete === true);

  const visibleCategories = previewReadOnly && Array.isArray(previewCategories) ? categories.filter(c => previewCategories.some(p => p.categoryId === c.id && p.canView)) : categories;

  const load = async () => {
    setLoading(true);
    const [{ data: cats, error: ce }, { data: its, error: ie }, { data: perms, error: pe }] = await Promise.all([
      supabase.from('catalogue_categories').select('*').order('name'),
      supabase.from('catalogue_items').select('*').order('name'),
      supabase.from('catalogue_category_permissions').select('category_id,can_add,can_edit,can_delete')
    ]);
    if (ce || ie || pe) setNotice(ce?.message || ie?.message || pe?.message || 'Could not load catalogue');
    else { setCategories(cats || []); setItems(its || []); setPermissions(perms || []); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const visibleItems = useMemo(() => items.filter(item =>
    (!previewReadOnly || visibleCategories.some(c => c.id === item.category_id)) &&
    (selectedCategory === 'all' || item.category_id === selectedCategory) &&
    `${item.name} ${item.description || ''} ${categories.find(c => c.id === item.category_id)?.name || ''}`.toLowerCase().includes(search.toLowerCase())
  ), [items, selectedCategory, search, categories, previewReadOnly, previewCategories]);

  const openNew = categoryId => { setEditing('new'); setDraft({ ...blank, category_id: categoryId || categories.find(c => canAdd(c.id))?.id || '' }); };
  const openEdit = async item => {
    setEditing(item.id);
    setDraft({ name:item.name, description:item.description || '', price:String(item.price ?? 0), image_url:item.image_url || '', category_id:item.category_id });
  };
  const save = async e => {
    e.preventDefault();
    if (!draft.name.trim() || !draft.category_id || !Number.isFinite(Number(draft.price)) || Number(draft.price) < 0) {
      setNotice('Enter an item name, category and valid non-negative price.'); return;
    }
    setBusy(true); setNotice('');
    const payload = { name:draft.name.trim(), description:draft.description, price:Number(draft.price), image_url:draft.image_url.trim(), category_id:draft.category_id };
    const result = editing === 'new'
      ? await supabase.from('catalogue_items').insert({ ...payload, created_by:(await supabase.auth.getUser()).data.user?.id }).select().single()
      : await supabase.from('catalogue_items').update(payload).eq('id', editing).select().single();
    if (result.error) { setNotice(result.error.message); setBusy(false); return; }
    setEditing(null); setBusy(false); await load();
  };
  const remove = async item => {
    if (!window.confirm('Delete this catalogue item?')) return;
    const { error } = await supabase.from('catalogue_items').delete().eq('id', item.id);
    if (error) setNotice(error.message); else { setNotice('Catalogue item deleted.'); await load(); }
  };
  const addCategory = () => { setCategoryName(''); setCategoryEditor('new'); };
  const renameCategory = category => { setCategoryName(category.name); setCategoryEditor(category); };
  const saveCategory = async event => {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) { setNotice('Enter a category name.'); return; }
    setCategoryBusy(true); setNotice('');
    const result = categoryEditor === 'new'
      ? await supabase.from('catalogue_categories').insert({ name })
      : await supabase.from('catalogue_categories').update({ name }).eq('id', categoryEditor.id);
    setCategoryBusy(false);
    if (result.error) { setNotice(result.error.message); return; }
    setCategoryEditor(null);
    setNotice(categoryEditor === 'new' ? 'Category created.' : 'Category renamed.');
    await load();
  };
  const deleteCategory = async category => {
    if (!window.confirm(`Delete "${category.name}" and all its catalogue items?`)) return;
    const { error } = await supabase.from('catalogue_categories').delete().eq('id', category.id);
    if (error) setNotice(error.message); else { setSelectedCategory('all'); await load(); }
  };

  return <div className="crafting-page catalogue-page">
    <div className="crafting-heading">
      <div><div className="eyebrow">KNOX HQ • PRICE LIST</div><h2>Catalogue</h2><p>Browse the available items and their prices. Orders are managed separately.</p></div>
      <button className="outline-btn" onClick={onClose}><ArrowLeft size={15}/> Back</button>
    </div>
    <div className="crafting-toolbar catalogue-toolbar">
      <label className="search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search catalogue items..."/></label>
      {isOwner && <button className="add-btn" onClick={addCategory}><Plus size={16}/> Add category</button>}
    </div>
    <div className="catalogue-category-tabs">
      <button className={selectedCategory==='all'?'catalogue-chip active':'catalogue-chip'} onClick={()=>setSelectedCategory('all')}>All items</button>
      {visibleCategories.map(c=><button key={c.id} className={selectedCategory===c.id?'catalogue-chip active':'catalogue-chip'} onClick={()=>setSelectedCategory(c.id)}>{c.name}</button>)}
    </div>
    {isOwner && !previewReadOnly && visibleCategories.length>0 && <details className="catalogue-category-manager"><summary><Tag size={14}/> Manage categories <span>{categories.length} categories</span></summary><div>{visibleCategories.map(c=><div key={c.id}><strong>{c.name}</strong><span><button className="outline-btn" onClick={()=>renameCategory(c)}><Pencil size={12}/> Rename</button><button className="danger-icon" onClick={()=>deleteCategory(c)} title="Delete category"><Trash2 size={13}/></button></span></div>)}</div></details>}
    {notice && <div className="crafting-notice">{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}
    {loading ? <div className="crafting-empty">Loading catalogue...</div> : visibleItems.length ? <div className="recipe-grid catalogue-grid">
      {visibleItems.map(item=><article className="recipe-card catalogue-card" key={item.id}>
        <div className="catalogue-item-image">{item.image_url ? <img src={item.image_url} alt={item.name}/> : <div><Package size={30}/><span>KNOX HQ</span></div>}</div>
        <div className="recipe-card-head"><div><div className="eyebrow">{visibleCategories.find(c=>c.id===item.category_id)?.name || 'CATALOGUE ITEM'}</div><h3>{item.name}</h3></div><div className="recipe-actions">{canEdit(item.category_id)&&<button className="outline-btn" onClick={()=>openEdit(item)}>Edit</button>}{canDelete(item.category_id)&&<button className="danger-icon" onClick={()=>remove(item)} title="Delete item"><Trash2 size={14}/></button>}</div></div>
        {item.description && <p className="recipe-description">{item.description}</p>}
        <div className="catalogue-price-row"><span>PRICE</span><strong>{money(item.price)}</strong></div>
      </article>)}
    </div> : <div className="crafting-empty">{items.length ? 'No catalogue items match your search or category.' : 'No catalogue items have been added yet.'}</div>}
    {visibleCategories.filter(c=>canAdd(c.id) && (selectedCategory==='all' || selectedCategory===c.id)).map(c=><button key={c.id} className="primary catalogue-add" onClick={()=>openNew(c.id)}><Plus size={15}/> Add item to {c.name}</button>)}
    {!previewReadOnly && categoryEditor!==null && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setCategoryEditor(null);}}><div className="modal editor-modal catalogue-modal">
      <button className="modal-close" onClick={()=>setCategoryEditor(null)}><X/></button>
      <div className="eyebrow">{categoryEditor==='new'?'NEW CATALOGUE CATEGORY':'EDIT CATALOGUE CATEGORY'}</div>
      <h2>{categoryEditor==='new'?'Add category':'Rename category'}</h2>
      <p className="recipe-description">Create a category to organise catalogue items. Account access is managed separately in the Admin Panel.</p>
      <form onSubmit={saveCategory}>
        <label>Category name<input autoFocus required maxLength="60" value={categoryName} onChange={e=>setCategoryName(e.target.value)} placeholder="e.g. Vehicle Services"/></label>
        <div className="modal-actions"><button type="button" className="outline-btn" onClick={()=>setCategoryEditor(null)}>Cancel</button><button className="primary" disabled={categoryBusy}><Save size={15}/>{categoryBusy?'Saving...':'Save category'}</button></div>
      </form>
    </div></div>}
    {!previewReadOnly && editing!==null && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null);}}><div className="modal editor-modal recipe-modal catalogue-modal">
      <button className="modal-close" onClick={()=>setEditing(null)}><X/></button><div className="eyebrow">{editing==='new'?'NEW CATALOGUE ITEM':'EDIT CATALOGUE ITEM'}</div><h2>{editing==='new'?'Add item':'Edit item'}</h2>
      <form onSubmit={save}>
        <label>Item name<input required maxLength="120" value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="e.g. Vehicle import"/></label>
        <label>Category<select required value={draft.category_id} onChange={e=>setDraft({...draft,category_id:e.target.value})}>{categories.filter(c=>canAdd(c.id)||c.id===draft.category_id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Price (£)<input required type="number" min="0" step="0.01" value={draft.price} onChange={e=>setDraft({...draft,price:e.target.value})}/></label>
        <label>Description<textarea rows="3" value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} placeholder="Optional item details..."/></label>
        <label>Image URL (optional)<input value={draft.image_url} onChange={e=>setDraft({...draft,image_url:e.target.value})} placeholder="https://..."/></label>
        <div className="modal-actions"><button type="button" className="outline-btn" onClick={()=>setEditing(null)}>Cancel</button><button className="primary" disabled={busy}><Save size={15}/>{busy?'Saving...':'Save item'}</button></div>
      </form>
    </div></div>}
  </div>;
}
