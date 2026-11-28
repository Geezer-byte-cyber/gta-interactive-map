import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { Plus, Search, X, Save, Trash2, MessageSquare, Package, UserPlus, RefreshCw } from 'lucide-react';

const STATUSES = ['New', 'In Progress', 'Waiting', 'Completed', 'Cancelled'];
const emptyOrder = () => ({ title: '', description: '', customer_user_id: '', items: [{ name: '', quantity: 1 }] });

export default function OrdersPanel({ isCustomer = false, canManage = false, username = '' }) {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [notes, setNotes] = useState({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState(emptyOrder());
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [customerForm, setCustomerForm] = useState({ username: '', password: '' });
  const [showCustomerForm, setShowCustomerForm] = useState(false);

  const invoke = async body => {
    const { data, error } = await supabase.functions.invoke('manage-users', { body });
    if (error || data?.error) throw new Error(data?.error || error.message);
    return data;
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('orders').select('*').order('updated_at', { ascending: false });
    if (error) setNotice(error.message);
    else setOrders(data || []);
    if (!isCustomer && canManage) {
      try {
        const result = await invoke({ action: 'listOrderCustomers' });
        setCustomers(result.customers || []);
      } catch (e) { setNotice(e.message); }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [isCustomer, canManage]);

  const filtered = useMemo(() => orders.filter(o =>
    (statusFilter === 'All' || o.status === statusFilter) &&
    `${o.ticket_number || ''} ${o.title} ${o.description || ''} ${o.customer_username || ''}`.toLowerCase().includes(search.toLowerCase())
  ), [orders, statusFilter, search]);

  const openNew = () => { setDraft(emptyOrder()); setEditing(true); };
  const setField = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const setItem = (index, key, value) => setDraft(current => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, [key]: value } : item) }));
  const saveOrder = async e => {
    e.preventDefault();
    const items = draft.items.filter(i => i.name.trim()).map(i => ({ name: i.name.trim(), quantity: Math.max(1, Number(i.quantity) || 1) }));
    if (!draft.title.trim() || !draft.customer_user_id || !items.length) { setNotice('Add an order title, customer and at least one item.'); return; }
    setSaving(true);
    const { error } = await supabase.from('orders').insert({
      title: draft.title.trim(), description: draft.description.trim(), customer_user_id: draft.customer_user_id,
      items, status: 'New', created_by: (await supabase.auth.getUser()).data.user?.id
    });
    setSaving(false);
    if (error) { setNotice(error.message); return; }
    setEditing(false); setNotice('Order created.'); await load();
  };

  const changeStatus = async (order, status) => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', order.id);
    if (error) setNotice(error.message); else { setNotice('Order status updated.'); await load(); }
  };

  const deleteOrder = async order => {
    if (!window.confirm(`Delete order ${order.ticket_number || ''}?`)) return;
    const { error } = await supabase.from('orders').delete().eq('id', order.id);
    if (error) setNotice(error.message); else { setSelected(null); setNotice('Order deleted.'); await load(); }
  };

  const loadNotes = async order => {
    if (isCustomer) return;
    const { data, error } = await supabase.from('order_internal_notes').select('*').eq('order_id', order.id).order('created_at');
    if (error) setNotice(error.message); else setNotes(current => ({ ...current, [order.id]: data || [] }));
  };

  const addNote = async () => {
    if (!selected || !noteDraft.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('order_internal_notes').insert({ order_id: selected.id, user_id: auth.user.id, note: noteDraft.trim() });
    if (error) setNotice(error.message); else { setNoteDraft(''); await loadNotes(selected); }
  };

  const createCustomer = async e => {
    e.preventDefault(); setSaving(true);
    try {
      await invoke({ action: 'createCustomer', username: customerForm.username, password: customerForm.password });
      setCustomerForm({ username: '', password: '' }); setShowCustomerForm(false); setNotice('Customer account created.'); await load();
    } catch (error) { setNotice(error.message); }
    setSaving(false);
  };

  return <section className="orders-page">
    <div className="orders-heading">
      <div><div className="eyebrow">THE KNOX MAP · TICKET DESK</div><h2>{isCustomer ? 'My Orders' : 'Orders & Tickets'}</h2><p>{isCustomer ? 'View the progress of your orders.' : 'Create orders, track progress and keep customer requests organised.'}</p></div>
      {!isCustomer && canManage && <div className="orders-heading-actions"><button className="outline-btn" onClick={() => setShowCustomerForm(v => !v)}><UserPlus size={15}/> Customer account</button><button className="primary" onClick={openNew}><Plus size={15}/> New order</button></div>}
    </div>
    <div className="orders-toolbar"><label className="search"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets..."/></label><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option>All</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select><button className="small-btn" onClick={load}><RefreshCw size={13}/> Refresh</button></div>
    {notice && <div className="crafting-notice">{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}
    {showCustomerForm && canManage && <form className="order-customer-form" onSubmit={createCustomer}><h3>Create customer login</h3><p>Customers can only view orders assigned to their account.</p><input required minLength="3" maxLength="24" value={customerForm.username} onChange={e => setCustomerForm(v => ({...v, username:e.target.value}))} placeholder="Customer username"/><input required minLength="10" type="password" value={customerForm.password} onChange={e => setCustomerForm(v => ({...v,password:e.target.value}))} placeholder="Temporary password (10+ characters)"/><button className="primary" disabled={saving}>Create customer</button></form>}
    {loading ? <div className="crafting-empty">Loading orders…</div> : <div className="orders-layout">
      <div className="orders-list">{filtered.map(order => <button key={order.id} className={selected?.id === order.id ? 'order-row selected' : 'order-row'} onClick={() => {setSelected(order); if (!isCustomer) loadNotes(order);}}><span className="order-ticket">{order.ticket_number || 'TICKET'}</span><strong>{order.title}</strong><small>{isCustomer ? '' : (order.customer_username || customers.find(c => c.user_id === order.customer_user_id)?.username || 'Customer')} · {new Date(order.created_at).toLocaleDateString()}</small><span className={`order-status status-${order.status.toLowerCase().replaceAll(' ', '-')}`}>{order.status}</span></button>)}{!filtered.length && <div className="crafting-empty">No orders found.</div>}</div>
      <div className="order-detail">{selected && orders.some(o => o.id === selected.id) ? <><div className="order-detail-head"><div><div className="eyebrow">{selected.ticket_number || 'ORDER TICKET'}</div><h3>{selected.title}</h3><span className={`order-status status-${selected.status.toLowerCase().replaceAll(' ', '-')}`}>{selected.status}</span></div>{canManage && <button className="danger-icon" onClick={() => deleteOrder(selected)} title="Delete order"><Trash2 size={15}/></button>}</div>
        {!isCustomer && <p className="order-customer-line">Customer: <strong>{customers.find(c => c.user_id === selected.customer_user_id)?.username || selected.customer_username || 'Customer'}</strong></p>}
        {selected.description && <p className="order-description">{selected.description}</p>}
        <h4><Package size={14}/> Order items</h4><div className="order-items">{(selected.items || []).map((item,i) => <div key={i}><span>{item.name}</span><strong>× {item.quantity}</strong></div>)}</div>
        {canManage && <label className="order-status-control">Update ticket status<select value={selected.status} onChange={e => changeStatus(selected,e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>}
        {!isCustomer && <div className="order-notes"><h4><MessageSquare size={14}/> Internal staff notes</h4><p>Only staff with Orders management access can see these notes.</p>{(notes[selected.id] || []).map(n => <div className="order-note" key={n.id}>{n.note}<small>{new Date(n.created_at).toLocaleString()}</small></div>)}<textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Add an internal note…"/><button className="small-btn" onClick={addNote}>Add note</button></div>}
      </> : <div className="orders-placeholder"><Package size={28}/><p>Select an order ticket to view its details.</p></div>}</div>
    </div>}
    {editing && <div className="modal-backdrop"><div className="modal recipe-modal"><button className="modal-close" onClick={() => setEditing(false)}><X/></button><div className="eyebrow">NEW CUSTOMER TICKET</div><h2>Create order</h2><form onSubmit={saveOrder}><label>Order title<input required value={draft.title} onChange={e => setField('title',e.target.value)} placeholder="e.g. Vehicle upgrade request"/></label><label>Customer<select required value={draft.customer_user_id} onChange={e => setField('customer_user_id',e.target.value)}><option value="">Choose customer…</option>{customers.map(c => <option key={c.user_id} value={c.user_id}>{c.username}</option>)}</select></label><label>Order details<textarea rows="3" value={draft.description} onChange={e => setField('description',e.target.value)} placeholder="Details visible to the customer…"/></label><div className="ingredient-form-head">ORDER ITEMS <button type="button" className="small-btn" onClick={() => setField('items',[...draft.items,{name:'',quantity:1}])}><Plus size={12}/> Add item</button></div>{draft.items.map((item,i) => <div className="ingredient-form-row" key={i}><input value={item.name} onChange={e => setItem(i,'name',e.target.value)} placeholder="Item / service"/><input type="number" min="1" step="1" value={item.quantity} onChange={e => setItem(i,'quantity',e.target.value)} aria-label="Quantity"/><button type="button" className="danger-icon" onClick={() => setField('items',draft.items.filter((_,j)=>j!==i))}><Trash2 size={13}/></button></div>)}<div className="modal-actions"><button type="button" className="outline-btn" onClick={() => setEditing(false)}>Cancel</button><button className="primary" disabled={saving}><Save size={14}/> Create ticket</button></div></form></div></div>}
  </section>;
}
