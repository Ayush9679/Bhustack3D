import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Layers,
  Box,
  Compass,
  ExternalLink,
  ShieldCheck,
  Building2,
  Share2,
  Check,
} from 'lucide-react';
import { INDIAN_LOCATIONS, findLocation, LocationData } from '../data/locations';
import ParcelHologram from '../components/Portal/ParcelHologram';
import KP2Hologram, { KP2Feature } from '../components/Portal/KP2Hologram';
import Logo from '../components/Logo';

// ─── KP2 GeoJSON loader ───────────────────────────────────────────────────────
// Loaded lazily so the large 415KB file is not bundled into the main chunk.
// Vite handles JSON imports natively via ?url import + fetch.
let kp2FeaturesCache: KP2Feature[] | null = null;

async function loadKP2Features(): Promise<KP2Feature[]> {
  if (kp2FeaturesCache) return kp2FeaturesCache;
  try {
    // Fetch via the backend API (compact stripped JSON)
    const apiBase = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/$/, '');
    const res = await fetch(`${apiBase}/parcels/knowledge-park-2`);
    if (res.ok) {
      const data = await res.json();
      if (data.geojson_features) {
        const parsed = JSON.parse(data.geojson_features) as KP2Feature[];
        kp2FeaturesCache = parsed;
        return parsed;
      }
    }
  } catch {
    // fall through to static fallback
  }
  // Fallback: load raw GeoJSON from static asset
  try {
    const res = await fetch('/kp2_parcel.geojson');
    const gj = await res.json();
    const features: KP2Feature[] = (gj.features || []).map((f: any) => ({
      fid: f.properties?.fid ?? null,
      name: f.properties?.name ?? null,
      area_m2: f.properties?.area_m2 ?? 0,
      est_height: f.properties?.est_height ?? 6,
      building: f.properties?.building ?? 'yes',
      geometry: f.geometry,
    }));
    kp2FeaturesCache = features;
    return features;
  } catch {
    return [];
  }
}

