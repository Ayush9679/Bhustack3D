import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  Box,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Activity,
} from 'lucide-react';

interface StratumLayer {
  id: string;
  level: string;
  title: string;
  tag: string;
  ulpin: string;
  elevation: string;
  description: string;
  color: string;
  accentBorder: string;
  bgGlow: string;
  details: string[];
}

const STRATA_LAYERS: StratumLayer[] = [
  {
    id: 'air',
    level: 'L3 · Air Rights & Penthouses',
    title: 'High-Rise Stratified Units',
    tag: 'Upper Volumetric',
    ulpin: 'ULPIN-3D: DL-07-284-Z4',
    elevation: '+45m to +120m',
    description:
      'Digital title deeds demarcating individual airspace boundaries, floor slabs, balconies, and cantilevered architecture.',
    color: 'text-cyan-glow',
    accentBorder: 'border-cyan-400/30 group-hover:border-cyan-400/60',
    bgGlow: 'from-cyan-500/10 to-transparent',
    details: ['Stratified unit ownership', 'Balcony & airspace rights', 'Solar envelope easements'],
  },
  {
    id: 'mid',
    level: 'L2 · Multi-Storey Commercial & Living',
    title: 'Stratified Floor Parcels',
    tag: 'Vertical Pods',
    ulpin: 'ULPIN-3D: DL-07-284-Z2',
    elevation: '+3.5m to +45m',
    description:
      'Solves multi-owner apartment blocks on a single survey parcel. Each unit receives an independent 3D bounding envelope.',
    color: 'text-accent-300',
    accentBorder: 'border-accent-400/30 group-hover:border-accent-400/60',
    bgGlow: 'from-accent-500/10 to-transparent',
    details: ['Independent mortgageability', 'Common area fractional ownership', 'Structural column clearance'],
  },
  {
    id: 'surface',
    level: 'L1 · Surface Cadastre',
    title: 'Base Land Parcel & Ground Survey',
    tag: 'National Base',
    ulpin: 'ULPIN: 14-DIGIT 784910283726',
    elevation: '0.0m (Ground Level)',
    description:
      'The foundational horizontal footprint aligned with Survey of India benchmark coordinates and GIS cadastral maps.',
    color: 'text-emerald-400',
    accentBorder: 'border-emerald-500/30 group-hover:border-emerald-500/60',
    bgGlow: 'from-emerald-500/10 to-transparent',
    details: ['Geo-referenced plot polygon', 'RoR & mutation sync', 'Surface road & access easements'],
  },
  {
    id: 'sub',
    level: 'L0 · Subsurface Utilities & Transit',
    title: 'Underground Infrastructure Envelopes',
    tag: 'Subterranean',
    ulpin: 'ULPIN-3D: DL-07-284-Z0',
    elevation: '-35m to 0.0m',
    description:
      'Maps metro tunnels, high-pressure gas pipelines, fiber conduits, and multi-level parking beneath registered land plots.',
    color: 'text-amber-400',
    accentBorder: 'border-amber-500/30 group-hover:border-amber-500/60',
    bgGlow: 'from-amber-500/10 to-transparent',
    details: ['Metro rail corridor easements', 'Deep utility conduits', 'Basement footprint validation'],
  },
];

const COMPARISONS = [
  {
    limitation: 'Flat 2D Cadastre (Current)',
    problem: 'Single owner per plot coordinate; apartment units and subsurface metro tunnels clash on the same parcel ID.',
    solution: 'Bhustack3D Volumetric ULPIN',
    resolved: 'True 3D bounding prisms (X, Y, Z + elevation bounds) allowing thousands of distinct legal titles per coordinate pin.',
  },
  {
    limitation: 'Disputed Air & Subterranean Rights',
    problem: 'Ambiguity over whether land ownership covers deep soil, tunnels, or high-rise vertical extensions.',
    solution: 'Parametric Stratum Deeds',
    resolved: 'Explicit upper and lower altitude limits recorded mathematically, eliminating multi-layered ownership litigation.',
  },
  {
    limitation: 'Manual Drone & Physical Inspections',
    problem: 'Time-consuming surveys that fail to visualize encroaching cantilevers or underground utilities.',
    solution: 'Digital Twin & LiDAR Fusion',
    resolved: 'Instant WebGL visualization of volumetric clashes, utility corridors, and verified spatial records in real-time.',
  },
];

