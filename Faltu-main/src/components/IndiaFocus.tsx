import { motion } from 'framer-motion';

interface IndiaFocusProps {
  sectionProgress: number;
}


export default function IndiaFocus({ sectionProgress: _sectionProgress }: IndiaFocusProps) {

  return (
    <section
      id="india-focus"
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden"
    >
      {/* Transparent background so the fixed globe shows through */}
      {/* Only a very subtle vignette for text readability */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-space-950/30 via-transparent to-space-850/40" />

      <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text content */}
          <div className="order-2 lg:order-1 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, amount: 0.3 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-light mb-6"
            >
              <span className="w-2 h-2 rounded-full bg-cyan-glow animate-pulse" />
              <span className="text-xs font-body font-500 text-cyan-glow tracking-wide">
                Bharat Focus
              </span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, amount: 0.3 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="font-display font-700 text-3xl sm:text-4xl lg:text-5xl text-white mb-6 leading-tight"
            >
              Data for every <br />
              corner of <span className="gradient-text">India</span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, amount: 0.3 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="font-body text-base sm:text-lg text-slate-300 mb-4 leading-relaxed max-w-lg mx-auto lg:mx-0"
            >
              From the Himalayan peaks to the coastal plains — Bhustack3D layers
              cadastral records, satellite imagery, and terrain data across all
              28 states and 8 union territories.
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, amount: 0.3 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="font-body text-sm text-slate-400 leading-relaxed max-w-lg mx-auto lg:mx-0"
            >
              Pan, zoom, and rotate the globe to explore any district, taluka, or
              survey number in stunning 3D detail.
            </motion.p>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, amount: 0.3 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="grid grid-cols-3 gap-4 mt-10 max-w-md mx-auto lg:mx-0"
            >
              {[
                { value: '2.4M+', label: 'Digitized Records' },
                { value: '100%', label: 'State Coverage' },
                { value: '3D', label: 'Cadastral Layers' },
              ].map((stat) => (
                <div key={stat.label} className="text-center lg:text-left">
                  <div className="font-display font-700 text-2xl text-white">{stat.value}</div>
                  <div className="font-body text-xs text-slate-400 mt-1">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right side — globe interaction hint card */}
          <div className="order-1 lg:order-2 flex items-center justify-center">
            <div className="relative">
              <div className="absolute -inset-20 rounded-full bg-gradient-to-br from-accent-600/10 to-cyan-glow/5 blur-2xl animate-pulse" />
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="relative glass rounded-2xl px-6 py-5 max-w-xs"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-3 h-3 rounded-full bg-cyan-glow animate-pulse-ring" />
                  <span className="font-display font-600 text-white text-lg">Bharat</span>
                </div>
                <p className="font-body text-xs text-slate-300 leading-relaxed">
                  Lat 22.5°N · Lon 79.0°E
                </p>
                <p className="font-body text-xs text-slate-400 mt-1">
                  Center of the Indian subcontinent
                </p>
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-xs font-body text-slate-500">
                    Drag the globe to explore · Scroll to continue
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
