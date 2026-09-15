import { motion } from 'framer-motion';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
}

export default function Logo({ size = 'md', showWordmark = true }: LogoProps) {
  const dimensions = {
    sm: { mark: 28, text: 'text-lg' },
    md: { mark: 36, text: 'text-xl' },
    lg: { mark: 48, text: 'text-2xl' },
  };
  const dim = dimensions[size];

  return (
    <div className="flex items-center gap-2.5 select-none">
      <motion.svg
        width={dim.mark}
        height={dim.mark}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        initial={{ opacity: 0, rotate: -10 }}
        animate={{ opacity: 1, rotate: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        whileHover={{ scale: 1.08 }}
      >
        <defs>
          <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5b94ff" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id="logoGradFade" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3a74ff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* Stacked terrain contour layers — "Bhu" (land) + "Stack" (layered data) */}
        <path
          d="M10 48 Q24 40 38 44 T58 42"
          stroke="url(#logoGradFade)"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M14 40 Q26 34 38 37 T54 35"
          stroke="url(#logoGrad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.7"
        />
        <path
          d="M18 32 Q28 27 38 30 T50 28"
          stroke="url(#logoGrad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />

        {/* Faceted 3D peak / gem — the "3D" element */}
        <path d="M26 24 L32 14 L38 24 L32 30 Z" fill="url(#logoGrad)" opacity="0.95" />
        <path d="M32 14 L38 24 L32 30 Z" fill="#22d3ee" opacity="0.3" />
        <path d="M26 24 L32 14 L32 30 Z" fill="#1d56f0" opacity="0.25" />

        {/* Subtle depth lines */}
        <line x1="26" y1="24" x2="32" y2="30" stroke="#03060f" strokeWidth="0.8" opacity="0.3" />
        <line x1="38" y1="24" x2="32" y2="30" stroke="#03060f" strokeWidth="0.8" opacity="0.3" />
      </motion.svg>

      {showWordmark && (
        <span className={`font-display font-700 ${dim.text} tracking-tight text-white leading-none`}>
          Bhu<span className="text-accent-300">stack</span>
          <span className="relative inline-block ml-0.5">
            <span className="text-cyan-glow">3D</span>
          </span>
        </span>
      )}
    </div>
  );
}
