import { useRef, useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, Layers, ChevronRight, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LocationData } from '../data/locations';
import {
  generateCityBuildings,
  generateFullUlpin,
  BuildingData,
} from '../utils/ulpin';

// ─── Easing ──────────────────────────────────────────────────────────────────
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ─── Building tier by height ──────────────────────────────────────────────────
type BuildingTier = 'highrise' | 'midrise' | 'lowrise';

function getBuildingTier(h: number): BuildingTier {
  if (h > 10) return 'highrise';
  if (h > 5) return 'midrise';
  return 'lowrise';
}

const TIER_PALETTE: Record<BuildingTier, { body: number; edge: number; emissive: number; emissiveHovered: number; bodyOpacity: number; edgeOpacity: number }> = {
  highrise: {
    body: 0x00c8e8,
    edge: 0x00f2ff,
    emissive: 0x0284c7,
    emissiveHovered: 0x00f2ff,
    bodyOpacity: 0.22,
    edgeOpacity: 0.9,
  },
  midrise: {
    body: 0x0099cc,
    edge: 0x38bdf8,
    emissive: 0x075985,
    emissiveHovered: 0x38bdf8,
    bodyOpacity: 0.18,
    edgeOpacity: 0.75,
  },
  lowrise: {
    body: 0x1e6fa0,
    edge: 0x7dd3fc,
    emissive: 0x0c4a6e,
    emissiveHovered: 0x7dd3fc,
    bodyOpacity: 0.14,
    edgeOpacity: 0.6,
  },
};

// ─── City grid ────────────────────────────────────────────────────────────────
function CityGrid() {
  const geo = useMemo(() => {
    const points: number[] = [];
    const EXTENT = 24;
    const STEP = 4;
    for (let i = -EXTENT; i <= EXTENT; i += STEP) {
      points.push(-EXTENT, 0, i, EXTENT, 0, i);
      points.push(i, 0, -EXTENT, i, 0, EXTENT);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return g;
  }, []);

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={0x0a2a3a} transparent opacity={0.55} />
    </lineSegments>
  );
}

// ─── Ground plane ─────────────────────────────────────────────────────────────
function GroundPlane() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <planeGeometry args={[60, 60]} />
      <meshStandardMaterial
        color={0x030c14}
        roughness={0.92}
        metalness={0}
        transparent
        opacity={0.94}
      />
    </mesh>
  );
}

// ─── City ambient glow (rising point lights for atmosphere) ───────────────────
function CityGlowLights() {
  const positions: [number, number, number][] = [
    [-10, 0.5, -10],
    [10, 0.5, 10],
    [-10, 0.5, 10],
    [10, 0.5, -10],
    [0, 0.5, 0],
  ];
  return (
    <>
      {positions.map(([x, y, z], i) => (
        <pointLight key={i} position={[x, y, z]} intensity={0.4} color={0x003a5c} distance={18} />
      ))}
    </>
  );
}

// ─── Landmark building (centre of city) ───────────────────────────────────────
function LandmarkBuilding() {
  const meshRef = useRef<THREE.Mesh>(null);
  const scaleRef = useRef(0);
  const grown = useRef(false);
  const timer = useRef(0);

  const w = 2.8, d = 2.8, h = 18;
  const boxGeo = useMemo(() => new THREE.BoxGeometry(w, h, d), []);
  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(boxGeo), [boxGeo]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    if (!grown.current) {
      timer.current += delta;
      const t = Math.min(1, Math.max(0, (timer.current - 0.2) / 0.8));
      const eased = easeInOutCubic(t);
      scaleRef.current = eased;
      meshRef.current.scale.y = eased;
      meshRef.current.position.y = (h / 2) * eased;
      if (t >= 1) grown.current = true;
    }
    // Gentle pulse on emissive
    if (meshRef.current.material instanceof THREE.MeshStandardMaterial) {
      meshRef.current.material.emissiveIntensity =
        0.3 + Math.sin(Date.now() * 0.002) * 0.12;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Main volume */}
      <mesh ref={meshRef} scale={[1, 0, 1]} position={[0, 0, 0]}>
        <primitive object={boxGeo} attach="geometry" />
        <meshStandardMaterial
          color={0xf59e0b}
          transparent
          opacity={0.14}
          roughness={0.1}
          metalness={0.1}
          emissive={new THREE.Color(0xd97706)}
          emissiveIntensity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Gold wireframe edges */}
      <lineSegments geometry={edgeGeo} position={[0, h / 2, 0]}>
        <lineBasicMaterial color={0xfbbf24} transparent opacity={0.95} />
      </lineSegments>

      {/* Top beacon sphere */}
      <mesh position={[0, h + 0.3, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color={0xfbbf24} />
      </mesh>

      {/* Label */}
      <Html position={[0, h + 1.2, 0]} distanceFactor={22} zIndexRange={[120, 0]}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            borderRadius: '8px',
            background: 'rgba(12, 8, 2, 0.88)',
            border: '1px solid rgba(251, 191, 36, 0.7)',
            backdropFilter: 'blur(8px)',
            whiteSpace: 'nowrap',
            boxShadow: '0 0 16px rgba(251, 191, 36, 0.3)',
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', fontWeight: 700, color: '#fbbf24', letterSpacing: '0.05em' }}>
            ★ LANDMARK
          </span>
        </div>
      </Html>
    </group>
  );
}

