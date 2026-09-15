import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  MapPin,
  LogOut,
  Layers,
  Box,
  Compass,
  CheckCircle2,
  ShieldCheck,
  Building2,
  ExternalLink,
  ChevronRight,
  Database,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import GlobeCanvas from '../Globe';
import ErrorBoundary from '../ErrorBoundary';
import ParcelHologram from './ParcelHologram';
import Logo from '../Logo';
import { INDIAN_LOCATIONS, LocationData } from '../../data/locations';



export default function PortalView() {
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<LocationData>(INDIAN_LOCATIONS[0]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeStratum, setActiveStratum] = useState<'all' | 'air' | 'surface' | 'subsurface'>('all');
  const [showHologram, setShowHologram] = useState(true);
  const [zoomDistance, setZoomDistance] = useState(5.4);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredLocations = useMemo(() => {
    if (!searchQuery.trim()) return INDIAN_LOCATIONS;
    const q = searchQuery.toLowerCase();
    return INDIAN_LOCATIONS.filter(
      (loc) =>
        loc.name.toLowerCase().includes(q) ||
        loc.state.toLowerCase().includes(q) ||
        loc.ulpin.toLowerCase().includes(q) ||
        loc.classification.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const handleSelectLocation = (loc: LocationData) => {
    if (loc.id === selectedLocation.id && showHologram) {
      setIsDropdownOpen(false);
      return;
    }

    setSelectedLocation(loc);
    setIsDropdownOpen(false);
    setSearchQuery('');

    // Smoothly zoom out slightly, rotate globe, and then zoom in to trigger hologram reveal
    setShowHologram(false);
    setZoomDistance(6.5);

    setTimeout(() => {
      setZoomDistance(4.4);
    }, 400);

    setTimeout(() => {
      setShowHologram(true);
    }, 1100);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      setIsSigningOut(false);
    }
  };

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : 'U';

  const roleText = (user?.role || 'CITIZEN').toUpperCase();

  return (
    <div className="relative w-full min-h-screen bg-space-950 text-white overflow-x-hidden flex flex-col">
      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-10 left-10 w-96 h-96 rounded-full bg-accent-600/10 blur-[140px]" />
        <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-cyan-glow/10 blur-[140px]" />
      </div>

      {/* Top Portal Navigation Bar */}
      <header className="relative z-30 w-full glass border-b border-white/10 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-white/10">
            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-accent-500/20 text-accent-300 border border-accent-400/30">
              3D CADASTRE PORTAL
            </span>
            <span className="text-[11px] font-body text-slate-400">
              National Land Records Modernization
            </span>
          </div>
        </div>

        {/* Top-right Profile Chip & Sign Out */}
        <div className="flex items-center gap-3">
          <div className="glass-light rounded-full pl-1.5 pr-4 py-1.5 flex items-center gap-2.5 border border-white/10">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-accent-600 to-cyan-400 flex items-center justify-center text-xs font-display font-700 text-space-950 shadow-md">
              {initials}
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-body font-600 text-white leading-tight">
                {user?.name || 'Authorized User'}
              </span>
              <span className="text-[10px] font-mono text-accent-300 tracking-wider">
                {roleText}
              </span>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="p-2 rounded-xl glass-light border border-white/10 text-slate-300 hover:text-error-400 hover:border-error-500/30 transition-all duration-200 group flex items-center gap-1.5 text-xs font-body"
            title="Sign Out"
          >
            <LogOut size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden md:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Portal Split Screen View */}
      <main className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-[calc(100vh-65px)]">
        {/* LEFT COLUMN: 3D Interactive Globe (reused Globe component, anchored to left half) */}
        <section className="lg:col-span-5 xl:col-span-5 relative min-h-[420px] lg:min-h-full border-b lg:border-b-0 lg:border-r border-white/10 overflow-hidden bg-space-950/40 flex flex-col justify-between">
          {/* Globe Canvas Container */}
          <div className="absolute inset-0 w-full h-full pointer-events-auto">
            <ErrorBoundary>
              <GlobeCanvas
                scrollProgress={1}
                indiaFocus={1}
                globeScale={1}
                globeOpacity={1}
                targetLat={selectedLocation.lat}
                targetLon={selectedLocation.lon}
                zoomDistance={zoomDistance}
                activeLocationName={selectedLocation.name.split(' (')[0]}
              />
            </ErrorBoundary>
          </div>

          {/* Top Left Globe HUD Overlay */}
          <div className="relative z-10 p-5 pointer-events-none">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-accent-500/30 text-xs font-mono text-accent-200">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>Geo-Spatial Cadastre Active</span>
            </div>
          </div>

          {/* Bottom Left Globe Coordinates & Controls */}
          <div className="relative z-10 p-5 bg-gradient-to-t from-space-950 via-space-950/60 to-transparent pointer-events-none">
            <div className="glass rounded-xl p-3 border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono">
                <Compass size={15} className="text-cyan-400 shrink-0" />
                <span className="text-slate-400">Target:</span>
                <span className="text-white font-600">
                  {selectedLocation.lat.toFixed(4)}° N, {selectedLocation.lon.toFixed(4)}° E
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent-500/20 text-accent-300">
                WGS-84
              </span>
            </div>
            <p className="text-[11px] font-body text-slate-400 mt-2 text-center">
              Drag globe to rotate • Scroll to zoom • Click a location to fly
            </p>
          </div>
        </section>

        {/* RIGHT COLUMN: Search, Cadastral Navigation & 3D Hologram Detail */}
        <section className="lg:col-span-7 xl:col-span-7 p-4 sm:p-7 flex flex-col gap-5 overflow-y-auto">
          {/* Search Bar & Auto-Suggestions */}
          <div className="relative w-full">
            <div className="relative flex items-center">
              <Search size={18} className="absolute left-4 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsDropdownOpen(true);
                }}
                onFocus={() => setIsDropdownOpen(true)}
                placeholder="Search a location, plot ID, or region (e.g. New Delhi, Mumbai, ULPIN)..."
                className="w-full pl-11 pr-24 py-3.5 rounded-2xl glass border border-white/15 text-sm font-body text-white placeholder:text-slate-500 outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-500/20 transition-all duration-200"
              />
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="absolute right-3 px-3 py-1.5 rounded-xl bg-accent-500/20 border border-accent-400/30 text-xs font-mono text-accent-300 hover:bg-accent-500/30 transition-colors"
              >
                Locations ({INDIAN_LOCATIONS.length})
              </button>
            </div>

            {/* Dropdown Suggestions */}
            <AnimatePresence>
              {isDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.18 }}
                  className="absolute top-full left-0 right-0 mt-2 z-50 glass rounded-2xl border border-accent-500/30 bg-space-900/95 shadow-2xl backdrop-blur-xl overflow-hidden max-h-72 overflow-y-auto"
                >
                  <div className="p-2 space-y-1">
                    {filteredLocations.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400 font-body">
                        No locations matching "{searchQuery}". Select from presets below.
                      </div>
                    ) : (
                      filteredLocations.map((loc) => (
                        <div
                          key={loc.id}
                          onClick={() => handleSelectLocation(loc)}
                          className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                            loc.id === selectedLocation.id
                              ? 'bg-accent-500/20 border border-accent-400/40 text-white'
                              : 'hover:bg-white/5 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-accent-500/15 flex items-center justify-center text-accent-300">
                              <MapPin size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-body font-500 text-white leading-tight">
                                {loc.name}
                              </p>
                              <p className="text-xs font-mono text-slate-400">{loc.ulpin}</p>
                            </div>
                          </div>
                          <span className="text-xs font-mono text-cyan-300 font-600">
                            {loc.elevation}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Quick-select Location Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <span className="text-xs font-mono text-slate-400 shrink-0 flex items-center gap-1">
              <MapPin size={13} className="text-accent-400" /> Presets:
            </span>
            {INDIAN_LOCATIONS.map((loc) => {
              const isSelected = loc.id === selectedLocation.id;
              return (
                <button
                  key={loc.id}
                  onClick={() => handleSelectLocation(loc)}
                  className={`px-3 py-1.5 rounded-full text-xs font-body whitespace-nowrap transition-all duration-200 ${
                    isSelected
                      ? 'bg-gradient-to-r from-accent-500 to-accent-600 text-white shadow-md shadow-accent-500/25 border border-accent-400/40 font-500'
                      : 'glass-light border border-white/5 text-slate-400 hover:text-white hover:border-white/15'
                  }`}
                >
                  {loc.name.split(' (')[0]}
                </button>
              );
            })}
          </div>

          {/* 3D Hologram Detail View Card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedLocation.id}
              initial={{ opacity: 0, scale: 0.97, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -15 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="glass rounded-3xl p-5 sm:p-6 border border-accent-500/25 relative overflow-hidden bg-space-900/60 shadow-2xl flex flex-col gap-5"
            >
              {/* Card Header: Location Name, ULPIN & Status */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 font-600">
                      3D ULPIN CADASTRE
                    </span>
                    <span className="text-xs font-body text-slate-400">• {selectedLocation.state}</span>
                  </div>
                  <h2 className="font-display font-700 text-2xl text-white tracking-tight">
                    {selectedLocation.name}
                  </h2>
                  <p className="text-xs font-mono text-accent-300 font-500 mt-0.5">
                    {selectedLocation.ulpin}
                  </p>
                </div>

                <div className="flex items-center gap-2 sm:self-start">
                  <div className="px-3 py-1.5 rounded-xl glass border border-success-400/30 flex items-center gap-2 text-xs font-mono text-success-300">
                    <ShieldCheck size={14} className="text-success-400" />
                    <span>ISO 19152 LADM Verified</span>
                  </div>
                </div>
              </div>

              {/* 3D Hologram Visualization Canvas */}
              <div className="relative">
                {showHologram ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    <ParcelHologram activeStratum={activeStratum} />
                  </motion.div>
                ) : (
                  <div className="w-full h-[320px] rounded-2xl glass flex flex-col items-center justify-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-accent-400/30 border-t-accent-400 animate-spin" />
                    <p className="text-xs font-mono text-slate-400">
                      Rotating Globe & Aligning 3D Coordinates...
                    </p>
                  </div>
                )}

                {/* Stratum Filter Buttons inside Hologram card */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {[
                    { id: 'all', label: 'All Strata' },
                    { id: 'air', label: 'L3 Air Rights' },
                    { id: 'surface', label: 'L1 Surface Cadastre' },
                    { id: 'subsurface', label: 'L0 Subterranean' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveStratum(tab.id as any)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono transition-all duration-200 ${
                        activeStratum === tab.id
                          ? 'bg-accent-500/30 text-cyan-300 border border-cyan-400/40 font-600'
                          : 'glass-light text-slate-400 hover:text-white border border-white/5'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mock Metadata Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl glass-light border border-white/5">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                    Footprint Area
                  </span>
                  <span className="text-sm font-mono font-600 text-white">
                    {selectedLocation.area}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl glass-light border border-white/5">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                    Enclosed Volume
                  </span>
                  <span className="text-sm font-mono font-600 text-cyan-300">
                    {selectedLocation.volume}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl glass-light border border-white/5">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                    Elevation Datum
                  </span>
                  <span className="text-sm font-mono font-600 text-emerald-400">
                    {selectedLocation.elevation}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl glass-light border border-white/5">
                  <span className="text-[10px] font-mono uppercase text-slate-500 block mb-1">
                    Planning Zone
                  </span>
                  <span className="text-xs font-body font-500 text-amber-300 truncate block">
                    {selectedLocation.zone}
                  </span>
                </div>
              </div>

              {/* Strata Details Breakdown */}
              <div className="p-4 rounded-xl bg-space-950/70 border border-white/5 space-y-2">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
                  <Layers size={14} className="text-accent-400" />
                  Volumetric Stratum Rights
                </span>
                <div className="space-y-1.5 text-xs font-body">
                  <div className="flex items-center justify-between text-slate-300 py-1 border-b border-white/5">
                    <span className="text-slate-400">Air Rights (L3):</span>
                    <span className="font-mono text-cyan-300">{selectedLocation.strata.air}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300 py-1 border-b border-white/5">
                    <span className="text-slate-400">Surface Cadastre (L1):</span>
                    <span className="font-mono text-emerald-300">{selectedLocation.strata.surface}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300 py-1">
                    <span className="text-slate-400">Subterranean (L0):</span>
                    <span className="font-mono text-amber-300">{selectedLocation.strata.subsurface}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  onClick={() => alert(`Exporting 3D Land Title for ${selectedLocation.ulpin} (CityGML & GeoJSON)`)}
                  className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-body font-500 text-xs hover:from-accent-400 hover:to-accent-500 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-accent-500/25"
                >
                  <Database size={14} />
                  <span>Export 3D Land Title Deed</span>
                </button>
                <button
                  onClick={() => alert(`Simulating smart-contract mutation audit for ${selectedLocation.ulpin}`)}
                  className="w-full sm:w-auto py-2.5 px-4 rounded-xl glass-light border border-white/10 text-slate-300 hover:text-white text-xs font-body font-500 transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink size={14} />
                  <span>Audit Mutation Log</span>
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </section>
      </main>
    </div>
  );
}
