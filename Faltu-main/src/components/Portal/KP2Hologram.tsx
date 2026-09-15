/**
 * KP2Hologram.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders ALL 575 real GeoJSON polygon features from the KP2_PARCEL.geojson
 * dataset as extruded 3D volumes in a glowing cyan/blue hologram style.
 *
 * Each polygon is converted from WGS-84 to a shared local XZ coordinate space
 * relative to the centroid, then extruded upward by its real `est_height` value
 * (scaled to scene units). Hover shows a tooltip with the feature's area and height.
 *
 * Coordinate conversion:
 *   - centroid: 28.455785°N, 77.500042°E  (computed from all 575 features)
 *   - 1° latitude  ≈ 111,320 m  → sceneUnit = realMeters / SCALE_M_PER_UNIT
 *   - 1° longitude ≈ cos(lat) * 111,320 m
 *   - Y (up) = est_height / SCALE_M_PER_UNIT
 */

import { useRef, useState, useMemo, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

// ─── Centroid from Python analysis ─────────────────────────────────────────
const CENTROID_LAT = 28.4557850;
const CENTROID_LON = 77.5000418;

// Scale: how many scene units = 1 real metre. At 200 we get scene spans of ~16 units.
const SCALE_M_PER_UNIT = 200;

// Metres per degree helpers
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = Math.cos((CENTROID_LAT * Math.PI) / 180) * 111320;

// Height exaggeration factor so short buildings are still visible
const HEIGHT_EXAGGERATION = 1.5;

// ─── Types ──────────────────────────────────────────────────────────────────
export interface KP2Feature {
  fid: number | null;
  name: string | null;
  area_m2: number;
  est_height: number;
  building: string;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

// ─── Coordinate helpers ──────────────────────────────────────────────────────
function lonLatToLocal(lon: number, lat: number): [number, number] {
  const x = ((lon - CENTROID_LON) * M_PER_DEG_LON) / SCALE_M_PER_UNIT;
  const z = -((lat - CENTROID_LAT) * M_PER_DEG_LAT) / SCALE_M_PER_UNIT;
  return [x, z];
}

/** Convert a GeoJSON polygon ring (array of [lon,lat] pairs) to a THREE.Shape. */
function ringToShape(ring: number[][]): THREE.Shape {
  const shape = new THREE.Shape();
  const [firstX, firstZ] = lonLatToLocal(ring[0][0], ring[0][1]);
  shape.moveTo(firstX, firstZ);
  for (let i = 1; i < ring.length - 1; i++) {
    const [x, z] = lonLatToLocal(ring[i][0], ring[i][1]);
    shape.lineTo(x, z);
  }
  shape.closePath();
  return shape;
}

// ─── Material constants ──────────────────────────────────────────────────────
const MAT_BODY = {
  color: 0x00c8e8,
  transparent: true,
  opacity: 0.18,
  roughness: 0.1,
  emissive: 0x0284c7 as number,
  emissiveIntensity: 0.35,
  side: THREE.DoubleSide,
};
const MAT_BODY_HOVERED = {
  ...MAT_BODY,
  color: 0x00f2ff,
  opacity: 0.40,
  emissive: 0x00f2ff as number,
  emissiveIntensity: 0.6,
};
const MAT_EDGE_COLOR = 0x38bdf8;
const MAT_EDGE_HOVERED = 0x00f2ff;

// ─── Single building volume ──────────────────────────────────────────────────
interface FeatureMeshProps {
  feature: KP2Feature;
  onHover: (info: { name: string | null; area: number; height: number; x: number; y: number } | null) => void;
}

function FeatureMesh({ feature, onHover }: FeatureMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);
  const [hovered, setHovered] = useState(false);

  // Build shapes from polygon geometry (support both Polygon and MultiPolygon)
  const { extrudeGeo, edgesGeo, heightUnits, centroidX, centroidZ } = useMemo(() => {
    const { geometry, est_height } = feature;
    const heightUnits = (est_height * HEIGHT_EXAGGERATION) / SCALE_M_PER_UNIT;
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: heightUnits,
      bevelEnabled: false,
    };

    let rings: number[][][] = [];
    if (geometry.type === 'Polygon') {
      rings = geometry.coordinates as number[][][];
    } else {
      // MultiPolygon — use all outer rings
      (geometry.coordinates as number[][][][]).forEach((poly) => {
        rings.push(...poly);
      });
    }

    // Build combined shape from all rings
    const outerRing = rings[0];
    if (!outerRing || outerRing.length < 3) {
      return { extrudeGeo: null, edgesGeo: null, heightUnits: 0, centroidX: 0, centroidZ: 0 };
    }

    const shape = ringToShape(outerRing);
    // Add holes (inner rings)
    for (let h = 1; h < rings.length; h++) {
      const hole = ringToShape(rings[h]);
      shape.holes.push(hole);
    }

    // Compute centroid for tooltip positioning
    const pts = outerRing.map(([lon, lat]) => lonLatToLocal(lon, lat));
    const centroidX = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const centroidZ = pts.reduce((s, p) => s + p[1], 0) / pts.length;

    const extrudeGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Rotate so polygon is in XZ plane (ExtrudeGeometry uses XY)
    extrudeGeo.rotateX(-Math.PI / 2);

    const edgesGeo = new THREE.EdgesGeometry(extrudeGeo, 15);

    return { extrudeGeo, edgesGeo, heightUnits, centroidX, centroidZ };
  }, [feature]);

  const handlePointerOver = useCallback(
    (e: THREE.Event) => {
      (e as any).stopPropagation?.();
      setHovered(true);
      const worldX = centroidX;
      const worldY = heightUnits + 0.1;
      onHover({
        name: feature.name,
        area: feature.area_m2,
        height: feature.est_height,
        x: worldX,
        y: worldY,
      });
    },
    [feature, centroidX, heightUnits, onHover]
  );

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    onHover(null);
  }, [onHover]);

  if (!extrudeGeo || !edgesGeo) return null;

  return (
    <group position={[centroidX, 0, centroidZ]}>
      {/* Body mesh — centred around origin so hover centroid works */}
      <mesh
        ref={meshRef}
        geometry={extrudeGeo}
        position={[-centroidX, 0, -centroidZ]}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <meshStandardMaterial
          color={hovered ? MAT_BODY_HOVERED.color : MAT_BODY.color}
          transparent
          opacity={hovered ? MAT_BODY_HOVERED.opacity : MAT_BODY.opacity}
          roughness={MAT_BODY.roughness}
          emissive={hovered ? MAT_BODY_HOVERED.emissive : MAT_BODY.emissive}
          emissiveIntensity={hovered ? MAT_BODY_HOVERED.emissiveIntensity : MAT_BODY.emissiveIntensity}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Wireframe edges */}
      <lineSegments
        ref={edgesRef}
        geometry={edgesGeo}
        position={[-centroidX, 0, -centroidZ]}
      >
        <lineBasicMaterial
          color={hovered ? MAT_EDGE_HOVERED : MAT_EDGE_COLOR}
          transparent
          opacity={hovered ? 1.0 : 0.75}
        />
      </lineSegments>
    </group>
  );
}