// ─── Camera fly-down ──────────────────────────────────────────────────────────
function CameraFlyDown({ onReady }: { onReady: () => void }) {
  const { camera } = useThree();
  const progressRef = useRef(0);
  const notifiedRef = useRef(false);

  const START_Y = 80;
  const END_Y = 22;
  const DURATION = 3.2;

  useEffect(() => {
    camera.position.set(0, START_Y, 0.001);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame((_, delta) => {
    if (progressRef.current >= 1) return;

    progressRef.current = Math.min(1, progressRef.current + delta / DURATION);
    const eased = easeInOutCubic(progressRef.current);
    const y = START_Y + (END_Y - START_Y) * eased;

    camera.position.set(0, y, 0.001);
    camera.lookAt(0, 0, 0);

    if (progressRef.current >= 1 && !notifiedRef.current) {
      notifiedRef.current = true;
      onReady();
    }
  });

  return null;
}

// ─── Individual building block ────────────────────────────────────────────────
interface BuildingBlockProps {
  data: BuildingData;
  onUlpinClick: (bld: BuildingData) => void;
  flyDone: boolean;
}

function BuildingBlock({ data, onUlpinClick, flyDone }: BuildingBlockProps) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const scaleRef = useRef(0);

  const delay = useMemo(() => {
    const hash = Math.abs(Math.sin(data.position[0] * 127.1 + data.position[1] * 311.7));
    return hash * 1.2;
  }, [data.position]);
  const growTimer = useRef(0);
  const grown = useRef(false);

  const tier = getBuildingTier(data.height);
  const palette = TIER_PALETTE[tier];

  useFrame((_, delta) => {
    if (!flyDone || !meshRef.current) return;
    if (grown.current) return;

    growTimer.current += delta;
    const t = Math.min(1, Math.max(0, (growTimer.current - delay) / 0.55));
    const eased = easeInOutCubic(t);
    scaleRef.current = eased;
    meshRef.current.scale.y = eased;
    meshRef.current.position.y = (data.height / 2) * eased;

    if (t >= 1) grown.current = true;
  });

  const [w, d] = data.footprint;
  const h = data.height;
  const [bx, bz] = data.position;

  const boxGeo = useMemo(() => new THREE.BoxGeometry(w, h, d), [w, h, d]);
  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(boxGeo), [boxGeo]);

  const tierLabel = tier === 'highrise' ? 'High-Rise' : tier === 'midrise' ? 'Mid-Rise' : 'Low-Rise';

  return (
    <group position={[bx, 0, bz]}>
      <mesh
        ref={meshRef}
        scale={[1, 0, 1]}
        position={[0, 0, 0]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <primitive object={boxGeo} attach="geometry" />
        <meshStandardMaterial
          color={hovered ? palette.body : palette.body}
          transparent
          opacity={hovered ? palette.bodyOpacity + 0.12 : palette.bodyOpacity}
          roughness={0.1}
          metalness={0.05}
          emissive={new THREE.Color().setHex(hovered ? palette.emissiveHovered : palette.emissive)}
          emissiveIntensity={hovered ? 0.55 : 0.28}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Wireframe edges */}
      <lineSegments geometry={edgeGeo} position={[0, h / 2, 0]}>
        <lineBasicMaterial
          color={hovered ? palette.emissiveHovered : palette.edge}
          transparent
          opacity={hovered ? 1 : palette.edgeOpacity}
        />
      </lineSegments>

      {/* Floating ULPIN label */}
      {flyDone && (
        <Html
          position={[0, h + 0.8, 0]}
          distanceFactor={20}
          style={{ pointerEvents: 'auto', userSelect: 'none' }}
          zIndexRange={[100, 0]}
        >
          <div
            onClick={() => onUlpinClick(data)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '8px',
              background: hovered
                ? 'rgba(0, 242, 255, 0.18)'
                : 'rgba(4, 18, 32, 0.82)',
              border: `1px solid ${hovered ? 'rgba(0,242,255,0.65)' : `rgba(${tier === 'highrise' ? '0,194,232' : tier === 'midrise' ? '56,189,248' : '125,211,252'},0.3)`}`,
              backdropFilter: 'blur(8px)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease',
              boxShadow: hovered
                ? '0 0 14px rgba(0,242,255,0.35)'
                : '0 2px 8px rgba(0,0,0,0.6)',
            }}
          >
            <Building2
              size={9}
              style={{ color: hovered ? '#00f2ff' : palette.edge.toString(), flexShrink: 0 }}
            />
            <span
              style={{
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                fontSize: '8px',
                fontWeight: 600,
                color: hovered ? '#00f2ff' : '#7dd3fc',
                letterSpacing: '0.03em',
              }}
            >
              {tierLabel} · {data.floors}F
            </span>
            <span
              style={{
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                fontSize: '7.5px',
                color: hovered ? '#a5f3fc' : '#475569',
                letterSpacing: '0.02em',
              }}
            >
              {data.primaryUlpin}
            </span>
            <ChevronRight
              size={8}
              style={{ color: hovered ? '#00f2ff' : '#38bdf8', flexShrink: 0 }}
            />
          </div>
        </Html>
      )}
    </group>
  );
}

