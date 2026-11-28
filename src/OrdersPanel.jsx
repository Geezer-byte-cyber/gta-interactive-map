import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { Plus, Search, X, Save, Trash2, MessageSquare, Package, UserPlus, RefreshCw } from 'lucide-react';

const STATUSES = ['New', 'In Progress', 'Waiting', 'Completed', 'Delivered', 'Cancelled'];
const PAYMENT_STATUSES = [{ value: 'awaiting_payment', label: 'Awaiting payment' }, { value: 'paid', label: 'Paid' }];
const money = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value) || 0);
const emptyOrder = () => ({ title: '', description: '', customer_user_id: '', amount_due: '0.00', items: [{ name: '', quantity: 1 }] });

export default function OrdersPanel({ isCustomer = false, canManage = false, canCreate = false, canEdit = false, canDelete = false, canManageCustomers = false, username = '', previewUserId = null, previewReadOnly = false }) {
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
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [customerForm, setCustomerForm] = useState({ username: '', password: '', enablePortal: false });
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [catalogueCategories, setCatalogueCategories] = useState([]);
  const [editingCustomerAccess, setEditingCustomerAccess] = useState(null);
  const [customerCatalogueEnabled, setCustomerCatalogueEnabled] = useState(false);
  const [customerCategoryIds, setCustomerCategoryIds] = useState([]);

  const invoke = async body => {
    const { data, error } = await supabase.functions.invoke('manage-users', { body });
    if (error || data?.error) throw new Error(data?.error || error.message);
    return data;
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('orders').select('*').order('updated_at', { ascending: false });
    if (error) setNotice(error.message);
    else setOrders(previewUserId ? (data || []).filter(order => order.customer_user_id === previewUserId) : (data || []));
    if (!isCustomer) {
      try {
        const result = await invoke({ action: 'listOrderCustomers' });
        setCustomers(result.customers || []); setCatalogueCategories(result.catalogueCategories || []);
      } catch (e) { setNotice(e.message); }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [isCustomer, canManage]);

  const customerFor = userId => customers.find(c => c.user_id === userId);

  const filtered = useMemo(() => orders.filter(o =>
    (statusFilter === 'All' || o.status === statusFilter) &&
    `${o.ticket_number || ''} ${o.title} ${o.description || ''} ${o.customer_username || ''}`.toLowerCase().includes(search.toLowerCase())
  ), [orders, statusFilter, search]);

  const openNew = () => { setDraft(emptyOrder()); setEditingOrderId(null); setEditing(true); };
  const openEdit = order => { setDraft({ title: order.title || '', description: order.description || '', customer_user_id: order.customer_user_id || '', amount_due: String(order.amount_due ?? 0), items: Array.isArray(order.items) && order.items.length ? order.items : [{ name: '', quantity: 1 }] }); setEditingOrderId(order.id); setEditing(true); };
  const setField = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const setItem = (index, key, value) => setDraft(current => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, [key]: value } : item) }));
  const saveOrder = async e => {
    e.preventDefault();
    const items = draft.items.filter(i => i.name.trim()).map(i => ({ name: i.name.trim(), quantity: Math.max(1, Number(i.quantity) || 1) }));
    if (!draft.title.trim() || !draft.customer_user_id || !items.length) { setNotice('Add an order title, customer and at least one item.'); return; }
    setSaving(true);
    const amountDue = Number(draft.amount_due);
    if (!Number.isFinite(amountDue) || amountDue < 0) { setNotice('Enter a valid amount to be paid.'); setSaving(false); return; }
    const payload = { title: draft.title.trim(), description: draft.description.trim(), customer_user_id: draft.customer_user_id, items, amount_due: Math.round(amountDue * 100) / 100 };
    const { error } = editingOrderId
      ? await supabase.from('orders').update(payload).eq('id', editingOrderId)
      : await supabase.from('orders').insert({ ...payload, status: 'New', opened_by: username.toLowerCase() === 'owner' ? 'James' : (username || 'Unknown'), created_by: (await supabase.auth.getUser()).data.user?.id });
    setSaving(false);
    if (error) { setNotice(error.message); return; }
    if (editingOrderId) setSelected(current => current?.id === editingOrderId ? { ...current, ...payload } : current);
    setEditing(false); setEditingOrderId(null); setNotice(editingOrderId ? 'Order updated.' : 'Order created.'); await load();
  };

  const changePaymentStatus = async (order, payment_status) => {
    const { error } = await supabase.from('orders').update({ payment_status }).eq('id', order.id);
    if (error) setNotice(error.message); else { setSelected({ ...order, payment_status }); setNotice('Payment status updated.'); await load(); }
  };

  const changeStatus = async (order, status) => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', order.id);
    if (error) setNotice(error.message); else { setSelected({ ...order, status }); setNotice('Order status updated.'); await load(); }
  };

  const deleteOrder = async order => {
    if (!window.confirm(`Delete order ${order.order_number || ''}?`)) return;
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

  const resetCustomerPassword = async customer => {
    const password = window.prompt(`Set a new password for ${customer.username} (minimum 10 characters):`);
    if (password === null) return;
    if (password.length < 10) { setNotice('Password must be at least 10 characters.'); return; }
    setSaving(true);
    try {
      await invoke({ action: 'updateCustomerPassword', userId: customer.user_id, password });
      setNotice(`Password updated for ${customer.username}.`);
    } catch (error) { setNotice(error.message); }
    setSaving(false);
  };

  const createCustomer = async e => {
    e.preventDefault(); setSaving(true);
    try {
      await invoke({ action: 'createCustomer', username: customerForm.username, password: customerForm.password, enablePortal: customerForm.enablePortal });
      setCustomerForm({ username: '', password: '', enablePortal: false }); setShowCustomerForm(false); setNotice('Customer account created.'); await load();
    } catch (error) { setNotice(error.message); }
    setSaving(false);
  };

  const openCustomerCatalogue = customer => {
    setEditingCustomerAccess(customer);
    setCustomerCatalogueEnabled(customer.canViewCatalogue === true);
    setCustomerCategoryIds((customer.catalogueCategories || []).filter(c => c.canView).map(c => c.id));
  };

  const saveCustomerCatalogue = async () => {
    if (!editingCustomerAccess) return;
    setSaving(true);
    try {
      await invoke({ action: 'updateCustomerCatalogueAccess', userId: editingCustomerAccess.user_id, canViewCatalogue: customerCatalogueEnabled, categoryIds: customerCatalogueEnabled ? customerCategoryIds : [] });
      setNotice(`Catalogue access updated for ${editingCustomerAccess.username}.`);
      setEditingCustomerAccess(null);
      await load();
    } catch (error) { setNotice(error.message); }
    setSaving(false);
  };

  return <section className="orders-page">
    <div className="orders-heading">
      <div><div className="eyebrow">THE KNOX MAP · TICKET DESK</div><h2>{isCustomer ? 'My Orders' : 'Orders & Tickets'}</h2><p>{isCustomer ? 'View the progress of your orders.' : 'Create orders, track progress and keep customer requests organised.'}</p></div>
      {!isCustomer && (canCreate || canManageCustomers) && <div className="orders-heading-actions">{canManageCustomers && <button className="outline-btn" onClick={() => setShowCustomerForm(v => !v)}><UserPlus size={15}/> Customer account</button>}{canCreate && <button className="primary" onClick={openNew}><Plus size={15}/> New order</button>}</div>}
    </div>
    <div className="orders-toolbar"><label className="search"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets..."/></label><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option>All</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select><button className="small-btn" onClick={load}><RefreshCw size={13}/> Refresh</button></div>
    {notice && <div className="crafting-notice">{notice}<button onClick={() => setNotice('')}><X size={14}/></button></div>}
    {showCustomerForm && canManageCustomers && <form className="order-customer-form" onSubmit={createCustomer}><h3>Create customer login</h3><p>Customers can only view orders assigned to their account.</p><input required minLength="3" maxLength="24" value={customerForm.username} onChange={e => setCustomerForm(v => ({...v, username:e.target.value}))} placeholder="Customer username"/><input required minLength="10" type="password" value={customerForm.password} onChange={e => setCustomerForm(v => ({...v,password:e.target.value}))} placeholder="Temporary password (10+ characters)"/><label className="customer-portal-toggle"><input type="checkbox" checked={customerForm.enablePortal} onChange={e => setCustomerForm(v => ({...v,enablePortal:e.target.checked}))}/> Allow this account to view its assigned orders (optional)</label><button className="primary" disabled={saving}>Create customer</button></form>}
    {!isCustomer && canManageCustomers && customers.length > 0 && <div className="order-customer-list"><h3>Customer accounts</h3>{customers.map(customer => <div className="order-customer-account" key={customer.user_id}><strong>{customer.username} <span className="account-type-badge customer-badge">CUSTOMER</span></strong><div style={{display:'flex',gap:7,flexWrap:'wrap'}}><button className="small-btn" disabled={saving} onClick={() => openCustomerCatalogue(customer)}>Catalogue access</button>{customer.canViewOwnOrders && <button className="small-btn" disabled={saving} onClick={() => resetCustomerPassword(customer)}>Reset password</button>}</div></div>)}</div>}
    {editingCustomerAccess && canManageCustomers && <div className="order-customer-form"><h3>Catalogue access · {editingCustomerAccess.username}</h3><p>Choose whether this customer can open the Catalogue and which categories they can see.</p><label className="customer-portal-toggle"><input type="checkbox" checked={customerCatalogueEnabled} onChange={e => setCustomerCatalogueEnabled(e.target.checked)}/> Allow access to Catalogue panel</label>{customerCatalogueEnabled && <div style={{margin:'12px 0',display:'grid',gap:8}}>{catalogueCategories.map(category=><label key={category.id} className="customer-portal-toggle"><input type="checkbox" checked={customerCategoryIds.includes(category.id)} onChange={e => setCustomerCategoryIds(current => e.target.checked ? [...current,category.id] : current.filter(id => id!==category.id))}/>{category.name}</label>)}</div>}<div style={{display:'flex',gap:8}}><button className="primary" disabled={saving} onClick={saveCustomerCatalogue}>Save catalogue access</button><button className="small-btn" disabled={saving} onClick={() => setEditingCustomerAccess(null)}>Cancel</button></div></div>}
    {loading ? <div className="crafting-empty">Loading orders…</div> : <div className="orders-layout">
      <div className="orders-list">{filtered.map(order => <button key={order.id} className={selected?.id === order.id ? 'order-row selected' : 'order-row'} onClick={() => {setSelected(order); if (!isCustomer && !previewReadOnly) loadNotes(order);}}><span className="order-ticket">{(order.order_number ? `KX-${String(order.order_number).padStart(6, '0')}` : 'TICKET')}</span><strong>{order.title}</strong><small>{!isCustomer && <>{customerFor(order.customer_user_id)?.username || 'Customer'} <span className={customerFor(order.customer_user_id)?.account_type === 'customer' ? 'account-type-badge customer-badge' : 'account-type-badge knox-badge'}>{customerFor(order.customer_user_id)?.account_type === 'customer' ? 'CUSTOMER' : 'KNOX'}</span> · </>}Opened by {order.opened_by || 'Unknown'} · {new Date(order.created_at).toLocaleDateString()}</small><span className={`order-status status-${order.status.toLowerCase().replaceAll(' ', '-')}`}>{order.status}</span><span className="order-ticket-money">{money(order.amount_due)}</span><span className={`payment-status payment-${order.payment_status || 'awaiting_payment'}`}>{order.payment_status === 'paid' ? 'PAID' : 'AWAITING PAYMENT'}</span></button>)}{!filtered.length && <div className="crafting-empty">No orders found.</div>}</div>
      <div className="order-detail">{selected && orders.some(o => o.id === selected.id) ? <><div className="order-detail-head"><div><div className="eyebrow">{(selected.order_number ? `KX-${String(selected.order_number).padStart(6, '0')}` : 'ORDER TICKET')}</div><h3>{selected.title}</h3><span className={`order-status status-${selected.status.toLowerCase().replaceAll(' ', '-')}`}>{selected.status}</span><div className="order-financial-summary"><strong>{money(selected.amount_due)}</strong><span className={`payment-status payment-${selected.payment_status || 'awaiting_payment'}`}>{selected.payment_status === 'paid' ? 'PAID' : 'AWAITING PAYMENT'}</span></div><p className="order-opened-by">Opened by <strong>{selected.opened_by || 'Unknown'}</strong></p></div><div className="order-head-actions">{canEdit && <button className="small-btn" onClick={() => openEdit(selected)}>Edit order</button>}{canDelete && <button className="danger-icon" onClick={() => deleteOrder(selected)} title="Delete order"><Trash2 size={15}/></button>}</div></div>
        {!isCustomer && <p className="order-customer-line">Customer: <strong>{customerFor(selected.customer_user_id)?.username || 'Customer'} <span className={customerFor(selected.customer_user_id)?.account_type === 'customer' ? 'account-type-badge customer-badge' : 'account-type-badge knox-badge'}>{customerFor(selected.customer_user_id)?.account_type === 'customer' ? 'CUSTOMER' : 'KNOX'}</span></strong></p>}
        {selected.description && <p className="order-description">{selected.description}</p>}
        <h4><Package size={14}/> Order items</h4><div className="order-items">{(selected.items || []).map((item,i) => <div key={i}><span>{item.name}</span><strong>× {item.quantity}</strong></div>)}</div>
        {canEdit && <><label className="order-status-control">Update ticket status<select value={selected.status} onChange={e => changeStatus(selected,e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label><label className="order-status-control">Payment status<select value={selected.payment_status || 'awaiting_payment'} onChange={e => changePaymentStatus(selected,e.target.value)}>{PAYMENT_STATUSES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label></>}
        {!isCustomer && !previewReadOnly && <div className="order-notes"><h4><MessageSquare size={14}/> Internal staff notes</h4><p>Only staff with Orders management access can see these notes.</p>{(notes[selected.id] || []).map(n => <div className="order-note" key={n.id}>{n.note}<small>{new Date(n.created_at).toLocaleString()}</small></div>)}{canEdit && <><textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Add an internal note…"/><button className="small-btn" onClick={addNote}>Add note</button></>}</div>}
      </> : <div className="orders-placeholder"><Package size={28}/><p>Select an order ticket to view its details.</p></div>}</div>
    </div>}
    {editing && <div className="modal-backdrop"><div className="modal recipe-modal"><button className="modal-close" onClick={() => { setEditing(false); setEditingOrderId(null); }}><X/></button><div className="eyebrow">CUSTOMER TICKET</div><h2>{editingOrderId ? 'Edit order' : 'Create order'}</h2><form onSubmit={saveOrder}><label>Order title<input required value={draft.title} onChange={e => setField('title',e.target.value)} placeholder="e.g. Vehicle upgrade request"/></label><label>Customer<select required value={draft.customer_user_id} onChange={e => setField('customer_user_id',e.target.value)}><option value="">Choose customer…</option>{customers.map(c => <option key={c.user_id} value={c.user_id}>{c.username}</option>)}</select></label><label>Order details<textarea rows="3" value={draft.description} onChange={e => setField('description',e.target.value)} placeholder="Details visible to the customer…"/></label><label>Amount to be paid (£)<input required type="number" min="0" step="0.01" value={draft.amount_due} onChange={e => setField('amount_due',e.target.value)} placeholder="0.00"/></label><div className="ingredient-form-head">ORDER ITEMS <button type="button" className="small-btn" onClick={() => setField('items',[...draft.items,{name:'',quantity:1}])}><Plus size={12}/> Add item</button></div>{draft.items.map((item,i) => <div className="ingredient-form-row" key={i}><input value={item.name} onChange={e => setItem(i,'name',e.target.value)} placeholder="Item / service"/><input type="number" min="1" step="1" value={item.quantity} onChange={e => setItem(i,'quantity',e.target.value)} aria-label="Quantity"/><button type="button" className="danger-icon" onClick={() => setField('items',draft.items.filter((_,j)=>j!==i))}><Trash2 size={13}/></button></div>)}<div className="modal-actions"><button type="button" className="outline-btn" onClick={() => setEditing(false)}>Cancel</button><button className="primary" disabled={saving}><Save size={14}/> {editingOrderId ? 'Save changes' : 'Create ticket'}</button></div></form></div></div>}
  </section>;
}
