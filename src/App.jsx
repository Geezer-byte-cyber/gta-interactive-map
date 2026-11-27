
import React, { useEffect, useMemo, useState } from 'react';
import {
  MapContainer, ImageOverlay, Marker, Popup, useMapEvents
} from 'react-leaflet';
import L from 'leaflet';
import { supabase, configured } from './supabase';
import {
  Search, Plus, LogIn, LogOut, X, Save, Trash2,
  Image as ImageIcon, MapPin, SlidersHorizontal,
  Crosshair, Upload, Pencil, Check
} from 'lucide-react';

const bounds = [[0, 0], [1000, 1600]];

const blank = {
  title: '',
  description: '',
  category: 'Other',
  image_url: '',
  x: 800,
  y: 500
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
  html: '<span class="map-pin" style="--pin:#ffffff"><i></i></span>',
  iconSize: [26, 34],
  iconAnchor: [13, 31]
});

function ClickCapture({ active, onPick }) {
  useMapEvents({
    click(e) {
      if (active) {
        onPick({ x: e.latlng.lng, y: e.latlng.lat });
      }
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');

  const [adminOpen, setAdminOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(blank);

  const [selectedPosition, setSelectedPosition] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const [newCategory, setNewCategory] = useState('');
  const [newColor, setNewColor] = useState('#58a6ff');
  const [categoryManager, setCategoryManager] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState('#58a6ff');

  const [mapUrl] = useState('/los-santos-map.jpg');

  const isAdmin = !!session;

  const filtered = useMemo(() =>
    pins.filter(p =>
      (category === 'All' || p.category === category) &&
      `${p.title} ${p.description} ${p.category}`
        .toLowerCase().includes(query.toLowerCase())
    ), [pins, category, query]);

  useEffect(() => {
    if (!configured) {
      setNotice('Connect Supabase to enable shared pins and admin login.');
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, s) => setSession(s));

    return () => subscription.unsubscribe();
  }, []);

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

  useEffect(() => {
    if (!configured) return;

    loadPins();
    loadCategories();

    const pinsChannel = supabase
      .channel('public-pins')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pins'
      }, loadPins)
      .subscribe();

    const categoriesChannel = supabase
      .channel('public-categories')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'map_categories'
      }, loadCategories)
      .subscribe();

    return () => {
      supabase.removeChannel(pinsChannel);
      supabase.removeChannel(categoriesChannel);
    };
  }, [session]);

  const categoryColor = (name) =>
    categories.find(c => c.name === name)?.color || '#c4c9c5';

  const setField = (key, value) =>
    setDraft(d => ({ ...d, [key]: value }));

  // Select a location on the map before pressing Add Pin.
  const pickLocation = (position) => {
    setSelectedPosition(position);
    setNotice(
      `Location selected: X ${Math.round(position.x)}, Y ${Math.round(position.y)}`
    );
  };

  const startNew = () => {
    if (!selectedPosition) {
      setNotice('Click somewhere on the map first to choose a pin location.');
      return;
    }

    setDraft({
      ...blank,
      x: selectedPosition.x,
      y: selectedPosition.y,
      category: categories[0]?.name || 'Other'
    });

    setEditing('new');
    setPlacing(false);
  };

  const editPin = (p) => {
    setDraft({ ...p });
    setEditing(p.id);
    setPlacing(false);
  };

  const closeEditor = () => {
    setEditing(null);
  };

  const login = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    setNotice(error ? error.message : 'Signed in.');
    if (!error) {
      setPassword('');
      setAdminOpen(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setNotice('Signed out.');
    setSelectedPosition(null);
    setPlacing(false);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!configured || !isAdmin) return;

    if (!draft.title.trim()) {
      setNotice('Please enter a pin title.');
      return;
    }

    if (!categories.some(c => c.name === draft.category)) {
      setNotice('Please select a valid category.');
      return;
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
    if (!isAdmin || !configured) return;

    // Save the new image-map coordinates, not screen pixels.
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
    if (!file || !configured || !isAdmin) return;

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

  // Category management
  const addCategory = async (e) => {
    e.preventDefault();
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
    setCategoryColor(c.color);
  };

  const saveCategoryEdit = async (id, oldName) => {
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

    // Update existing pins first so they retain their category.
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
      .update({ name, color: categoryColor })
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">LS</div>
          <div>
            <div className="eyebrow">COMMUNITY ATLAS</div>
            <h1>LOS SANTOS <span>FIELD GUIDE</span></h1>
          </div>
        </div>

        <div className="top-actions">
          <span className="live-dot">MAP ONLINE</span>
          <button className="outline-btn" onClick={() => setAdminOpen(true)}>
            {isAdmin ? <><LogOut size={16}/> Admin</> : <><LogIn size={16}/> Admin login</>}
          </button>
          {isAdmin && (
            <button className="icon-btn" title="Sign out" onClick={logout}>
              <LogOut size={17}/>
            </button>
          )}
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <div className="side-heading">
            <div>
              <div className="eyebrow">EXPLORE THE CITY</div>
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
              <b>{pins.length}</b>
            </button>

            {categories.map(c => (
              <button
                key={c.id}
                className={category === c.name ? 'cat active' : 'cat'}
                onClick={() => setCategory(c.name)}
              >
                <span className="swatch" style={{ background: c.color }}/>
                {c.name}
                <b>{pins.filter(p => p.category === c.name).length}</b>
              </button>
            ))}
          </div>

          {isAdmin && (
            <div style={{
              marginTop: 22, paddingTop: 15,
              borderTop: '1px solid #26352b'
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
                  background: '#0d140f', padding: 11,
                  border: '1px solid #34483a', borderRadius: 5
                }}>
                  <strong style={{ fontSize: 11 }}>Create category</strong>

                  <form onSubmit={addCategory} style={{ display: 'grid', gap: 8 }}>
                    <input
                      value={newCategory}
                      onChange={e => setNewCategory(e.target.value)}
                      placeholder="Category name"
                      maxLength={40}
                      required
                      style={{
                        width: '100%', padding: 9, background: '#17221b',
                        color: '#fff', border: '1px solid #34483a',
                        borderRadius: 4
                      }}
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
                      borderTop: '1px solid #26352b'
                    }}>
                      {editingCategory === c.id ? (
                        <>
                          <input
                            value={categoryName}
                            onChange={e => setCategoryName(e.target.value)}
                            maxLength={40}
                            style={{
                              padding: 7, background: '#17221b',
                              color: '#fff', border: '1px solid #34483a'
                            }}
                          />
                          <label style={{
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'space-between', fontSize: 10
                          }}>
                            Colour
                            <input
                              type="color"
                              value={categoryColor}
                              onChange={e => setCategoryColor(e.target.value)}
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
                onClick={() => editPin(p)}
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
              {isAdmin && (
                <span style={{ fontSize: 10, color: '#9fc5a4' }}>
                  {selectedPosition ? 'LOCATION SELECTED' : 'CLICK MAP TO SELECT'}
                </span>
              )}

              {isAdmin && (
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
              minZoom={-2}
              maxZoom={3}
              zoom={-1}
              maxBounds={[[-100, -100], [1100, 1700]]}
              maxBoundsViscosity={0.8}
              zoomControl={true}
              attributionControl={false}
              className="leaflet-map"
            >
              <MapImage src={mapUrl}/>

              <ClickCapture
                active={isAdmin}
                onPick={pickLocation}
              />

              {selectedPosition && isAdmin && (
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
                  draggable={isAdmin}
                  eventHandlers={{
                    click: () => {
                      if (isAdmin) editPin(p);
                    },
                    dragend: (e) => {
                      if (!isAdmin) return;
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
                      {isAdmin && (
                        <button onClick={() => editPin(p)}>Edit pin</button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>

            {!mapUrl && (
              <div className="map-placeholder">
                <div className="placeholder-grid"/>
                <div className="placeholder-card">
                  <div className="placeholder-icon"><MapPin size={23}/></div>
                  <h3>Your Los Santos map goes here</h3>
                  <p>Upload your GTA V map image into the public folder.</p>
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="placing-banner">
                <Crosshair size={16}/>
                CLICK THE MAP TO SELECT A LOCATION
                {selectedPosition && (
                  <button onClick={() => setSelectedPosition(null)}>
                    Clear selection
                  </button>
                )}
              </div>
            )}

            <div className="map-coord">
              INTERACTIVE CARTOGRAPHY
              <span>•</span>
              {isAdmin ? 'ADMIN SESSION' : 'VIEW ONLY'}
            </div>
          </div>

          <div className="map-footer">
            <span>
              Drag to pan • Scroll to zoom
              {isAdmin ? ' • Drag pins to move them' : ' • Select a pin for details'}
            </span>
            <span>MAP DATA {configured ? 'CONNECTED' : 'NOT CONFIGURED'}</span>
          </div>
        </section>
      </main>

      {notice && (
        <div className="toast" role="status">
          {notice}
          <button onClick={() => setNotice('')}><X size={14}/></button>
        </div>
      )}

      {adminOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setAdminOpen(false);
          }}
        >
          <div className="modal auth-modal">
            <button
              className="modal-close"
              onClick={() => setAdminOpen(false)}
            >
              <X/>
            </button>
            <div className="eyebrow">RESTRICTED ACCESS</div>
            <h2>{isAdmin ? 'Admin session' : 'Admin login'}</h2>

            {isAdmin ? (
              <>
                <p>You are signed in and can manage map pins and categories.</p>
                <button className="primary wide" onClick={logout}>
                  Sign out
                </button>
              </>
            ) : (
              <form onSubmit={login}>
                <p>Sign in with your Supabase admin account.</p>
                <label>
                  Email
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Your password"
                  />
                </label>
                <button className="primary wide" disabled={!configured}>
                  Sign in
                </button>
                {!configured && (
                  <small className="warning">
                    Supabase setup is required before login works.
                  </small>
                )}
              </form>
            )}
          </div>
        </div>
      )}

      {editing !== null && isAdmin && (
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
                  {categories.map(c => (
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
                  onChange={e => upload(e.target.files?.[0])}
                />
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
                {editing !== 'new' && (
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
                <button
                  className="primary"
                  disabled={saving || !configured}
                >
                  <Save size={15}/>
                  {saving ? 'Saving...' : 'Save pin'}
                </button>
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