export default function ConceptSection() {
  const [activeLayer, setActiveLayer] = useState<string>('mid');

  const selectedStratum = STRATA_LAYERS.find((l) => l.id === activeLayer) || STRATA_LAYERS[1];

  return (
    <section
      id="concept"
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-gradient-to-b from-space-950 via-space-900 to-space-950 py-24"
    >
      {/* Background glow effects */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/4 -left-48 w-96 h-96 rounded-full bg-accent-600/10 blur-[120px]" />
        <div className="absolute bottom-1/4 -right-48 w-96 h-96 rounded-full bg-cyan-glow/10 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 w-full">
        {/* Hackathon Badge & Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.4 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-light border border-accent-400/25 text-xs font-body text-accent-200 mb-5"
          >
            <span className="w-2 h-2 rounded-full bg-accent-400 animate-pulse" />
            <span className="font-600 uppercase tracking-wider text-[11px] text-accent-300">
              Smart India Hackathon 2026 · SIH26011
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">Ministry of Rural Development</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.4 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-display font-700 text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-tight mb-5"
          >
            3D ULPIN & <span className="gradient-text">Vertical Property</span> Mapping
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.4 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="font-body text-base sm:text-lg text-slate-300 leading-relaxed"
          >
            Traditional land cadastres only capture flat, 2D surface boundaries. Bhustack3D extends
            India&apos;s 14-digit ULPIN into the volumetric dimension — enabling legally distinct,
            tamper-proof ownership for multi-storey apartments, underground infrastructure, and air
            rights.
          </motion.p>
        </div>

        {/* Interactive 3D Stratum Visualizer + Layer Details */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mb-20">
          {/* Left: Interactive Stratum Stack */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-6 flex flex-col gap-3.5"
          >
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers size={14} className="text-accent-400" />
                Volumetric Strata Architecture
              </span>
              <span className="text-xs text-slate-500 font-mono">Select stratum to inspect</span>
            </div>

            {STRATA_LAYERS.map((layer) => {
              const isSelected = activeLayer === layer.id;
              return (
                <div
                  key={layer.id}
                  onClick={() => setActiveLayer(layer.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveLayer(layer.id);
                    }
                  }}
                  className={`group relative cursor-pointer rounded-2xl p-5 border transition-all duration-300 text-left ${
                    isSelected
                      ? `glass border-accent-400/60 bg-gradient-to-r ${layer.bgGlow} shadow-lg shadow-accent-500/10 -translate-y-1`
                      : 'glass-light border-white/5 hover:border-white/15 hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-xs text-slate-400 font-500">
                          {layer.level}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                            isSelected
                              ? 'bg-accent-500/20 text-accent-300 border-accent-400/30'
                              : 'bg-white/5 text-slate-400 border-white/10'
                          }`}
                        >
                          {layer.tag}
                        </span>
                      </div>
                      <h4 className="font-display font-600 text-base text-white group-hover:text-accent-200 transition-colors">
                        {layer.title}
                      </h4>
                    </div>

                    <div className="text-right flex flex-col items-end">
                      <span className={`text-xs font-mono font-600 ${layer.color}`}>
                        {layer.elevation}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 mt-1">
                        {layer.ulpin}
                      </span>
                    </div>
                  </div>

                  {/* Active highlight bar */}
                  {isSelected && (
                    <motion.div
                      layoutId="stratumHighlight"
                      className="absolute -left-[1px] top-3 bottom-3 w-1 rounded-r bg-accent-400"
                    />
                  )}
                </div>
              );
            })}
          </motion.div>

          {/* Right: Detailed Inspection Card for Active Layer */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-6"
          >
            <div className="glass rounded-3xl p-7 sm:p-8 border border-accent-500/20 relative overflow-hidden bg-space-900/80 shadow-2xl">
              {/* Background ambient radial */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-accent-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-center justify-between pb-5 border-b border-white/10 mb-6">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-accent-500/15 border border-accent-500/30 flex items-center justify-center text-accent-300">
                    <Box size={20} />
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                      Active Cadastral Volume
                    </span>
                    <span className="font-mono text-xs text-cyan-300 font-600">
                      {selectedStratum.ulpin}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] font-mono text-slate-400 block">Z-Elevation Range</span>
                  <span className={`text-sm font-mono font-700 ${selectedStratum.color}`}>
                    {selectedStratum.elevation}
                  </span>
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedStratum.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-5"
                >
                  <div>
                    <h3 className="font-display font-700 text-xl sm:text-2xl text-white mb-2">
                      {selectedStratum.title}
                    </h3>
                    <p className="font-body text-sm sm:text-base text-slate-300 leading-relaxed">
                      {selectedStratum.description}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-space-950/60 border border-white/5 space-y-3">
                    <span className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-success-400" />
                      Cadastral Verification Parameters
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                      {selectedStratum.details.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 text-xs font-body text-slate-300"
                        >
                          <CheckCircle2 size={13} className="text-accent-400 mt-0.5 shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Live Simulation Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <span className="text-[10px] font-mono text-slate-500 block">Z-Tolerance</span>
                      <span className="font-mono text-xs font-600 text-white">±0.05 m</span>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <span className="text-[10px] font-mono text-slate-500 block">Volume Clashes</span>
                      <span className="font-mono text-xs font-600 text-success-400">0 Detected</span>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <span className="text-[10px] font-mono text-slate-500 block">Standard</span>
                      <span className="font-mono text-xs font-600 text-accent-300">ISO 19152 LADM</span>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <span className="text-[10px] font-mono text-slate-500 block">Ledger Sync</span>
                      <span className="font-mono text-xs font-600 text-cyan-300">Immutable</span>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {/* Problem vs Solution Comparison Cards */}
        <div className="mb-14">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h3 className="font-display font-600 text-2xl text-white mb-2">
              Why 2D Cadastres Fail in Modern India
            </h3>
            <p className="font-body text-sm text-slate-400">
              Transforming horizontal parcel records into volumetric legal rights.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {COMPARISONS.map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 25 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, amount: 0.2 }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="glass rounded-2xl p-6 border border-white/10 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div>
                    <span className="text-[11px] font-mono uppercase tracking-wider text-error-400 block mb-1">
                      {item.limitation}
                    </span>
                    <p className="text-xs font-body text-slate-400 leading-relaxed">
                      {item.problem}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-white/10">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-glow flex items-center gap-1.5 mb-1">
                      <CheckCircle2 size={13} className="text-cyan-glow" />
                      {item.solution}
                    </span>
                    <p className="text-xs font-body text-slate-300 leading-relaxed font-400">
                      {item.resolved}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Prototype Summary Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 0.3 }}
          transition={{ duration: 0.5 }}
          className="glass rounded-2xl p-6 sm:p-8 border border-accent-500/20 bg-gradient-to-r from-accent-950/40 via-space-900 to-space-950 flex flex-col sm:flex-row items-center justify-between gap-6"
        >
          <div className="space-y-1.5 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 text-xs font-mono text-accent-300">
              <Activity size={14} className="text-accent-400" />
              <span>Full Prototype Integration Ready</span>
            </div>
            <h4 className="font-display font-600 text-lg sm:text-xl text-white">
              Ready to explore 3D vertical land registry for your state?
            </h4>
            <p className="font-body text-xs sm:text-sm text-slate-400 max-w-xl">
              Integrates directly with state Bhunaksha records, NGDRS registries, and GIS cadastral layers.
            </p>
          </div>

          <a
            href="#auth"
            className="shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-accent-500 to-cyan-glow text-space-950 font-display font-600 text-sm hover:opacity-95 hover:shadow-lg hover:shadow-accent-500/25 transition-all duration-200"
          >
            <span>Access 3D Portal</span>
            <ArrowRight size={16} />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