// ─── Ground grid ─────────────────────────────────────────────────────────────
function GroundGrid() {
  const geo = useMemo(() => {
    const pts: number[] = [];
    const EXT = 12;
    const STEP = 1.5;
    for (let i = -EXT; i <= EXT; i += STEP) {
      pts.push(-EXT, 0, i, EXT, 0, i);
      pts.push(i, 0, -EXT, i, 0, EXT);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={0x0a2a3a} transparent opacity={0.4} />
    </lineSegments>
  );
}

// ─── Auto-fit camera ──────────────────────────────────────────────────────────
function AutoFitCamera({ features }: { features: KP2Feature[] }) {
  const { camera } = useThree();
  const fitted = useRef(false);

  useMemo(() => {
    if (fitted.current || features.length === 0) return;
    fitted.current = true;

    // Compute bounding box in scene space
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const f of features) {
      const rings = f.geometry.type === 'Polygon'
        ? (f.geometry.coordinates as number[][][])
        : (f.geometry.coordinates as number[][][][]).flat();
      for (const ring of rings) {
        for (const [lon, lat] of ring) {
          const [x, z] = lonLatToLocal(lon, lat);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minZ = Math.min(minZ, z);
          maxZ = Math.max(maxZ, z);
        }
      }
    }

    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    const span = Math.max(spanX, spanZ, 4);
    const dist = span * 1.1;

    // Position camera at angle above centre
    (camera as THREE.PerspectiveCamera).position.set(dist * 0.7, dist * 0.85, dist * 0.9);
    camera.lookAt(0, 0, 0);
    (camera as THREE.PerspectiveCamera).far = dist * 10;
    camera.updateProjectionMatrix();
  }, [features, camera]);

  return null;
}

// ─── Tooltip overlay ─────────────────────────────────────────────────────────
interface TooltipInfo {
  name: string | null;
  area: number;
  height: number;
  x: number;
  y: number;
}

function TooltipMesh({ info }: { info: TooltipInfo }) {
  return (
    <Html position={[info.x, info.y + 0.3, 0]} center distanceFactor={10}>
      <div
        style={{
          background: 'rgba(0, 10, 20, 0.92)',
          border: '1px solid rgba(0,242,255,0.5)',
          borderRadius: '8px',
          padding: '6px 10px',
          color: '#e0f7ff',
          fontFamily: 'monospace',
          fontSize: '11px',
          lineHeight: '1.6',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 0 12px rgba(0,242,255,0.3)',
        }}
      >
        {info.name && (
          <div style={{ color: '#00f2ff', fontWeight: 700, marginBottom: 2 }}>{info.name}</div>
        )}
        <div>Area: <span style={{ color: '#7dd3fc' }}>{info.area.toLocaleString('en-IN', { maximumFractionDigits: 0 })} m²</span></div>
        <div>Height: <span style={{ color: '#34d399' }}>{info.height} m</span></div>
      </div>
    </Html>
  );
}

// ─── Scene inner ─────────────────────────────────────────────────────────────
interface SceneProps {
  features: KP2Feature[];
}

function KP2Scene({ features }: SceneProps) {
  const [tooltipInfo, setTooltipInfo] = useState<TooltipInfo | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Subtle slow rotation before user interacts
  const rotated = useRef(false);
  useFrame((_, delta) => {
    if (rotated.current || !groupRef.current) return;
    // Stop auto-rotation after first orbit control usage (handled by OrbitControls itself)
  });

  const handleHover = useCallback((info: TooltipInfo | null) => {
    setTooltipInfo(info);
  }, []);

  return (
    <>
      <AutoFitCamera features={features} />

      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 15, 8]} intensity={1.4} color={0xddeeff} />
      <pointLight position={[-8, 5, -8]} intensity={1.0} color={0x00f2ff} />
      <pointLight position={[8, 2, 8]} intensity={0.5} color={0x0284c7} />

      <GroundGrid />

      {/* Concentric ground rings */}
      <mesh position={[0, -0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5, 5.05, 64]} />
        <meshBasicMaterial color={0x00f2ff} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[10, 10.05, 64]} />
        <meshBasicMaterial color={0x38bdf8} transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>

      <group ref={groupRef}>
        {features.map((feat, i) => (
          <FeatureMesh
            key={`kp2-feat-${feat.fid ?? i}`}
            feature={feat}
            onHover={handleHover}
          />
        ))}
      </group>

      {tooltipInfo && <TooltipMesh info={tooltipInfo} />}

      <OrbitControls
        enableZoom
        enablePan
        enableDamping
        dampingFactor={0.07}
        minDistance={1}
        maxDistance={40}
      />
    </>
  );
}

