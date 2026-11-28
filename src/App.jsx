
import React, { useEffect, useMemo, useState } from 'react';
import {
  MapContainer, ImageOverlay, Marker, Polygon, Polyline, Popup, useMapEvents
} from 'react-leaflet';
import L from 'leaflet';
import { supabase, configured } from './supabase';
import AdminPanel from './AdminPanel';
import {
  Search, Plus, LogOut, X, Save, Trash2,
  Image as ImageIcon, MapPin, SlidersHorizontal,
  Crosshair, Upload, Pencil, Check, LockKeyhole, Users
} from 'lucide-react';

const MAP_WIDTH = 5944;
const MAP_HEIGHT = 8075;

const bounds = [[0, 0], [MAP_HEIGHT, MAP_WIDTH]];

const blank = {
  title: '',
  description: '',
  category: 'Other',
  image_url: '',
  x: MAP_WIDTH / 2,
  y: MAP_HEIGHT / 2
};

const iconFor = (color) => L.divIcon({
  className: 'pin-wrap',
  html: `<span class="map-pin" style="--pin:${color}"><i></i></span>`,
  iconSize: [26, 34],
  iconAnchor: [13, 31],
  popupAnchor: [0, -29]
});

const previewIcon = L.divIcon({
  className: 'pin-wrap',
  html: '<span class="map-pin" style="--pin:#ff8a24"><i></i></span>',
  iconSize: [26, 34],
  iconAnchor: [13, 31]
});

function ClickCapture({ active, onPick }) {
  useMapEvents({
    click(e) {
      if (active) onPick({ x: e.latlng.lng, y: e.latlng.lat });
    }
  });
  return null;
}

function MapImage({ src }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (src) map.fitBounds(bounds);
  }, [src, map]);
  return src ? <ImageOverlay url={src} bounds={bounds} /> : null;
}