// ─── Full city scene ──────────────────────────────────────────────────────────
interface CitySceneProps {
  location: LocationData;
  onBuildingClick: (bld: BuildingData) => void;
}

function CityScene({ location, onBuildingClick }: CitySceneProps) {
  const [flyDone, setFlyDone] = useState(false);
  const buildings = useMemo(
    () => generateCityBuildings(location.id, location.state, 18),
    [location.id, location.state],
  );

  // Filter out buildings too close to center to keep landmark clear
  const filteredBuildings = useMemo(
    () => buildings.filter((b) => Math.abs(b.position[0]) > 3 || Math.abs(b.position[1]) > 3),
    [buildings],
  );

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.45} />
      <directionalLight position={[6, 14, 8]} intensity={2.4} color={0xddeeff} />
      <pointLight position={[-8, 8, -8]} intensity={0.55} color={0x4d8fff} />
      <pointLight position={[0, 6, 0]} intensity={1.4} color={0x00f2ff} />
      {/* Warm ground-level fill */}
      <pointLight position={[0, 1, 12]} intensity={0.3} color={0xfbbf24} />

      <CameraFlyDown onReady={() => setFlyDone(true)} />

      <GroundPlane />
      <CityGrid />
      <CityGlowLights />

      {/* Landmark at center */}
      <LandmarkBuilding />

      {/* Location name watermark */}
      <Html position={[0, 0.5, -22]} distanceFactor={32} zIndexRange={[50, 0]}>
        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.14)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            pointerEvents: 'none',
          }}
        >
          {location.name.split(' (')[0]}
        </div>
      </Html>

      {filteredBuildings.map((bld) => (
        <BuildingBlock
          key={bld.id}
          data={bld}
          onUlpinClick={onBuildingClick}
          flyDone={flyDone}
        />
      ))}

      {flyDone && (
        <OrbitControls
          enableZoom
          enablePan
          minDistance={6}
          maxDistance={55}
          enableDamping
          dampingFactor={0.07}
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2.1}
        />
      )}
    </>
  );
}

// ─── HUD overlay ──────────────────────────────────────────────────────────────
interface HudProps {
  location: LocationData;
  buildingCount: number;
  onClose: () => void;
}

