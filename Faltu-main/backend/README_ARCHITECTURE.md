# Bhustack3D — 7-Layer Architecture Documentation

## Overview

Bhustack3D implements the **SIH26011 solution document** 7-layer architecture
for a 3D cadastral intelligence platform. This document maps each architectural
layer to its current prototype implementation and notes what would change in
production.

---

## Layer 1 — Data Acquisition

| Item | Prototype | Production |
|------|-----------|------------|
| Method | Manual QGIS digitization from satellite basemap (OSM + Google Imagery) | Automated LiDAR/drone/satellite ingestion daemon |
| Input | QGIS project → Export to GeoJSON (EPSG:4326) | PDAL point clouds, Sentinel-2 STAC tiles, DILRMP API shapefiles |
| Output | `data/raw/*.geojson` | Same folder, written by ingestion service |
| Status | **REAL (manual)** — legitimate real-world substitute at demo scale | Automated |

**Files:** `data/raw/README.md`, `data/kp2_parcel.geojson`

---

## Layer 2 — Data Pre-processing

| Item | Prototype | Production |
|------|-----------|------------|
| CRS validation | EPSG:4326 / OGC CRS84 check (real) | Same |
| Geometry repair | Shapely `make_valid()` (real) | Same, parallelized |
| Duplicate detection | SHA-256 geometry hash (real) | Same |
| Overlap analysis | Shapely `.overlaps()` pairwise (real) | PostGIS spatial queries |
| Output | `data/processed/*_clean.geojson` | Same |
| Status | **REAL** | Same algorithm, scaled |

**Files:** `scripts/preprocess_geojson.py`

---

## Layer 3 — AI/ML Extraction Engine

| Item | Prototype | Production |
|------|-----------|------------|
| Building footprint segmentation | **STUB** — pass-through of pre-digitized QGIS data | U-Net / Segment Anything Model (SAM) fine-tuned on Indian cadastral imagery |
| Floor count estimation | **STUB** — est_height / 3m heuristic | Shadow-length analysis, LiDAR DSM-DTM difference |
| Input | Pre-digitized GeoJSON | Raw satellite raster tiles |
| Output | Same features passed through | GeoJSON FeatureCollection with confidence scores |

> **STUB** — clearly labeled. The pipeline shape is preserved so the real model
> can be swapped in by replacing `extract_footprints()` internals.

**Files:** `services/ai_extraction.py`

---

## Layer 4 — 3D Cadastral Database

| Item | Prototype | Production |
|------|-----------|------------|
| Database | **SQLite** (zero-infrastructure, prototype speed) | **PostgreSQL 15 + PostGIS 3D + 3DCityDB** |
| Schema | LADM-inspired: `parcels`, `parcel_features`, `parcel_ownership` | Full ISO 19152 LADM profile + CityGML LOD2 storage |
| Geometry storage | GeoJSON string in `TEXT` column | Native `geometry(Polygon, 4326)` with GIST spatial index |
| Spatial queries | Python/Shapely in-memory | PostGIS `ST_Intersects`, `ST_3DIntersects` |

### Tables

#### `parcels`
```sql
id, ulpin_3d, parent_land_ulpin, name, centroid_lat, centroid_lon,
total_area, confidence_score, last_verified_date, created_at
```

Confidence score tiers (Novelty 4 — Data Authenticity per solution doc):
- `satellite-only` — QGIS from satellite imagery
- `drone-verified` — LiDAR/photogrammetry drone survey
- `lidar-verified` — Full LiDAR point cloud
- `sanction-plan-verified` — Matched against approved building sanction plan

#### `parcel_features`
```sql
id, parcel_id (FK), fid, ulpin_3d, geometry_json,
height, area, floor_level, floor_count, building_type, feature_name
```

#### `parcel_ownership`
```sql
id, parcel_id (FK), owner_name, aadhaar_ref (nullable — voluntary),
registration_doc_ref, is_verified, created_at
```

**Files:** `models.py`, `scripts/seed_parcels.py`

---

## Layer 5 — 3D ULPIN Generation Engine

