import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { Plus, X, Save, Trash2, Calculator, Search, ArrowLeft } from 'lucide-react';

const emptyRecipe = () => ({ name: '', description: '', output_name: '', output_quantity: 1, ingredients: [{ name: '', quantity: 1 }] });
const numberText = value => Number.isInteger(value) ? String(value) : Number(value.toFixed(3)).toString();

export default function CraftingPanel({ onClose, permissions = {} }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyRecipe());
  const [desired, setDesired] = useState({});
  const [saving, setSaving] = useState(false);

  const canAdd = permissions.isOwner || permissions.canAdd;
  const canEdit = permissions.isOwner || permissions.canEdit;
  const canDelete = permissions.isOwner || permissions.canDelete;

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('crafting_recipes').select('*').order('name');
    if (error) setNotice(error.message);
    else setRecipes(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => recipes.filter(r =>
    `${r.name} ${r.output_name} ${r.description} ${(r.ingredients || []).map(i => i.name).join(' ')}`.toLowerCase().includes(search.toLowerCase())
  ), [recipes, search]);

  const setDraftField = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const setIngredient = (index, key, value) => setDraft(current => ({
    ...current, ingredients: current.ingredients.map((item, i) => i === index ? { ...item, [key]: value } : item)
  }));
  const openNew = () => { setDraft(emptyRecipe()); setEditing('new'); };
  const openEdit = recipe => { setDraft({ ...recipe, ingredients: (recipe.ingredients || []).map(i => ({ ...i })) }); setEditing(recipe.id); };

  const save = async event => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.output_name.trim() || !Number.isInteger(Number(draft.output_quantity)) || Number(draft.output_quantity) < 1) {
      setNotice('Enter a recipe name, output item and whole-number output quantity.'); return;
    }
    const ingredients = draft.ingredients.map(i => ({ name: i.name.trim(), quantity: Number(i.quantity) })).filter(i => i.name && Number.isFinite(i.quantity) && i.quantity > 0);
    if (!ingredients.length || ingredients.length !== draft.ingredients.filter(i => i.name.trim()).length) {
      setNotice('Each ingredient needs a name and a quantity greater than zero.'); return;
    }
    setSaving(true);
    const payload = { name: draft.name.trim(), description: draft.description || '', output_name: draft.output_name.trim(), output_quantity: Number(draft.output_quantity), ingredients };
    const result = editing === 'new'
      ? await supabase.from('crafting_recipes').insert({ ...payload, created_by: (await supabase.auth.getUser()).data.user?.id })
      : await supabase.from('crafting_recipes').update(payload).eq('id', editing);
    setSaving(false);
    if (result.error) { setNotice(result.error.message); return; }
    setEditing(null); setNotice('Recipe saved.'); await load();
  };

  const remove = async recipe => {
    if (!canDelete || !window.confirm(`Delete recipe "${recipe.name}"?`)) return;
    const { error } = await supabase.from('crafting_recipes').delete().eq('id', recipe.id);
    if (error) setNotice(error.message); else { setNotice('Recipe deleted.'); await load(); }
  };

  return (
    <div className="crafting-page">
      <div className="crafting-heading">
        <div><div className="eyebrow">THE KNOX MAP • WORKSHOP</div><h2>Crafting recipes</h2><p>Build a recipe library and calculate the exact ingredients you need.</p></div>
        <button className="outline-btn" onClick={onClose}><ArrowLeft size={15}/> Back</button>
      </div>
      <div className="crafting-toolbar">
        <label className="search"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search recipes, outputs or ingredients..."/></label>
        {canAdd && <button className="add-btn" onClick={openNew}><Plus size={16}/> Add recipe</button>}
      </div>
      {notice && <div className="crafting-notice">{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}
      {loading ? <p>Loading recipes...</p> : !visible.length ? <div className="crafting-empty">{recipes.length ? 'No recipes match your search.' : 'No crafting recipes have been added yet.'}</div> : (
        <div className="recipe-grid">
          {visible.map(recipe => {
            const target = Math.max(1, Number(desired[recipe.id] ?? recipe.output_quantity));
            const multiplier = target / recipe.output_quantity;
            return <article className="recipe-card" key={recipe.id}>
              <div className="recipe-card-head"><div><div className="eyebrow">RECIPE</div><h3>{recipe.name}</h3></div><div className="recipe-actions">{canEdit && <button className="outline-btn" onClick={() => openEdit(recipe)}>Edit</button>}{canDelete && <button className="danger-icon" onClick={() => remove(recipe)} title="Delete recipe"><Trash2 size={15}/></button>}</div></div>
              {recipe.description && <p className="recipe-description">{recipe.description}</p>}
              <div className="recipe-output"><span>OUTPUT</span><strong>{recipe.output_name}</strong><b>× {recipe.output_quantity}</b></div>
              <div className="calculator-head"><Calculator size={15}/> OUTPUT CALCULATOR</div>
              <label className="desired-output">I want to make <input type="number" min="1" step="1" value={target} onChange={e => setDesired(v => ({ ...v, [recipe.id]: e.target.value }))}/> {recipe.output_name}</label>
              <div className="ingredient-list"><div className="ingredient-title">YOU WILL NEED</div>{(recipe.ingredients || []).map((item, i) => <div className="ingredient-row" key={i}><span>{item.name}</span><strong>{numberText(item.quantity * multiplier)}</strong></div>)}</div>
            </article>;
          })}
        </div>
      )}
      {editing !== null && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }}><div className="modal editor-modal recipe-modal">
        <button className="modal-close" onClick={() => setEditing(null)}><X/></button><div className="eyebrow">{editing === 'new' ? 'NEW CRAFTING RECIPE' : 'EDIT CRAFTING RECIPE'}</div><h2>{editing === 'new' ? 'Add recipe' : 'Edit recipe'}</h2>
        <form onSubmit={save}>
          <label>Recipe name<input required maxLength="100" value={draft.name} onChange={e => setDraftField('name', e.target.value)} placeholder="e.g. Radio Booster"/></label>
          <label>Description / notes<textarea rows="2" value={draft.description} onChange={e => setDraftField('description', e.target.value)} placeholder="Optional crafting notes..."/></label>
          <div className="recipe-form-row"><label>Output item<input required value={draft.output_name} onChange={e => setDraftField('output_name', e.target.value)} placeholder="Radio Booster"/></label><label>Output quantity<input required type="number" min="1" step="1" value={draft.output_quantity} onChange={e => setDraftField('output_quantity', e.target.value)}/></label></div>
          <div className="ingredient-form-head"><strong>INGREDIENTS</strong><button type="button" className="small-btn" onClick={() => setDraftField('ingredients', [...draft.ingredients, { name: '', quantity: 1 }])}><Plus size={13}/> Add ingredient</button></div>
          {draft.ingredients.map((item, i) => <div className="ingredient-form-row" key={i}><input aria-label="Ingredient name" value={item.name} onChange={e => setIngredient(i, 'name', e.target.value)} placeholder="Ingredient name"/><input aria-label="Ingredient quantity" type="number" min="0.001" step="any" value={item.quantity} onChange={e => setIngredient(i, 'quantity', e.target.value)}/><button type="button" className="danger-icon" disabled={draft.ingredients.length === 1} onClick={() => setDraftField('ingredients', draft.ingredients.filter((_, index) => index !== i))}><Trash2 size={15}/></button></div>)}
          <div className="modal-actions"><button type="button" className="outline-btn" onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={saving}><Save size={15}/>{saving ? 'Saving...' : 'Save recipe'}</button></div>
        </form>
      </div></div>}
    </div>
  );
}
