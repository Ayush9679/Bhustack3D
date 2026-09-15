import { motion } from 'framer-motion';
import { ShieldCheck, Satellite, Lock, Zap } from 'lucide-react';

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Verified Land Records',
    description: 'Government-verified cadastral data with immutable ownership trails and survey history.',
  },
  {
    icon: Satellite,
    title: 'Real-time Satellite Data',
    description: 'Live satellite imagery updates with terrain change detection across all monitored regions.',
  },
  {
    icon: Lock,
    title: 'Secure Transactions',
    description: 'End-to-end encrypted land deal workflows with digital signatures and audit logs.',
  },
  {
    icon: Zap,
    title: 'Instant Search',
    description: 'Find any parcel, plot, or survey number in milliseconds with spatial indexing.',
  },
];

export default function Features() {
  return (
    <section
      id="features"
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-gradient-to-b from-space-850 via-space-900 to-space-950 py-20"
    >
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-accent-600/6 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 w-full">
        <div className="text-center mb-14">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.5 }}
            transition={{ duration: 0.5 }}
            className="font-display font-700 text-3xl sm:text-4xl lg:text-5xl text-white mb-4"
          >
            Built for <span className="gradient-text">precision</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.5 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-body text-base text-slate-400 max-w-xl mx-auto"
          >
            Every layer of data is engineered for accuracy, security, and speed.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false, amount: 0.2 }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                whileHover={{ y: -6 }}
                className="group glass rounded-2xl p-6 hover:border-accent-700/30 transition-colors duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-500/20 to-cyan-glow/10 border border-accent-500/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                  <Icon size={22} className="text-accent-300" />
                </div>
                <h3 className="font-display font-600 text-white text-base mb-2">
                  {feature.title}
                </h3>
                <p className="font-body text-sm text-slate-400 leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
