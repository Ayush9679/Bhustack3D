import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  LogOut,
  MapPin,
  Layers,
  Search,
  Box,
  Compass,
  Building2,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { INDIAN_LOCATIONS, LocationData } from '../data/locations';

type Tab = 'login' | 'signup';
type FieldState = 'idle' | 'error' | 'success';

interface ToastState {
  visible: boolean;
  name: string;
}

export default function AuthSection({ onLocationSearch }: { onLocationSearch?: (loc: LocationData) => void }) {
  const navigate = useNavigate();
  const { user, login, signup, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('login');
  const [toast, setToast] = useState<ToastState>({ visible: false, name: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Authenticated portal state
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = () => {
    setToast((prev) => ({ ...prev, visible: false }));
  };

  // Auto-dismiss toast after 3.5s
  useEffect(() => {
    if (toast.visible) {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(dismissToast, 3500);
    }
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [toast.visible]);

  // Dismiss toast if user scrolls away from this section
  useEffect(() => {
    const onScroll = () => {
      const el = sectionRef.current;
      if (!el || !toast.visible) return;
      const rect = el.getBoundingClientRect();
      const inView = rect.bottom > 100 && rect.top < window.innerHeight - 100;
      if (!inView) dismissToast();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [toast.visible]);

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

  const validate = (form: HTMLFormElement): boolean => {
    const newErrors: Record<string, string> = {};
    const formData = new FormData(form);

    const email = ((formData.get('email') as string) || '').trim();
    const password = (formData.get('password') as string) || '';

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      newErrors.email = 'Enter a valid email address';
    }
    if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (tab === 'signup') {
      const name = ((formData.get('name') as string) || '').trim();
      const confirm = (formData.get('confirmPassword') as string) || '';
      if (name.length < 2) {
        newErrors.name = 'Enter your name (minimum 2 characters)';
      }
      if (confirm !== password) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setGeneralError(null);
    const form = e.currentTarget;
    if (!validate(form)) return;

    const formData = new FormData(form);
    const email = ((formData.get('email') as string) || '').trim();
    const password = (formData.get('password') as string) || '';
    const name = ((formData.get('name') as string) || '').trim();

    setIsSubmitting(true);
    try {
      if (tab === 'login') {
        const res = await login(email, password);
        setToast({ visible: true, name: res.user.name });
      } else {
        const res = await signup(name, email, password);
        setToast({ visible: true, name: res.user.name });
      }
    } catch (err: any) {
      const msg = err?.message || 'Authentication failed. Please check your credentials.';
      const msgLower = msg.toLowerCase();
      if (msgLower.includes('email') || msgLower.includes('already exists') || msgLower.includes('registered')) {
        setErrors((prev) => ({ ...prev, email: msg }));
      } else if (msgLower.includes('password') || msgLower.includes('credential')) {
        setErrors((prev) => ({ ...prev, password: msg }));
      } else {
        setGeneralError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      setIsSigningOut(false);
    }
  };

  const fieldState = (field: string): FieldState => {
    if (errors[field]) return 'error';
    return 'idle';
  };

  const borderClass = (field: string) => {
    const state = fieldState(field);
    if (state === 'error') return 'border-error-500/60 focus:border-error-500';
    return 'border-white/10 focus:border-accent-500/50';
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
    <section
      ref={sectionRef}
      id="auth"
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-transparent py-20"
    >
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/4 w-96 h-96 rounded-full bg-accent-600/8 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full bg-cyan-glow/5 blur-3xl" />
      </div>

      {user ? (
        /* ================= AUTHENTICATED PORTAL VIEW ================= */
        <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6">
          {/* User Header Chip */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 glass rounded-2xl p-4 sm:p-5 mb-6 glow-blue">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-accent-600 to-cyan-400 flex items-center justify-center text-sm font-display font-700 text-space-950 shadow-md">
                {initials}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-display font-700 text-white leading-tight">
                    {user.name}
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent-500/20 text-accent-300 border border-accent-400/30">
                    {roleText}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                    <ShieldCheck size={12} /> Verified
                  </span>
                </div>
                <p className="text-xs font-body text-slate-400">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-space-950/60 border border-white/10 text-xs font-mono text-cyan-300">
                <Compass size={13} />
                <span>3D Cadastre Mode</span>
              </div>
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="px-4 py-2 rounded-xl glass-light border border-white/10 text-slate-300 hover:text-error-400 hover:border-error-500/30 transition-all duration-200 group flex items-center gap-2 text-xs font-body"
              >
                <LogOut size={15} className="group-hover:-translate-x-0.5 transition-transform" />
                <span>{isSigningOut ? 'Signing out...' : 'Sign Out'}</span>
              </button>
            </div>
          </div>

          {/* Search and Location Presets */}
          <div className="glass rounded-2xl p-5 mb-6 space-y-4">
            <div className="relative">
              <div className="relative flex items-center">
                <Search size={18} className="absolute left-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const loc = filteredLocations[0];
                      if (!loc) return;
                      console.log('[Search] Enter pressed → navigating to /parcel/' + loc.id, loc);
                      setIsDropdownOpen(false);
                      setSearchQuery('');
                      if (onLocationSearch) onLocationSearch(loc);
                      navigate(`/parcel/${loc.id}`);
                    }
                  }}
                  placeholder="Search cadastral parcel by location or ULPIN (e.g. Delhi, Mumbai, DL-07)..."
                  className="w-full pl-11 pr-28 py-3 rounded-xl bg-space-950/60 border border-white/10 text-sm font-body text-white placeholder:text-slate-500 outline-none focus:border-accent-500/50 transition-all"
                />
                <span className="absolute right-3 text-xs font-mono text-slate-400 px-2 py-1 rounded bg-white/5">
                  {INDIAN_LOCATIONS.length} Parcels
                </span>
              </div>

              {/* Dropdown */}
              <AnimatePresence>
                {isDropdownOpen && searchQuery && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="absolute top-full left-0 right-0 mt-2 z-50 glass rounded-xl border border-accent-500/30 bg-space-900/95 shadow-2xl p-2 max-h-60 overflow-y-auto"
                  >
                    {filteredLocations.map((loc) => (
                      <div
                        key={loc.id}
                        onClick={() => {
                          console.log('[Search] Dropdown click → navigating to /parcel/' + loc.id, loc);
                          setIsDropdownOpen(false);
                          setSearchQuery('');
                          if (onLocationSearch) onLocationSearch(loc);
                          navigate(`/parcel/${loc.id}`);
                        }}
                        className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/10 cursor-pointer text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <MapPin size={14} className="text-accent-400" />
                          <div>
                            <span className="text-white font-500">{loc.name}</span>
                            <span className="text-slate-400 ml-2 font-mono">({loc.ulpin})</span>
                          </div>
                        </div>
                        <span className="text-cyan-300 font-mono">{loc.elevation}</span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Presets */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <span className="text-xs font-mono text-slate-400 shrink-0 flex items-center gap-1">
                <MapPin size={13} className="text-accent-400" /> Presets:
              </span>
              {INDIAN_LOCATIONS.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => {
                    console.log('[Search] Preset chip click → navigating to /parcel/' + loc.id, loc);
                    if (onLocationSearch) onLocationSearch(loc);
                    navigate(`/parcel/${loc.id}`);
                  }}
                  className="px-3 py-1.5 rounded-full text-xs font-body whitespace-nowrap transition-all duration-200 bg-space-950/50 hover:bg-accent-500/20 hover:text-white text-slate-300 border border-white/10 hover:border-accent-500/30"
                >
                  {loc.name.split(' (')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Cadastral Registry Quick Launch & Featured 3D Parcels */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              onClick={() => navigate('/parcel/pune')}
              className="glass rounded-xl p-4 border border-white/10 hover:border-accent-500/40 hover:bg-white/5 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-accent-500/20 text-accent-300 border border-accent-400/30">
                  Featured 3D Parcel
                </span>
                <ArrowRight size={14} className="text-slate-400 group-hover:text-accent-400 group-hover:translate-x-1 transition-all" />
              </div>
              <h4 className="text-sm font-display font-700 text-white">Pune (Hinjawadi IT Park)</h4>
              <p className="text-[11px] font-mono text-cyan-400 mt-0.5">ULPIN-3D: MH-12-HW-8820-Z3</p>
              <p className="text-xs font-body text-slate-400 mt-2 line-clamp-2">
                Industrial & Biotech Volumetric cluster with subterranean cryogenic vaults.
              </p>
            </div>

            <div
              onClick={() => navigate('/parcel/delhi')}
              className="glass rounded-xl p-4 border border-white/10 hover:border-cyan-500/40 hover:bg-white/5 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                  NCT Capital
                </span>
                <ArrowRight size={14} className="text-slate-400 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
              </div>
              <h4 className="text-sm font-display font-700 text-white">New Delhi (Connaught Place)</h4>
              <p className="text-[11px] font-mono text-cyan-400 mt-0.5">ULPIN-3D: DL-07-CP-284-Z4</p>
              <p className="text-xs font-body text-slate-400 mt-2 line-clamp-2">
                High-density commercial precinct with stratified rooftop air rights.
              </p>
            </div>

            <div
              onClick={() => navigate('/parcel/mumbai')}
              className="glass rounded-xl p-4 border border-white/10 hover:border-emerald-500/40 hover:bg-white/5 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Financial Hub
                </span>
                <ArrowRight size={14} className="text-slate-400 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
              </div>
              <h4 className="text-sm font-display font-700 text-white">Mumbai (BKC)</h4>
              <p className="text-[11px] font-mono text-cyan-400 mt-0.5">ULPIN-3D: MH-02-BKC-9102-Z2</p>
              <p className="text-xs font-body text-slate-400 mt-2 line-clamp-2">
                Premier financial cluster utilizing 3D vertical title demarcation.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ================= UNAUTHENTICATED LOGIN / SIGN UP VIEW ================= */
        <div className="relative z-10 w-full max-w-md mx-auto px-5 sm:px-8">
          <div className="text-center mb-8">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, amount: 0.5 }}
              transition={{ duration: 0.5 }}
              className="font-display font-700 text-3xl sm:text-4xl text-white mb-3"
            >
              Access the <span className="gradient-text">Portal</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, amount: 0.5 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="font-body text-sm text-slate-400"
            >
              Sign in to manage land records and transactions
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.6 }}
            className="glass rounded-2xl p-6 sm:p-8 glow-blue"
          >
            {/* Tab switcher */}
            <div className="flex gap-1 p-1 rounded-xl bg-space-950/50 mb-6">
              <button
                onClick={() => { setTab('login'); setErrors({}); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-body font-500 transition-all duration-300 ${
                  tab === 'login'
                    ? 'bg-gradient-to-r from-accent-500 to-accent-600 text-white shadow-lg shadow-accent-600/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Login
              </button>
              <button
                onClick={() => { setTab('signup'); setErrors({}); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-body font-500 transition-all duration-300 ${
                  tab === 'signup'
                    ? 'bg-gradient-to-r from-accent-500 to-accent-600 text-white shadow-lg shadow-accent-600/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign Up
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.form
                key={tab}
                initial={{ opacity: 0, x: tab === 'login' ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: tab === 'login' ? 20 : -20 }}
                transition={{ duration: 0.25 }}
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                {tab === 'signup' && (
                  <div>
                    <label className="block text-xs font-body font-500 text-slate-400 mb-1.5">Full Name</label>
                    <div className="relative">
                      <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        name="name"
                        type="text"
                        placeholder="Aarav Sharma"
                        className={`w-full pl-10 pr-4 py-3 rounded-xl bg-space-950/50 border ${borderClass('name')} text-sm font-body text-white placeholder:text-slate-600 outline-none transition-all duration-200`}
                      />
                    </div>
                    {errors.name && (
                      <p className="flex items-center gap-1.5 mt-1.5 text-xs text-error-400">
                        <AlertCircle size={12} /> {errors.name}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-body font-500 text-slate-400 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      className={`w-full pl-10 pr-4 py-3 rounded-xl bg-space-950/50 border ${borderClass('email')} text-sm font-body text-white placeholder:text-slate-600 outline-none transition-all duration-200`}
                    />
                  </div>
                  {errors.email && (
                    <p className="flex items-center gap-1.5 mt-1.5 text-xs text-error-400">
                      <AlertCircle size={12} /> {errors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-body font-500 text-slate-400 mb-1.5">Password</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      className={`w-full pl-10 pr-4 py-3 rounded-xl bg-space-950/50 border ${borderClass('password')} text-sm font-body text-white placeholder:text-slate-600 outline-none transition-all duration-200`}
                    />
                  </div>
                  {errors.password && (
                    <p className="flex items-center gap-1.5 mt-1.5 text-xs text-error-400">
                      <AlertCircle size={12} /> {errors.password}
                    </p>
                  )}
                </div>

                {tab === 'login' && (
                  <div className="flex justify-end">
                    <button type="button" className="text-xs font-body text-accent-400 hover:text-accent-300 transition-colors">
                      Forgot password?
                    </button>
                  </div>
                )}

                {tab === 'signup' && (
                  <div>
                    <label className="block text-xs font-body font-500 text-slate-400 mb-1.5">Confirm Password</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        name="confirmPassword"
                        type="password"
                        placeholder="••••••••"
                        className={`w-full pl-10 pr-4 py-3 rounded-xl bg-space-950/50 border ${borderClass('confirmPassword')} text-sm font-body text-white placeholder:text-slate-600 outline-none transition-all duration-200`}
                      />
                    </div>
                    {errors.confirmPassword && (
                      <p className="flex items-center gap-1.5 mt-1.5 text-xs text-error-400">
                        <AlertCircle size={12} /> {errors.confirmPassword}
                      </p>
                    )}
                  </div>
                )}

                {generalError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-error-500/10 border border-error-500/30 text-xs text-error-400 font-body">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{generalError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-body font-500 text-sm hover:from-accent-400 hover:to-accent-500 transition-all duration-300 hover:shadow-lg hover:shadow-accent-500/30 flex items-center justify-center gap-2 group disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <>
                      {tab === 'login' ? 'Sign In' : 'Create Account'}
                      <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>
              </motion.form>
            </AnimatePresence>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs font-body text-slate-600">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Google button */}
            <button
              onClick={() => {
                setToast({ visible: true, name: 'Google User' });
              }}
              className="w-full py-3 rounded-xl bg-space-950/50 border border-white/10 text-white font-body font-500 text-sm hover:bg-space-800/50 hover:border-white/20 transition-all duration-300 flex items-center justify-center gap-3"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Continue with Google
            </button>
          </motion.div>
        </div>
      )}

      {/* Toast notification */}
      <AnimatePresence>
        {toast.visible && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-8 left-1/2 z-50 glass rounded-xl px-5 py-3.5 flex items-center gap-3 glow-blue"
          >
            <CheckCircle2 size={20} className="text-success-400" />
            <span className="text-sm font-body text-white">
              Signed in as <span className="font-500 text-accent-300">{toast.name}</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