| Item | Status |
|------|--------|
| ULPIN format | `{14-char base}-V{level:02d}-U{unit}-C{check}` — **REAL** |
| Check digit algorithm | Verhoeff-inspired weighted positional checksum (prime weights, mod 97 → mod 10) — **REAL**, deterministic, error-detecting |
| `generate_ulpin()` | **REAL** — produces valid, checksummed codes |
| `validate_ulpin()` | **REAL** — re-derives check digit and compares; works live in API |
| Spatial overlap check | **REAL** — Shapely `.intersects()` against all stored features |

### ULPIN Format Detail
```
UP1228KP2GNIDA0A  -  V00  -  U0001  -  C7
│────────────────│  │───│  │─────│  │──│
 14-char base ULPIN  Level   Unit    Check digit
 (state+dist+zone)  (strata) (unit)  (Verhoeff-inspired)
```

**Files:** `services/ulpin_generator.py`

---

## Layer 6 — API & Integration Layer

### Real Endpoints
| Endpoint | Status |
|----------|--------|
| `GET /parcels/{id}` | **REAL** — returns Location or Parcel data |
| `GET /locations/search` | **REAL** — fuzzy search across cadastral registry |
| `GET /parcels/{id}/validate` | **REAL** — live Layer 5 checksum validation |
| `GET /parcels/{id}/confidence` | **REAL** — returns confidence tier + date |
| `GET /admin/parcels` | **REAL** — role-gated (admin/surveyor); returns all parcels |
| `GET /admin/features` | **REAL** — role-gated; per-building ULPIN list |
| `POST /auth/*` | **REAL** — bcrypt + JWT auth |

### Stub Endpoints (clearly labeled `mock: true`)
| Endpoint | Status |
|----------|--------|
| `GET /integrations/digilocker/{id}` | **STUB** — mock response only. Real integration needs MeitY Partner API credentials + OTP consent flow |
| `GET /integrations/bank-kyc/{id}` | **STUB** — mock response only. Real integration needs bilateral bank API agreements + RBI-compliant KYC |

**Files:** `main.py`, `schemas.py`

---

## Layer 7 — Application Layer

| Component | Status |
|-----------|--------|
| Citizen portal (Hero/Auth/Search/Globe) | **REAL** — React + Three.js |
| 3D viewer (hologram / CityZoomView) | **REAL** — Three.js/R3F (substitutes CesiumJS at prototype scale) |
| Admin/Govt Dashboard (`/admin`) | **REAL** — role-gated, live ULPIN validation, MOCK-labeled stubs |
| Mobile field-verification app | **FUTURE WORK** — Flutter app out of scope for web hackathon |
| Real DigiLocker/Bank KYC | **FUTURE WORK** — requires government partnership |
| Blockchain hash-anchoring | **FUTURE WORK** — architectural enhancement noted, not built |

**Files:** `src/pages/AdminDashboard.tsx`, `src/App.tsx`

---

## Three.js vs CesiumJS Substitution Note

The solution document's Layer 7 spec references CesiumJS or Deck.gl for the
3D cadastral viewer. This prototype uses **Three.js / React Three Fiber**, which
is an accepted substitute at prototype scale:

- Three.js provides full 3D polygon extrusion, lighting, and orbit controls
- The hologram/CityZoomView already renders the KP2 building cluster in 3D
- CesiumJS would add terrain, global tile streaming, and official CZML/3D Tiles support
  in a production deployment — out of scope for hackathon hosting

---

## Running the Full Pipeline

```bash
# 1. Install Python dependencies
cd backend
pip install fastapi uvicorn sqlalchemy python-jose bcrypt python-multipart shapely

# 2. Run Layer 2 preprocessing (optional — runs automatically on seed)
python scripts/preprocess_geojson.py data/kp2_parcel.geojson

# 3. Start the API (auto-seeds Layer 4 on startup)
python main.py
# or:
uvicorn main:app --reload

# 4. (Optional) Re-seed Layer 4 parcels from CLI
python scripts/seed_parcels.py --force

# 5. Start the frontend
cd ..
npm run dev
```

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Surveyor / Admin | `rajesh.verma@bhustack.gov.in` | `Surveyor@123` |

Navigate to `/admin` after logging in with the surveyor account.
