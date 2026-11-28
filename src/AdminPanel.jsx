
import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import {
  X, Plus, Trash2, Save, Users, ShieldCheck,
  KeyRound, RefreshCw
} from 'lucide-react';

const panelStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 3000,
  background: 'rgba(0,0,0,.88)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 16
};

const cardStyle = {
  width: '100%',
  maxWidth: 850,
  maxHeight: '92vh',
  overflowY: 'auto',
  background: '#17120e',
  border: '1px solid #59391f',
  borderRadius: 9,
  padding: 22,
  color: '#f5eee8'
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 11,
  background: '#0d0b09',
  color: '#fff',
  border: '1px solid #49301e',
  borderRadius: 5,
  marginTop: 6
};

const buttonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '10px 13px',
  background: '#ff8a24',
  color: '#17100a',
  border: 0,
  borderRadius: 5,
  cursor: 'pointer',
  fontWeight: 700
};

const secondaryStyle = {
  ...buttonStyle,
  background: '#292019',
  color: '#f5eee8',
  border: '1px solid #59391f'
};

export default function AdminPanel({ onClose }) {
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [catalogueCategories, setCatalogueCategories] = useState([]);
  const [cataloguePermissions, setCataloguePermissions] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [permissions, setPermissions] = useState([]);
  const [moduleAccess, setModuleAccess] = useState({ can_view_map: false, can_view_crafting: false, can_add_recipes: false, can_edit_recipes: false, can_delete_recipes: false, can_view_hidden_recipes: false, can_view_orders: false, can_create_orders: false, can_edit_orders: false, can_delete_orders: false, can_manage_customers: false, can_view_own_orders: false, can_view_catalogue: false });
  const [accountMarker, setAccountMarker] = useState('knox');

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newAccountType, setNewAccountType] = useState('knox');
  const [passwordUser, setPasswordUser] = useState('');
  const [replacementPassword, setReplacementPassword] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const selectedUser = users.find(u => u.user_id === selectedId);

  const invoke = async (body) => {
    const { data, error } = await supabase.functions.invoke(
      'manage-users',
      { body }
    );

    if (error) {
      throw new Error(data?.error || error.message);
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  };

  const loadUsers = async () => {
    setLoading(true);
    setNotice('');

    try {
      const data = await invoke({ action: 'list' });

      setUsers(data.users || []);
      setCategories(data.categories || []);
      setCatalogueCategories(data.catalogueCategories || []);

      const currentId = selectedId;
      if (currentId && !(data.users || []).some(u => u.user_id === currentId)) {
        setSelectedId('');
      }
    } catch (error) {
      setNotice(error.message || 'Could not load users.');
    }

    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (!selectedUser) {
      setPermissions([]);
      setCataloguePermissions([]);
      return;
    }

    setAccountMarker(selectedUser.account_type || 'knox');
    setModuleAccess(selectedUser.moduleAccess || { can_view_map: false, can_view_crafting: false, can_add_recipes: false, can_edit_recipes: false, can_delete_recipes: false, can_view_hidden_recipes: false, can_view_orders: false, can_create_orders: false, can_edit_orders: false, can_delete_orders: false, can_manage_customers: false, can_view_own_orders: false });
    setCataloguePermissions(catalogueCategories.map(category => {
      const existing = selectedUser.cataloguePermissions?.find(p => p.categoryId === category.id);
      return { categoryId: category.id, categoryName: category.name, canView: existing?.canView === true, canAdd: existing?.canAdd === true, canEdit: existing?.canEdit === true, canDelete: existing?.canDelete === true };
    }));
    setPermissions(
      categories.map(category => {
        const existing = selectedUser.permissions?.find(
          p => p.categoryId === category.id
        );

        return {
          categoryId: category.id,
          categoryName: category.name,
          canView: existing?.canView === true,
          canAdd: existing?.canAdd === true,
          canEdit: existing?.canEdit === true,
          canDelete: existing?.canDelete === true
        };
      })
    );
  }, [selectedId, users, categories, catalogueCategories]);

  const changePermission = (categoryId, key, value) => {
    setPermissions(current =>
      current.map(p => {
        if (p.categoryId !== categoryId) return p;

        if (key === 'canView' && !value) {
          return {
            ...p,
            canView: false,
            canAdd: false,
            canEdit: false,
            canDelete: false
          };
        }

        return { ...p, [key]: value };
      })
    );
  };

  const createUser = async (e) => {
    e.preventDefault();

    const username = newUsername.trim().toLowerCase();

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      setNotice('Username must be 3–24 characters using letters, numbers or underscores.');
      return;
    }

    if (newPassword.length < 10) {
      setNotice('Password must be at least 10 characters.');
      return;
    }

    setSaving(true);
    setNotice('');

    try {
      await invoke({
        action: 'create',
        username,
        password: newPassword,
        accountType: newAccountType
      });

      setNewUsername('');
      setNewPassword('');
      setNewAccountType('knox');
      setNotice(`Account "${username}" created successfully.`);
      await loadUsers();
    } catch (error) {
      setNotice(error.message);
    }

    setSaving(false);
  };

  const savePermissions = async () => {
    if (!selectedUser || selectedUser.role === 'owner') return;

    setSaving(true);
    setNotice('');

    try {
      await invoke({
        action: 'updatePermissions',
        userId: selectedUser.user_id,
        permissions,
        cataloguePermissions,
        moduleAccess,
        accountType: accountMarker
      });

      await loadUsers();
      setNotice('Permissions updated successfully.');
    } catch (error) {
      setNotice(error.message);
    }

    setSaving(false);
  };

  const changePassword = async (e) => {
    e.preventDefault();

    if (!passwordUser || replacementPassword.length < 10) {
      setNotice('Choose a user and enter a password of at least 10 characters.');
      return;
    }

    setSaving(true);
    setNotice('');

    try {
      await invoke({
        action: 'updatePassword',
        userId: passwordUser,
        password: replacementPassword
      });

      setReplacementPassword('');
      setPasswordUser('');
      setNotice('Password updated successfully.');
    } catch (error) {
      setNotice(error.message);
    }

    setSaving(false);
  };

  const deleteUser = async (user) => {
    if (!user || user.role === 'owner') return;

    if (!window.confirm(
      `Permanently delete the account "${user.username}"?`
    )) return;

    setSaving(true);
    setNotice('');

    try {
      await invoke({
        action: 'delete',
        userId: user.user_id
      });

      if (selectedId === user.user_id) setSelectedId('');
      if (passwordUser === user.user_id) setPasswordUser('');

      setNotice(`Account "${user.username}" deleted.`);
      await loadUsers();
    } catch (error) {
      setNotice(error.message);
    }

    setSaving(false);
  };

  const checkStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    fontSize: 11,
    minWidth: 57
  };

  return (
    <div style={panelStyle} onMouseDown={e => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div style={cardStyle}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20
        }}>
          <div>
            <div style={{
              color: '#ffad66',
              fontSize: 10,
              letterSpacing: 2
            }}>
              THE KNOX MAP • OWNER CONTROLS
            </div>
            <h2 style={{ margin: '6px 0' }}>
              <Users size={21} style={{ verticalAlign: 'middle' }}/> Admin Panel
            </h2>
            <div style={{ color: '#a99a8d', fontSize: 12 }}>
              Manage accounts and category permissions
            </div>
          </div>

          <button
            onClick={onClose}
            style={secondaryStyle}
            title="Close admin panel"
          >
            <X size={17}/> Close
          </button>
        </div>

        {notice && (
          <div style={{
            background: '#302015',
            border: '1px solid #75451e',
            padding: 11,
            borderRadius: 5,
            marginBottom: 16,
            fontSize: 12
          }}>
            {notice}
            <button
              onClick={() => setNotice('')}
              style={{
                float: 'right',
                background: 'none',
                border: 0,
                color: '#fff',
                cursor: 'pointer'
              }}
            >
              <X size={14}/>
            </button>
          </div>
        )}

        <section style={{
          border: '1px solid #49301e',
          borderRadius: 7,
          padding: 15,
          marginBottom: 18
        }}>
          <h3 style={{ marginTop: 0 }}>
            <Plus size={16} style={{ verticalAlign: 'middle' }}/> Create account
          </h3>

          <form onSubmit={createUser}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))',
              gap: 12
            }}>
              <label style={{ fontSize: 12 }}>
                Username
                <input
                  style={inputStyle}
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  placeholder="e.g. player_one"
                  minLength={3}
                  maxLength={24}
                  required
                />
              </label>

              <label style={{ fontSize: 12 }}>
                Account marker
                <select style={inputStyle} value={newAccountType} onChange={e => setNewAccountType(e.target.value)}><option value="knox">Knox</option><option value="customer">Customer</option></select>
              </label>

              <label style={{ fontSize: 12 }}>
                Initial password
                <input
                  style={inputStyle}
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 10 characters"
                  minLength={10}
                  required
                />
              </label>
            </div>

            <button
              style={{ ...buttonStyle, marginTop: 12 }}
              disabled={saving}
            >
              <Plus size={15}/> Create user
            </button>
          </form>
        </section>

        <section style={{
          border: '1px solid #49301e',
          borderRadius: 7,
          padding: 15,
          marginBottom: 18
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}>
            <h3 style={{ marginTop: 0 }}>
              <Users size={16} style={{ verticalAlign: 'middle' }}/> User accounts
            </h3>

            <button
              style={secondaryStyle}
              onClick={loadUsers}
              disabled={loading || saving}
            >
              <RefreshCw size={14}/> Refresh
            </button>
          </div>

          {loading ? (
            <p>Loading accounts...</p>
          ) : users.length === 0 ? (
            <p>No user accounts found.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {users.map(user => (
                <div
                  key={user.user_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    flexWrap: 'wrap',
                    background: selectedId === user.user_id ? '#382517' : '#100d0a',
                    border: '1px solid #49301e',
                    padding: 10,
                    borderRadius: 5
                  }}
                >
                  <div>
                    <strong>{user.username} <span className={user.account_type === 'customer' ? 'account-type-badge customer-badge' : 'account-type-badge knox-badge'}>{user.account_type === 'customer' ? 'CUSTOMER' : 'KNOX'}</span></strong>
                    <div style={{
                      color: '#a99a8d',
                      fontSize: 10,
                      marginTop: 4
                    }}>
                      {user.role === 'owner' ? 'OWNER ACCOUNT' : 'MEMBER ACCOUNT'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      style={secondaryStyle}
                      onClick={() => setSelectedId(
                        selectedId === user.user_id ? '' : user.user_id
                      )}
                    >
                      <ShieldCheck size={14}/>
                      {selectedId === user.user_id ? 'Close permissions' : 'Permissions'}
                    </button>

                    {user.role !== 'owner' && (
                      <button
                        style={{
                          ...secondaryStyle,
                          color: '#ff8585'
                        }}
                        onClick={() => deleteUser(user)}
                        disabled={saving}
                        title="Delete account"
                      >
                        <Trash2 size={14}/>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {selectedUser && (
          <section style={{
            border: '1px solid #75451e',
            borderRadius: 7,
            padding: 15,
            marginBottom: 18
          }}>
            <h3 style={{ marginTop: 0 }}>
              <ShieldCheck size={17} style={{ verticalAlign: 'middle' }}/>
              {' '}Permissions for {selectedUser.username}
            </h3>

            <label style={{ display: 'block', margin: '10px 0', fontSize: 12 }}>Account marker (visual only)
              <select style={inputStyle} value={accountMarker} onChange={e => {
                const nextType = e.target.value;
                setAccountMarker(nextType);
                if (nextType === 'customer') {
                  setModuleAccess(current => ({ ...current, can_view_map: false, can_view_crafting: false, can_add_recipes: false, can_edit_recipes: false, can_delete_recipes: false, can_view_hidden_recipes: false }));
                }
              }} disabled={selectedUser.role === 'owner'}><option value="knox">Knox</option><option value="customer">Customer</option></select>
            </label>

            {selectedUser.role === 'owner' ? (
              <p>The owner automatically has full access to every category.</p>
            ) : (
              <>
                <div style={{ border: '1px solid #59391f', borderRadius: 6, padding: 12, margin: '12px 0 18px' }}>
                  <h4 style={{ margin: '0 0 12px', color: '#ffad66' }}>Website section access</h4>
                  {[
                    { title: 'Map panel', description: 'Access to the interactive map.', permissions: [['can_view_map', 'View Map']] },
                    { title: 'Crafting panel', description: 'Manage crafting recipes and hidden recipe visibility.', permissions: [['can_view_crafting', 'View Crafting'], ['can_add_recipes', 'Add recipes'], ['can_edit_recipes', 'Edit recipes'], ['can_delete_recipes', 'Delete recipes'], ['can_view_hidden_recipes', 'View hidden recipes']] },
                    { title: 'Orders panel', description: 'Manage the order desk and customer order portal.', permissions: [['can_view_orders', 'View Orders desk'], ['can_create_orders', 'Create orders'], ['can_edit_orders', 'Edit orders / update status'], ['can_delete_orders', 'Delete orders'], ['can_manage_customers', 'Create customer accounts'], ['can_view_own_orders', 'Customer portal: view assigned orders']] },
                    { title: 'Catalogue panel', description: 'Access to the catalogue and its price list.', permissions: [['can_view_catalogue', 'View Catalogue']] }
                  ].filter(group => accountMarker !== 'customer' || !['Map panel', 'Crafting panel'].includes(group.title)).map(group => (
                    <div key={group.title} style={{ border: '1px solid #49301e', borderRadius: 5, padding: 11, marginTop: 9, background: '#100d0a' }}>
                      <h5 style={{ margin: '0 0 3px', color: '#ffad66', fontSize: 13 }}>{group.title}</h5>
                      <div style={{ color: '#a99a8d', fontSize: 11, marginBottom: 8 }}>{group.description}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '3px 12px' }}>
                        {group.permissions.map(([key, label]) => (
                          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', fontSize: 12 }}>
                            <input type="checkbox" checked={moduleAccess[key] === true}
                              disabled={(['can_add_recipes','can_edit_recipes','can_delete_recipes','can_view_hidden_recipes'].includes(key)) && !moduleAccess.can_view_crafting || (['can_create_orders','can_edit_orders','can_delete_orders','can_manage_customers'].includes(key)) && !moduleAccess.can_view_orders}
                              onChange={e => setModuleAccess(current => {
                                const next = { ...current, [key]: e.target.checked };
                                if (key === 'can_view_orders' && !e.target.checked) { next.can_create_orders = false; next.can_edit_orders = false; next.can_delete_orders = false; next.can_manage_customers = false; }
                                if (key === 'can_view_crafting' && !e.target.checked) {
                                  next.can_add_recipes = false; next.can_edit_recipes = false; next.can_delete_recipes = false; next.can_view_hidden_recipes = false;
                                }
                                return next;
                              })}/>
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: '#b9a99a' }}>Map category permissions are managed separately below.</p>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 12,
                    textAlign: 'center'
                  }}>
                    <thead>
                      <tr style={{ color: '#ffad66' }}>
                        <th style={{ textAlign: 'left', padding: 9 }}>Category</th>
                        <th>View</th>
                        <th>Add</th>
                        <th>Edit</th>
                        <th>Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {permissions.map(p => (
                        <tr
                          key={p.categoryId}
                          style={{ borderTop: '1px solid #49301e' }}
                        >
                          <td style={{ textAlign: 'left', padding: 9 }}>
                            {p.categoryName}
                          </td>

                          {['canView', 'canAdd', 'canEdit', 'canDelete'].map(key => (
                            <td key={key} style={{ padding: 9 }}>
                              <input
                                type="checkbox"
                                checked={p[key]}
                                disabled={key !== 'canView' && !p.canView}
                                onChange={e => changePermission(
                                  p.categoryId,
                                  key,
                                  e.target.checked
                                )}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {accountMarker === 'customer' ? (
                  <div style={{ border: '1px solid #59391f', borderRadius: 6, padding: 12, margin: '16px 0' }}>
                    <h4 style={{ margin: '0 0 8px', color: '#ffad66' }}>Catalogue category access</h4>
                    <p style={{ fontSize: 12, color: '#b9a99a' }}>Choose which catalogue categories this customer can see. These settings do not affect Knox accounts.</p>
                    {cataloguePermissions.map(p => (
                      <label key={p.categoryId} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', fontSize: 12, borderTop: '1px solid #49301e' }}>
                        <input type="checkbox" checked={p.canView} onChange={e => setCataloguePermissions(current => current.map(x => x.categoryId === p.categoryId ? { ...x, canView: e.target.checked } : x))}/>
                        {p.categoryName}
                      </label>
                    ))}
                    {!cataloguePermissions.length && <p style={{ fontSize: 12 }}>No catalogue categories have been created yet.</p>}
                  </div>
                ) : (
                  <div style={{ border: '1px solid #59391f', borderRadius: 6, padding: 12, margin: '16px 0', fontSize: 12 }}>
                    <strong style={{ color: '#ffad66' }}>Knox catalogue access</strong>
                    <p>Knox accounts with Catalogue panel access automatically see every category. Set their item-management permissions below.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,1fr) repeat(3,55px)', gap: 6, alignItems: 'center', color: '#ffad66', padding: '8px 0' }}>
                      <strong>Category</strong><strong>Add</strong><strong>Edit</strong><strong>Delete</strong>
                    </div>
                    {cataloguePermissions.map(p => (
                      <div key={p.categoryId} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,1fr) repeat(3,55px)', gap: 6, alignItems: 'center', borderTop: '1px solid #49301e', padding: '8px 0' }}>
                        <span>{p.categoryName}</span>
                        {['canAdd','canEdit','canDelete'].map(key => <input key={key} aria-label={key + ' ' + p.categoryName} type="checkbox" checked={p[key]} onChange={e => setCataloguePermissions(current => current.map(x => x.categoryId === p.categoryId ? { ...x, [key]: e.target.checked } : x))}/>)}
                      </div>
                    ))}
                    {!cataloguePermissions.length && <p>No catalogue categories have been created yet.</p>}
                  </div>
                )}

                <button
                  style={{ ...buttonStyle, marginTop: 15 }}
                  onClick={savePermissions}
                  disabled={saving}
                >
                  <Save size={15}/> Save permissions
                </button>
              </>
            )}
          </section>
        )}

        <section style={{
          border: '1px solid #49301e',
          borderRadius: 7,
          padding: 15
        }}>
          <h3 style={{ marginTop: 0 }}>
            <KeyRound size={16} style={{ verticalAlign: 'middle' }}/> Change user password
          </h3>

          <form onSubmit={changePassword}>
            <label style={{ fontSize: 12 }}>
              Select account
              <select
                style={inputStyle}
                value={passwordUser}
                onChange={e => setPasswordUser(e.target.value)}
                required
              >
                <option value="">Choose a user...</option>
                {users.filter(u => u.role !== 'owner').map(user => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.username}
                  </option>
                ))}
              </select>
            </label>

            <label style={{
              display: 'block',
              fontSize: 12,
              marginTop: 12
            }}>
              New password
              <input
                style={inputStyle}
                type="password"
                value={replacementPassword}
                onChange={e => setReplacementPassword(e.target.value)}
                placeholder="At least 10 characters"
                minLength={10}
                required
              />
            </label>

            <button
              style={{ ...buttonStyle, marginTop: 12 }}
              disabled={saving || !passwordUser}
            >
              <KeyRound size={15}/> Update password
            </button>
          </form>
        </section>

        <div style={{
          marginTop: 18,
          color: '#8e8074',
          fontSize: 10,
          textAlign: 'center'
        }}>
          OWNER ACCESS ONLY • ACCOUNT MANAGEMENT
        </div>
      </div>
    </div>
  );
}
