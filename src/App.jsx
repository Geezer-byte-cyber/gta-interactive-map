import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, ImageOverlay, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { supabase, configured } from './supabase';
import { Search, Plus, LogIn, LogOut, X, Save, Trash2, Image as ImageIcon, MapPin, SlidersHorizontal, Crosshair, Upload } from 'lucide-react';

const CATEGORIES = [
  {name:'Collectibles',color:'#f2c14e'},
  {name:'Properties',color:'#58a6ff'},
  {name:'Businesses',color:'#4cc38a'},
  {name:'Vehicles',color:'#e879f9'},
  {name:'Secrets',color:'#fb7185'},
  {name:'Other',color:'#c4c9c5'}
];
const bounds = [[0,0],[1000,1600]];
const iconFor = (color) => L.divIcon({
  className:'pin-wrap', html:`<span class="map-pin" style="--pin:${color}"><i></i></span>`,
  iconSize:[26,34], iconAnchor:[13,31], popupAnchor:[0,-29]
});
const blank = {title:'',description:'',category:'Collectibles',image_url:'',x:500,y:800};

function ClickCapture({active,onPick}) {
  useMapEvents({click(e){if(active) onPick({x:e.latlng.lng,y:e.latlng.lat});}});
  return null;
}
function MapImage({src}) {
  const map=useMapEvents({});
  useEffect(()=>{if(src) map.fitBounds(bounds);},[src,map]);
  return src ? <ImageOverlay url={src} bounds={bounds}/> : null;
}
function App(){
  const [pins,setPins]=useState([]);
  const [session,setSession]=useState(null);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [query,setQuery]=useState('');
  const [category,setCategory]=useState('All');
  const [adminOpen,setAdminOpen]=useState(false);
  const [editing,setEditing]=useState(null);
  const [draft,setDraft]=useState(blank);
  const [placing,setPlacing]=useState(false);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState('');
  const [mapUrl,setMapUrl]=useState('/los-santos-map.jpg');
  const isAdmin=!!session;
  const filtered=useMemo(()=>pins.filter(p=>(category==='All'||p.category===category)&&`${p.title} ${p.description} ${p.category}`.toLowerCase().includes(query.toLowerCase())),[pins,category,query]);

  useEffect(()=>{
    if(!configured){setNotice('Connect Supabase to enable shared pins and admin login.');return;}
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>setSession(s));
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    if(!configured)return;
    let alive=true;
    supabase.from('pins').select('*').order('created_at',{ascending:false}).then(({data,error})=>{
      if(!alive)return;
      if(error)setNotice(error.message); else setPins(data||[]);
    });
    const channel=supabase.channel('public-pins').on('postgres_changes',{event:'*',schema:'public',table:'pins'},()=>{
      supabase.from('pins').select('*').order('created_at',{ascending:false}).then(({data})=>setPins(data||[]));
    }).subscribe();
    return ()=>{alive=false;supabase.removeChannel(channel);};
  },[session]);
  const startNew=()=>{setEditing('new');setDraft({...blank});setPlacing(true);setNotice('Click the map to place your pin.');};
  const editPin=p=>{setEditing(p.id);setDraft({...p});setPlacing(false);};
  const closeEditor=()=>{setEditing(null);setPlacing(false);};
  const setField=(k,v)=>setDraft(d=>({...d,[k]:v}));
  const login=async(e)=>{e.preventDefault();const {error}=await supabase.auth.signInWithPassword({email,password});setNotice(error?error.message:'Signed in.');if(!error){setPassword('');setAdminOpen(false);}};
  const logout=async()=>{await supabase.auth.signOut();setNotice('Signed out.');};
  const save=async(e)=>{
    e.preventDefault(); if(!configured||!isAdmin)return;
    if(!draft.title.trim()){setNotice('Please enter a pin title.');return;}
    setSaving(true);
    const payload={title:draft.title.trim(),description:draft.description,category:draft.category,image_url:draft.image_url||null,x:draft.x,y:draft.y};
    const result=editing==='new'?await supabase.from('pins').insert(payload):await supabase.from('pins').update(payload).eq('id',editing);
    setSaving(false);
    if(result.error){setNotice(result.error.message);return;}
    closeEditor();setNotice('Pin saved.');
    const {data}=await supabase.from('pins').select('*').order('created_at',{ascending:false});setPins(data||[]);
  };
  const remove=async()=>{
    if(!window.confirm('Delete this pin?'))return;
    const {error}=await supabase.from('pins').delete().eq('id',editing);
    if(error){setNotice(error.message);return;}
    setPins(p=>p.filter(x=>x.id!==editing));closeEditor();setNotice('Pin deleted.');
  };
  const upload=async(file)=>{
    if(!file||!configured||!isAdmin)return;
    const ext=file.name.split('.').pop().toLowerCase();
    const path=`${crypto.randomUUID()}.${ext}`;
    const {error}=await supabase.storage.from('pin-images').upload(path,file,{upsert:false});
    if(error){setNotice(error.message);return;}
    const {data}=supabase.storage.from('pin-images').getPublicUrl(path);
    setField('image_url',data.publicUrl);
  };
  const changeMap=async(file)=>{
    if(!file)return;
    const url=URL.createObjectURL(file);setMapUrl(url);
    setNotice('Map image loaded for this browser preview. To publish it, follow the README map-image instructions.');
  };
  const categoryColor=name=>CATEGORIES.find(c=>c.name===name)?.color||'#c4c9c5';

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark">LS</div><div><div className="eyebrow">COMMUNITY ATLAS</div><h1>LOS SANTOS <span>FIELD GUIDE</span></h1></div></div>
      <div className="top-actions">
        <span className="live-dot">MAP ONLINE</span>
        <button className="outline-btn" onClick={()=>setAdminOpen(true)}>{isAdmin?<><LogOut size={16}/> Admin</>:<><LogIn size={16}/> Admin login</>}</button>
        {isAdmin&&<button className="icon-btn" title="Sign out" onClick={logout}><LogOut size={17}/></button>}
      </div>
    </header>
    <main className="layout">
      <aside className="sidebar">
        <div className="side-heading"><div><div className="eyebrow">EXPLORE THE CITY</div><h2>Map directory</h2></div><span className="count">{filtered.length} PINS</span></div>
        <label className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search locations..."/>{query&&<button onClick={()=>setQuery('')}><X size={14}/></button>}</label>
        <div className="filter-title"><SlidersHorizontal size={14}/> FILTER BY CATEGORY</div>
        <div className="categories">
          <button className={category==='All'?'cat active':'cat'} onClick={()=>setCategory('All')}><span className="swatch all"/>All locations <b>{pins.length}</b></button>
          {CATEGORIES.map(c=><button key={c.name} className={category===c.name?'cat active':'cat'} onClick={()=>setCategory(c.name)}><span className="swatch" style={{background:c.color}}/>{c.name}<b>{pins.filter(p=>p.category===c.name).length}</b></button>)}
        </div>
        <div className="list-heading">LOCATIONS <span>{filtered.length}</span></div>
        <div className="pin-list">{filtered.map(p=><button className="pin-row" key={p.id} onClick={()=>{setCategory(p.category);}}><span className="pin-dot" style={{background:categoryColor(p.category)}}/><span className="pin-row-copy"><strong>{p.title}</strong><small>{p.category}</small></span><span className="arrow">↗</span></button>)}
          {!filtered.length&&<div className="empty">No locations match your search yet.</div>}
        </div>
        <div className="sidebar-foot">LOS SANTOS • BLAINE COUNTY<br/><span>Unofficial fan-made community project</span></div>
      </aside>
      <section className="map-area">
        <div className="map-toolbar"><div className="map-label"><MapPin size={15}/> SAN ANDREAS <span>/</span> INTERACTIVE MAP</div><div className="map-tools">{isAdmin&&<label className="small-btn upload-map"><Upload size={14}/> Map image<input type="file" accept="image/*" onChange={e=>changeMap(e.target.files?.[0])}/></label>}{isAdmin&&<button className="add-btn" onClick={startNew}><Plus size={16}/> Add pin</button>}</div></div>
        <div className="map-frame">
          <MapContainer crs={L.CRS.Simple} bounds={bounds} minZoom={-2} maxZoom={3} zoom={-1} maxBounds={[[ -100,-100],[1100,1700]]} maxBoundsViscosity={0.8} zoomControl={true} attributionControl={false} className="leaflet-map">
            {mapUrl?<MapImage src={mapUrl}/>:<div/>}
            <ClickCapture active={placing} onPick={({x,y})=>{setDraft(d=>({...d,x,y}));setPlacing(false);setNotice('Pin location selected. Add its details and save.');}}/>
            {filtered.map(p=><Marker key={p.id} position={[p.y,p.x]} icon={iconFor(categoryColor(p.category))} eventHandlers={{click:()=>editPin(p)}}>
              <Popup><div className="popup-content"><b>{p.title}</b><small>{p.category}</small>{p.image_url&&<img src={p.image_url} alt=""/>}<p>{p.description}</p>{isAdmin&&<button onClick={()=>editPin(p)}>Edit pin</button>}</div></Popup>
            </Marker>)}
          </MapContainer>
          {!mapUrl&&<div className="map-placeholder"><div className="placeholder-grid"/><div className="placeholder-card"><div className="placeholder-icon"><MapPin size={23}/></div><h3>Your Los Santos map goes here</h3><p>Sign in as admin and upload a high-resolution, top-down GTA V map image. Then place pins directly on it.</p><span>IMAGE OVERLAY • ZOOMABLE • PIN-READY</span></div></div>}
          {placing&&<div className="placing-banner"> <Crosshair size={16}/> CLICK THE MAP TO PLACE YOUR PIN <button onClick={()=>setPlacing(false)}>Cancel</button></div>}
          <div className="map-coord">INTERACTIVE CARTOGRAPHY <span>•</span> {isAdmin?'ADMIN SESSION':'VIEW ONLY'}</div>
        </div>
        <div className="map-footer"><span>Drag to pan • Scroll to zoom • Select a pin for details</span><span>MAP DATA {configured?'CONNECTED':'NOT CONFIGURED'}</span></div>
      </section>
    </main>
    {notice&&<div className="toast" role="status">{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}
    {adminOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setAdminOpen(false);}}><div className="modal auth-modal"><button className="modal-close" onClick={()=>setAdminOpen(false)}><X/></button><div className="eyebrow">RESTRICTED ACCESS</div><h2>{isAdmin?'Admin session':'Admin login'}</h2>{isAdmin?<><p>You are signed in and can manage map pins.</p><button className="primary wide" onClick={logout}>Sign out</button></>:<form onSubmit={login}><p>Sign in with the admin account you create in Supabase.</p><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/></label><button className="primary wide" disabled={!configured}>Sign in</button>{!configured&&<small className="warning">Supabase setup is required before login works.</small>}</form>}</div></div>}
    {editing!==null&&isAdmin&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closeEditor();}}><div className="modal editor-modal"><button className="modal-close" onClick={closeEditor}><X/></button><div className="eyebrow">{editing==='new'?'NEW MAP LOCATION':'EDIT MAP LOCATION'}</div><h2>{editing==='new'?'Add a pin':'Edit pin'}</h2><form onSubmit={save}>
      <label>Pin title<input required maxLength="90" value={draft.title} onChange={e=>setField('title',e.target.value)} placeholder="e.g. Hidden package"/></label>
      <label>Category<select value={draft.category} onChange={e=>setField('category',e.target.value)}>{CATEGORIES.map(c=><option key={c.name}>{c.name}</option>)}</select></label>
      <label>Description / notes<textarea rows="4" maxLength="2000" value={draft.description||''} onChange={e=>setField('description',e.target.value)} placeholder="Add details for viewers..."/></label>
      <label className="upload-field"><span><ImageIcon size={16}/> Pin image</span><input type="file" accept="image/*" onChange={e=>upload(e.target.files?.[0])}/></label>
      {draft.image_url&&<img className="image-preview" src={draft.image_url} alt="Pin preview"/>}
      <div className="coords">MAP POSITION <span>X {Math.round(draft.x)} / Y {Math.round(draft.y)}</span></div>
      <div className="modal-actions">{editing!=='new'&&<button type="button" className="danger-btn" onClick={remove}><Trash2 size={15}/> Delete</button>}<button type="button" className="outline-btn" onClick={closeEditor}>Cancel</button><button className="primary" disabled={saving||!configured}><Save size={15}/> {saving?'Saving...':'Save pin'}</button></div>
    </form></div></div>}
    <footer className="mobile-foot">Unofficial fan-made project • Not affiliated with Rockstar Games</footer>
  </div>
}
export default App;
