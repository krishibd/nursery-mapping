import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import type { Nursery, TabType, FilterType, MapFilterType, SortType } from './types/nursery';
import { useNurseryDB } from './hooks/useNurseryDB';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { UPAZILA_CENTERS } from './data/seed';

/* ── Helper: download CSV ── */
function dlCSV(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ── Map controller component ── */
function MapController({
  flyTo,
}: {
  flyTo: { lat: number; lon: number; zoom: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (flyTo) {
      map.flyTo([flyTo.lat, flyTo.lon], flyTo.zoom, { duration: 1 });
    }
  }, [flyTo, map]);
  return null;
}

/* ── Main App ── */
export default function App() {
  const {
    db,
    lastSync,
    updateNursery,
    addNursery,
    exportCSV,
    exportJSON,
    exportOneCSV,
    getFiltered,
    getMissing,
    getById,
  } = useNurseryDB();

  const isOnline = useOnlineStatus();

  const [activeTab, setActiveTab] = useState<TabType>('map');
  const [activeUpazila, setActiveUpazila] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [activeMapFilter, setActiveMapFilter] = useState<MapFilterType>('all');
  const [activeSort, setActiveSort] = useState<SortType>('sl');
  const [searchQ, setSearchQ] = useState('');
  const [curId, setCurId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; zoom: number } | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const [showToast, setShowToast] = useState(false);
  const toastTimer = useRef<number | null>(null);

  const curN = useMemo(() => (curId != null ? getById(curId) : undefined) as Nursery | undefined, [curId, getById]);
  const editN = useMemo(() => (editId != null ? getById(editId) : undefined) as Nursery | undefined, [editId, getById]);

  const filtered = useMemo(
    () => getFiltered(activeUpazila, searchQ, activeFilter, activeSort),
    [getFiltered, activeUpazila, searchQ, activeFilter, activeSort]
  );

  const missingList = useMemo(() => getMissing(), [getMissing]);

  /* ── Toast ── */
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    clearTimeout(toastTimer.current ?? undefined);
    toastTimer.current = setTimeout(() => setShowToast(false), 2800);
  }, []);

  /* ── Map helpers ── */
  const mkIcon = (n: Nursery) => {
    const gps = n.lat && n.lon;
    const mob = !!n.mobile;
    const c = !gps ? '#c0392b' : !mob ? '#d97706' : '#2e8b57';
    const r = n.total > 50000 ? 10 : n.total > 10000 ? 8 : 6;
    return L.divIcon({
      html: `<div style="width:${r * 2}px;height:${r * 2}px;border-radius:50%;background:${c};border:2px solid rgba(255,255,255,.9);box-shadow:0 1px 5px rgba(0,0,0,.35)"></div>`,
      className: '',
      iconSize: [r * 2, r * 2],
      iconAnchor: [r, r],
      popupAnchor: [0, -r - 2],
    });
  };

  const visibleMarkers = useMemo(() => {
    return filtered.filter(n => {
      if (!n.lat || !n.lon) return false;
      if (activeMapFilter === 'ok' && (!n.mobile || !n.lat)) return false;
      if (activeMapFilter === 'nomob' && n.mobile) return false;
      if (activeMapFilter === 'nogps') return false;
      return true;
    });
  }, [filtered, activeMapFilter]);

  const legendCounts = useMemo(() => {
    const vis = activeMapFilter === 'all' ? filtered : filtered.filter(n => n.lat && n.lon);
    return {
      ok: vis.filter(n => n.lat && n.mobile).length,
      mob: vis.filter(n => n.lat && !n.mobile).length,
      gps: filtered.filter(n => !n.lat || !n.lon).length,
    };
  }, [filtered, activeMapFilter]);

  /* ── Tab navigation ── */
  const setTab = useCallback(
    (tab: TabType) => {
      setActiveTab(tab);
      if (tab === 'map') {
        // On map tab, desktop shows both
      }
    },
    []
  );

  /* ── Upazila selection ── */
  const handleSetUpazila = useCallback(
    (u: string) => {
      setActiveUpazila(u);
      if (u && UPAZILA_CENTERS[u]) {
        setFlyTo({ lat: UPAZILA_CENTERS[u][0], lon: UPAZILA_CENTERS[u][1], zoom: 12 });
      } else {
        setFlyTo({ lat: 25.73, lon: 89.64, zoom: 10 });
      }
    },
    []
  );

  /* ── Detail ── */
  const showDet = useCallback(
    (n: Nursery) => {
      setCurId(n.id);
      setEditId(null);
      if (n.lat && n.lon) {
        setFlyTo({ lat: n.lat, lon: n.lon, zoom: 14 });
      }
    },
    []
  );

  const closeDet = useCallback(() => {
    setCurId(null);
  }, []);

  /* ── Edit ── */
  const openEdit = useCallback(
    (n: Nursery) => {
      setEditId(n.id);
      setCurId(null);
    },
    []
  );

  const openEditById = useCallback(
    (id: number) => {
      const n = getById(id);
      if (n) {
        setEditId(id);
        setCurId(null);
      }
    },
    [getById]
  );

  const closeEdit = useCallback(() => {
    setEditId(null);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editN) return;
    const name = (document.getElementById('f-name') as HTMLInputElement)?.value.trim() || editN.name;
    const address = (document.getElementById('f-addr') as HTMLInputElement)?.value.trim();
    const mobile = (document.getElementById('f-mobile') as HTMLInputElement)?.value.trim();
    const latVal = parseFloat((document.getElementById('f-lat') as HTMLInputElement)?.value);
    const lonVal = parseFloat((document.getElementById('f-lon') as HTMLInputElement)?.value);
    const falod = parseInt((document.getElementById('f-falod') as HTMLInputElement)?.value) || 0;
    const bonaj = parseInt((document.getElementById('f-bonaj') as HTMLInputElement)?.value) || 0;
    const oushodhi = parseInt((document.getElementById('f-oushodhi') as HTMLInputElement)?.value) || 0;

    if (mobile && (mobile.length !== 11 || !mobile.startsWith('0'))) {
      toast('⚠️ সঠিক নম্বর দিন: ১১ সংখ্যা, ০ দিয়ে শুরু');
      return;
    }

    const lat = !isNaN(latVal) && latVal > 20 && latVal < 30 ? latVal : null;
    const lon = !isNaN(lonVal) && lonVal > 85 && lonVal < 95 ? lonVal : null;
    const total = falod + bonaj + oushodhi;

    updateNursery(editN.id, {
      name,
      address,
      mobile,
      lat,
      lon,
      falod,
      bonaj,
      oushodhi,
      total,
      updatedBy: activeUpazila || 'field',
    });

    setEditId(null);
    setCurId(editN.id);
    toast('✅ সংরক্ষিত হয়েছে');
  }, [editN, updateNursery, activeUpazila, toast]);

  const newNursery = useCallback(() => {
    const newN: Omit<Nursery, 'id' | 'sl'> = {
      upazila: activeUpazila || 'কুড়িগ্রাম সদর',
      name: '',
      address: '',
      mobile: '',
      lat: null,
      lon: null,
      falod: 0,
      bonaj: 0,
      oushodhi: 0,
      total: 0,
      fs: [],
      bs: [],
      os: [],
    };
    addNursery(newN);
    // Get the newly added nursery (last in db)
    const added = db[db.length - 1];
    if (added) {
      setEditId(added.id);
      setCurId(null);
    }
  }, [addNursery, activeUpazila, db]);

  /* ── GPS capture ── */
  const grabGPS = useCallback(() => {
    const statusEl = document.getElementById('gps-status');
    if (statusEl) {
      statusEl.textContent = '🔄 GPS সংকেত নেওয়া হচ্ছে...';
      statusEl.className = 'text-[10px] text-[var(--ink3)] min-h-[15px] leading-snug';
    }
    if (!navigator.geolocation) {
      if (statusEl) {
        statusEl.textContent = '❌ এই ডিভাইসে GPS নেই';
        statusEl.className = 'text-[10px] text-[var(--red)] min-h-[15px] leading-snug';
      }
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
        const lon = Math.round(pos.coords.longitude * 1e6) / 1e6;
        (document.getElementById('f-lat') as HTMLInputElement).value = String(lat);
        (document.getElementById('f-lon') as HTMLInputElement).value = String(lon);
        if (statusEl) {
          statusEl.textContent = `✅ পাওয়া গেছে: ${lat}, ${lon} (±${Math.round(pos.coords.accuracy)}মি)`;
          statusEl.className = 'text-[10px] text-[var(--leaf2)] font-semibold min-h-[15px] leading-snug';
        }
        toast('📍 GPS অবস্থান নেওয়া হয়েছে');
      },
      () => {
        if (statusEl) {
          statusEl.textContent = '❌ GPS পাওয়া যায়নি। সেটিংসে Location চালু আছে কি?';
          statusEl.className = 'text-[10px] text-[var(--red)] min-h-[15px] leading-snug';
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [toast]);

  /* ── Export ── */
  const handleExportAll = useCallback(() => {
    const rows = exportCSV();
    if (!rows) {
      toast('⚠️ কোনো আপডেট নেই');
      return;
    }
    dlCSV(rows, `nursery_updates_${new Date().toISOString().slice(0, 10)}.csv`);
    toast(`✅ ${rows.length - 1}টি রেকর্ড রপ্তানি হয়েছে`);
  }, [exportCSV, toast]);

  const handleExportFull = useCallback(() => {
    const json = exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nursery_full_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('📋 সম্পূর্ণ ডেটা রপ্তানি হয়েছে');
  }, [exportJSON, toast]);

  const handleExportOne = useCallback(() => {
    const n = editN || curN;
    if (!n) return;
    const rows = exportOneCSV(n);
    dlCSV(rows, `nursery_${n.sl}.csv`);
  }, [editN, curN, exportOneCSV]);

  /* ── Derived data ── */
  const upazilaList = useMemo(() => [...new Set(db.map(n => n.upazila))].sort(), [db]);

  const upazilaStats = useMemo(() => {
    return upazilaList.map(u => {
      const g = db.filter(n => n.upazila === u);
      const tot = g.reduce((s, n) => s + (n.total || 0), 0);
      const nm = g.filter(n => !n.mobile).length;
      const ng = g.filter(n => !n.lat || !n.lon).length;
      return { u, count: g.length, tot, nm, ng };
    });
  }, [db, upazilaList]);

  const maxTotal = useMemo(() => Math.max(...upazilaStats.map(s => s.tot), 1), [upazilaStats]);

  const isDesktop = typeof window !== 'undefined' && window.innerWidth > 700;
  const [isWide, setIsWide] = useState(isDesktop);

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth > 700);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* ── Date format for sync bar ── */
  const syncDate = useMemo(() => {
    const d = new Date(lastSync);
    const months = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }, [lastSync]);

  return (
    <div className="flex flex-col h-[100dvh] h-screen overflow-hidden bg-[var(--bg)]" style={{ fontFamily: 'var(--font)' }}>
      {/* ── TOPBAR ── */}
      <div
        className="flex items-center gap-2.5 shrink-0 z-[600] px-3.5 h-[54px]"
        style={{ background: 'var(--leaf)', boxShadow: '0 2px 12px rgba(0,0,0,.3)' }}
      >
        <div
          className="w-[34px] h-[34px] rounded-[9px] shrink-0 flex items-center justify-center text-[19px]"
          style={{ background: 'linear-gradient(135deg,var(--leaf2),var(--leaf3))', boxShadow: '0 2px 6px rgba(0,0,0,.2)' }}
        >
          🌿
        </div>
        <div className="flex-1 text-white leading-tight">
          <strong className="block text-sm font-bold tracking-wide">কুড়িগ্রাম নার্সারি রেজিস্ট্রি</strong>
          <span className="block text-[10px] font-normal" style={{ color: 'var(--leaf5)', fontFamily: 'var(--mono)' }}>
            DAE · GIS PWA · ২০২৬
          </span>
        </div>
        <div className="relative flex items-center">
          <input
            type="search"
            placeholder="নার্সারি খুঁজুন..."
            autoComplete="off"
            spellCheck={false}
            value={searchQ}
            onChange={e => {
              setSearchQ(e.target.value);
            }}
            className="bg-white/13 border border-white/22 rounded-[22px] py-[7px] pr-8 pl-3 text-white text-[13px] outline-none transition-all w-[170px] focus:w-[210px] focus:bg-white/20 focus:border-[var(--leaf5)]"
            style={{ fontFamily: 'var(--font)' }}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/45 text-[13px] pointer-events-none">🔍</span>
        </div>
        <button
          className="bg-transparent border-none cursor-pointer text-[var(--leaf5)] text-lg p-1 shrink-0 relative transition-colors hover:text-white"
          title="মোবাইল নেই"
          onClick={() => setTab('missing')}
        >
          📞
          {missingList.length > 0 && (
            <span
              className="absolute top-0 right-0 bg-[var(--amber)] text-white text-[9px] font-bold min-w-[16px] h-4 rounded-full flex items-center justify-center border-2 border-[var(--leaf)] px-[3px]"
            >
              {missingList.length}
            </span>
          )}
        </button>
      </div>

      {/* ── SYNC BAR ── */}
      <div
        className="shrink-0 text-center text-[10px] py-[5px] px-3"
        style={{ background: 'var(--leaf)', color: 'var(--leaf5)', fontFamily: 'var(--mono)', borderBottom: '1px solid rgba(255,255,255,.1)' }}
      >
        {isOnline ? '● অনলাইন ·' : '● অফলাইন মোড ·'} সব ডেটা ডিভাইসে সংরক্ষিত · আপডেট: {syncDate}
      </div>

      {/* ── TAB BAR ── */}
      <div className="flex shrink-0" style={{ background: 'var(--leaf)', borderTop: '1px solid rgba(255,255,255,.1)' }}>
        {(['map', 'list', 'missing', 'upazila'] as TabType[]).map(tab => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            className={`flex-1 py-2 px-1 text-center text-[10px] font-semibold border-b-2 transition-all bg-transparent border-t-0 border-l-0 border-r-0 ${
              activeTab === tab
                ? 'text-white border-b-[var(--leaf4)]'
                : 'text-white/50 border-b-transparent'
            }`}
            style={{ fontFamily: 'var(--font)' }}
          >
            <span className="block text-[17px] mb-0.5">
              {tab === 'map' && '🗺️'}
              {tab === 'list' && '📋'}
              {tab === 'missing' && '📞'}
              {tab === 'upazila' && '📊'}
            </span>
            {tab === 'map' && 'ম্যাপ'}
            {tab === 'list' && 'তালিকা'}
            {tab === 'missing' && `মোবাইল নেই${missingList.length > 0 ? ` (${missingList.length})` : ''}`}
            {tab === 'upazila' && 'উপজেলা'}
          </button>
        ))}
      </div>

      {/* ── BODY ── */}
      <div className="flex-1 flex overflow-hidden relative responsive-body">
        {/* MAP VIEW */}
        <div
          className={`relative z-[1] ${activeTab === 'map' || isWide ? 'flex-1' : 'hidden'} ${!isWide && activeTab === 'map' ? 'h-[40vh]' : ''}`}
          style={!isWide && activeTab !== 'map' ? { display: 'none' } : {}}
        >
          <MapContainer
            center={[25.73, 89.64]}
            zoom={10}
            zoomControl={true}
            className="w-full h-full"
          >
            <TileLayer
              attribution='© <a href="https://openstreetmap.org">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            <MapController flyTo={flyTo} />
            {visibleMarkers.map(n => (
              <Marker
                key={n.id}
                position={[n.lat!, n.lon!]}
                icon={mkIcon(n)}
                eventHandlers={{
                  click: () => showDet(n),
                }}
              >
                <Popup maxWidth={270} minWidth={200}>
                  <div>
                    <div className="text-[13px] font-bold text-[var(--ink)] leading-tight mb-1">{n.name}</div>
                    <div className="text-[10px] text-[var(--ink3)] mb-2">
                      {n.upazila} উপজেলা &nbsp;·&nbsp; #{n.sl}
                    </div>
                    <div className="text-[11px] flex items-center gap-1 mb-1">
                      <span>📞</span>
                      {n.mobile ? (
                        <a href={`tel:${n.mobile}`} style={{ color: 'var(--leaf2)', fontWeight: 700 }}>
                          {n.mobile}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--amber)', fontWeight: 700 }}>অনুপস্থিত</span>
                      )}
                    </div>
                    <div className="text-[11px] flex items-center gap-1 mb-1">
                      <span>🌱</span>
                      <span className="font-semibold text-[var(--ink2)]">মোট: {(n.total || 0).toLocaleString()} চারা</span>
                    </div>
                    <div className="text-[11px] flex items-center gap-1 mb-2">
                      <span>🍎</span>
                      <span className="text-[var(--ink2)]">
                        ফলদ {(n.falod || 0).toLocaleString()} &nbsp;🌲 বনজ {(n.bonaj || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        className="flex-1 py-[7px] rounded-[7px] border-none text-[11px] font-bold text-center cursor-pointer transition-opacity hover:opacity-85"
                        style={{ background: 'var(--leaf2)', color: '#fff' }}
                        onClick={() => openEditById(n.id)}
                      >
                        ✏️ আপডেট
                      </button>
                      {n.mobile ? (
                        <a
                          href={`tel:${n.mobile}`}
                          className="flex-1 py-[7px] rounded-[7px] text-[11px] font-bold text-center no-underline block transition-opacity hover:opacity-85"
                          style={{ background: 'var(--bg2)', color: 'var(--leaf)', border: '1px solid var(--border)' }}
                        >
                          📞 কল
                        </a>
                      ) : (
                        <button
                          className="flex-1 py-[7px] rounded-[7px] text-[11px] font-bold text-center cursor-pointer transition-opacity hover:opacity-85"
                          style={{ background: 'var(--bg2)', color: 'var(--leaf)', border: '1px solid var(--border)' }}
                          onClick={() => openEditById(n.id)}
                        >
                          📞 নম্বর দিন
                        </button>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Map filters */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-[400] flex gap-1.5">
            {([
              { key: 'all', label: 'সব' },
              { key: 'ok', label: '✅ সম্পূর্ণ' },
              { key: 'nomob', label: '📞 মোবাইল নেই' },
              { key: 'nogps', label: '📍 GPS নেই' },
            ] as { key: MapFilterType; label: string }[]).map(mf => (
              <button
                key={mf.key}
                onClick={() => setActiveMapFilter(mf.key)}
                className={`whitespace-nowrap px-3 py-[5px] rounded-[18px] text-[11px] font-semibold cursor-pointer transition-all border ${
                  activeMapFilter === mf.key
                    ? 'bg-[var(--leaf2)] text-white border-[var(--leaf2)]'
                    : 'bg-white/94 text-[var(--ink2)] border-[var(--border)]'
                }`}
                style={{ backdropFilter: 'blur(6px)', boxShadow: 'var(--shadow)' }}
              >
                {mf.label}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div
            className="absolute bottom-4 left-3 z-[400] rounded-lg p-2 text-[10px] border"
            style={{ background: 'rgba(255,255,255,.94)', backdropFilter: 'blur(6px)', boxShadow: 'var(--shadow)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-1.5 py-0.5" style={{ color: 'var(--ink3)' }}>
              <div className="w-[9px] h-[9px] rounded-full shrink-0 border border-black/15" style={{ background: '#2e8b57' }} />
              GPS + মোবাইল
              <span className="ml-auto pl-2 font-medium" style={{ color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{legendCounts.ok}</span>
            </div>
            <div className="flex items-center gap-1.5 py-0.5" style={{ color: 'var(--ink3)' }}>
              <div className="w-[9px] h-[9px] rounded-full shrink-0 border border-black/15" style={{ background: '#d97706' }} />
              মোবাইল নেই
              <span className="ml-auto pl-2 font-medium" style={{ color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{legendCounts.mob}</span>
            </div>
            <div className="flex items-center gap-1.5 py-0.5" style={{ color: 'var(--ink3)' }}>
              <div className="w-[9px] h-[9px] rounded-full shrink-0 border border-black/15" style={{ background: '#c0392b' }} />
              GPS নেই
              <span className="ml-auto pl-2 font-medium" style={{ color: 'var(--ink2)', fontFamily: 'var(--mono)' }}>{legendCounts.gps}</span>
            </div>
          </div>
        </div>

        {/* PANEL */}
        <div
          className={`shrink-0 bg-white flex flex-col overflow-hidden z-[2] ${isWide ? 'w-[360px] border-l' : 'w-full border-t'} ${activeTab === 'map' && !isWide ? 'hidden' : ''}`}
          style={{ borderColor: 'var(--border)' }}
        >
          {/* UPAZILA PILLS */}
          {activeTab !== 'upazila' && (
            <div className="flex overflow-x-auto px-2 py-2 gap-1.5 shrink-0 bg-[var(--bg)] border-b" style={{ borderColor: 'var(--border)', scrollbarWidth: 'none' }}>
              <button
                onClick={() => handleSetUpazila('')}
                className={`pill ${!activeUpazila ? 'active' : ''}`}
              >
                সব <span className="font-mono text-[10px] opacity-75 ml-0.5">{db.length}</span>
              </button>
              {upazilaList.map(u => (
                <button
                  key={u}
                  onClick={() => handleSetUpazila(u)}
                  className={`pill ${activeUpazila === u ? 'active' : ''}`}
                >
                  {u}{' '}
                  <span className="font-mono text-[10px] opacity-75 ml-0.5">
                    {db.filter(n => n.upazila === u).length}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* FILTER ROW */}
          {activeTab === 'list' && (
            <div className="flex gap-1.5 px-2 py-1.5 shrink-0 bg-[var(--bg)] border-b flex-wrap items-center" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setActiveFilter('all')} className={`chip-btn ${activeFilter === 'all' ? 'active' : ''}`}>
                সব
              </button>
              <button onClick={() => setActiveFilter('nomob')} className={`chip-btn warn ${activeFilter === 'nomob' ? 'active' : ''}`}>
                📞 মোবাইল নেই
              </button>
              <button onClick={() => setActiveFilter('nogps')} className={`chip-btn danger ${activeFilter === 'nogps' ? 'active' : ''}`}>
                📍 GPS নেই
              </button>
              <select
                value={activeSort}
                onChange={e => setActiveSort(e.target.value as SortType)}
                className="ml-auto text-[10px] py-[3px] px-2 border rounded-[14px] bg-white text-[var(--ink2)] outline-none cursor-pointer"
                style={{ fontFamily: 'var(--font)', borderColor: 'var(--border)' }}
              >
                <option value="sl">ক্রম</option>
                <option value="total">বেশি চারা</option>
                <option value="name">নাম</option>
                <option value="miss">অসম্পূর্ণ আগে</option>
              </select>
            </div>
          )}

          {/* LIST PANE */}
          {(activeTab === 'list' || (activeTab === 'map' && isWide)) && !curN && !editN && (
            <div className="flex-1 overflow-y-auto p-[7px] flex flex-col gap-[5px] custom-scroll">
              {filtered.length === 0 ? (
                <div className="text-center py-10 px-4" style={{ color: 'var(--ink3)' }}>
                  <div className="text-[42px] mb-3">🔍</div>
                  <p className="text-[13px] leading-relaxed">কোনো নার্সারি পাওয়া যায়নি</p>
                </div>
              ) : (
                filtered.map((n, i) => {
                  const gps = n.lat && n.lon;
                  const mob = !!n.mobile;
                  let cls = gps && mob ? 'ok' : !mob && !gps ? 'both' : !mob ? 'mob' : 'gps';
                  const gpsChip = gps ? 'status-chip green' : 'status-chip red';
                  const mobChip = mob ? 'status-chip green' : 'status-chip amber';
                  const totChip = n.total > 0 ? 'status-chip blue' : '';
                  const isSelected = curId != null && n.id === curId;
                  return (
                    <div
                      key={n.id}
                      onClick={() => showDet(n)}
                      className={`ncard ${cls} ${isSelected ? 'selected' : ''} animate-fade-up`}
                      style={{ animationDelay: `${Math.min(i * 15, 250)}ms` }}
                    >
                      <div className="flex items-start gap-1.5 mb-1">
                        <span
                          className="shrink-0 text-[9px] font-bold text-white rounded px-1.5 py-0.5"
                          style={{ background: 'var(--leaf)', fontFamily: 'var(--mono)' }}
                        >
                          {n.sl}
                        </span>
                        <span className="text-xs font-bold text-[var(--ink)] leading-tight flex-1">{n.name}</span>
                        <span
                          className="shrink-0 text-[9px] text-[var(--ink3)] rounded px-1 py-0.5 border whitespace-nowrap"
                          style={{ background: 'var(--bg2)', borderColor: 'var(--border)' }}
                        >
                          {n.upazila}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-[3px]">
                        <span className={gpsChip}>{gps ? '📍 GPS' : '❌ GPS নেই'}</span>
                        <span className={mobChip}>{mob ? `📞 ${n.mobile}` : '📞 নেই'}</span>
                        {n.total > 0 && <span className={totChip}>🌱 {n.total.toLocaleString()}</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* DETAIL PANE */}
          {curN && !editN && (
            <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3 custom-scroll">
              <div className="flex gap-2 items-start">
                <button
                  onClick={closeDet}
                  className="w-[34px] h-[34px] rounded-lg flex items-center justify-center cursor-pointer transition-all shrink-0"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                >
                  ←
                </button>
                <div className="flex-1">
                  <div className="text-[15px] font-bold text-[var(--ink)] leading-tight">{curN.name}</div>
                  <div className="text-[11px] text-[var(--ink3)] mt-1">
                    {curN.upazila} উপজেলা · ক্রম #{curN.sl}
                  </div>
                </div>
              </div>

              <div className="section-box">
                <h3>📍 লোকেশন</h3>
                <div className="kv-row">
                  <span className="kv-key">অক্ষাংশ</span>
                  <span className="kv-val" style={{ fontFamily: 'var(--mono)' }}>{curN.lat || 'নেই'}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">দ্রাঘিমাংশ</span>
                  <span className="kv-val" style={{ fontFamily: 'var(--mono)' }}>{curN.lon || 'নেই'}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">GPS স্ট্যাটাস</span>
                  <span className="kv-val">
                    {curN.lat ? (
                      <span style={{ color: 'var(--leaf2)' }}>✅ বৈধ GPS</span>
                    ) : (
                      <span style={{ color: 'var(--red)' }}>❌ নেই</span>
                    )}
                  </span>
                </div>
              </div>

              <div className="section-box">
                <h3>📞 যোগাযোগ</h3>
                <div className="kv-row">
                  <span className="kv-key">মোবাইল</span>
                  <span className="kv-val">
                    {curN.mobile ? (
                      <a href={`tel:${curN.mobile}`} style={{ color: 'var(--leaf2)', fontWeight: 700 }}>
                        {curN.mobile}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--amber)', fontWeight: 700 }}>অনুপস্থিত — আপডেট করুন</span>
                    )}
                  </span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">ঠিকানা</span>
                  <span className="kv-val">{curN.address || '—'}</span>
                </div>
              </div>

              <div className="section-box">
                <h3>🌱 চারার সারসংক্ষেপ</h3>
                <div className="kv-row">
                  <span className="kv-key">ফলদ</span>
                  <span className="kv-val">{(curN.falod || 0).toLocaleString('bn-BD')}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">বনজ</span>
                  <span className="kv-val">{(curN.bonaj || 0).toLocaleString('bn-BD')}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">ঔষধি</span>
                  <span className="kv-val">{(curN.oushodhi || 0).toLocaleString('bn-BD')}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">মোট</span>
                  <span className="kv-val text-[14px]" style={{ color: 'var(--leaf2)' }}>
                    {(curN.total || 0).toLocaleString('bn-BD')}
                  </span>
                </div>
              </div>

              {[...(curN.fs || []), ...(curN.bs || []), ...(curN.os || [])].length > 0 && (
                <div className="section-box">
                  <h3>🌿 প্রধান প্রজাতি</h3>
                  {[...(curN.fs || []), ...(curN.bs || []), ...(curN.os || [])].map((s, i) => (
                    <div key={i} className="species-row">
                      <span>{s.n}</span>
                      <b>{(s.q || 0).toLocaleString()}</b>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-1.5">
                <button className="btn-primary flex-1" onClick={() => openEdit(curN)}>
                  ✏️ তথ্য আপডেট
                </button>
                {curN.mobile && (
                  <button className="btn-call" onClick={() => (window.location.href = `tel:${curN.mobile}`)}>
                    📞 কল
                  </button>
                )}
              </div>
              <button
                className="btn-secondary w-full"
                onClick={() => {
                  if (curN.lat && curN.lon) {
                    setFlyTo({ lat: curN.lat, lon: curN.lon, zoom: 16 });
                    setTab('map');
                  } else {
                    toast('❌ GPS নেই');
                  }
                }}
              >
                🗺️ ম্যাপে দেখুন
              </button>
            </div>
          )}

          {/* EDIT PANE */}
          {editN && (
            <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3 custom-scroll">
              <div className="flex gap-2 items-start">
                <button
                  onClick={closeEdit}
                  className="w-[34px] h-[34px] rounded-lg flex items-center justify-center cursor-pointer transition-all shrink-0"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                >
                  ←
                </button>
                <div>
                  <div className="text-[15px] font-bold text-[var(--ink)] leading-tight">তথ্য আপডেট করুন</div>
                  <div className="text-[11px] text-[var(--ink3)] mt-1">
                    {editN.upazila} · #{editN.sl}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="form-label">নার্সারির নাম ও মালিক</label>
                <input id="f-name" type="text" defaultValue={editN.name || ''} placeholder="নাম লিখুন..." className="form-input" />
              </div>

              <div className="flex flex-col gap-1">
                <label className="form-label">ঠিকানা / গ্রাম</label>
                <input id="f-addr" type="text" defaultValue={editN.address || ''} placeholder="গ্রাম, ইউনিয়ন..." className="form-input" />
              </div>

              <div className="flex flex-col gap-1">
                <label className="form-label">
                  📞 মোবাইল নম্বর<span style={{ color: 'var(--amber)', marginLeft: '3px' }}>★</span>
                </label>
                <input
                  id="f-mobile"
                  type="tel"
                  defaultValue={editN.mobile || ''}
                  placeholder="০১XXXXXXXXX"
                  inputMode="numeric"
                  maxLength={11}
                  className={`form-input ${!editN.mobile ? 'highlight' : ''}`}
                />
                <span className="text-[10px] text-[var(--ink3)] leading-snug">১১ সংখ্যার নম্বর দিন · ০১৭XXXXXXXX বা ০১৮XXXXXXXX</span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="form-label">📍 GPS কোঅর্ডিনেট</label>
                <div className="flex gap-1.5">
                  <input
                    id="f-lat"
                    type="number"
                    defaultValue={editN.lat || ''}
                    placeholder="অক্ষাংশ 25.XXXXXX"
                    step={0.000001}
                    min={20}
                    max={30}
                    className="form-input flex-1 text-xs"
                    style={{ fontFamily: 'var(--mono)' }}
                  />
                  <input
                    id="f-lon"
                    type="number"
                    defaultValue={editN.lon || ''}
                    placeholder="দ্রাঘিমাংশ 89.XXXXXX"
                    step={0.000001}
                    min={85}
                    max={95}
                    className="form-input flex-1 text-xs"
                    style={{ fontFamily: 'var(--mono)' }}
                  />
                  <button
                    onClick={grabGPS}
                    className="shrink-0 text-white rounded-lg px-3 py-2 text-[19px] cursor-pointer transition-all active:scale-93"
                    style={{ background: 'var(--leaf2)' }}
                    title="বর্তমান অবস্থান"
                  >
                    📡
                  </button>
                </div>
                <span id="gps-status" className="text-[10px] text-[var(--ink3)] min-h-[15px] leading-snug">
                  📡 বোতাম চাপলে ডিভাইসের GPS থেকে স্বয়ংক্রিয়ভাবে নেওয়া হবে
                </span>
              </div>

              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="form-label">ফলদ চারা</label>
                  <input id="f-falod" type="number" defaultValue={editN.falod || 0} placeholder="0" min={0} className="form-input" />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="form-label">বনজ চারা</label>
                  <input id="f-bonaj" type="number" defaultValue={editN.bonaj || 0} placeholder="0" min={0} className="form-input" />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="form-label">ঔষধি চারা</label>
                  <input id="f-oushodhi" type="number" defaultValue={editN.oushodhi || 0} placeholder="0" min={0} className="form-input" />
                </div>
              </div>

              <div className="flex gap-1.5">
                <button className="btn-secondary" onClick={closeEdit}>
                  বাতিল
                </button>
                <button className="btn-primary flex-1" onClick={saveEdit}>
                  💾 সংরক্ষণ করুন
                </button>
              </div>
              <button
                className="btn-secondary w-full text-[11px] py-2"
                onClick={handleExportOne}
              >
                📤 এই রেকর্ড CSV-তে রপ্তানি
              </button>
            </div>
          )}

          {/* UPAZILA PANE */}
          {activeTab === 'upazila' && (
            <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3 custom-scroll">
              {upazilaStats.map(({ u, count, tot, nm, ng }) => {
                const pct = Math.round((tot / maxTotal) * 100);
                return (
                  <div
                    key={u}
                    onClick={() => {
                      handleSetUpazila(u);
                      setTab('list');
                    }}
                    className="bg-white border rounded-[var(--card-r)] p-3 cursor-pointer transition-all hover:shadow-md hover:border-[var(--leaf4)]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] font-bold text-[var(--ink)]">{u}</span>
                      <span className="status-chip green">{count} নার্সারি</span>
                    </div>
                    <div className="progress-track mb-1.5">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[10px] text-[var(--ink3)]">
                        🌱 <b className="text-[var(--ink2)]">{tot.toLocaleString()}</b> চারা
                      </span>
                      <span className="text-[10px] text-[var(--ink3)]">
                        {nm ? (
                          <>📞 <b style={{ color: 'var(--amber)' }}>{nm}</b> মোবাইল নেই</>
                        ) : (
                          <>📞 <b style={{ color: 'var(--leaf2)' }}>সম্পূর্ণ</b></>
                        )}
                      </span>
                      <span className="text-[10px] text-[var(--ink3)]">
                        {ng ? (
                          <>📍 <b style={{ color: 'var(--red)' }}>{ng}</b> GPS নেই</>
                        ) : (
                          <>📍 <b style={{ color: 'var(--leaf2)' }}>সম্পূর্ণ</b></>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* MISSING MOBILE PANE */}
          {activeTab === 'missing' && (
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 custom-scroll">
              {missingList.length === 0 ? (
                <div className="text-center py-10 px-4" style={{ color: 'var(--ink3)' }}>
                  <div className="text-[42px] mb-3">🎉</div>
                  <p className="text-[13px] leading-relaxed">সব নার্সারির মোবাইল নম্বর সংগ্রহ করা হয়েছে!</p>
                </div>
              ) : (
                missingList.map(n => (
                  <div
                    key={n.id}
                    onClick={() => openEditById(n.id)}
                    className="miss-card"
                  >
                    <div className="text-[22px] shrink-0">{!n.lat ? '🚨' : '📞'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-[var(--ink)] whitespace-nowrap overflow-hidden text-ellipsis">
                        {n.name}
                      </div>
                      <div className="text-[10px] text-[var(--ink3)] mt-0.5">
                        {n.upazila} · #{n.sl} {!n.lat ? '· GPS নেই' : ''}
                      </div>
                    </div>
                    <button
                      className="text-white rounded-[7px] py-[7px] px-3 text-[11px] font-bold cursor-pointer shrink-0 whitespace-nowrap transition-colors hover:bg-[#b45309]"
                      style={{ background: 'var(--amber)' }}
                      onClick={e => {
                        e.stopPropagation();
                        openEditById(n.id);
                      }}
                    >
                      নম্বর দিন
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* EXPORT BAR */}
          <div className="shrink-0 flex gap-1.5 p-2 bg-[var(--bg)] border-t" style={{ borderColor: 'var(--border)' }}>
            <button className="exp-btn" onClick={handleExportAll}>
              📤 আপডেট রপ্তানি (CSV)
            </button>
            <button className="exp-btn sec" onClick={handleExportFull}>
              📋 সব ডেটা JSON
            </button>
          </div>
        </div>
      </div>

      {/* ── FAB ── */}
      <button
        onClick={newNursery}
        className="fixed bottom-5 right-4 z-[500] w-[52px] h-[52px] rounded-full text-white text-[26px] flex items-center justify-center border-none cursor-pointer transition-all hover:scale-105 active:scale-90"
        style={{ background: 'var(--leaf2)', boxShadow: 'var(--shadow2)', lineHeight: 1 }}
        title="নতুন নার্সারি"
      >
        ＋
        {missingList.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-[var(--amber)] text-white text-[9px] font-bold min-w-[17px] h-[17px] rounded-full flex items-center justify-center border-2 border-white px-[3px]" style={{ fontFamily: 'var(--mono)' }}>
            {missingList.length}
          </span>
        )}
      </button>

      {/* ── TOAST ── */}
      <div className={`toast ${showToast ? 'show' : ''}`}>{toastMsg}</div>
    </div>
  );
}
