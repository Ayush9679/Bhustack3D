export interface LocationData {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  ulpin: string;
  classification: string;
  area: string;
  elevation: string;
  volume: string;
  zone: string;
  description: string;
  strata: {
    air: string;
    surface: string;
    subsurface: string;
  };
  /** Number of sub-features in this parcel cluster (for multi-unit parcels like KP2) */
  featureCount?: number;
  /** Whether this parcel has real GeoJSON geometry data available from the backend */
  hasRealGeometry?: boolean;
}

export const INDIAN_LOCATIONS: LocationData[] = [
  {
    id: 'delhi',
    name: 'New Delhi (Connaught Place)',
    state: 'National Capital Territory',
    lat: 28.6139,
    lon: 77.2090,
    ulpin: 'ULPIN-3D: DL-07-CP-284-Z4',
    classification: 'Commercial & Air Rights Volumetric',
    area: '4,850 m²',
    elevation: '+216m MSL',
    volume: '58,200 m³',
    zone: 'Inner Radial C-Zone',
    description: 'High-density commercial precinct with stratified rooftop air rights and subterranean Metro corridor easements.',
    strata: {
      air: 'L3 · Air Rights & Helipad Easement (+45m to +95m)',
      surface: 'L1 · Base Cadastre Footprint (Ground Level)',
      subsurface: 'L0 · DMRC Metro Tunnel Envelope (-18m to 0m)',
    },
  },
  {
    id: 'mumbai',
    name: 'Mumbai (Bandra-Kurla Complex)',
    state: 'Maharashtra',
    lat: 19.0657,
    lon: 72.8687,
    ulpin: 'ULPIN-3D: MH-02-BKC-9102-Z2',
    classification: 'Financial District Mixed-Use Prism',
    area: '6,200 m²',
    elevation: '+14m MSL',
    volume: '74,400 m³',
    zone: 'G-Block International Finance',
    description: 'Premier financial cluster utilizing 3D vertical title demarcation for multi-tenant headquarters and deep utilities.',
    strata: {
      air: 'L3 · Cantilevered Sky-Bridges (+50m to +85m)',
      surface: 'L1 · Cadastral Survey Land Parcel (Ground Level)',
      subsurface: 'L0 · High-Voltage Utility Conduits (-24m to 0m)',
    },
  },
  {
    id: 'bengaluru',
    name: 'Bengaluru (Whitefield Tech Hub)',
    state: 'Karnataka',
    lat: 12.9698,
    lon: 77.7499,
    ulpin: 'ULPIN-3D: KA-04-WF-3318-Z3',
    classification: 'Special Economic Zone IT Park',
    area: '12,400 m²',
    elevation: '+920m MSL',
    volume: '148,800 m³',
    zone: 'EPIP Innovation Zone',
    description: 'Multi-storey campus with dedicated cloud data centers, campus aerial rights, and fiber optic easements.',
    strata: {
      air: 'L3 · Rooftop Solar & Aerial Envelopes (+35m to +60m)',
      surface: 'L1 · Ground Footprint & Green Corridor',
      subsurface: 'L0 · Subterranean Fiber Backbone (-12m to 0m)',
    },
  },
  {
    id: 'ayodhya',
    name: 'Ayodhya (Ram Mandir Precinct)',
    state: 'Uttar Pradesh',
    lat: 26.7922,
    lon: 82.1998,
    ulpin: 'ULPIN-3D: UP-42-AY-1049-Z1',
    classification: 'Heritage & Sacred Architecture Cadastre',
    area: '28,000 m²',
    elevation: '+98m MSL',
    volume: '196,000 m³',
    zone: 'Ram Janmabhoomi Heritage Zone',
    description: 'Volumetrically protected religious heritage zone with strict altitude limits and perimeter security buffers.',
    strata: {
      air: 'L3 · Sacred Spire Airspace Buffer (+42m to +100m)',
      surface: 'L1 · Base Temple Footprint & Parikrama Cadastre',
      subsurface: 'L0 · Stabilized Engineered Substrata (-14m to 0m)',
    },
  },
  {
    id: 'varanasi',
    name: 'Varanasi (Kashi Vishwanath Corridor)',
    state: 'Uttar Pradesh',
    lat: 25.3109,
    lon: 82.9739,
    ulpin: 'ULPIN-3D: UP-65-VN-4482-Z1',
    classification: 'Dense Ancient Urban Strata',
    area: '3,150 m²',
    elevation: '+81m MSL',
    volume: '25,200 m³',
    zone: 'Ganga Waterfront Heritage Cadastre',
    description: 'Complex multi-layered urban cadastre demarcating ancient foundations, ghat frontage, and elevated skywalks.',
    strata: {
      air: 'L3 · Skyline View Envelope (+18m to +30m)',
      surface: 'L1 · Traditional Stone Footprint & Ghat Approach',
      subsurface: 'L0 · Ancient Subterranean Water Channels (-8m to 0m)',
    },
  },
  {
    id: 'hyderabad',
    name: 'Hyderabad (HITEC City Cyberabad)',
    state: 'Telangana',
    lat: 17.4474,
    lon: 78.3762,
    ulpin: 'ULPIN-3D: TS-09-HC-7714-Z4',
    classification: 'High-Density Tech Volumetric',
    area: '8,900 m²',
    elevation: '+542m MSL',
    volume: '106,800 m³',
    zone: 'Cyberabad Core Hub',
    description: 'Volumetric skyscraper titles integrated with elevated metro corridors and subterranean server infrastructure.',
    strata: {
      air: 'L3 · High-Altitude Office Suites (+60m to +110m)',
      surface: 'L1 · Ground Plinth & Transit Plaza',
      subsurface: 'L0 · Metro Pillar Foundations & Utility Vaults (-22m to 0m)',
    },
  },
  {
    id: 'jaipur',
    name: 'Jaipur (Pink City Walled Heritage)',
    state: 'Rajasthan',
    lat: 26.9124,
    lon: 75.7873,
    ulpin: 'ULPIN-3D: RJ-14-JP-5201-Z1',
    classification: 'UNESCO Historic Conservation Cadastre',
    area: '5,300 m²',
    elevation: '+431m MSL',
    volume: '42,400 m³',
    zone: 'Walled Heritage Zone',
    description: '3D cadastral protection regulating historic haveli facade preservation and vertical development restrictions.',
    strata: {
      air: 'L3 · Heritage Height Limitation Ceiling (+15m)',
      surface: 'L1 · Historic Haveli Footprint & Courtyard Cadastre',
      subsurface: 'L0 · Traditional Water Harvesting Baolis (-16m to 0m)',
    },
  },
  {
    id: 'pune',
    name: 'Pune (Hinjawadi IT Corridor)',
    state: 'Maharashtra',
    lat: 18.5913,
    lon: 73.7389,
    ulpin: 'ULPIN-3D: MH-12-HW-8820-Z3',
    classification: 'Industrial & Biotech Volumetric',
    area: '15,000 m²',
    elevation: '+560m MSL',
    volume: '180,000 m³',
    zone: 'Phase-1 Biotech Cluster',
    description: 'Comprehensive 3D land parcels supporting pharmaceutical cleanrooms, aerial pipelines, and underground vaults.',
    strata: {
      air: 'L3 · Air Conditioning & Exhaust Envelopes (+25m)',
      surface: 'L1 · Laboratory & Facility Foundation Footprint',
      subsurface: 'L0 · Subterranean Cryogenic Vaults (-10m to 0m)',
    },
  },
  // ── REAL GIS DATA — Knowledge Park 2, Greater Noida ─────────────────────────
  // Centroid computed from 575 real digitized features (QGIS / OpenStreetMap export).
  // Total area: 246,026 m² across all features. All est_height values are present.
  {
    id: 'knowledge-park-2',
    name: 'Knowledge Park 2, Greater Noida',
    state: 'Uttar Pradesh',
    lat: 28.4557850,   // real centroid from GeoJSON vertex average
    lon: 77.5000418,   // real centroid from GeoJSON vertex average
    ulpin: 'ULPIN-3D: UP1228KP2GNIDA0AA-V01-U0101-C3',
    classification: 'Industrial & Commercial Multi-Cluster (Real QGIS Data)',
    area: '246,026 m²',    // sum of all 575 features' area_m2
    elevation: '+198m MSL',
    volume: '~2,214,243 m³',
    zone: 'Knowledge Park-II, GNIDA Special Zone',
    description:
      'Real digitized multi-building cluster in Knowledge Park 2, Greater Noida — includes India Expo Mart (42,881 m²), KP-II Institute, archaeological institute, hostels, and 575 individual commercial/residential/institutional structures. Data sourced from OpenStreetMap via QGIS export.',
    strata: {
      air: 'L3 · Commercial & Institutional Air Rights (+9m to +18m above each block)',
      surface: 'L1 · Knowledge Park-II Industrial & Commercial Land (Ground Level)',
      subsurface: 'L0 · NMRC Aqua Line Metro Corridor Easement (-12m to 0m)',
    },
    featureCount: 575,
    hasRealGeometry: true,
  },
];

export function findLocation(idOrUlpin?: string): LocationData | undefined {
  if (!idOrUlpin) return undefined;
  const clean = idOrUlpin.trim().toLowerCase();
  return INDIAN_LOCATIONS.find((loc) => {
    if (loc.id.toLowerCase() === clean) return true;
    const cleanUlpin = loc.ulpin.toLowerCase().replace(/^ulpin(-3d)?:\s*/i, '').trim();
    if (cleanUlpin === clean || loc.ulpin.toLowerCase() === clean) return true;
    if (loc.ulpin.toLowerCase().includes(clean)) return true;
    if (loc.name.toLowerCase().includes(clean)) return true;
    return false;
  });
}
