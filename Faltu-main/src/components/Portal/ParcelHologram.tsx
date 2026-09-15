import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

interface HologramProps {
  activeStratum?: 'all' | 'air' | 'surface' | 'subsurface';
}

function HologramModel({ activeStratum = 'all' }: HologramProps) {
  const modelGroup = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringRef2 = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (modelGroup.current) {
      modelGroup.current.rotation.y += delta * 0.35;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.5;
    }
    if (ringRef2.current) {
      ringRef2.current.rotation.z -= delta * 0.35;
    }
  });

  const showSub = activeStratum === 'all' || activeStratum === 'subsurface';
  const showSurface = activeStratum === 'all' || activeStratum === 'surface';
  const showAir = activeStratum === 'all' || activeStratum === 'air';

  return (
    <group ref={modelGroup} position={[0, -0.2, 0]}>
      {/* Ground Projection Grid */}
      <gridHelper args={[6, 12, 0x00f2ff, 0x1e3a5f]} position={[0, -1.5, 0]} />

      {/* Concentric Rotating Holographic Base Rings */}
      <mesh ref={ringRef} position={[0, -1.48, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.8, 1.86, 48]} />
        <meshBasicMaterial color={0x00f2ff} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>

      <mesh ref={ringRef2} position={[0, -1.47, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.3, 2.34, 48]} />
        <meshBasicMaterial color={0x38bdf8} transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>

      {/* L0: Subterranean Infrastructure Envelope */}
      {showSub && (
        <group position={[0, -0.9, 0]}>
          <mesh>
            <boxGeometry args={[1.6, 0.8, 1.6]} />
            <meshStandardMaterial
              color={0xf59e0b}
              transparent
              opacity={0.18}
              roughness={0.2}
              emissive={0xd97706}
              emissiveIntensity={0.25}
            />
          </mesh>
          {/* Wireframe border */}
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(1.6, 0.8, 1.6)]} />
            <lineBasicMaterial color={0xfbbf24} transparent opacity={0.8} />
          </lineSegments>
        </group>
      )}

      {/* L1: Surface Cadastral Boundary Base Footprint */}
      {showSurface && (
        <group position={[0, -0.2, 0]}>
          <mesh>
            <boxGeometry args={[2.0, 0.35, 2.0]} />
            <meshStandardMaterial
              color={0x10b981}
              transparent
              opacity={0.25}
              roughness={0.1}
              emissive={0x059669}
              emissiveIntensity={0.3}
            />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(2.0, 0.35, 2.0)]} />
            <lineBasicMaterial color={0x34d399} transparent opacity={0.9} />
          </lineSegments>
        </group>
      )}

      {/* L2: Multi-Storey Volumetric Stratum Prisms */}
      <group position={[0, 0.6, 0]}>
        <mesh>
          <boxGeometry args={[1.7, 0.9, 1.7]} />
          <meshStandardMaterial
            color={0x00f2ff}
            transparent
            opacity={0.22}
            roughness={0.1}
            emissive={0x0284c7}
            emissiveIntensity={0.35}
          />
        </mesh>
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(1.7, 0.9, 1.7)]} />
          <lineBasicMaterial color={0x38bdf8} transparent opacity={0.95} />
        </lineSegments>
      </group>

      {/* L3: Upper Volumetric Air Rights Envelope */}
      {showAir && (
        <group position={[0, 1.5, 0]}>
          <mesh>
            <boxGeometry args={[1.4, 0.7, 1.4]} />
            <meshStandardMaterial
              color={0x38bdf8}
              transparent
              opacity={0.18}
              roughness={0.2}
              emissive={0x0284c7}
              emissiveIntensity={0.2}
            />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(1.4, 0.7, 1.4)]} />
            <lineBasicMaterial color={0x7dd3fc} transparent opacity={0.85} />
          </lineSegments>

          {/* Glowing Beacon Spheres at Corner Vertices */}
          {[-0.7, 0.7].map((x) =>
            [-0.7, 0.7].map((z) => (
              <mesh key={`${x}-${z}`} position={[x, 0.35, z]}>
                <sphereGeometry args={[0.04, 12, 12]} />
                <meshBasicMaterial color={0x00f2ff} />
              </mesh>
            ))
          )}
        </group>
      )}

      {/* Central Hologram Scanning Beam Line */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 3.4, 8]} />
        <meshBasicMaterial color={0x00f2ff} transparent opacity={0.45} />
      </mesh>
    </group>
  );
}

export default function ParcelHologram({ activeStratum = 'all' }: HologramProps) {
  return (
    <div className="w-full h-full min-h-[320px] sm:min-h-[380px] relative rounded-2xl overflow-hidden bg-space-950/70 border border-accent-500/20 glow-blue">
      {/* Subtle background radial glow */}
      <div className="absolute inset-0 bg-radial-at-c from-accent-600/10 via-space-950/80 to-space-950 pointer-events-none" />

      {/* Top Hologram Status HUD */}
      <div className="absolute top-3 left-4 z-10 flex items-center gap-2 pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-cyan-glow animate-pulse" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-cyan-300 font-600">
          3D Volumetric Wireframe Active
        </span>
      </div>

      <div className="absolute top-3 right-4 z-10 font-mono text-[10px] text-slate-500 pointer-events-none">
        Drag to Rotate 3D Model
      </div>

      <Canvas
        camera={{ position: [3.2, 2.4, 3.6], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 4]} intensity={1.5} color={0xddeeff} />
        <pointLight position={[-3, -2, -3]} intensity={0.8} color={0x00f2ff} />

        <HologramModel activeStratum={activeStratum} />

        <OrbitControls
          enableZoom={true}
          enablePan={false}
          minDistance={2.5}
          maxDistance={7.5}
          autoRotate={false}
          enableDamping
          dampingFactor={0.06}
        />
      </Canvas>
    </div>
  );
}