function Hud({ location, buildingCount, onClose }: HudProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* Top bar */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-3.5 bg-space-950/75 backdrop-blur-xl border-b border-white/10"
      >
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-cyan-glow animate-pulse" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-cyan-300 font-600">
            3D Cadastral City View
          </span>
          <span className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded bg-accent-500/15 border border-accent-400/25 text-[10px] font-mono text-accent-300">
            <MapPin size={9} />
            {location.name.split(' (')[0]}
          </span>
          <span className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/25 text-[10px] font-mono text-amber-300">
            ★ Landmark at origin
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 text-[11px] font-mono text-slate-400">
            <Building2 size={12} className="text-accent-400" />
            {buildingCount} buildings · scroll to zoom · drag to orbit
          </div>
          <div className="text-[10px] font-mono text-slate-500 hidden sm:block">
            {location.ulpin}
          </div>
          <button
            onClick={onClose}
            aria-label="Close city view"
            className="flex items-center justify-center w-8 h-8 rounded-lg glass-light border border-white/10 text-slate-400 hover:text-white hover:border-error-500/40 transition-all"
          >
            <X size={15} />
          </button>
        </div>
      </motion.div>

      {/* Bottom info strip */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-2.5 bg-space-950/65 backdrop-blur-md border-t border-white/10 pointer-events-none"
      >
        <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500">
          <span>Lat {location.lat.toFixed(4)}° N</span>
          <span>Lon {location.lon.toFixed(4)}° E</span>
          <span className="text-slate-600">·</span>
          <span>{location.elevation} MSL</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-600">
          <span className="text-amber-600/80">★ Click landmark for city ULPIN</span>
          <span>·</span>
          <span>Click building tag to inspect parcel</span>
        </div>
      </motion.div>

      {/* Escape hint */}
      <EscHint />
    </>
  );
}

function EscHint() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4500);
    return () => clearTimeout(t);
  }, []);
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.4 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 pointer-events-none"
        >
          <div className="glass rounded-full px-4 py-1.5 text-[10px] font-mono text-slate-400 border border-white/10">
            Press <span className="text-white font-600">Esc</span> to close · Click a building to inspect its ULPIN
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Building detail card with floor picker ───────────────────────────────────
interface BuildingCardProps {
  data: BuildingData;
  location: LocationData;
  onNavigate: (floorUlpin: string, floor: number) => void;
  onDismiss: () => void;
}

function BuildingDetailCard({ data, location, onNavigate, onDismiss }: BuildingCardProps) {
  const [selectedFloor, setSelectedFloor] = useState<number>(1);
  const floorsToShow = Math.min(data.floors, 8);
  const tier = getBuildingTier(data.height);
  const tierLabel = tier === 'highrise' ? 'High-Rise' : tier === 'midrise' ? 'Mid-Rise' : 'Low-Rise';
  const tierColor = tier === 'highrise' ? 'text-cyan-300 border-cyan-400/30 bg-cyan-500/20'
    : tier === 'midrise' ? 'text-sky-300 border-sky-400/30 bg-sky-500/20'
    : 'text-slate-300 border-slate-400/30 bg-slate-500/20';

  const floorUlpin = generateFullUlpin(data.baseUlpin, data.floors, selectedFloor - 1, 1);

  return (
    <motion.div
      key={data.id}
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.96 }}
      transition={{ duration: 0.28 }}
      className="absolute bottom-14 left-1/2 -translate-x-1/2 z-30 w-[380px] max-w-[92vw]"
    >
      <div className="glass rounded-2xl p-5 border border-accent-500/30 glow-blue shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${tierColor}`}>
                {tierLabel}
              </span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-accent-500/20 text-accent-300 border border-accent-400/30">
                {location.classification}
              </span>
            </div>
            <h3 className="text-sm font-display font-700 text-white leading-tight">
              {location.name.split(' (')[0]}
            </h3>
            <p className="text-[11px] font-mono text-cyan-400 mt-0.5">{data.baseUlpin}</p>
          </div>
          <button
            onClick={onDismiss}
            className="text-slate-500 hover:text-white transition-colors mt-0.5 ml-3 shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-space-950/60 border border-white/5 text-center mb-4">
          <div>
            <span className="block text-[9px] font-body text-slate-400">Floors</span>
            <span className="text-xs font-mono text-white font-600">{data.floors}F</span>
          </div>
          <div>
            <span className="block text-[9px] font-body text-slate-400">Footprint</span>
            <span className="text-xs font-mono text-cyan-300 font-600">
              {(data.footprint[0] * 4.2).toFixed(0)}×{(data.footprint[1] * 4.2).toFixed(0)} m
            </span>
          </div>
          <div>
            <span className="block text-[9px] font-body text-slate-400">Height</span>
            <span className="text-xs font-mono text-white font-600">
              {(data.height * 3.1).toFixed(0)} m
            </span>
          </div>
        </div>

        {/* Floor picker */}
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Layers size={11} className="text-accent-400" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Select Floor · {data.floors} total
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: floorsToShow }, (_, i) => {
              const floor = i + 1;
              const isSelected = selectedFloor === floor;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedFloor(floor)}
                  className={`py-1.5 rounded-lg text-[10px] font-mono transition-all duration-150 ${
                    isSelected
                      ? 'bg-accent-500/30 text-cyan-300 border border-cyan-400/40 font-600'
                      : 'bg-space-950/50 text-slate-400 border border-white/5 hover:text-white hover:border-white/15'
                  }`}
                >
                  V{String(floor).padStart(2, '0')}
                </button>
              );
            })}
            {data.floors > floorsToShow && (
              <div className="col-span-4 text-[9px] font-mono text-slate-600 text-center pt-0.5">
                +{data.floors - floorsToShow} more floors above
              </div>
            )}
          </div>
          {/* Selected floor ULPIN preview */}
          <div className="mt-2.5 p-2.5 rounded-lg bg-space-950/70 border border-accent-400/20">
            <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400 mb-1">
              <span>Floor V{String(selectedFloor).padStart(2, '0')} · Full Volumetric ULPIN:</span>
            </div>
            <span className="text-[10px] font-mono text-cyan-300 font-600 tracking-tight break-all">
              {floorUlpin}
            </span>
          </div>
        </div>

        {/* Strata summary */}
        <div className="space-y-1 mb-4 text-[10px] font-mono">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-200 flex gap-2">
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold shrink-0">Air</span>
            <span>{location.strata.air}</span>
          </div>
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 flex gap-2">
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold shrink-0">Surf</span>
            <span>{location.strata.surface}</span>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => onNavigate(floorUlpin, selectedFloor)}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-body font-500 text-xs hover:from-accent-400 hover:to-accent-500 transition-all duration-200 flex items-center justify-center gap-2 group"
        >
          Open Full Parcel Record · Floor V{String(selectedFloor).padStart(2, '0')}
          <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Root exported component ──────────────────────────────────────────────────
