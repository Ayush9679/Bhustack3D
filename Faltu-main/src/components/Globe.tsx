import { useRef, useMemo, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Stars, OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

export interface GlobeProps {
  scrollProgress?: number;
  indiaFocus?: number;
  globeScale?: number;
  globeOpacity?: number;
  targetLat?: number;
  targetLon?: number;
  zoomDistance?: number;
  activeLocationName?: string;
  /** Called once when the camera has settled at zoomDistance (±0.08 units). */
  onZoomReady?: () => void;
  /** When true, keeps the fill light at full intensity regardless of indiaFocus. */
  searchFocus?: boolean;
}



const EARTH_RADIUS = 2.5;

function latLongToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Subtle, soft atmosphere rim glow (thin Fresnel-based edge glow)
function Atmosphere() {
  const atmosphereMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          // Thin Fresnel-based edge glow strictly at the silhouette limb
          float viewDot = clamp(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
          float rim = pow(1.0 - viewDot, 4.0);
          gl_FragColor = vec4(0.3, 0.65, 1.0, 1.0) * rim * 0.65;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
  }, []);

  return (
    <mesh scale={1.025}>
      <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
      <primitive object={atmosphereMaterial} attach="material" />
    </mesh>
  );
}

// Simple, minimal marker at India's coordinates: a solid black pin dot + "Here we are" label
function SimpleLocationPin({ indiaFocus }: { indiaFocus: number }) {
  // India geographic center: 20.59°N, 78.96°E
  const indiaPos = useMemo(() => latLongToVector3(20.59, 78.96, EARTH_RADIUS * 1.002), []);

  return (
    <group position={indiaPos.toArray()} visible={indiaFocus > 0.05}>
      {/* Small solid black circular pin dot marker — simple, clean, no animation/glow */}
      <mesh>
        <sphereGeometry args={[0.035, 16, 16]} />
        <meshBasicMaterial color={0x0a0a0a} />
      </mesh>

      {/* Clean, understated text label reading exactly "Here we are" */}
      <Html
        position={[0, 0, 0.04]}
        distanceFactor={8}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          opacity: indiaFocus,
          transition: 'opacity 0.4s ease',
        }}
      >
        <div
          style={{
            transform: 'translate(8px, -50%)',
            whiteSpace: 'nowrap',
            fontFamily: 'Inter, sans-serif',
            fontSize: '11px',
            fontWeight: 500,
            color: '#e2e8f0',
            letterSpacing: '0.02em',
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          }}
        >
          Here we are
        </div>
      </Html>
    </group>
  );
}

function TargetLocationMarker({ lat, lon, name }: { lat: number; lon: number; name: string }) {
  const pos = useMemo(() => latLongToVector3(lat, lon, EARTH_RADIUS * 1.004), [lat, lon]);

  return (
    <group position={pos.toArray()}>
      {/* Outer subtle pulse ring */}
      <mesh>
        <ringGeometry args={[0.035, 0.055, 32]} />
        <meshBasicMaterial color={0x00f2ff} side={THREE.DoubleSide} transparent opacity={0.85} />
      </mesh>
      {/* Center pinpoint */}
      <mesh>
        <sphereGeometry args={[0.025, 16, 16]} />
        <meshBasicMaterial color={0x38bdf8} />
      </mesh>

      <Html
        position={[0, 0, 0.05]}
        distanceFactor={7}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            transform: 'translate(8px, -50%)',
            whiteSpace: 'nowrap',
            fontFamily: 'Inter, sans-serif',
            fontSize: '11px',
            fontWeight: 600,
            color: '#00f2ff',
            letterSpacing: '0.04em',
            textShadow: '0 0 10px rgba(0, 242, 255, 0.8), 0 1px 4px rgba(0,0,0,0.9)',
          }}
        >
          {name}
        </div>
      </Html>
    </group>
  );
}

