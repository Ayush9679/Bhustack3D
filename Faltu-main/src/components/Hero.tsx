import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-screen w-full overflow-hidden flex items-center"
    >
      {/* Transparent background — globe shows through from fixed layer behind */}
      {/* Subtle gradient overlay for text readability on left side only */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-space-950/80 via-space-950/30 via-40% to-transparent" />

      {/* Hero content — left side, cleanly anchored with intentional desktop edge spacing */}
      <div className="relative z-10 h-full flex flex-col justify-center w-full px-6 sm:px-10 md:px-16 lg:px-20 xl:px-24">
        <div className="w-full max-w-[620px]">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-light mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-success-400 animate-pulse" />
            <span className="text-xs font-body font-500 text-slate-300 tracking-wide">
              Geospatial Intelligence Platform
            </span>
          </motion.div>

          {/* Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35 }}
            className="font-display font-700 text-4xl sm:text-5xl lg:text-6xl leading-tight text-white mb-6 tracking-tight"
          >
            Welcome to <br />
            <span className="gradient-text text-glow">Bhustack3D</span>
          </motion.h1>

          {/* Subheading */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="font-body text-lg sm:text-xl text-slate-300 mb-10 leading-relaxed max-w-[560px]"
          >
            Explore land data, reimagined. India's terrain, parcels, and records —
            visualized in three dimensions.
          </motion.p>

          {/* CTAs — max 2 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.75 }}
            className="flex flex-col sm:flex-row items-start gap-4"
          >
            <a
              href="#india-focus"
              className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-body font-500 text-sm hover:from-accent-400 hover:to-accent-500 transition-all duration-300 hover:shadow-lg hover:shadow-accent-500/30 hover:-translate-y-0.5"
            >
              Focus Bharat 3D
              <ChevronDown size={16} className="group-hover:translate-y-0.5 transition-transform" />
            </a>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl glass-light text-white font-body font-500 text-sm hover:bg-space-700/40 transition-all duration-300 hover:-translate-y-0.5 border border-accent-800/20 hover:border-accent-700/40"
            >
              Search Land Parcels
            </a>
          </motion.div>

          {/* Subtle coordinate tag */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1 }}
            className="mt-12 flex items-center gap-3 text-xs font-body text-slate-500 tracking-wider"
          >
            <span className="text-accent-400/70">N 22.5°</span>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span className="text-accent-400/70">E 79.0°</span>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span>WGS-84 Geodetic</span>
          </motion.div>
        </div>
      </div>

      {/* Scroll-down indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2"
      >
        <span className="text-xs font-body text-slate-500 tracking-widest uppercase">Scroll</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="w-6 h-10 rounded-full border-2 border-slate-700 flex items-start justify-center p-1.5"
        >
          <div className="w-1 h-2 rounded-full bg-accent-400" />
        </motion.div>
      </motion.div>
    </section>
  );
}