interface CityZoomViewProps {
  location: LocationData;
  open: boolean;
  onClose: () => void;
}

export default function CityZoomView({ location, open, onClose }: CityZoomViewProps) {
  const navigate = useNavigate();
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingData | null>(null);

  const buildings = useMemo(
    () => generateCityBuildings(location.id, location.state, 18),
    [location.id, location.state],
  );

  const filteredBuildingCount = useMemo(
    () => buildings.filter((b) => Math.abs(b.position[0]) > 3 || Math.abs(b.position[1]) > 3).length,
    [buildings],
  );

  const handleBuildingClick = useCallback((bld: BuildingData) => {
    setSelectedBuilding(bld);
  }, []);

  const handleNavigate = useCallback((floorUlpin: string, floor: number) => {
    if (!selectedBuilding) return;
    navigate(`/parcel/${location.id}`, {
      state: {
        buildingUlpin: floorUlpin,
        baseUlpin: selectedBuilding.baseUlpin,
        floor,
        floors: selectedBuilding.floors,
        footprint: selectedBuilding.footprint,
        height: selectedBuilding.height,
        fromCity: true,
      },
    });
  }, [navigate, location.id, selectedBuilding]);

  const handleClose = useCallback(() => {
    setSelectedBuilding(null);
    onClose();
  }, [onClose]);

  // Dismiss card on Escape (card open)
  useEffect(() => {
    if (!selectedBuilding) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedBuilding(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selectedBuilding]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="city-zoom"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: 'easeInOut' }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
            background: 'rgba(2, 6, 14, 0.97)',
          }}
        >
          {/* Three.js city canvas */}
          <Suspense fallback={null}>
            <Canvas
              key={location.id}
              camera={{ position: [0, 80, 0.001], fov: 55, near: 0.5, far: 400 }}
              dpr={[1, 1.5]}
              gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
              style={{ width: '100%', height: '100%' }}
            >
              <CityScene location={location} onBuildingClick={handleBuildingClick} />
            </Canvas>
          </Suspense>

          {/* HUD (DOM overlay, not in canvas) */}
          <Hud location={location} buildingCount={filteredBuildingCount} onClose={handleClose} />

          {/* Building detail card */}
          <AnimatePresence>
            {selectedBuilding && (
              <BuildingDetailCard
                key={selectedBuilding.id}
                data={selectedBuilding}
                location={location}
                onNavigate={handleNavigate}
                onDismiss={() => setSelectedBuilding(null)}
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