function Earth({
  indiaFocus,
  isLowPower,
  targetLat,
  targetLon,
  activeLocationName,
}: {
  indiaFocus: number;
  isLowPower: boolean;
  targetLat?: number;
  targetLon?: number;
  activeLocationName?: string;
}) {
  const earthRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  const [dayMap, normalMap, specularMap, cloudsMap] = useLoader(THREE.TextureLoader, [
    'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
    'https://threejs.org/examples/textures/planets/earth_normal_2048.jpg',
    'https://threejs.org/examples/textures/planets/earth_specular_2048.jpg',
    'https://threejs.org/examples/textures/planets/earth_clouds_1024.png',
  ]);

  dayMap.colorSpace = THREE.SRGBColorSpace;
  dayMap.wrapS = THREE.RepeatWrapping;
  dayMap.wrapT = THREE.ClampToEdgeWrapping;
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.ClampToEdgeWrapping;
  specularMap.wrapS = THREE.RepeatWrapping;
  specularMap.wrapT = THREE.ClampToEdgeWrapping;
  cloudsMap.wrapS = THREE.RepeatWrapping;
  cloudsMap.wrapT = THREE.ClampToEdgeWrapping;

  // Active target coordinates (default to geographic center of India)
  const destLat = targetLat !== undefined ? targetLat : 20.59;
  const destLon = targetLon !== undefined ? targetLon : 78.96;

  useFrame((_, delta) => {
    if (earthRef.current) {
      // Auto-spin slows to zero as focus increases or when target location is set
      const spinWeight = targetLat !== undefined ? 0 : 1 - indiaFocus;
      earthRef.current.rotation.y += delta * 0.06 * spinWeight;

      // Steer the earth's own Y rotation toward the target longitude
      if (indiaFocus > 0.01 || targetLat !== undefined) {
        const targetY = THREE.MathUtils.degToRad(-(90 + destLon));
        let diff = targetY - earthRef.current.rotation.y;
        diff = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI;
        const lerpSpeed = targetLat !== undefined ? 0.06 : 0.05 * indiaFocus;
        earthRef.current.rotation.y += diff * lerpSpeed;
      }
    }

    if (cloudsRef.current && !isLowPower) {
      cloudsRef.current.rotation.y += delta * 0.075;
    }

    // Group handles latitude tilt
    if (groupRef.current) {
      const targetRotX = THREE.MathUtils.degToRad(destLat);
      const focusWeight = targetLat !== undefined ? 1 : indiaFocus;
      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        targetRotX * focusWeight,
        0.05
      );
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, 0, 0.08);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Vibrant Earth surface with rich ocean specular highlights and warm terrain tones */}
      <mesh ref={earthRef}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <meshStandardMaterial
          map={dayMap}
          normalMap={normalMap}
          roughnessMap={specularMap}
          roughness={0.45}
          metalness={0.05}
          emissive={new THREE.Color('#0c1833')}
          emissiveIntensity={0.14}
        />
        {/* Render default pin if no specific city pin is selected, otherwise render city target marker */}
        {activeLocationName && targetLat !== undefined && targetLon !== undefined ? (
          <TargetLocationMarker lat={targetLat} lon={targetLon} name={activeLocationName} />
        ) : (
          <SimpleLocationPin indiaFocus={indiaFocus} />
        )}
      </mesh>

      {/* Concentric 64x64 clouds layer */}
      {!isLowPower && (
        <mesh ref={cloudsRef}>
          <sphereGeometry args={[EARTH_RADIUS * 1.015, 64, 64]} />
          <meshStandardMaterial
            map={cloudsMap}
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

function CameraController({
  scrollProgress = 0,
  zoomDistance,
  onZoomReady,
}: {
  scrollProgress?: number;
  zoomDistance?: number;
  onZoomReady?: () => void;
}) {
  const { camera } = useThree();
  const targetRef = useRef(new THREE.Vector3(0, 0, 8));
  const firedRef = useRef(false);

  // Reset fired state whenever the target distance changes
  useEffect(() => {
    firedRef.current = false;
  }, [zoomDistance]);

  useFrame(() => {
    const safeProgress = typeof scrollProgress === 'number' && Number.isFinite(scrollProgress) ? scrollProgress : 0;
    const rawZ = zoomDistance !== undefined && Number.isFinite(zoomDistance) ? zoomDistance : 8 - safeProgress * 1.5;
    const targetZ = Number.isFinite(rawZ) ? rawZ : 8;
    targetRef.current.set(0, 0, targetZ);
    camera.position.lerp(targetRef.current, 0.045);
    camera.lookAt(0, 0, 0);

    // Fire onZoomReady once the camera has settled close enough to the target
    if (onZoomReady && !firedRef.current && zoomDistance !== undefined) {
      if (Math.abs(camera.position.z - targetZ) < 0.08) {
        firedRef.current = true;
        onZoomReady();
      }
    }
  });

  return null;
}

// Dynamically lit fill light that illuminates the India-facing hemisphere during India focus.
// When searchFocus=true (city search active), holds at full intensity so the city is never in shadow.
function FocusLight({ indiaFocus = 0, searchFocus = false }: { indiaFocus?: number; searchFocus?: boolean }) {
  const lightRef = useRef<THREE.DirectionalLight>(null);

  useFrame(() => {
    if (lightRef.current) {
      const safeFocus = typeof indiaFocus === 'number' && Number.isFinite(indiaFocus) ? indiaFocus : 0;
      const targetIntensity = searchFocus ? 2.5 : safeFocus * 2.5;
      lightRef.current.intensity = THREE.MathUtils.lerp(
        lightRef.current.intensity,
        targetIntensity,
        0.05
      );
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      position={[0, 0, 8]}
      intensity={0}
      color={0xffeedd}
    />
  );
}

function Scene(props: GlobeProps & { isLowPower: boolean }) {
  const {
    scrollProgress = 0,
    indiaFocus = 0,
    globeScale = 1,
    isLowPower,
    targetLat,
    targetLon,
    zoomDistance,
    activeLocationName,
    onZoomReady,
    searchFocus = false,
  } = props;
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      const currentScale = Number.isFinite(groupRef.current.scale.x) ? groupRef.current.scale.x : 1;
      const targetScale = typeof globeScale === 'number' && Number.isFinite(globeScale) ? globeScale : 1;
      const newScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.08);
      groupRef.current.scale.setScalar(Number.isFinite(newScale) ? newScale : 1);
    }
  });

  // Soft ambient fill light so shadows don't drop off sharply
  const safeIndiaFocus = typeof indiaFocus === 'number' && Number.isFinite(indiaFocus) ? indiaFocus : 0;
  const ambientIntensity = 0.45 + safeIndiaFocus * 0.25 + (searchFocus ? 0.2 : 0);

  return (
    <>
      <ambientLight intensity={ambientIntensity} />
      {/* Primary sun light illuminating the globe with vivid, saturated natural colors */}
      <directionalLight position={[6, 4, 7]} intensity={3.8} color={0xfff6ea} />
      {/* Soft hemisphere skylight fill so terminator transition is natural without harsh steps */}
      <hemisphereLight args={[0xddeeff, 0x112244, 0.65]} />
      <pointLight position={[-6, -2, -4]} intensity={0.4} color={0x4d8fff} />
      <FocusLight indiaFocus={safeIndiaFocus} searchFocus={searchFocus} />

      <CameraController scrollProgress={scrollProgress} zoomDistance={zoomDistance} onZoomReady={onZoomReady} />

      <Stars radius={100} depth={50} count={isLowPower ? 2500 : 5000} factor={4} saturation={0} fade speed={0.5} />

      <group ref={groupRef}>
        <Suspense fallback={null}>
          <Earth
            indiaFocus={indiaFocus}
            isLowPower={isLowPower}
            targetLat={targetLat}
            targetLon={targetLon}
            activeLocationName={activeLocationName}
          />
          <Atmosphere />
        </Suspense>
      </group>

      <OrbitControls
        enableZoom={true}
        enablePan={false}
        minDistance={5}
        maxDistance={12}
        rotateSpeed={0.5}
        zoomSpeed={0.5}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

function LoadingFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-accent-800/30 border-t-accent-400 animate-spin" />
        <p className="text-xs font-body text-slate-500 tracking-wider">Initializing Earth...</p>
      </div>
    </div>
  );
}

export default function GlobeCanvas(props: GlobeProps) {
  const [isLowPower, setIsLowPower] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const isLowCPU = nav.deviceMemory !== undefined && nav.deviceMemory < 4;
    setIsLowPower(isMobile || isLowCPU);
  }, []);

  // Keep the Three.js canvas snapped to the container's *actual* rendered size.
  // A ResizeObserver guarantees a re-measure on every container/viewport resize.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => {
        window.dispatchEvent(new Event('resize'));
      });
      ro.observe(el);
    } catch {
      ro = null;
    }
    return () => {
      if (ro) ro.disconnect();
    };
  }, []);

  // Apply opacity to the container via CSS for smooth fade
  const safeOpacity = typeof props.globeOpacity === 'number' && Number.isFinite(props.globeOpacity) ? props.globeOpacity : 1;
  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-hidden transition-opacity duration-300 pointer-events-auto"
      style={{ opacity: safeOpacity, width: '100%', height: '100%' }}
    >
      <Suspense fallback={<LoadingFallback />}>
        <Canvas
          camera={{ position: [0, 0, 8], fov: 45 }}
          dpr={[1, isLowPower ? 1.5 : 2]}
          gl={{ antialias: !isLowPower, alpha: true, powerPreference: 'high-performance' }}
          style={{ background: 'transparent', display: 'block', width: '100%', height: '100%' }}
        >
          <Scene {...props} isLowPower={isLowPower} />
        </Canvas>
      </Suspense>
    </div>
  );
}
