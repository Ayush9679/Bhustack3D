export interface UserProfile {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: UserProfile;
}

export interface LocationSearchResult {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  ulpin_3d: string;
  classification: string;
  area: string;
  elevation: string;
  feature_count?: number | null;
}

export interface ParcelResponse {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  ulpin_3d: string;
  classification: string;
  area: string;
  volume: string;
  elevation: string;
  zone: string;
  description: string;
  envelopes: Array<{ type: string; label: string; range: string }>;
  geojson_features?: string | null;
  feature_count?: number | null;
}

// ── Layer 4 + 5 schemas ──────────────────────────────────────────────────────

export interface AdminParcelRow {
  id: number;
  ulpin_3d: string;
  name: string | null;
  centroid_lat: number;
  centroid_lon: number;
  total_area: number;
  confidence_score: string;
  last_verified_date: string | null;
  feature_count: number;
}

export interface ULPINValidationResult {
  ulpin: string;
  valid: boolean;
  check_digit_expected: number;
  check_digit_found: number;
  message: string;
}

export interface ConfidenceResult {
  ulpin_3d: string;
  confidence_score: string;
  last_verified_date: string | null;
  confidence_description: string;
}

// ── Layer 6 stub schemas ─────────────────────────────────────────────────────

export interface DigiLockerStub {
  mock: true;
  ulpin_id: string;
  linked_documents: Array<{
    doc_type: string;
    doc_ref: string;
    issued_by: string;
    verified: boolean;
    note: string;
  }>;
  status: string;
  note: string;
}

export interface BankKYCStub {
  mock: true;
  ulpin_id: string;
  loan_eligibility: string;
  estimated_property_value_inr: number;
  ltv_ratio_percent: number;
  status: string;
  note: string;
}

// ── Surveyor Drill-Down schemas (Building → Floor → Flat) ────────────────

/** A single building / ParcelFeature row inside a parcel. */
export interface FeatureDetailResponse {
  id: number;
  parcel_id: number;
  fid: number | null;
  ulpin_3d: string;
  height: number | null;
  area: number | null;
  floor_level: number;
  floor_count: number;
  building_type: string | null;
  feature_name: string | null;
  notes: string | null;
  defined_floor_count: number;
}

/** Body for PUT /admin/parcels/{parcel_id}/features/{feature_id}. */
export interface FeatureUpdateRequest {
  name?: string | null;
  height?: number | null;
  notes?: string | null;
}

/** A flat / unit row in parcel_flats. */
export interface FlatResponse {
  id: number;
  floor_id: number;
  unit_number: string;
  unit_ulpin: string | null;
  unit_type: string;
  area_sqm: number | null;
  owner_name: string | null;
  created_at: string;
  updated_at: string;
}

/** A floor row in parcel_floors, with nested flats. */
export interface FloorResponse {
  id: number;
  parcel_feature_id: number;
  floor_number: number;
  floor_ulpin: string | null;
  floor_label: string;
  created_at: string;
  updated_at: string;
  flats: FlatResponse[];
  flat_count: number;
}

/** Body for POST .../floors/generate. */
export interface FloorGenerateRequest {
  floor_count: number;
  basement_count?: number;
}

/** Body for POST .../floors (manual single floor). */
export interface FloorCreateRequest {
  floor_number: number;
  floor_label?: string | null;
}

/** Body for PUT /admin/floors/{floor_id}. */
export interface FloorUpdateRequest {
  floor_number?: number | null;
  floor_label?: string | null;
}

/** Body for POST .../flats/generate. */
export interface FlatGenerateRequest {
  flat_count: number;
  starting_unit_number?: number;
}

/** Body for POST .../flats (manual single flat). */
export interface FlatCreateRequest {
  unit_number: string;
  unit_type?: string | null;
  area_sqm?: number | null;
  owner_name?: string | null;
}

/** Body for PUT /admin/flats/{flat_id}. */
export interface FlatUpdateRequest {
  unit_number?: string | null;
  unit_type?: string | null;
  area_sqm?: number | null;
  owner_name?: string | null;
}

/** Response from POST .../assign-ulpin at floor or flat level. */
export interface AssignUlpinResponse {
  id: number;
  ulpin_3d: string;
  status: string;
  message: string;
}

export interface MessageResponse {
  detail: string;
}

/**
 * Dynamically resolves the API base URL.
 * - Uses VITE_API_BASE_URL (or VITE_API_URL) when configured.
 * - If configured to localhost/127.0.0.1 but accessed from an external device/domain (e.g. ngrok),
 *   automatically falls back to relative path '' to route through Vite's reverse proxy.
 * - If empty, defaults to '' which leverages Vite's built-in reverse proxy on /auth and /api.
 */
