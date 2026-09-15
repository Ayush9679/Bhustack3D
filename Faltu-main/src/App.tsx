import { useRef, useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import IndiaFocus from './components/IndiaFocus';
import AuthSection from './components/AuthSection';
import Features from './components/Features';
import ConceptSection from './components/ConceptSection';
import Footer from './components/Footer';
import GlobeCanvas from './components/Globe';
import CityZoomView from './components/CityZoomView';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import ParcelDetailPage from './pages/ParcelDetailPage';
import AdminDashboard from './pages/AdminDashboard';
import { LocationData } from './data/locations';

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp(v: number, min: number, max: number): number {
  if (typeof v !== 'number' || isNaN(v) || !isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

function MainApp() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [indiaFocus, setIndiaFocus] = useState(0);
  const [globeScale, setGlobeScale] = useState(1);
  const [globeOpacity, setGlobeOpacity] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Search → Globe Zoom → 3D City state ──────────────────────────────────
  const [searchedLocation, setSearchedLocation] = useState<LocationData | null>(null);
  const [cityZoomOpen, setCityZoomOpen] = useState(false);

  const handleLocationSearch = useCallback((loc: LocationData) => {
    // Reset city view if a new location is searched while one is open
    setCityZoomOpen(false);
    setSearchedLocation(loc);
  }, []);

  const handleZoomReady = useCallback(() => {
    // Globe camera has settled at the city — open the 3D city view
    setCityZoomOpen(true);
  }, []);

  const handleCityClose = useCallback(() => {
    setCityZoomOpen(false);
    // Keep the city marker on the globe but reset to normal distance
    // (searchedLocation stays set so the marker + lighting remain active)
  }, []);

  const handleScroll = useCallback(() => {
    const scrollTop = window.scrollY || 0;
    const winH = window.innerHeight || 1;
    const docH = Math.max(1, (document.documentElement.scrollHeight || 0) - winH);
    const overallProgress = clamp(scrollTop / docH, 0, 1);
    setScrollProgress(overallProgress);

    const sectionIndex = scrollTop / winH;

    // India focus: ramps up during section 2 (1.0 to 2.0 viewports)
    const indiaFocusRaw = clamp((sectionIndex - 0.5) / 1.5, 0, 1);
    setIndiaFocus(easeInOutCubic(indiaFocusRaw));

    // Globe scale: full (1.0) through hero + india focus, shrinks to 0.17 from auth onward
    let scale = 1;
    if (sectionIndex <= 2) {
      scale = 1;
    } else if (sectionIndex <= 3) {
      const authProgress = clamp((sectionIndex - 2) / 1, 0, 1);
      scale = 1 - easeInOutCubic(authProgress) * 0.83;
    } else {
      scale = 0.17;
    }
    setGlobeScale(scale);

    // Globe opacity: full until end of india focus, fades to 0.35 from auth onward
    let opacity = 1;
    if (sectionIndex <= 2) {
      opacity = 1;
    } else if (sectionIndex <= 3) {
      const authProgress = clamp((sectionIndex - 2) / 1, 0, 1);
      opacity = 1 - easeInOutCubic(authProgress) * 0.65;
    } else {
      opacity = 0.35;
    }
    setGlobeOpacity(opacity);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Handle auto-scroll to #auth if navigating back from parcel detail
  useEffect(() => {
    if (window.location.hash === '#auth') {
      const timer = setTimeout(() => {
        const authEl = document.getElementById('auth');
        if (authEl) {
          authEl.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, []);

  const scrollToAuth = () => {
    const authEl = document.getElementById('auth');
    if (authEl) {
      authEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // The public marketing page ALWAYS renders completely, with the 3D globe and starfield
  // mounted in the fixed layer behind all sections. Auth state never gates or replaces this tree.
  return (
    <div ref={containerRef} className="relative w-full min-h-screen bg-space-950 overflow-x-hidden">
      {/* Fixed globe layer — stays behind all sections, recedes after section 2 */}
      <div className="fixed inset-0 w-full h-full z-0 pointer-events-auto overflow-hidden">
        <ErrorBoundary>
          <GlobeCanvas
            scrollProgress={scrollProgress}
            indiaFocus={indiaFocus}
            globeScale={globeScale}
            globeOpacity={globeOpacity}
            targetLat={searchedLocation?.lat}
            targetLon={searchedLocation?.lon}
            activeLocationName={searchedLocation?.name.split(' (')[0]}
            zoomDistance={searchedLocation && !cityZoomOpen ? 3.5 : undefined}
            searchFocus={!!searchedLocation}
            onZoomReady={searchedLocation && !cityZoomOpen ? handleZoomReady : undefined}
          />
        </ErrorBoundary>
      </div>

      <Navbar onPortalAccess={scrollToAuth} />

      {/* Content sections scroll above the fixed globe */}
      <div className="relative z-10 w-full min-h-screen">
        {/* Section 1 — Hero */}
        <Hero />

        {/* Section 2 — India Focus */}
        <IndiaFocus sectionProgress={indiaFocus} />

        {/* Section 3 — Auth & 3D Cadastre Portal */}
        <AuthSection onLocationSearch={handleLocationSearch} />

        {/* Section 4 — Features */}
        <Features />

        {/* Section 5 — Concept / 3D ULPIN */}
        <ConceptSection />

        {/* Section 6 — Footer */}
        <Footer />
      </div>

      {/* 3D City zoom overlay — mounts on top of everything once globe zoom settles */}
      {searchedLocation && (
        <CityZoomView
          location={searchedLocation}
          open={cityZoomOpen}
          onClose={handleCityClose}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainApp />} />
          <Route path="/parcel/:parcelId" element={<ParcelDetailPage />} />
          <Route path="/explore/:parcelId" element={<ParcelDetailPage />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