function App() {
  const [pins, setPins] = useState([]);
  const [categories, setCategories] = useState([]);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [authLoading, setAuthLoading] = useState(true);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(blank);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const [newCategory, setNewCategory] = useState('');
  const [newColor, setNewColor] = useState('#ff8a24');
  const [categoryManager, setCategoryManager] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [editingColor, setEditingColor] = useState('#ff8a24');

  // Admin Panel is closed by default.
  const [adminOpen, setAdminOpen] = useState(false);

  const [mapUrl] = useState('/los-santos-map.jpg');

  const isOwner = profile?.role === 'owner';
  const isSignedIn = !!session && !!profile;

  const permissionFor = (categoryName) =>
    permissions.find(p => p.category_name === categoryName);

  const canView = (categoryName) =>
    isOwner || !!permissionFor(categoryName);

  const canAdd = (categoryName) =>
    isOwner || permissionFor(categoryName)?.can_add === true;

  const canEdit = (categoryName) =>
    isOwner || permissionFor(categoryName)?.can_edit === true;

  const canDelete = (categoryName) =>
    isOwner || permissionFor(categoryName)?.can_delete === true;

  const visibleCategories = useMemo(
    () => categories.filter(c =>
      profile?.role === 'owner' ||
      permissions.some(p => p.category_id === c.id)
    ),
    [categories, permissions, profile]
  );

  const visiblePins = useMemo(
    () => pins.filter(p => canView(p.category)),
    [pins, permissions, profile]
  );

  const filtered = useMemo(() =>
    visiblePins.filter(p =>
      (category === 'All' || p.category === category) &&
      `${p.title} ${p.description || ''} ${p.category}`
        .toLowerCase().includes(query.toLowerCase())
    ),
    [visiblePins, category, query]
  );

  useEffect(() => {
    if (!configured) {
      setNotice('Supabase is not configured. Please check your website settings.');
      setAuthLoading(false);
      return;
    }

    let alive = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setNotice(error.message);
      setSession(data?.session || null);
      setAuthLoading(false);
    });

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession);
        setProfile(null);
        setPermissions([]);
        setAdminOpen(false);
      });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let alive = true;

    const loadAccess = async () => {
      if (!session?.user?.id) {
        setProfile(null);
        setPermissions([]);
        setPins([]);
        setCategories([]);
        setAdminOpen(false);
        return;
      }

      const [{ data: profileData, error: profileError },
        { data: permissionData, error: permissionError }] =
        await Promise.all([
          supabase.from('user_profiles')
            .select('user_id, username, role')
            .eq('user_id', session.user.id)
            .maybeSingle(),
          supabase.from('user_category_permissions')
            .select('category_id, can_add, can_edit, can_delete')
            .eq('user_id', session.user.id)
        ]);

      if (!alive) return;

      if (profileError || !profileData) {
        setNotice(profileError?.message || 'Your user profile could not be found.');
        await supabase.auth.signOut();
        return;
      }

      if (permissionError) {
        setNotice(permissionError.message);
        return;
      }

      const { data: categoryData, error: categoryError } =
        await supabase.from('map_categories')
          .select('*')
          .order('name');

      if (!alive) return;

      if (categoryError) {
        setNotice(categoryError.message);
        return;
      }

      const permissionRows = (permissionData || []).map(p => ({
        ...p,
        category_name: categoryData?.find(c => c.id === p.category_id)?.name
      }));

      setProfile(profileData);
      setPermissions(permissionRows);
      setCategories(categoryData || []);

      // Never leave the Admin Panel open for a non-owner.
      if (profileData.role !== 'owner') {
        setAdminOpen(false);
      }

      const { data: pinData, error: pinError } = await supabase
        .from('pins')
        .select('*')
        .order('created_at', { ascending: false });

      if (!alive) return;

      if (pinError) setNotice(pinError.message);
      else setPins(pinData || []);
    };

    loadAccess();

    return () => {
      alive = false;
    };
  }, [session]);

  useEffect(() => {
    if (!isSignedIn) return;

    const pinsChannel = supabase
      .channel('knox-pins')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pins'
      }, async () => {
        const { data, error } = await supabase
          .from('pins')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error) setPins(data || []);
      })
      .subscribe();

    const categoriesChannel = supabase
      .channel('knox-categories')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'map_categories'
      }, async () => {
        const { data, error } = await supabase
          .from('map_categories')
          .select('*')
          .order('name');
        if (!error) setCategories(data || []);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(pinsChannel);
      supabase.removeChannel(categoriesChannel);
    };
  }, [isSignedIn]);

  const loadPins = async () => {
    const { data, error } = await supabase
      .from('pins')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) setNotice(error.message);
    else setPins(data || []);
  };

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from('map_categories')
      .select('*')
      .order('name');

    if (error) setNotice(error.message);
    else setCategories(data || []);
  };

  const categoryColor = (name) =>
    categories.find(c => c.name === name)?.color || '#ff8a24';

  const setField = (key, value) =>
    setDraft(d => ({ ...d, [key]: value }));

  const pickLocation = (position) => {
    setSelectedPosition(position);
    setNotice(
      `Location selected: X ${Math.round(position.x)}, Y ${Math.round(position.y)}`
    );
  };

  const startNew = () => {
    const firstAllowed = visibleCategories.find(c => canAdd(c.name));

    if (!firstAllowed) {
      setNotice('You do not have permission to add pins in any category.');
      return;
    }

    if (!selectedPosition) {
      setNotice('Click somewhere on the map first to choose a pin location.');
      return;
    }

    setDraft({
      ...blank,
      x: selectedPosition.x,
      y: selectedPosition.y,
      category: firstAllowed.name
    });

    setEditing('new');
  };

  const editPin = (pin) => {
    if (!canEdit(pin.category) && !canDelete(pin.category)) {
      setNotice('You do not have permission to edit this pin.');
      return;
    }

    setDraft({ ...pin });
    setEditing(pin.id);
  };

  const closeEditor = () => setEditing(null);

  const login = async (e) => {
    e.preventDefault();

    if (!configured || loginLoading) return;

    const cleanUsername = username.trim().toLowerCase();

    if (!cleanUsername || !password) {
      setNotice('Enter your username and password.');
      return;
    }

    setLoginLoading(true);
    setNotice('');

    const { data, error } = await supabase.functions.invoke(
      'manage-users',
      {
        body: {
          action: 'login',
          username: cleanUsername,
          password
        }
      }
    );

    if (error || !data?.session) {
      setNotice(data?.error || error?.message || 'Login failed. Check your username and password.');
      setLoginLoading(false);
      return;
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    });

    setLoginLoading(false);

    if (sessionError) {
      setNotice(sessionError.message);
      return;
    }

    setUsername('');
    setPassword('');
    setNotice('Welcome to The Knox Map.');
  };

  const logout = async () => {
    setAdminOpen(false);
    await supabase.auth.signOut();
    setProfile(null);
    setPermissions([]);
    setPins([]);
    setCategories([]);
    setSelectedPosition(null);
    setEditing(null);
    setNotice('Signed out.');
  };

  const save = async (e) => {
    e.preventDefault();

    if (!configured || !isSignedIn) return;

    if (!draft.title.trim()) {
      setNotice('Please enter a pin title.');
      return;
    }

    if (!categories.some(c => c.name === draft.category)) {
      setNotice('Please select a valid category.');
      return;
    }

    if (editing === 'new' && !canAdd(draft.category)) {
      setNotice('You do not have permission to add pins in this category.');
      return;
    }

    if (editing !== 'new') {
      const original = pins.find(p => p.id === editing);

      if (!original || !canEdit(original.category) || !canEdit(draft.category)) {
        setNotice('You do not have permission to edit this pin or move it to that category.');
        return;
      }
    }

    setSaving(true);

    const payload = {
      title: draft.title.trim(),
      description: draft.description || '',
      category: draft.category,
      image_url: draft.image_url || null,
      x: draft.x,
      y: draft.y
    };

    const result = editing === 'new'
      ? await supabase.from('pins').insert(payload)
      : await supabase.from('pins').update(payload).eq('id', editing);

    setSaving(false);

    if (result.error) {
      setNotice(result.error.message);
      return;
    }

    setSelectedPosition(null);
    closeEditor();
    setNotice('Pin saved successfully.');
    await loadPins();
  };

  const movePin = async (pin, position) => {
    if (!canEdit(pin.category)) {
      setNotice('You do not have permission to move this pin.');
      return;
    }

    const { error } = await supabase
      .from('pins')
      .update({ x: position.lng, y: position.lat })
      .eq('id', pin.id);

    if (error) {
      setNotice(`Could not move pin: ${error.message}`);
      await loadPins();
      return;
    }

    setPins(current =>
      current.map(p => p.id === pin.id
        ? { ...p, x: position.lng, y: position.lat }
        : p
      )
    );

    setNotice(`Moved "${pin.title}" and saved its new location.`);
  };

  const remove = async () => {
    const pin = pins.find(p => p.id === editing);

    if (!pin || !canDelete(pin.category)) {
      setNotice('You do not have permission to delete this pin.');
      return;
    }

    if (!window.confirm('Delete this pin?')) return;

    const { error } = await supabase
      .from('pins')
      .delete()
      .eq('id', editing);

    if (error) {
      setNotice(error.message);
      return;
    }

    setPins(p => p.filter(x => x.id !== editing));
    closeEditor();
    setNotice('Pin deleted.');
  };

  const upload = async (file) => {
    if (!file || !configured || !isOwner) {
      setNotice('Image uploads are currently restricted to the owner account.');
      return;
    }

    const ext = file.name.split('.').pop().toLowerCase();
    const path = `${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from('pin-images')
      .upload(path, file, { upsert: false });

    if (error) {
      setNotice(error.message);
      return;
    }

    const { data } = supabase.storage
      .from('pin-images')
      .getPublicUrl(path);

    setField('image_url', data.publicUrl);
    setNotice('Image uploaded.');
  };

  const addCategory = async (e) => {
    e.preventDefault();
    if (!isOwner) return;

    const name = newCategory.trim();
    if (!name) return;

    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      setNotice('That category already exists.');
      return;
    }

    const { error } = await supabase
      .from('map_categories')
      .insert({ name, color: newColor });

    if (error) {
      setNotice(error.message);
      return;
    }

    setNewCategory('');
    setNotice(`Category "${name}" created.`);
    await loadCategories();
  };

  const beginCategoryEdit = (c) => {
    setEditingCategory(c.id);
    setCategoryName(c.name);
    setEditingColor(c.color);
  };

  const saveCategoryEdit = async (id, oldName) => {
    if (!isOwner) return;

    const name = categoryName.trim();

    if (!name) {
      setNotice('Category name cannot be empty.');
      return;
    }

    if (categories.some(c =>
      c.id !== id && c.name.toLowerCase() === name.toLowerCase()
    )) {
      setNotice('A category with that name already exists.');
      return;
    }

    const { error: pinError } = await supabase
      .from('pins')
      .update({ category: name })
      .eq('category', oldName);

    if (pinError) {
      setNotice(pinError.message);
      return;
    }

    const { error } = await supabase
      .from('map_categories')
      .update({ name, color: editingColor })
      .eq('id', id);

    if (error) {
      setNotice(error.message);
      return;
    }

    if (category === oldName) setCategory(name);
    if (draft.category === oldName) setField('category', name);

    setEditingCategory(null);
    setNotice('Category updated.');
    await loadCategories();
    await loadPins();
  };

  const deleteCategory = async (c) => {
    if (!isOwner) return;

    const used = pins.some(p => p.category === c.name);

    if (used) {
      setNotice('Move or delete the pins in this category before deleting it.');
      return;
    }

    if (!window.confirm(`Delete category "${c.name}"?`)) return;

    const { error } = await supabase
      .from('map_categories')
      .delete()
      .eq('id', c.id);

    if (error) {
      setNotice(error.message);
      return;
    }

    if (category === c.name) setCategory('All');
    setNotice('Category deleted.');
    await loadCategories();
  };

  if (!configured) {
    return (
      <div className="app-shell">
        <div className="auth-modal modal" style={{ margin: '12vh auto', maxWidth: 440 }}>
          <div className="brand-mark">K</div>
          <div className="eyebrow">GRAND THEFT AUTO V • INTERACTIVE ATLAS</div>
          <h1>THE KNOX MAP</h1>
          <p>Supabase is not configured. Please check the website environment settings.</p>
        </div>
      </div>
    );
  }

  if (authLoading || (session && !profile)) {
    return (
      <div className="app-shell">
        <div className="auth-modal modal" style={{ margin: '12vh auto', maxWidth: 440, textAlign: 'center' }}>
          <div className="brand-mark" style={{ margin: '0 auto 15px' }}>K</div>
          <div className="eyebrow">GRAND THEFT AUTO V • INTERACTIVE ATLAS</div>
          <h1>THE KNOX MAP</h1>
          <p>Preparing your map access...</p>
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <div className="app-shell">
        <div className="auth-modal modal" style={{
          margin: '10vh auto',
          maxWidth: 440,
          padding: 30,
          textAlign: 'left'
        }}>
          <div className="brand" style={{ marginBottom: 28 }}>
            <div className="brand-mark">K</div>
            <div>
              <div className="eyebrow">GRAND THEFT AUTO V • INTERACTIVE ATLAS</div>
              <h1>THE KNOX MAP</h1>
            </div>
          </div>

          <div className="eyebrow">RESTRICTED COMMUNITY ACCESS</div>
          <h2 style={{ marginTop: 8 }}>Welcome back.</h2>
          <p>Sign in with the username and password provided by the map owner.</p>

          <form onSubmit={login}>
            <label>
              Username
              <input
                autoComplete="username"
                required
                maxLength={24}
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </label>

            <button className="primary wide" disabled={loginLoading}>
              <LockKeyhole size={16}/>
              {loginLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="sidebar-foot" style={{ marginTop: 25 }}>
            LOS SANTOS • BLAINE COUNTY<br/>
            <span>Unofficial fan-made community project</span>
          </div>

          {notice && (
            <div className="toast" role="status" style={{ position: 'static', marginTop: 15 }}>
              {notice}
              <button onClick={() => setNotice('')}><X size={14}/></button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">K</div>
          <div>
            <div className="eyebrow">GRAND THEFT AUTO V • INTERACTIVE ATLAS</div>
            <h1>THE KNOX MAP</h1>
          </div>
        </div>

        <div className="top-actions">
          <span className="live-dot">MAP ONLINE</span>
          <span style={{ color: '#ffad66', fontSize: 11 }}>
            {isOwner ? 'OWNER' : `SIGNED IN: ${profile.username}`}
          </span>

          {/* Only the owner is shown this button. */}
          {isOwner && (
            <button
              className="outline-btn"
              onClick={() => setAdminOpen(true)}
            >
              <Users size={16}/> Admin Panel
            </button>
          )}

          <button className="outline-btn" onClick={logout}>
            <LogOut size={16}/> Sign out
          </button>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <div className="side-heading">
            <div>
              <div className="eyebrow">EXPLORE THE WORLD</div>
              <h2>Map directory</h2>
            </div>
            <span className="count">{filtered.length} PINS</span>
          </div>

          <label className="search">
            <Search size={17}/>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search locations..."
            />
            {query && (
              <button onClick={() => setQuery('')}><X size={14}/></button>
            )}
          </label>

          <div className="filter-title">
            <SlidersHorizontal size={14}/> FILTER BY CATEGORY
          </div>

          <div className="categories">
            <button
              className={category === 'All' ? 'cat active' : 'cat'}
              onClick={() => setCategory('All')}
            >
              <span className="swatch all"/>All locations
              <b>{visiblePins.length}</b>
            </button>

            {visibleCategories.map(c => (
              <button
                key={c.id}
                className={category === c.name ? 'cat active' : 'cat'}
                onClick={() => setCategory(c.name)}
              >
                <span className="swatch" style={{ background: c.color }}/>
                {c.name}
                <b>{visiblePins.filter(p => p.category === c.name).length}</b>
              </button>
            ))}
          </div>

          {isOwner && (
            <div style={{
              marginTop: 22, paddingTop: 15,
              borderTop: '1px solid #30251d'
            }}>
              <button
                className="outline-btn"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => setCategoryManager(v => !v)}
              >
                <SlidersHorizontal size={14}/>
                {categoryManager ? 'Close category manager' : 'Manage categories'}
              </button>

              {categoryManager && (
                <div style={{
                  marginTop: 13, display: 'grid', gap: 10,
                  background: '#15110e', padding: 11,
                  border: '1px solid #49301e', borderRadius: 5
                }}>
                  <strong style={{ fontSize: 11 }}>Create category</strong>

                  <form onSubmit={addCategory} style={{ display: 'grid', gap: 8 }}>
                    <input
                      value={newCategory}
                      onChange={e => setNewCategory(e.target.value)}
                      placeholder="Category name"
                      maxLength={40}
                      required
                    />
                    <label style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', fontSize: 10
                    }}>
                      Category colour
                      <input
                        type="color"
                        value={newColor}
                        onChange={e => setNewColor(e.target.value)}
                      />
                    </label>
                    <button className="primary" type="submit">
                      <Plus size={14}/> Create category
                    </button>
                  </form>

                  <strong style={{ fontSize: 11 }}>Your categories</strong>

                  {categories.map(c => (
                    <div key={c.id} style={{
                      display: 'grid', gap: 7, padding: '8px 0',
                      borderTop: '1px solid #30251d'
                    }}>
                      {editingCategory === c.id ? (
                        <>
                          <input
                            value={categoryName}
                            onChange={e => setCategoryName(e.target.value)}
                            maxLength={40}
                          />
                          <label style={{
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'space-between', fontSize: 10
                          }}>
                            Colour
                            <input
                              type="color"
                              value={editingColor}
                              onChange={e => setEditingColor(e.target.value)}
                            />
                          </label>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="small-btn"
                              onClick={() => saveCategoryEdit(c.id, c.name)}
                            >
                              <Check size={13}/> Save
                            </button>
                            <button
                              className="small-btn"
                              onClick={() => setEditingCategory(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 7
                        }}>
                          <span style={{
                            width: 11, height: 11, borderRadius: '50%',
                            background: c.color, flexShrink: 0
                          }}/>
                          <span style={{
                            fontSize: 10, flex: 1, overflowWrap: 'anywhere'
                          }}>
                            {c.name}
                          </span>
                          <button
                            className="icon-btn"
                            title="Edit category"
                            onClick={() => beginCategoryEdit(c)}
                          >
                            <Pencil size={12}/>
                          </button>
                          <button
                            className="icon-btn"
                            title="Delete category"
                            onClick={() => deleteCategory(c)}
                          >
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="list-heading">
            LOCATIONS <span>{filtered.length}</span>
          </div>

          <div className="pin-list">
            {filtered.map(p => (
              <button
                className="pin-row"
                key={p.id}
                onClick={() => {
                  if (canEdit(p.category) || canDelete(p.category)) {
                    editPin(p);
                  } else {
                    setNotice(`${p.title} — ${p.description || p.category}`);
                  }
                }}
              >
                <span
                  className="pin-dot"
                  style={{ background: categoryColor(p.category) }}
                />
                <span className="pin-row-copy">
                  <strong>{p.title}</strong>
                  <small>{p.category}</small>
                </span>
                <span className="arrow">↗</span>
              </button>
            ))}
            {!filtered.length && (
              <div className="empty">No locations match your search yet.</div>
            )}
          </div>

          <div className="sidebar-foot">
            LOS SANTOS • BLAINE COUNTY<br/>
            <span>Unofficial fan-made community project</span>
          </div>
        </aside>

        <section className="map-area">
          <div className="map-toolbar">
            <div className="map-label">
              <MapPin size={15}/> SAN ANDREAS <span>/</span> INTERACTIVE MAP
            </div>

            <div className="map-tools">
              {(isOwner || visibleCategories.some(c => canAdd(c.name))) && (
                <span style={{ fontSize: 10, color: '#ffad66' }}>
                  {selectedPosition ? 'LOCATION SELECTED' : 'CLICK MAP TO SELECT'}
                </span>
              )}

              {(isOwner || visibleCategories.some(c => canAdd(c.name))) && (
                <button
                  className="add-btn"
                  onClick={startNew}
                  disabled={!selectedPosition}
                  title={!selectedPosition ? 'Click the map first' : 'Add pin here'}
                >
                  <Plus size={16}/> Add Pin
                </button>
              )}
            </div>
          </div>

          <div className="map-frame">
            <MapContainer
              crs={L.CRS.Simple}
              bounds={bounds}
              minZoom={-3}
              maxZoom={3}
              zoom={-2}
              maxBounds={[
                [-100, -100],
                [MAP_HEIGHT + 100, MAP_WIDTH + 100]
              ]}
              maxBoundsViscosity={0.8}
              zoomControl={true}
              attributionControl={false}
              className="leaflet-map"
            >
              <MapImage src={mapUrl}/>

              <ClickCapture
                active={isOwner || visibleCategories.some(c => canAdd(c.name))}
                onPick={pickLocation}
              />

              {selectedPosition && (
                <Marker
                  position={[selectedPosition.y, selectedPosition.x]}
                  icon={previewIcon}
                  draggable={true}
                  eventHandlers={{
                    dragend(e) {
                      const pos = e.target.getLatLng();
                      pickLocation({ x: pos.lng, y: pos.lat });
                    }
                  }}
                >
                  <Popup>New pin location — drag to adjust</Popup>
                </Marker>
              )}

              {filtered.map(p => (
                <Marker
                  key={p.id}
                  position={[p.y, p.x]}
                  icon={iconFor(categoryColor(p.category))}
                  draggable={canEdit(p.category)}
                  eventHandlers={{
                    dragend: (e) => {
                      if (!canEdit(p.category)) return;
                      const pos = e.target.getLatLng();
                      movePin(p, pos);
                    }
                  }}
                >
                  <Popup>
                    <div className="popup-content">
                      <b>{p.title}</b>
                      <small>{p.category}</small>
                      {p.image_url && <img src={p.image_url} alt=""/>}
                      <p>{p.description}</p>
                      {(canEdit(p.category) || canDelete(p.category)) && (
                        <button onClick={() => editPin(p)}>Edit pin</button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>

            <div className="placing-banner">
              <Crosshair size={16}/>
              {isOwner || visibleCategories.some(c => canAdd(c.name))
                ? 'CLICK THE MAP TO SELECT A LOCATION'
                : 'MAP VIEW ONLY'}
              {selectedPosition && (
                <button onClick={() => setSelectedPosition(null)}>
                  Clear selection
                </button>
              )}
            </div>

            <div className="map-coord">
              INTERACTIVE CARTOGRAPHY
              <span>•</span>
              {isOwner ? 'OWNER SESSION' : 'MEMBER SESSION'}
            </div>
          </div>

          <div className="map-footer">
            <span>
              Drag to pan • Scroll to zoom
              {' • Drag pins to move them when permitted'}
            </span>
            <span>MAP DATA CONNECTED</span>
          </div>
        </section>
      </main>

      {notice && (
        <div className="toast" role="status">
          {notice}
          <button onClick={() => setNotice('')}><X size={14}/></button>
        </div>
      )}

      {/* The Admin Panel is rendered only when the signed-in profile is the owner. */}
      {isOwner && adminOpen && (
        <AdminPanel onClose={() => setAdminOpen(false)} />
      )}

      {editing !== null && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) closeEditor();
          }}
        >
          <div className="modal editor-modal">
            <button className="modal-close" onClick={closeEditor}><X/></button>
            <div className="eyebrow">
              {editing === 'new' ? 'NEW MAP LOCATION' : 'EDIT MAP LOCATION'}
            </div>
            <h2>{editing === 'new' ? 'Add a pin' : 'Edit pin'}</h2>

            <form onSubmit={save}>
              <label>
                Pin title
                <input
                  required
                  maxLength="90"
                  value={draft.title}
                  onChange={e => setField('title', e.target.value)}
                  placeholder="e.g. Hidden package"
                />
              </label>

              <label>
                Category
                <select
                  value={draft.category}
                  onChange={e => setField('category', e.target.value)}
                >
                  {visibleCategories
                    .filter(c => editing === 'new'
                      ? canAdd(c.name)
                      : canEdit(c.name))
                    .map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                </select>
              </label>

              <label>
                Description / notes
                <textarea
                  rows="4"
                  maxLength="2000"
                  value={draft.description || ''}
                  onChange={e => setField('description', e.target.value)}
                  placeholder="Add details for viewers..."
                />
              </label>

              <label className="upload-field">
                <span><ImageIcon size={16}/> Pin image</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={!isOwner}
                  onChange={e => upload(e.target.files?.[0])}
                />
                {!isOwner && (
                  <small>Image uploads are currently owner-only.</small>
                )}
              </label>

              {draft.image_url && (
                <img
                  className="image-preview"
                  src={draft.image_url}
                  alt="Pin preview"
                />
              )}

              <div className="coords">
                MAP POSITION
                <span>
                  X {Math.round(draft.x)} / Y {Math.round(draft.y)}
                </span>
              </div>

              <div className="modal-actions">
                {editing !== 'new' && canDelete(
                  pins.find(p => p.id === editing)?.category
                ) && (
                  <button
                    type="button"
                    className="danger-btn"
                    onClick={remove}
                  >
                    <Trash2 size={15}/> Delete
                  </button>
                )}
                <button
                  type="button"
                  className="outline-btn"
                  onClick={closeEditor}
                >
                  Cancel
                </button>
                {(editing === 'new'
                  ? canAdd(draft.category)
                  : canEdit(pins.find(p => p.id === editing)?.category)) && (
                  <button
                    className="primary"
                    disabled={saving || !configured}
                  >
                    <Save size={15}/>
                    {saving ? 'Saving...' : 'Save pin'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="mobile-foot">
        Unofficial fan-made project • Not affiliated with Rockstar Games
      </footer>
    </div>
  );
}

export default App;