function resolveApiBaseUrl(): string {
  const envUrl = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? (import.meta.env.VITE_API_URL as string | undefined) ?? '').trim();

  if (envUrl) {
    if (typeof window !== 'undefined') {
      const isRemoteHost = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      const isLocalhostTarget = envUrl.includes('localhost') || envUrl.includes('127.0.0.1');
      if (isRemoteHost && isLocalhostTarget) {
        return '';
      }
    }
    return envUrl.replace(/\/$/, '');
  }

  return '';
}

const API_BASE_URL = resolveApiBaseUrl();

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  let data: unknown = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    let errorMsg = 'An unexpected error occurred';
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      if (typeof d.detail === 'string') {
        errorMsg = d.detail;
      } else if (Array.isArray(d.detail) && (d.detail[0] as Record<string, unknown>)?.msg) {
        errorMsg = (d.detail[0] as Record<string, unknown>).msg as string;
      }
    } else if (typeof data === 'string' && data.length > 0) {
      errorMsg = data;
    }
    throw new ApiError(errorMsg, res.status);
  }

  return data as T;
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────

  async signup(name: string, email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    return handleResponse<AuthResponse>(res);
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return handleResponse<AuthResponse>(res);
  },

  async getMe(token: string): Promise<UserProfile> {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse<UserProfile>(res);
  },

  async logout(token: string): Promise<{ detail: string }> {
    const res = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    return handleResponse<{ detail: string }>(res);
  },

  // ── Search & Parcel ──────────────────────────────────────────────────────

  /** Search cadastral locations by name, ULPIN, state, or zone. */
  async searchLocations(q: string): Promise<LocationSearchResult[]> {
    const res = await fetch(`${API_BASE_URL}/locations/search?q=${encodeURIComponent(q)}`);
    return handleResponse<LocationSearchResult[]>(res);
  },

  /** Fetch full parcel data by ULPIN code or location slug. */
  async getParcel(ulpinOrId: string): Promise<ParcelResponse> {
    const res = await fetch(`${API_BASE_URL}/parcels/${encodeURIComponent(ulpinOrId)}`);
    return handleResponse<ParcelResponse>(res);
  },

  // ── Layer 5: ULPIN Validation ────────────────────────────────────────────

  /** Validate a 3D ULPIN's check digit via the Layer 5 engine. */
  async validateUlpin(ulpin: string): Promise<ULPINValidationResult> {
    const res = await fetch(`${API_BASE_URL}/parcels/${encodeURIComponent(ulpin)}/validate`);
    return handleResponse<ULPINValidationResult>(res);
  },

  /** Get the confidence score and verification status for a parcel. */
  async getConfidence(ulpinOrId: string): Promise<ConfidenceResult> {
    const res = await fetch(`${API_BASE_URL}/parcels/${encodeURIComponent(ulpinOrId)}/confidence`);
    return handleResponse<ConfidenceResult>(res);
  },

  // ── Layer 7: Admin Dashboard ─────────────────────────────────────────────

  /** Fetch all parcels for the Admin Dashboard table (requires admin/surveyor token). */
  async getAdminParcels(token: string): Promise<AdminParcelRow[]> {
    const res = await fetch(`${API_BASE_URL}/admin/parcels`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse<AdminParcelRow[]>(res);
  },

  // ── Surveyor Drill-Down: Buildings (ParcelFeature) ─────────────────────

  /** List every building / feature belonging to a parcel. */
  async getParcelFeatures(token: string, parcelId: number): Promise<FeatureDetailResponse[]> {
    const res = await fetch(`${API_BASE_URL}/admin/parcels/${parcelId}/features`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse<FeatureDetailResponse[]>(res);
  },

  /** Edit a building's basic attributes (name, height, notes). */
  async updateFeature(
    token: string,
    parcelId: number,
    featureId: number,
    body: FeatureUpdateRequest,
  ): Promise<FeatureDetailResponse> {
    const res = await fetch(`${API_BASE_URL}/admin/parcels/${parcelId}/features/${featureId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return handleResponse<FeatureDetailResponse>(res);
  },

  // ── Surveyor Drill-Down: Floors ────────────────────────────────────────

  /** Returns all floors (with nested flats) for a building. */
  async getBuildingFloors(token: string, parcelId: number, featureId: number): Promise<FloorResponse[]> {
    const res = await fetch(
      `${API_BASE_URL}/admin/parcels/${parcelId}/features/${featureId}/floors`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return handleResponse<FloorResponse[]>(res);
  },

  /** Auto-generate floor rows for a building (no ULPINs assigned). */
  async generateBuildingFloors(
    token: string,
    parcelId: number,
    featureId: number,
    body: FloorGenerateRequest,
  ): Promise<FloorResponse[]> {
    const res = await fetch(
      `${API_BASE_URL}/admin/parcels/${parcelId}/features/${featureId}/floors/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      },
    );
    return handleResponse<FloorResponse[]>(res);
  },

  /** Manual single-floor creation by the surveyor. */
  async createSingleFloor(
    token: string,
    parcelId: number,
    featureId: number,
    body: FloorCreateRequest,
  ): Promise<FloorResponse> {
    const res = await fetch(
      `${API_BASE_URL}/admin/parcels/${parcelId}/features/${featureId}/floors`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      },
    );
    return handleResponse<FloorResponse>(res);
  },

  /** Edit a floor's label / floor_number manually. */
  async updateFloor(token: string, floorId: number, body: FloorUpdateRequest): Promise<FloorResponse> {
    const res = await fetch(`${API_BASE_URL}/admin/floors/${floorId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return handleResponse<FloorResponse>(res);
  },

  /** Remove a floor (cascades to its flats). */
  async deleteFloor(token: string, floorId: number): Promise<MessageResponse> {
    const res = await fetch(`${API_BASE_URL}/admin/floors/${floorId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse<MessageResponse>(res);
  },

  /** Generate and persist a real 3D ULPIN for this floor (Layer 5). */
  async assignFloorUlpin(token: string, floorId: number): Promise<AssignUlpinResponse> {
    const res = await fetch(`${API_BASE_URL}/admin/floors/${floorId}/assign-ulpin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse<AssignUlpinResponse>(res);
  },

  // ── Surveyor Drill-Down: Flats ─────────────────────────────────────────

  /** Auto-generate flat rows for a floor (no ULPINs assigned). */
  async generateFlats(token: string, floorId: number, body: FlatGenerateRequest): Promise<FlatResponse[]> {
    const res = await fetch(`${API_BASE_URL}/admin/floors/${floorId}/flats/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return handleResponse<FlatResponse[]>(res);
  },

  /** Manual single-flat creation by the surveyor. */
  async createSingleFlat(token: string, floorId: number, body: FlatCreateRequest): Promise<FlatResponse> {
    const res = await fetch(`${API_BASE_URL}/admin/floors/${floorId}/flats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return handleResponse<FlatResponse>(res);
  },

  /** Edit a flat's unit_number / unit_type / area_sqm / owner_name. */
  async updateFlat(token: string, flatId: number, body: FlatUpdateRequest): Promise<FlatResponse> {
    const res = await fetch(`${API_BASE_URL}/admin/flats/${flatId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return handleResponse<FlatResponse>(res);
  },

  /** Remove a flat. */
  async deleteFlat(token: string, flatId: number): Promise<MessageResponse> {
    const res = await fetch(`${API_BASE_URL}/admin/flats/${flatId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse<MessageResponse>(res);
  },

  /** Generate and persist a real 3D ULPIN for this flat (Layer 5 + overlap check). */
  async assignFlatUlpin(token: string, flatId: number): Promise<AssignUlpinResponse> {
    const res = await fetch(`${API_BASE_URL}/admin/flats/${flatId}/assign-ulpin`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    return handleResponse<AssignUlpinResponse>(res);
  },

  // ── Layer 6: Stub Integrations (mock: true) ──────────────────────────────

  /**
   * STUB — DigiLocker integration mock (returns mock: true).
   * For demo/pitch only — not a real DigiLocker connection.
   */
  async getDigilockerStub(ulpin: string): Promise<DigiLockerStub> {
    const res = await fetch(`${API_BASE_URL}/integrations/digilocker/${encodeURIComponent(ulpin)}`);
    return handleResponse<DigiLockerStub>(res);
  },

  /**
   * STUB — Bank KYC / loan eligibility mock (returns mock: true).
   * For demo/pitch only — not a real bank API connection.
   */
  async getBankKycStub(ulpin: string): Promise<BankKYCStub> {
    const res = await fetch(`${API_BASE_URL}/integrations/bank-kyc/${encodeURIComponent(ulpin)}`);
    return handleResponse<BankKYCStub>(res);
  },
};