// ─── Loading placeholder ──────────────────────────────────────────────────────
function LoadingScene() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 rounded-full border-2 border-accent-400/30 border-t-cyan-400 animate-spin" />
      <p className="text-xs font-mono text-slate-400">Loading 575 real parcel geometries…</p>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────
interface KP2HologramProps {
  features: KP2Feature[];
}

export default function KP2Hologram({ features }: KP2HologramProps) {
  if (!features || features.length === 0) {
    return <LoadingScene />;
  }

  return (
    <div className="w-full h-full min-h-[320px] sm:min-h-[380px] relative rounded-2xl overflow-hidden bg-space-950/70 border border-accent-500/20 glow-blue">
      {/* Radial glow background */}
      <div className="absolute inset-0 bg-radial-at-c from-accent-600/10 via-space-950/80 to-space-950 pointer-events-none" />

      {/* HUD top-left */}
      <div className="absolute top-3 left-4 z-10 flex items-center gap-2 pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-cyan-300 font-semibold">
          Real QGIS Data · {features.length} Parcels Loaded
        </span>
      </div>

      {/* HUD top-right */}
      <div className="absolute top-3 right-4 z-10 font-mono text-[10px] text-slate-500 pointer-events-none">
        Drag to Rotate · Scroll to Zoom · Hover for Details
      </div>

      {/* Badge */}
      <div className="absolute bottom-3 left-4 z-10 pointer-events-none">
        <span className="px-2 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-[10px] font-mono text-cyan-300">
          KP2 · Greater Noida · OSM/QGIS Export
        </span>
      </div>

      <Canvas
        camera={{ position: [12, 10, 14], fov: 45, near: 0.01, far: 500 }}
        gl={{ alpha: true, antialias: true }}
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl }) => {
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        }}
      >
        <Suspense fallback={null}>
          <KP2Scene features={features} />
        </Suspense>
      </Canvas>
    </div>
  );
}
