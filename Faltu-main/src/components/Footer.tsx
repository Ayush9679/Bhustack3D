import { motion } from 'framer-motion';
import { Github, Twitter, Linkedin, Mail } from 'lucide-react';
import Logo from './Logo';

const LINKS = {
  About: ['Our Mission', 'Team', 'Careers', 'Press'],
  Resources: ['Documentation', 'API Reference', 'Help Center', 'Status'],
  Legal: ['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'Security'],
};

const SOCIALS = [
  { icon: Twitter, href: '#' },
  { icon: Github, href: '#' },
  { icon: Linkedin, href: '#' },
  { icon: Mail, href: '#' },
];

export default function Footer() {
  return (
    <footer
      id="footer"
      className="relative w-full overflow-hidden bg-space-950 border-t border-accent-800/15 pt-16 pb-8"
    >
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] rounded-full bg-accent-600/5 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <Logo size="md" />
            <p className="font-body text-sm text-slate-500 mt-5 max-w-xs leading-relaxed">
              3D geospatial land intelligence for India. Explore terrain, parcels,
              and records in three dimensions.
            </p>
            <div className="flex gap-3 mt-6">
              {SOCIALS.map((social, idx) => {
                const Icon = social.icon;
                return (
                  <motion.a
                    key={idx}
                    href={social.href}
                    whileHover={{ y: -3 }}
                    className="w-9 h-9 rounded-lg glass-light flex items-center justify-center text-slate-400 hover:text-accent-300 hover:border-accent-700/30 transition-all duration-200"
                  >
                    <Icon size={16} />
                  </motion.a>
                );
              })}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(LINKS).map(([category, items]) => (
            <div key={category}>
              <h4 className="font-display font-600 text-white text-sm mb-4">{category}</h4>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-sm font-body text-slate-500 hover:text-accent-300 transition-colors duration-200"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs font-body text-slate-600">
            © 2026 Bhustack3D. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-xs font-body text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse" />
            <span>All systems operational</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
