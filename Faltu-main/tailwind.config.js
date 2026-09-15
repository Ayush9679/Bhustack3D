/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        space: {
          950: '#0e1526',
          900: '#131c33',
          850: '#182440',
          800: '#1f2d4e',
          700: '#273860',
          600: '#304473',
        },
        accent: {
          50: '#e8f1ff',
          100: '#c5dbff',
          200: '#8fbaff',
          300: '#5b94ff',
          400: '#3a74ff',
          500: '#1d56f0',
          600: '#0d3fc7',
          700: '#0930a0',
          800: '#072580',
          900: '#051a5c',
        },
        cyan: {
          glow: '#22d3ee',
        },
        success: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        warning: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
        error: {
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-ring': 'pulseRing 2s ease-out infinite',
        'fade-in': 'fadeIn 0.8s ease forwards',
        'slide-up': 'slideUp 0.6s ease forwards',
        'float-slow': 'floatSlow 6s ease-in-out infinite',
      },
      keyframes: {
        pulseRing: {
          '0%': { transform: 'scale(0.8)', opacity: '0.7' },
          '100%': { transform: 'scale(2.5)', opacity: '0' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
      },
    },
  },
  plugins: [],
};