// ─── Is this parcel the KP2 multi-cluster? ───────────────────────────────────
function isKP2(location: LocationData): boolean {
  return location.id === 'knowledge-park-2' || location.hasRealGeometry === true;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ParcelDetailPage() {
  const { parcelId } = useParams<{ parcelId: string }>();
  const navigate = useNavigate();

  const [activeStratum, setActiveStratum] = useState<'all' | 'air' | 'surface' | 'subsurface'>('all');
  const [copied, setCopied] = useState(false);
  const [kp2Features, setKP2Features] = useState<KP2Feature[]>([]);
  const [kp2Loading, setKP2Loading] = useState(false);

  // Find parcel by ID or ULPIN
  const location: LocationData = findLocation(parcelId) || INDIAN_LOCATIONS[0];
  const showKP2 = isKP2(location);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [parcelId]);

  // Load real KP2 geometry if needed
  useEffect(() => {
    if (!showKP2) return;
    setKP2Loading(true);
    loadKP2Features()
      .then(setKP2Features)
      .finally(() => setKP2Loading(false));
  }, [showKP2]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBack = () => {
    navigate('/#auth');
  };

  return (
    <div className="relative min-h-screen w-full bg-space-950 text-white overflow-x-hidden flex flex-col">
      {/* Background radial glow effects */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-accent-600/10 blur-[120px]" />
        <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] rounded-full bg-cyan-glow/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 w-[450px] h-[450px] rounded-full bg-accent-500/5 blur-[100px]" />
      </div>

      {/* Top Navigation Bar */}
      <header className="relative z-20 w-full border-b border-white/10 bg-space-950/80 backdrop-blur-xl px-4 sm:px-8 py-3.5 flex items-center justify-between sticky top-0">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-light border border-white/10 text-slate-300 hover:text-white hover:border-accent-500/50 transition-all text-xs font-body font-500 group"
          >
            <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Portal</span>
          </button>

          <div className="hidden sm:flex items-center gap-2 text-xs font-body text-slate-400">
            <span className="text-slate-500">/</span>
            <span>Cadastre</span>
            <span className="text-slate-500">/</span>
            <span className="text-cyan-300 font-500">{location.name.split(' (')[0]}</span>
            {showKP2 && (
              <>
                <span className="text-slate-500">·</span>
                <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/30 text-[10px] font-mono text-cyan-300">
                  REAL GIS DATA
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-500/15 border border-accent-400/30 text-[11px] font-mono text-accent-300">
            <Compass size={12} />
            <span>{showKP2 ? 'Real QGIS Multi-Parcel Cluster' : '3D Cadastral Volumetric View'}</span>
          </div>

          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-light border border-white/10 text-xs font-body text-slate-300 hover:text-white hover:border-white/20 transition-all"
            title="Copy link to parcel"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Share2 size={14} />}
            <span>{copied ? 'Copied' : 'Share'}</span>
          </button>
        </div>
      </header>

      {/* Main Content View */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
        {/* Preset Location Switcher Bar */}
        <div className="glass rounded-2xl p-3 sm:p-4 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-xs font-mono text-slate-400 shrink-0 flex items-center gap-1 pl-1">
            <MapPin size={13} className="text-accent-400" /> All Parcels:
          </span>
          {INDIAN_LOCATIONS.map((loc) => {
            const isCurrent = loc.id === location.id;
            return (
              <button
                key={loc.id}
                onClick={() => navigate(`/parcel/${loc.id}`)}
                className={`px-3 py-1.5 rounded-full text-xs font-body whitespace-nowrap transition-all duration-200 ${
                  isCurrent
                    ? 'bg-gradient-to-r from-accent-500 to-accent-600 text-white shadow-md shadow-accent-500/25 border border-accent-400/40 font-500'
                    : 'bg-space-950/50 hover:bg-white/10 text-slate-300 border border-white/10'
                } ${loc.hasRealGeometry ? 'ring-1 ring-cyan-400/30' : ''}`}
              >
                {loc.name.split(' (')[0]}
                {loc.hasRealGeometry && (
                  <span className="ml-1.5 text-[9px] text-cyan-400 font-mono">GIS</span>
                )}
              </button>
            );
          })}
        </div>

        {/* 3D Hologram & Cadastral Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start">
          {/* 3D Parcel Hologram Viewer */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div
              className={`relative rounded-2xl overflow-hidden glass border border-white/10 glow-blue ${
                showKP2 ? 'h-[520px] sm:h-[600px] xl:h-[640px]' : 'h-[420px] sm:h-[500px] xl:h-[540px]'
              }`}
            >
              {showKP2 ? (
                kp2Loading ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-space-950/70">
                    <div className="w-10 h-10 rounded-full border-2 border-accent-400/30 border-t-cyan-400 animate-spin" />
                    <p className="text-xs font-mono text-slate-400">Loading 575 real parcel geometries…</p>
                    <p className="text-[10px] font-mono text-slate-600">Fetching from backend API…</p>
                  </div>
                ) : (
                  <KP2Hologram features={kp2Features} />
                )
              ) : (
                <ParcelHologram activeStratum={activeStratum} />
              )}
            </div>

            {/* Stratum Filter Buttons — only for non-KP2 */}
            {!showKP2 && (
              <div className="flex items-center gap-2 p-1.5 rounded-xl bg-space-950/60 border border-white/10 text-xs">
                {(['all', 'air', 'surface', 'subsurface'] as const).map((strat) => (
                  <button
                    key={strat}
                    onClick={() => setActiveStratum(strat)}
                    className={`flex-1 py-2 px-2.5 rounded-lg font-body transition-colors capitalize ${
                      activeStratum === strat
                        ? 'bg-accent-500 text-white font-500 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {strat === 'all' ? 'All Strata' : strat}
                  </button>
                ))}
              </div>
            )}

            {/* KP2 legend */}
            {showKP2 && kp2Features.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-space-950/60 border border-white/10 text-[10px] font-mono">
                <span className="text-slate-400">Height legend:</span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#38bdf8', opacity: 0.8 }} />
                  <span className="text-slate-300">6m (lowrise)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#00c8e8', opacity: 0.8 }} />
                  <span className="text-slate-300">9–12m (midrise)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#00f2ff', opacity: 0.9 }} />
                  <span className="text-slate-300">18m (highrise)</span>
                </span>
                <span className="ml-auto text-cyan-400">Hover a building for details</span>
              </div>
            )}
          </div>

          {/* Selected Parcel Data Card */}
          <div className="lg:col-span-5 glass rounded-2xl p-6 flex flex-col justify-between glow-blue space-y-6">
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent-500/20 text-accent-300 border border-accent-400/30">
                    {location.classification}
                  </span>
                  {showKP2 && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse inline-block" />
                      REAL DATA
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-display font-700 text-white mt-2">
                  {location.name}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-mono text-cyan-400">{location.ulpin}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Active
                  </span>
                </div>
                {/* Parcel count badge for KP2 */}
                {showKP2 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Building2 size={13} className="text-cyan-400" />
                    <span className="text-xs font-mono text-cyan-300">
                      {kp2Features.length > 0 ? kp2Features.length : location.featureCount ?? 575} parcels/units in this cluster
                    </span>
                  </div>
                )}
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2.5 p-3.5 rounded-xl bg-space-950/60 border border-white/5 text-center">
                <div>
                  <span className="block text-[10px] font-body text-slate-400">
                    {showKP2 ? 'Total Area' : 'Area'}
                  </span>
                  <span className="text-sm font-mono text-white font-600">{location.area}</span>
                  {showKP2 && (
                    <span className="block text-[9px] font-mono text-cyan-400/70 mt-0.5">sum of {location.featureCount ?? 575} parcels</span>
                  )}
                </div>
                <div>
                  <span className="block text-[10px] font-body text-slate-400">Volume</span>
                  <span className="text-sm font-mono text-cyan-300 font-600">{location.volume}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-body text-slate-400">Elevation</span>
                  <span className="text-sm font-mono text-white font-600">{location.elevation}</span>
                </div>
              </div>

              {/* Stratified Cadastre Envelopes */}
              <div className="space-y-2">
                <span className="text-xs font-body font-500 text-slate-300 flex items-center gap-1.5">
                  <Layers size={14} className="text-accent-400" /> Stratified Cadastre Envelopes
                </span>
                <div className="space-y-2 text-[11px] font-mono">
                  <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-200 flex items-start gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold shrink-0">Air</span>
                    <span>{location.strata.air}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 flex items-start gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold shrink-0">Surface</span>
                    <span>{location.strata.surface}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 flex items-start gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold shrink-0">Sub</span>
                    <span>{location.strata.subsurface}</span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <span className="text-xs font-body font-500 text-slate-300">Geospatial Demarcation</span>
                <p className="text-xs font-body text-slate-400 leading-relaxed">
                  {location.description}
                </p>
              </div>

              {/* KP2 named features highlight */}
              {showKP2 && (
                <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20 space-y-1">
                  <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider">Notable Structures</span>
                  <div className="space-y-1 text-[11px] font-mono text-slate-300">
                    <div>🏛 India Expo Mart — 42,881 m² · 9m</div>
                    <div>🏫 KP-II Institute — 3,419 m² · 9m</div>
                    <div>🏛 Pt. D. Upadhyaya Archaeology — 11,670 m² · 9m</div>
                    <div>🏠 Girls' Hostel — 800 m² · 18m</div>
                    <div>🏠 Boys' Hostel — 515 m² · 12m</div>
                  </div>
                </div>
              )}
            </div>

            {/* Coordinates and Zone */}
            <div className="pt-4 border-t border-white/10 space-y-2 text-xs font-mono text-slate-400">
              <div className="flex items-center justify-between">
                <span>Zone: <span className="text-slate-300">{location.zone}</span></span>
                <span>State: <span className="text-slate-300">{location.state}</span></span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span>Lat: {location.lat.toFixed(4)}° N</span>
                <span>Lon: {location.lon.toFixed(4)}° E</span>
              </div>
              {showKP2 && (
                <div className="text-[10px] text-cyan-500/70 pt-1">
                  Centroid computed from {location.featureCount ?? 575} polygon vertex averages · OSM/QGIS export
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
