// ─────────────────────────────────────────────────────────────────────────────
// ULPIN Generation Utilities
// Deterministic mock ULPIN codes for the 3D building view prototype.
//
// Format:  [14-char base] - V[##] - U[####] - C[#]
// Example: UP0512034567AB-V07-U0704-C3
// ─────────────────────────────────────────────────────────────────────────────

/** Simple LCG seeded random — stable output for the same seed across renders. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Map a location state name to a 2-char state code. */
function stateCode(state: string): string {
  const map: Record<string, string> = {
    'national capital territory': 'DL',
    'maharashtra': 'MH',
    'karnataka': 'KA',
    'uttar pradesh': 'UP',
    'telangana': 'TS',
    'rajasthan': 'RJ',
    'gujarat': 'GJ',
    'tamil nadu': 'TN',
    'west bengal': 'WB',
    'kerala': 'KL',
    'madhya pradesh': 'MP',
    'bihar': 'BR',
    'punjab': 'PB',
    'haryana': 'HR',
    'odisha': 'OD',
  };
  const key = state.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (key.includes(k)) return v;
  }
  // Fallback: first 2 chars uppercased
  return state.replace(/\s/g, '').substring(0, 2).toUpperCase();
}

/** Deterministic numeric hash of a string. */
function strHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O confusion

/**
 * Generate the 14-character base ULPIN for a specific building in a city.
 * Format: SS DDDDDDDDDD AA  (2 state + 10 digits + 2 alpha)
 */
export function generateBaseUlpin(locationId: string, locationState: string, buildingIndex: number): string {
  const sc = stateCode(locationState);
  const hash = strHash(locationId + ':' + buildingIndex);
  const digits = String(hash).padStart(10, '0').substring(0, 10);
  const a1 = ALPHA[buildingIndex % ALPHA.length];
  const a2 = ALPHA[(buildingIndex * 7 + 3) % ALPHA.length];
  return `${sc}${digits}${a1}${a2}`;
}

/**
 * Generate the full ULPIN code including vertical level and unit codes.
 *
 * @param baseUlpin  14-char base from generateBaseUlpin()
 * @param floorCount total number of floors in the building
 * @param floorIndex 0-based floor being labelled (0 = ground)
 * @param unitIndex  unit number within the floor
 */
export function generateFullUlpin(
  baseUlpin: string,
  floorCount: number,
  floorIndex = 0,
  unitIndex = 1,
): string {
  const V = String(floorIndex + 1).padStart(2, '0');
  const totalUnits = Math.max(1, floorCount);
  const unit = ((unitIndex % totalUnits) + 1);
  const U = String(unit * 100 + (unitIndex % 99) + 1).padStart(4, '0');

  // Simple check digit: sum of digit chars mod 10
  const raw = baseUlpin + V + U;
  let sum = 0;
  for (const ch of raw) {
    const n = parseInt(ch, 10);
    if (!isNaN(n)) sum += n;
  }
  const C = sum % 10;

  return `${baseUlpin}-V${V}-U${U}-C${C}`;
}

/** Procedurally generate building layout data for a city, seeded by locationId. */
export interface BuildingData {
  id: string;
  /** Position in scene units [x, z] */
  position: [number, number];
  /** Footprint size [width, depth] */
  footprint: [number, number];
  /** Building height in scene units */
  height: number;
  /** Estimated floor count */
  floors: number;
  baseUlpin: string;
  primaryUlpin: string;
}

export function generateCityBuildings(
  locationId: string,
  locationState: string,
  count = 16,
): BuildingData[] {
  const rng = seededRandom(strHash(locationId));
  const buildings: BuildingData[] = [];

  // Simple grid-avoidance: keep track of placed rects
  const placed: Array<{ x: number; z: number; w: number; d: number }> = [];

  const CITY_RADIUS = 18;
  let attempts = 0;

  while (buildings.length < count && attempts < count * 8) {
    attempts++;

    const x = (rng() - 0.5) * CITY_RADIUS * 2;
    const z = (rng() - 0.5) * CITY_RADIUS * 2;
    const w = 1.5 + rng() * 3.5;   // 1.5 – 5 units wide
    const d = 1.5 + rng() * 3.5;   // 1.5 – 5 units deep
    const h = 2 + rng() * 13;      // 2 – 15 units tall
    const floors = Math.max(1, Math.round(h / 1.4));

    // Simple overlap check (axis-aligned bounding box + 1.5u gap)
    const GAP = 1.5;
    const overlaps = placed.some(
      (p) =>
        Math.abs(p.x - x) < (p.w + w) / 2 + GAP &&
        Math.abs(p.z - z) < (p.d + d) / 2 + GAP,
    );
    if (overlaps) continue;

    placed.push({ x, z, w, d });
    const idx = buildings.length;
    const baseUlpin = generateBaseUlpin(locationId, locationState, idx);
    const primaryUlpin = generateFullUlpin(baseUlpin, floors, 0, 1);

    buildings.push({
      id: `${locationId}-bld-${idx}`,
      position: [x, z],
      footprint: [w, d],
      height: h,
      floors,
      baseUlpin,
      primaryUlpin,
    });
  }

  return buildings;
}
