# Backend & API Complete Technical Report

**Repository:** Bhustack3D — 3D Cadastral Intelligence Platform (SIH26011 hackathon prototype)
**Audit mode:** Read-only, evidence-based
**Audit date:** 2026-09-18
**Repo root:** `c:\Users\ayush\OneDrive\Desktop\Bhustack3D`
**Definitions of truth used:** tracked Git tree at `HEAD` (79 files), actual source contents of every backend file, and the frontend API layer.

> **Secrets policy (honoured):** No credentials, tokens, private keys, database passwords, `.env` values, or the hardcoded JWT signing secret string are reproduced anywhere in this report. Where a secret-bearing value exists in code it is flagged as `[REDACTED]`. The untracked `Faltu-main/.env` file was deliberately **not opened**.

---

## 1. Executive Summary

Bhustack3D is a **single-file FastAPI monolith** (Python backend) plus a **React + Three.js (Vite) frontend** for a 3D cadastral (land-record) platform prototype for India. There is **no API gateway, no microservice mesh, no message broker, no worker process, and no external third-party HTTP dependency at runtime**. All business logic runs synchronously in-process in `Faltu-main/backend/main.py` against a local **SQLite** database (`bhustack.db`) via **SQLAlchemy ORM** — the only "external" hop the frontend makes is through Vite's dev-server reverse proxy to the FastAPI process on `127.0.0.1:8000`.

Key numbers found by static inspection of the tracked code:

| Metric | Count |
|---|---|
| HTTP endpoints | **26** (all registered in `backend/main.py`) |
| Backend services / modules | **6** (`main.py`, `auth.py`, `database.py`, `models.py`, `schemas.py`, `services/`) plus 2 CLI scripts |
| Database tables / ORM models | **7** (`users`, `locations`, `parcels`, `parcel_features`, `parcel_ownership`, `parcel_floors`, `parcel_flats`) |
| External integration endpoints | **2** — both **stubs** (DigiLocker, Bank KYC, `mock: true`) |
| Webhook endpoints | **0** |
| Background / queue workers | **0** (only synchronous FastAPI startup seed hooks) |
| Async (queued) processing | **None** — every action is synchronous in the request thread |
| Docker / Compose / CI-CD files | **0** |

Authentication is **JWT (HS256) + bcrypt** with a **hardcoded signing secret** in `backend/auth.py` (value `[REDACTED]`; confirmed via search that it appears only there). Authorization is a coarse **role-string check** (`admin`/`surveyor`, case-sensitive set) applied only to `/admin/*` routes.

The system is best understood as a **7-layer conceptual pipeline** (documented in `backend/README_ARCHITECTURE.md`) in which Layers 2, 4, 5 and 6 are genuinely implemented, Layer 3 (AI extraction) is a clearly-labelled **stub**, and Layer 6's government integrations (DigiLocker / bank KYC) are **mocked**.

## 2. Repository Structure

The Git repository root is the workspace root `c:\Users\ayush\OneDrive\Desktop\Bhustack3D`. The application source lives under one folder, `Faltu-main/`, with GIS artifacts at the root.

```
Bhustack3D/                                    # Git repo root (79 tracked files)
├── Faltu-main/                                # The application (Bolt-generated template + custom backend)
│   ├── .env.example                           # Template for VITE_API_BASE_URL (empty by default)
│   ├── .gitignore                             # Ignores node_modules, dist, *.local, logs, .env
│   ├── README.md                              # 1-line placeholder + Bolt link
│   ├── package.json / package-lock.json       # Frontend dependencies (Vite/React/Three)
│   ├── index.html
│   ├── vite.config.ts                         # Dev server + API reverse-proxy rules
│   ├── eslint.config.js / postcss.config.js / tailwind.config.js / tsconfig*.json
│   ├── public/                                # favicon.svg, kp2_parcel.geojson (static fallback)
│   └── backend/                               # ★ THE ENTIRE BACKEND ★
│       ├── README_ARCHITECTURE.md             # 7-layer architecture doc (important reading)
│       ├── main.py                            # FastAPI app — ALL 26 endpoints — 1,376 lines
│       ├── auth.py                            # JWT + bcrypt helpers, get_current_user dependency
│       ├── database.py                        # SQLAlchemy engine / session / Base / get_db
│       ├── models.py                          # 7 ORM models
│       ├── schemas.py                         # Pydantic request/response schemas
│       ├── test_api.py                        # Manual smoke-test script (urllib, prints, no asserts)
│       ├── bhustack.db                        # ★ SQLite database file committed to Git
│       ├── data/                              # kp2_parcel.geojson + processed/clean + raw/README.md
│       ├── scripts/                           # preprocess_geojson.py, seed_parcels.py
│       └── services/                          # ulpin_generator.py (real), ai_extraction.py (STUB)
│   └── src/                                   # Frontend (React + TS)
│       ├── services/api.ts                    # ★ single API wrapper used by all components
│       ├── context/AuthContext.tsx            # Auth state + localStorage token mgmt
│       ├── pages/AdminDashboard.tsx           # /admin (role-gated UI)
│       ├── pages/admin/{BuildingsView,FloorsView,FlatsView}.tsx   # Surveyor drill-down
│       ├── pages/ParcelDetailPage.tsx         # /parcel/:id (fetches /parcels/... directly)
│       ├── components/…                       # Marketing + 3D globe/city views (no backend calls)
│       └── utils/ulpin.ts                     # Client-side mock ULPIN generator (demo only)
├── KP2_PARCEL.geojson                         # Root-level GIS export (tracked)
├── kp2_EXPORTED.gpkg                          # Root-level GIS export (tracked)
└── gis-source/kp2_EXPORTED.gpkg               # GIS source bundle (tracked)
```

| Concern | Location |
|---|---|
| Backend runtime | `Faltu-main/backend/` — Python 3.13 (from committed `.pyc` files), FastAPI |
| Frontend runtime | `Faltu-main/src/` — React 18 + Vite 5 |
| API contract surface | `Faltu-main/src/services/api.ts` (TS interfaces mirror `schemas.py`) |
| Dev proxy (gateway-like) | `vite.config.ts` server/preview `proxy` |

> **Working-tree note (not part of the repository):** the working directory also contains **untracked, non-versioned** artifacts (`requirements.txt`, `requirements.txt.bak`, `HANDOFF_NOTES.txt`, `KP2_CONFIG.json(.bak)`, `MASTER_PROMPT.txt`, `_scratch_*.py`, `prepare_kp2_buildings.py(.bak)`, `GlobalMLBuildingFootprints-main/`, `cache/`, and an untracked `Faltu-main/.env`). Per the audit rules these were **not** treated as repository content; the untracked `requirements.txt` is mentioned in §21 only as evidence of local dependency practice. The committed `backend/.env.example` is the only tracked env template.

## 3. Backend Architecture

### 3.1 Overall style

**Verified classification: modular monolith** — single process, single codebase, no services. The "modules" are Python files, not independently deployable units.

- Web framework: **FastAPI** (`app = FastAPI(...)` in `backend/main.py:44`), served by **uvicorn** (`main.py:1376` — `uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)`).
- Storage: **SQLite** via **SQLAlchemy 2.x-style ORM** (`backend/database.py`).
- No gRPC, no RabbitMQ/Kafka/Redis, no Celery/background tasks, no message queues.
- The only HTTP "client/server" boundary inside the repo is **Vite dev-proxy → FastAPI** (`vite.config.ts`).
- Architecture concept is documented as a **7-layer pipeline (SIH26011)** in `backend/README_ARCHITECTURE.md`; the layers are conceptual, not deployable services.

### 3.2 The 7 conceptual layers vs implementation

| Layer | Name | Implementation status (evidence) |
|---|---|---|
| L1 | Data acquisition | **Real (manual)** — QGIS digitisations shipped as `backend/data/kp2_parcel.geojson`; convention doc `backend/data/raw/README.md` |
| L2 | Pre-processing | **Real** — `backend/scripts/preprocess_geojson.py` (CRS validation, Shapely `make_valid()`, SHA-256 duplicate detection, pair-wise overlap report) |
| L3 | AI/ML extraction | **STUB (labelled)** — `backend/services/ai_extraction.py` returns features unchanged; floor count via `est_height/3` heuristic |
| L4 | 3D cadastral DB | **Real (simplified)** — SQLite tables `parcels`, `parcel_features`, `parcel_ownership` (+ `parcel_floors`, `parcel_flats`) in `backend/models.py`; a PostGIS+3DCityDB production target is only described in docs |
| L5 | 3D ULPIN generation | **Real** — `backend/services/ulpin_generator.py` (weighted checksum, `generate_ulpin`/`validate_ulpin`/`build_base_ulpin`/`check_spatial_overlap`) |
| L6 | API & integration layer | **Real + stubs** — `/auth`, `/locations`, `/parcels`, `/admin` real; `/integrations/*` are `mock: true` |
| L7 | Application layer | **Real (web)** — React citizen portal + `/admin` dashboard; mobile app explicitly **future work** (per README_ARCHITECTURE.md §Layer 7) |

### 3.3 Request / response / error lifecycle (verified code path)

```
Browser (React SPA)
   │  fetch() with optional Bearer token
   ▼
Vite dev server (port 5173)  ──  path match in proxy table
   │  '/auth','/api','/parcels','/locations','/admin','/integrations'
   ▼
FastAPI app (uvicorn, 0.0.0.0:8000)  backend/main.py
   │  1. CORSMiddleware (preflight/intercept)
   │  2. FastAPI route resolution (26 routes)
   │  3. Dependency graph resolved: get_db → Session; get_current_user → HTTPBearer
   │  4. Pydantic body/query/param validation (schemas.py)
   │  5. Handler function runs (main.py) — business logic
   │  6. SQLAlchemy ORM calls against SQLite (bhustack.db)
   │  7. Serialization via response_model (Pydantic) or raw dict
   ▼
HTTP response (JSON) — errors are FastAPI HTTPException JSON {"detail": ...}
```

Key evidence:
- CORS is the only middleware (`main.py:55-70`, `add_middleware(CORSMiddleware, ...)`).
- The db dependency `get_db()` (`database.py:17-21`) yields a session and closes it in `finally`.
- Auth dependency `get_current_user()` (`auth.py:49-75`) validates the bearer token and loads the `User`.

### 3.4 Internal "service-to-service" communication

There is none in the network sense. `main.py` imports and calls:
- `services.ulpin_generator.py` → `generate_ulpin`, `validate_ulpin`, `build_base_ulpin` (`main.py:30`)
- `auth.py` → `hash_password`, `verify_password`, `create_access_token`, `get_current_user` (`main.py:31`)
- `database.py`/`models.py`/`schemas.py` directly.

Shared services boundary: only `ulpin_generator` and `ai_extraction` live under `services/`. Everything else is a module-level function in `main.py`.

### 3.5 External API communication

None at runtime. The only "remote" references are:
- Mocked integration responses (see §13).
- Frontend fetches Google Fonts (`index.html`), which is not a backend call.

## 4. Services / Modules

No independent deployable services exist. The module inventory below is the complete backend surface.

| Module | File | Responsibility | Important functions | Exposed via |
|---|---|---|---|---|
| FastAPI app | `backend/main.py` (1,376 lines) | Application entrypoint, all routes, seed logic, request handling | `root`, `signup`, `login`, `get_me`, `logout`, `search_locations`, `get_parcel`, `validate_parcel_ulpin`, `get_parcel_confidence`, `list_admin_parcels`, `list_admin_features`, `get_parcel_features`, `update_feature_attributes`, `list_building_floors`, `generate_building_floors`, `create_single_floor`, `update_floor`, `delete_floor`, `generate_flats`, `create_single_flat`, `update_flat`, `delete_flat`, `assign_floor_ulpin`, `assign_flat_ulpin`, `digilocker_stub`, `bank_kyc_stub`; seed helpers `seed_demo_surveyor`, `seed_kp2`, `seed_kp2_layer4`, `seed_kp2_location`, `seed_kp2_parcels`, `_location_to_response`, `_require_admin`, `_extract_base_ulpin` | HTTP |
| Auth | `backend/auth.py` | JWT HS256 creation/validation, bcrypt hashing, current-user dependency | `hash_password`, `verify_password`, `create_access_token`, `get_current_user`; constants `SECRET_KEY` [REDACTED], `ALGORITHM="HS256"`, `ACCESS_TOKEN_EXPIRE_HOURS=24` | Imported by `main.py` |
| Database | `backend/database.py` | SQLAlchemy engine/session/Base + FastAPI dependency | `engine`, `SessionLocal`, `Base`, `get_db` | Imported everywhere |
| ORM models | `backend/models.py` | 7 table definitions (LADM-inspired) | `User`, `Location`, `Parcel`, `ParcelFeature`, `ParcelOwnership`, `ParcelFloor`, `ParcelFlat` | Imported by `main.py`, scripts |
| Pydantic schemas | `backend/schemas.py` | Request/response contracts | 26 model classes (listed in §11) | Imported by `main.py`; mirrored in TS |
| ULPIN engine | `backend/services/ulpin_generator.py` | 3D ULPIN generation, checksum validation, spatial-overlap check, base-ULPIN construction | `generate_ulpin`, `validate_ulpin`, `check_spatial_overlap`, `build_base_ulpin`, `_compute_check_digit` | Imported by `main.py` + `scripts/seed_parcels.py` |
| AI extraction | `backend/services/ai_extraction.py` | **STUB** — passes pre-digited features through | `extract_footprints`, `estimate_floor_count` | Imported by seeds only (not by any HTTP route) |
| Pre-processing (CLI) | `backend/scripts/preprocess_geojson.py` | Layer 2 pipeline: CRS check, repair, dedupe, overlap report, normalized output | `preprocess`, `validate_crs`, `repair_geometry`, `geometry_hash`, `find_overlaps`, `normalise_feature` | CLI |
| Seeder (CLI) | `backend/scripts/seed_parcels.py` | Full L2→L3(stub)→L5→L4 import; idempotent; `--force` re-seed | `run_seed` | CLI |
| Smoke test | `backend/test_api.py` | Manual endpoint smoke script | `test` | CLI |

**Startup / lifespan behaviour (all synchronous):**
1. `Base.metadata.create_all(bind=engine)` — create missing tables (`main.py:36`).
2. `ALTER TABLE parcel_features ADD COLUMN notes TEXT` attempted in a try/except (raw SQL, `main.py:37-42`) — a hand-written micro-migration.
3. `@app.on_event("startup")` × 3 (`main.py:334-371`): `seed_demo_surveyor`, `seed_kp2` (Location row), `seed_kp2_layer4` (Parcels + ParcelFeatures + Ownership). All idempotent (skip when data exists).

## 5. Complete API Inventory

Every route below is statically verified from `@app.<method>(...)` decorators in `backend/main.py` (searched with regex; 26 decorators found — no other routers, no `include_router`, no `APIRouter`, no dynamic `add_api_route` anywhere in the repo).

Legend — Auth: `Public` = no token; `Bearer` = JWT via `get_current_user`; `Bearer+role` = JWT *and* role ∈ {admin, ADMIN, surveyor, SURVEYOR} via `_require_admin`.

| # | Method | Endpoint | Handler (main.py) | Auth | Public/Internal/Admin | Purpose (summary) |
|---|---|---|---|---|---|---|
| 1 | GET | `/` | `root` (line 379) | Public | Public | Service metadata / status banner |
| 2 | POST | `/auth/signup` | `signup` (402) | Public | Public | Create citizen account → JWT (201) |
| 3 | POST | `/auth/login` | `login` (427) | Public | Public | Password login → JWT |
| 4 | GET | `/auth/me` | `get_me` (443) | Bearer | Public (authenticated) | Current user profile |
| 5 | POST | `/auth/logout` | `logout` (449) | Bearer | Public (authenticated) | No-op ack; client discards token |
| 6 | GET | `/locations/search?q=` | `search_locations` (459) | Public | Public | Fuzzy search cadastral locations (≤20 rows) |
| 7 | GET | `/parcels/{ulpin_id}` | `get_parcel` (498) | Public | Public | Full parcel record + GeoJSON envelope |
| 8 | GET | `/parcels/{ulpin_id}/validate` | `validate_parcel_ulpin` (535) | Public | Public | Live ULPIN check-digit validation (pure algorithm) |
| 9 | GET | `/parcels/{ulpin_id}/confidence` | `get_parcel_confidence` (578) | Public | Public | Confidence tier + description |
| 10 | GET | `/admin/parcels` | `list_admin_parcels` (656) | Bearer+role | Admin | All parcels with feature_count |
| 11 | GET | `/admin/features` | `list_admin_features` (684) | Bearer+role | Admin | ParcelFeature rows (paged; `parcel_id` filter) |
| 12 | GET | `/admin/parcels/{parcel_id}/features` | `get_parcel_features` (732) | Bearer+role | Admin | Buildings of a parcel (+ `defined_floor_count`) |
| 13 | PUT | `/admin/parcels/{parcel_id}/features/{feature_id}` | `update_feature_attributes` (767) | Bearer+role | Admin | Edit building name/height/notes |
| 14 | GET | `/admin/parcels/{parcel_id}/features/{feature_id}/floors` | `list_building_floors` (809) | Bearer+role | Admin | Floors (with nested flats) of a building |
| 15 | POST | `/admin/parcels/{parcel_id}/features/{feature_id}/floors/generate` | `generate_building_floors` (856) | Bearer+role | Admin | Auto-create floors 1..N (+ basements) |
| 16 | POST | `/admin/parcels/{parcel_id}/features/{feature_id}/floors` | `create_single_floor` (917) | Bearer+role | Admin | Manual single floor |
| 17 | PUT | `/admin/floors/{floor_id}` | `update_floor` (977) | Bearer+role | Admin | Edit floor number/label |
| 18 | DELETE | `/admin/floors/{floor_id}` | `delete_floor` (1021) | Bearer+role | Admin | Delete floor (cascades flats) |
| 19 | POST | `/admin/floors/{floor_id}/flats/generate` | `generate_flats` (1037) | Bearer+role | Admin | Auto-create flats on a floor |
| 20 | POST | `/admin/floors/{floor_id}/flats` | `create_single_flat` (1084) | Bearer+role | Admin | Manual single flat |
| 21 | PUT | `/admin/flats/{flat_id}` | `update_flat` (1118) | Bearer+role | Admin | Edit flat fields |
| 22 | DELETE | `/admin/flats/{flat_id}` | `delete_flat` (1154) | Bearer+role | Admin | Delete flat |
| 23 | POST | `/admin/floors/{floor_id}/assign-ulpin` | `assign_floor_ulpin` (1170) | Bearer+role | Admin | Generate + persist floor 3D ULPIN |
| 24 | POST | `/admin/flats/{flat_id}/assign-ulpin` | `assign_flat_ulpin` (1212) | Bearer+role | Admin | Generate + persist flat 3D ULPIN (dup guard) |
| 25 | GET | `/integrations/digilocker/{ulpin_id}` | `digilocker_stub` (1299) | Public | Public | **MOCK** DigiLocker documents (`mock: true`) |
| 26 | GET | `/integrations/bank-kyc/{ulpin_id}` | `bank_kyc_stub` (1344) | Public | Public | **MOCK** loan eligibility (`mock: true`) |

**Behavioural notes verified in code:**
- **No rate limiting, no pagination helpers on public endpoints** (only admin features list has `limit`/`offset`), no idempotency keys, no ETags/versioning.
- `search_locations` caps results at 20 rows via `.limit(20)`.
- Three endpoints (`/admin/features`, `digilocker_stub`, `bank_kyc_stub`) return shapes not fully covered by a typed response model (see §11 mismatches).
- Every `/admin/*` route depends on `_require_admin` (`main.py:651-655`), which is itself built on `get_current_user`.
- There are **no webhook, callback, or internal-health endpoints** (`/health` is absent; `GET /` serves as the de-facto health check).

## 6. Detailed API Documentation

Formats: body = JSON. Error body = `{"detail": "<message>"}` (FastAPI default). Validation errors = FastAPI 422 with `detail[]` array. `Status` codes below are the ones produced by the code.

### 6.1 `GET /` — Service banner (`root`, main.py:379)
- **Auth:** none. **Type:** public.
- **Response 200 (schema: inline dict):**
  ```json
  {"status":"online","service":"Bhustack3D Geospatial Intelligence API","version":"2.0.0",
   "architecture":"7-layer SIH26011","layers":{ "L1":"...","L2":"...","L3":"... STUB ...","L6":"... STUB ...", ... }}
  ```
- **Side effects:** none. FastAPI `/docs` and `/openapi.json` are also auto-served.

### 6.2 `POST /auth/signup` → 201 (`signup`, main.py:402)
- **Auth:** none. **Type:** public.
- **Request body `UserSignup` (schemas.py:23-26):** `name: str` (2..120), `email: EmailStr`, `password: str` (6..128).
- **Logic:** lowercase+strip email → duplicate check on `users.email` → `User(role="citizen")`, `hash_password` (bcrypt cost 12) → commit → JWT with claims `{sub: str(id), email, role}`.
- **Responses:** `201` → `TokenResponse` (`access_token`, `token_type="bearer"`, `user: UserResponse`). `400` on duplicate: `{"detail":"An account with this email address already exists. Please log in."}`. `422` on schema violations.
- **Side effects:** INSERT into `users`. Generates a token (token is also returned on signup — signup implicitly logs the user in).

### 6.3 `POST /auth/login` → 200 (`login`, main.py:427)
- **Auth:** none. **Type:** public.
- **Request body `UserLogin` (schemas.py:29-31):** `email: EmailStr`, `password: str` (min 1).
- **Logic:** lowercase email → fetch user → `verify_password` → JWT `{sub, email, role}`.
- **Responses:** `200` → `TokenResponse`. `401` → `{"detail":"Invalid email or password. Please check your credentials."}` + `WWW-Authenticate: Bearer` header.

### 6.4 `GET /auth/me` → 200 (`get_me`, main.py:443)
- **Auth:** Bearer; denied without token (`401` `"Could not validate credentials or token expired"`).
- **Response `UserResponse`:** `{id, name, email, role, created_at}`.

### 6.5 `POST /auth/logout` → 200 (`logout`, main.py:449)
- **Auth:** Bearer.
- **Logic:** returns `{"detail":"Successfully logged out. Please discard your access token."}`. **No server-side revocation, blocklist, or token invalidation exists** — JWT stays valid until `exp` (24 h). Logout is a client-side discard (see §8 / AuthContext.tsx).

### 6.6 `GET /locations/search?q=<str min 1>` → 200 (`search_locations`, main.py:459)
- **Auth:** none. **Type:** public.
- **Query params:** `q` (required, min_length=1).
- **Logic:** `%q%` ILIKE over `locations.name|state|ulpin_3d|zone|classification`, `.limit(20)`.
- **Response:** `LocationSearchResult[]` (lightweight; excludes `geojson_features` and `volume/envelopes`).
- **Notes:** currently **not called by any frontend component** (§22). Admin features list is the only endpoint exposing its own pagination (`limit`≤200 default 50, `offset`).

### 6.7 `GET /parcels/{ulpin_id}` → 200 (`get_parcel`, main.py:498)
- **Auth:** none. **Type:** public.
- **Path params:** `ulpin_id` (ULPIN string or Location slug `id`, e.g. `knowledge-park-2`).
- **Logic:** lookup order → (1) `Location` by `ulpin_3d`, (2) `Location` by `id`, (3) `Parcel` by `ulpin_3d` — if found, responds **404** with guidance to use `/admin/parcels` (feature-level ULPINs are not resolvable here); else **404** `"Parcel '<id>' not found in the cadastral registry."`
- **Response `LocationResponse`:** full record incl. `envelopes[]` (`StrataEnvelope` ×3: air/surface/subsurface generated by `_location_to_response`), `geojson_features` (compact JSON string), `feature_count`.
- **Frontend usage:** `src/pages/ParcelDetailPage.tsx:30` fetches `{apiBase}/parcels/knowledge-park-2` directly with `fetch()` and parses `geojson_features`.

### 6.8 `GET /parcels/{ulpin_id}/validate` → 200 (`validate_parcel_ulpin`, main.py:535)
- **Auth:** none. **Type:** public.
- **Logic (pure algorithm, no DB):** delegates to `services.ulpin_generator.validate_ulpin(code)`; parses `...-C<digit>` suffix, re-derives the weighted checksum, compares. Never raises; malformed input yields `valid:false`, `check_digit_expected=-1`.
- **Response `ULPINValidationResult`:** `{ulpin, valid, check_digit_expected, check_digit_found, message}`.
- **Frontend usage:** `api.validateUlpin` → `ADMIN` dashboard "Validate ULPIN" button (`AdminDashboard.tsx:158`).

### 6.9 `GET /parcels/{ulpin_id}/confidence` → 200 (`get_parcel_confidence`, main.py:578)
- **Auth:** none. **Type:** public.
- **Logic:** checks `parcels` first then legacy `locations`; maps score via local `CONFIDENCE_DESCRIPTIONS` map (satellite-only / drone-verified / lidar-verified / sanction-plan-verified).
- **Responses:** `200` → `ConfidenceResult` `{ulpin_3d, confidence_score, last_verified_date, confidence_description}`; `404` `"Parcel '<id>' not found."`.
- **Note:** wrapper `api.getConfidence` exists in frontend but no component calls it (§22).

---

### 6.10 Admin endpoints (`require _require_admin` → roles admin/ADMIN/surveyor/SURVEYOR; `403` `"Access denied. Admin or Surveyor role required."`)

#### `GET /admin/parcels` (`list_admin_parcels`, main.py:656)
- Response: `AdminParcelRow[]` — `{id, ulpin_3d, name, centroid_lat, centroid_lon, total_area, confidence_score, last_verified_date, feature_count}` (per-parcel sub-query counting `parcel_features`). Ordered by `Parcel.id`.

#### `GET /admin/features?parcel_id=&limit=&offset=` (`list_admin_features`, main.py:684)
- Query: `parcel_id` optional int, `limit` default 50 (max 200), `offset` default 0.
- Response: `list[dict]` (**no Pydantic response model**) — raw dicts with keys `id, parcel_id, fid, ulpin_3d, height, area, floor_level, floor_count, building_type, feature_name`.
- **Note:** no frontend wrapper exists for this endpoint (§22).

#### `GET /admin/parcels/{parcel_id}/features` (`get_parcel_features`, main.py:732)
- Returns `FeatureDetailResponse[]` — adds `notes` and `defined_floor_count` (count of `parcel_floors` for the feature). `404` if parcel missing.

#### `PUT /admin/parcels/{parcel_id}/features/{feature_id}` (`update_feature_attributes`, main.py:767)
- Body `FeatureUpdateRequest`: `{name?, height?, notes?}` (all optional). Applies only non-None fields; `height` coerced via `float()`. Empty name stored as NULL.
- Returns updated `FeatureDetailResponse`. `404` if feature not found on that parcel.

#### `GET /admin/parcels/{parcel_id}/features/{feature_id}/floors` (`list_building_floors`, main.py:809)
- Returns `FloorResponse[]` ordered `floor_number DESC`, each with nested `flats[]` (ordered `unit_number ASC`).
- `404` if building not found.

#### `POST /admin/parcels/{parcel_id}/features/{feature_id}/floors/generate` (`generate_building_floors`, main.py:856)
- Body `FloorGenerateRequest`: `floor_count: int 1..200` (required), `basement_count: int 0..20` (default 0).
- Creates floors `1..floor_count` (label `Floor N`) and basements `-1..-basement_count` (label `Basement N`); skips numbers already present; bumps `feature.floor_count` when newly defined count exceeds it. Reuses `list_building_floors` for the response.

#### `POST /admin/parcels/{parcel_id}/features/{feature_id}/floors` (`create_single_floor`, main.py:917)
- Body `FloorCreateRequest`: `floor_number: int` (required), `floor_label?` (auto: negative→`Basement N`, 0→`Ground Floor`, positive→`Floor N`).
- `400` if floor number already exists in the building. Bumps `feature.floor_count` if needed.

#### `PUT /admin/floors/{floor_id}` (`update_floor`, main.py:977)
- Body `FloorUpdateRequest`: `{floor_number?, floor_label?}`. `400` on number conflict; updates `updated_at`; returns `FloorResponse` with nested flats.

#### `DELETE /admin/floors/{floor_id}` (`delete_floor`, main.py:1021)
- Deletes floor; `parcel_flats` cascade via SQLAlchemy relationship `cascade="all, delete-orphan"` (`models.py`). Returns `MessageResponse {"detail":"Floor <id> and all its units were deleted."}`. `404` if missing.

#### `POST /admin/floors/{floor_id}/flats/generate` (`generate_flats`, main.py:1037)
- Body `FlatGenerateRequest`: `flat_count: int 1..500` (required), `starting_unit_number: int` (≥1, default 1).
- Unit naming (verified): floor `>0` → `f"{floor}{seq:02d}"` (e.g. floor 7 → `704`); floor `0` → `G{seq:02d}`; floor `<0` → `B{abs(floor)}{seq:02d}`. Existing unit numbers are skipped. New flats: `unit_ulpin=None`, `unit_type="Residential"`, `area_sqm=75.0`, `owner_name=None`.
- Returns `FlatResponse[]` (all flats of the floor, ordered by unit_number).

#### `POST /admin/floors/{floor_id}/flats` (`create_single_flat`, main.py:1084)
- Body `FlatCreateRequest`: `unit_number` (1..50, required, trimmed), `unit_type?` (default `"Residential"`), `area_sqm?`, `owner_name?`.
- `400` if `unit_number` already exists on that floor.

#### `PUT /admin/flats/{flat_id}` (`update_flat`, main.py:1118)
- Body `FlatUpdateRequest` (all optional). Duplicate `unit_number` on same floor → `400`. Sets `updated_at`; returns `FlatResponse`.

#### `DELETE /admin/flats/{flat_id}` (`delete_flat`, main.py:1154)
- Returns `MessageResponse {"detail":"Unit <id> deleted."}`. `404` if missing.

#### `POST /admin/floors/{floor_id}/assign-ulpin` (`assign_floor_ulpin`, main.py:1170)
- Walks `floor → ParcelFeature → Parcel`; builds base ULPIN via `_extract_base_ulpin(parcel)`; generates `generate_ulpin(base, floor.floor_number, "0000")`; **self-validates** with `validate_ulpin` (fails with `500` `"Generated ULPIN failed checksum validation."`); persists `floor_ulpin`; returns `AssignUlpinResponse {id, ulpin_3d, status:"assigned", message}`.
- **Not idempotent by request** — re-calling overwrites `floor_ulpin` with a new code (no `if already assigned` guard on the backend; the UI disables the button once assigned).

#### `POST /admin/flats/{flat_id}/assign-ulpin` (`assign_flat_ulpin`, main.py:1212)
- Walks `flat → ParcelFloor → ParcelFeature → Parcel`; cleans `unit_number` to alphanumeric (≤6 chars, uppercase; fallback `{flat.id:04d}`); generates `generate_ulpin(base, floor.floor_number, clean_unit)`.
- **Duplicate guard (verified):** queries all sibling flats across the parent building's floors for an identical `unit_ulpin`; if found → `400` `"ULPIN Duplicate Collision: Building #<fid> ... A unit cannot duplicate an existing 3D strata parcel within the same building."`
- Self-validates checksum (`500` on failure); persists `unit_ulpin`; `AssignUlpinResponse`.
- ⚠️ **Docstring vs code discrepancy:** the docstring says it "Runs the EXISTING overlap/uniqueness check"; the implementation performs an exact `unit_ulpin` string-duplicate check only — the geometry-based `services.ulpin_generator.check_spatial_overlap()` is **not invoked** on this path (it is only used by `scripts/seed_parcels.py`). Same applies to floor assignment (no overlap check at all).

### 6.11 Stub integrations (both return canned data; **no DB, no auth, no external call**)

#### `GET /integrations/digilocker/{ulpin_id}` (`digilocker_stub`, main.py:1299)
- Response `DigiLockerStub` (`mock: true`): `{mock, ulpin_id, linked_documents[] (2 hardcoded docs: Sale Deed, Building Sanction Plan — each `verified:false`), status:"mock_linked", note}`.
- Source docstring: real integration "requires MeitY DigiLocker Partner API credentials and citizen OTP consent" — **not available, intentionally stubbed**.

#### `GET /integrations/bank-kyc/{ulpin_id}` (`bank_kyc_stub`, main.py:1344)
- Response `BankKYCStub` (`mock: true`): `{mock, ulpin_id, loan_eligibility:"eligible", estimated_property_value_inr:45_000_000, ltv_ratio_percent:75.0, status:"mock_approved", note}`.
- Source docstring: requires bilateral lender API agreements + RBI-compliant KYC.

> Both stubs are surfaced in the admin UI via `api.getDigilockerStub`/`api.getBankKycStub` (`AdminDashboard.tsx:187-188`) and rendered with a red `MOCK` badge.

## 7. Request / Response Flows

### 7.1 `POST /auth/login` (fully traced)
```
AuthSection.tsx handleSubmit → validate() → useAuth().login(email, password)
   → api.login (src/services/api.ts:278) → fetch `${API_BASE_URL}/auth/login`, JSON body
   → Vite proxy '/auth' → http://127.0.0.1:8000/auth/login
   → FastAPI `login` (main.py:427) → Depends(get_db) (database.py:17)
   → User.query.filter(User.email == email_clean) → SQLite SELECT on users
   → verify_password (auth.py:25) — bcrypt.checkpw
   → create_access_token({sub, email, role}) (auth.py:36) — HS256, exp = now+24h
   → TokenResponse (schemas.py:45) → 200 JSON
   → AuthContext stores token in localStorage key 'bhustack_access_token'; setUser(res.user)
```

### 7.2 `POST /auth/signup` (fully traced)
```
AuthSection (signup tab) → useAuth().signup(name, email, password)
   → api.signup (api.ts:269) → /auth/signup (201)
   → `signup` (main.py:402): Pydantic UserSignup → email lowercase/strip
   → duplicate EXISTS query on users.email → 400 if present
   → User(name, email, hashed_password=bcrypt(12 rounds), role="citizen")
   → db.add/commit/refresh → create_access_token → TokenResponse 201
```
Storage-side effect: new row in `users`. No email verification, no welcome email, no activation flag.

### 7.3 `GET /auth/me` token validation path
```
AuthContext (mount) → token from localStorage → api.getMe(token) (api.ts:287)
   → Authorization: Bearer <token> → `get_me` (main.py:443)
   → dependency get_current_user (auth.py:49):
       HTTPBearer(auto_error=False) → no credentials → 401
       jwt.decode(token, SECRET_KEY, algorithms=["HS256"]) → JWTError/ValueError → 401
       sub → int → User.id lookup → user null → 401
   → UserResponse (role loaded fresh from DB, not from the token claims)
```

### 7.4 `GET /parcels/{ulpin_id}` lookup precedence (verified)
```
get_parcel (main.py:498)
   1. Location.ulpin_3d == id
   2. Location.id == id            (slug, e.g. knowledge-park-2)
   3. Parcel.ulpin_3d == id → 404 with hint to /admin/parcels   ← feature-level ULPINs intentionally
   4. else → 404
→ success: _location_to_response(loc) → LocationResponse
```

### 7.5 Admin drill-down and ULPIN assignment loop (the main "surveyor" workflow)
```
AdminDashboard (guards: isAuthenticated + role admin|surveyor) → api.getAdminParcels(token)
   → GET /admin/parcels (Bearer) → list
   → validate each row: POST-less GET /parcels/{ulpin}/validate (public)
   → BuildingsView: api.getParcelFeatures(token, parcel.id) → GET /admin/parcels/{id}/features
       edit: PUT /admin/parcels/{id}/features/{featureId}
   → FloorsView: api.getBuildingFloors(...) → GET .../features/{featureId}/floors
       create: POST .../floors/generate | POST .../floors | PUT/DELETE /admin/floors/{id}
       assign: POST /admin/floors/{floorId}/assign-ulpin
   → FlatsView: same floor list; create: POST .../floors/{floorId}/flats/generate | POST .../flats
       edit: PUT /admin/flats/{id} | delete: DELETE /admin/flats/{id}
       assign: POST /admin/flats/{flatId}/assign-ulpin (dup guard → 400 surfaces as error message)
```

### 7.6 Response serialization behaviour (schema → ORM)
- FastAPI `response_model` serializes ORM objects via Pydantic `from_attributes = True` on the response classes (e.g. `UserResponse`, `LocationResponse`, `AdminParcelRow`, `FeatureDetailResponse`, `FlatResponse`, `FloorResponse`).
- `FloorResponse.flats` is filled manually (not via relationship) in `list_building_floors` and includes `flat_count` (schemas.py:312-324).
- `GET /admin/features`, `digilocker_stub`, `bank_kyc_stub` do not rely on an ORM→schema mapping (raw dicts / constructed stub objects).

## 8. Authentication & Authorization

All auth code lives in `backend/auth.py` (75 lines). No OAuth, no refresh tokens, no API keys, no sessions.

### 8.1 Mechanism summary

| Aspect | Value (verified) |
|---|---|
| Token type | JWT |
| Signing algorithm | **HS256** (`ALGORITHM = "HS256"`, auth.py:12) |
| Secret | Hardcoded module constant `SECRET_KEY` (auth.py:11). ⚠️ **Stored in source code — value `[REDACTED]` in this report. Confirmed it is not read from any environment variable** (no `os.getenv`/`os.environ` anywhere in the tracked repo). |
| Token lifetime | `ACCESS_TOKEN_EXPIRE_HOURS = 24` (auth.py:13); `exp` set to `datetime.now(timezone.utc) + timedelta(...)` (auth.py:40-44) |
| Claims in token | `sub` = user id as string, `email`, `role` (set in `create_access_token` calls at main.py:417,438) |
| Password hashing | bcrypt, `gensalt(rounds=12)`, `hash_password`/`verify_password` (auth.py:18-33) |
| Token transport | `Authorization: Bearer <token>` — parsed by FastAPI `HTTPBearer(auto_error=False)` (auth.py:15) |
| Token revocation | **None** — `/auth/logout` only returns an acknowledgement; the token remains valid until `exp` |
| Refresh tokens | **None** |
| User resolution on each request | `get_current_user` re-reads `User` from DB by `sub` (auth.py:72-75) → freshly loaded `role` |

### 8.2 Enforcement points

- `get_current_user` (auth.py:49) is a FastAPI `Depends` used by: `/auth/me`, `/auth/logout`, and indirectly by all `/admin/*` routes via `_require_admin`.
- `_require_admin` (main.py:651-655): `if current_user.role not in _ADMIN_ROLES: raise 403`. `_ADMIN_ROLES = {"admin","ADMIN","surveyor","SURVEYOR"}` — **case-sensitive union of lowercase and uppercase role strings** (two spellings must both exist because signup creates `role="citizen"` lowercase while the seeded demo account uses `role="SURVEYOR"` uppercase; main.py:410 vs main.py:349).
- Frontend role gate (`AdminDashboard.tsx:116-125`): redirects unauthenticated → `/#auth`, non-admin/surveyor → `/`.
- There are **no permissions beyond the binary "is admin/surveyor" check** — no per-parcel ownership, no per-action RBAC matrix, no OAuth scopes.

### 8.3 Login / logout / expiry flow

| Phase | Where |
|---|---|
| Credentials checked | main.py:427-441 (`login`) + auth.py:25 (`verify_password`) |
| Token issued | auth.py:36-46 (`create_access_token`) |
| Token validated | auth.py:62-75 (`get_current_user`) |
| Role checked | main.py:651-655 (`_require_admin`) |
| Client storage | `src/context/AuthContext.tsx:16` — `localStorage` key `bhustack_access_token` (XSS-sensitive; no HttpOnly cookie) |
| Expiry handling | AuthContext init: `api.getMe(storedToken)` failure ⇒ token removed from storage (AuthContext.tsx:40-45) |
| Logout | AuthContext.logout → `api.logout(token)` then clears localStorage (AuthContext.tsx:74-86) |

### 8.4 Observations (auth)
- **CONFIRMED:** JWT signing secret is committed in source; token signing/verification rely on a single shared key with no rotation path.
- **CONFIRMED:** `role` claim inside the token is informational — role decisions re-read from DB each request.
- **CONFIRMED:** no password reset, no email verification, no lockout, no rate limiting on `/auth/login`.
- **CONFIRMED:** demo account seeded at startup (main.py:334-353) with a hardcoded password — documented in `backend/README_ARCHITECTURE.md` "Demo Credentials" table. Value not reproduced here.

## 9. Database Architecture

### 9.1 Engine and connection

| Aspect | Value (verified in `backend/database.py`) |
|---|---|
| Technology | **SQLite** — `SQLALCHEMY_DATABASE_URL = "sqlite:///./bhustack.db"` (relative to the working directory; the committed file is `backend/bhustack.db`) |
| Driver | Built-in `sqlite3` via SQLAlchemy |
| ORM | SQLAlchemy (`declarative_base`, `sessionmaker`) |
| Options | `connect_args={"check_same_thread": False}` (SQLite + threaded async/WEB use); sessions `autocommit=False, autoflush=False` |
| Pooling | Default SQLAlchemy `SingletonThreadPool` for SQLite (not configured explicitly) |
| Transactions | Implicit per `db.commit()`/`db.rollback()` in route code; no explicit `session.begin()` |
| Migration tooling | **None** (no Alembic). Schema initialized with `Base.metadata.create_all` + one raw `ALTER TABLE parcel_features ADD COLUMN notes TEXT` in a try/except (`main.py:35-42`) |
| Seed scripts | Startup hooks (`main.py:334-371`) + CLI `scripts/seed_parcels.py --force` |
| Raw SQL | Only the startup ALTER above (`sqlalchemy.text`) |

**Production note (code/doc evidence):** `models.py`, `README_ARCHITECTURE.md`, and `seed_parcels.py` docstrings state the intended production target is **PostgreSQL 15 + PostGIS 3D + 3DCityDB** (ISO 19152 LADM), with geometry stored natively and spatial queries via PostGIS instead of Python/Shapely. The current SQLite schema deliberately stores geometries as **JSON strings in TEXT columns** (`ParcelFeature.geometry_json`).

### 9.2 Relationship overview

```
users (auth/roles)
locations ── legacy seeded cadastral registry (used by /parcels, /locations/search, globe portal)
One Parcel ─── many ParcelFeature (buildings)           [cascade all, delete-orphan]
One Parcel ─── many ParcelOwnership (owners)            [cascade all, delete-orphan]
One ParcelFeature ─── many ParcelFloor (floors)         [cascade all, delete-orphan]
     ParcelFloor.parcel_feature_id FK → parcel_features.id (ondelete CASCADE)
One ParcelFloor ─── many ParcelFlat (flats)             [cascade all, delete-orphan]
     ParcelFlat.floor_id FK → parcel_floors.id (ondelete CASCADE)
```
All relationships are declared in `models.py`; the FK graph is `parcels → parcel_features → parcel_floors → parcel_flats` plus `parcels → parcel_ownership`.

## 10. Models / Entities

All definitions in `backend/models.py`. Column types as declared there; SQLite enforces types loosely.

### 10.1 `users` — class `User` (models.py:27-35)
| Column | Type | Constraints |
|---|---|---|
| id | Integer | PK, autoincrement, indexed |
| name | String(120) | NOT NULL |
| email | String(255) | NOT NULL, UNIQUE, indexed |
| hashed_password | String(255) | NOT NULL |
| role | String(50) | NOT NULL, default `"citizen"` |
| created_at | DateTime | NOT NULL, default `datetime.now(timezone.utc)` |

Business meaning: authentication + coarse role separation (citizen / admin / surveyor). No `updated_at`, no `is_active`.

### 10.2 `locations` — class `Location` (models.py:38-58)
| Column | Type | Constraints |
|---|---|---|
| id | String(50) | PK (slug, e.g. `knowledge-park-2`), indexed |
| name | String(200) | NOT NULL, indexed |
| state | String(100) | NOT NULL |
| lat / lon | Float | NOT NULL |
| ulpin_3d | String(100) | NOT NULL, UNIQUE, indexed |
| classification | String(200) | NOT NULL |
| area / volume / elevation | String(50) | NOT NULL |
| zone | String(200) | NOT NULL |
| description | Text | NOT NULL |
| strata_air / strata_surface / strata_subsurface | String(300) | NOT NULL |
| geojson_features | Text | NULL (compact JSON string) |
| feature_count | Integer | NULL |

Business meaning: legacy seeded cadastral registry backing the public globe/search/parcel endpoints. Single seeded row `knowledge-park-2` at startup; ULPIN seeded via Layer 5 engine with legacy fallback.

### 10.3 `parcels` — class `Parcel` (models.py:76-106)
| Column | Type | Constraints |
|---|---|---|
| id | Integer | PK, autoincrement |
| ulpin_3d | String(150) | NOT NULL, UNIQUE, indexed |
| parent_land_ulpin | String(20) | NULL (14-char base ULPIN of surface parcel) |
| name | String(300) | NULL |
| centroid_lat / centroid_lon | Float | NOT NULL |
| total_area | Float | NOT NULL, default 0.0 |
| confidence_score | String(30) | NOT NULL, default `"satellite-only"` |
| last_verified_date | DateTime | NULL |
| created_at | DateTime | NOT NULL, default now(utc) |

Relationships: `features` → ParcelFeature (cascade all, delete-orphan); `ownership` → ParcelOwnership (cascade all, delete-orphan).

### 10.4 `parcel_features` — class `ParcelFeature` (models.py:108-142)
| Column | Type | Constraints |
|---|---|---|
| id | Integer | PK, autoincrement |
| parcel_id | Integer | NOT NULL, FK → `parcels.id`, indexed |
| fid | Integer | NULL (original GeoJSON fid) |
| ulpin_3d | String(150) | NOT NULL, UNIQUE, indexed |
| geometry_json | Text | NOT NULL (GeoJSON geometry string) |
| height / area | Float | NULL |
| floor_level | Integer | NOT NULL, default 0 |
| floor_count | Integer | NOT NULL, default 1 |
| building_type | String(50) | NULL |
| feature_name | String(300) | NULL |
| notes | Text | NULL (surveyor-editable; added by raw ALTER) |

Relationships: `parcel` (back), `floors` → ParcelFloor (cascade all, delete-orphan).

### 10.5 `parcel_ownership` — class `ParcelOwnership` (models.py:144-166)
| Column | Type | Constraints |
|---|---|---|
| id | Integer | PK, autoincrement |
| parcel_id | Integer | NOT NULL, FK → `parcels.id`, indexed |
| owner_name | String(300) | NULL |
| aadhaar_ref | String(100) | NULL (voluntary per privacy policy; comment says reference only, not the number) |
| registration_doc_ref | String(500) | NULL (DigiLocker URI stub) |
| is_verified | Boolean | NOT NULL, default False |
| created_at | DateTime | NOT NULL, default now(utc) |

Business meaning: ownership linkage stub — seeded with one placeholder owner (GNIDA) for KP2; real ownership data is explicitly a future DILRMP integration.

### 10.6 `parcel_floors` — class `ParcelFloor` (models.py:169-195)
| Column | Type | Constraints |
|---|---|---|
| id | Integer | PK, autoincrement |
| parcel_feature_id | Integer | NOT NULL, FK → `parcel_features.id` ondelete CASCADE, indexed |
| floor_number | Integer | NOT NULL (positive=above ground, 0=ground, negative=basement) |
| floor_ulpin | String(150) | NULL (until assigned), indexed |
| floor_label | String(100) | NOT NULL (e.g. "Ground Floor") |
| created_at / updated_at | DateTime | NOT NULL; updated_at has onupdate now(utc) |

### 10.7 `parcel_flats` — class `ParcelFlat` (models.py:198-225)
| Column | Type | Constraints |
|---|---|---|
| id | Integer | PK, autoincrement |
| floor_id | Integer | NOT NULL, FK → `parcel_floors.id` ondelete CASCADE, indexed |
| unit_number | String(50) | NOT NULL (e.g. "704") |
| unit_ulpin | String(150) | NULL (until assigned), indexed |
| unit_type | String(50) | NOT NULL, default `"Residential"` |
| area_sqm | Float | NULL (surveyor-editable) |
| owner_name | String(300) | NULL (surveyor-editable) |
| created_at / updated_at | DateTime | NOT NULL; updated_at onupdate now(utc) |

### 10.8 Data-layer capabilities (verified)
- **Soft deletes:** none; `DELETE` routes physically delete rows.
- **Audit fields:** only `created_at`/`updated_at` on floors/flats; `users.created_at`; no `created_by`/`modified_by` anywhere.
- **Aggregations:** per-parcel `feature_count` (sub-query in `list_admin_parcels`), `total_area` computed at seed time.
- **Pagination:** only `/admin/features` (`limit`/`offset`); public search hard-limits to 20.
- **Search:** ILIKE string matching on `locations`; **no full-text index**.
- **Sorting:** `parcels` by id; features by id; floors by floor_number DESC; flats by unit_number ASC.
- **Spatial:** geometry stored as JSON strings; in-memory Shapely `.intersects()` in `services/ulpin_generator.check_spatial_overlap()` used **only** by `seed_parcels.py`, not by API routes.

## 11. Request & Response Schemas

All Pydantic classes live in `backend/schemas.py`. TS counterparts live in `src/services/api.ts`.

### 11.1 Request schemas

| Model | Fields & validation (schemas.py) | Used by |
|---|---|---|
| `UserSignup` (23) | `name` str 2..120; `email` EmailStr; `password` str 6..128 | `POST /auth/signup` |
| `UserLogin` (29) | `email` EmailStr; `password` str min 1 | `POST /auth/login` |
| `FeatureUpdateRequest` (239) | `name?`, `height?` float, `notes?` — all optional | `PUT .../features/{feature_id}` |
| `FloorGenerateRequest` (263) | `floor_count` int ge 1 le 200; `basement_count` int ge 0 le 20 (default 0) | `POST .../floors/generate` |
| `FloorCreateRequest` (268) | `floor_number` int; `floor_label?` str | `POST .../floors` |
| `FloorUpdateRequest` (273) | `floor_number?`, `floor_label?` | `PUT /admin/floors/{id}` |
| `FlatGenerateRequest` (278) | `flat_count` int ge 1 le 500; `starting_unit_number` int ge 1 (default 1) | `POST .../flats/generate` |
| `FlatCreateRequest` (283) | `unit_number` str 1..50; `unit_type?` (default "Residential"); `area_sqm?` float; `owner_name?` | `POST .../flats` |
| `FlatUpdateRequest` (290) | all optional | `PUT /admin/flats/{id}` |

### 11.2 Response schemas

| Model | Fields | Notes |
|---|---|---|
| `UserResponse` (34) | `id, name, email, role, created_at` | `from_attributes=True` |
| `TokenResponse` (45) | `access_token`, `token_type="bearer"`, `user: UserResponse` | |
| `MessageResponse` (51) | `detail: str` | used by logout/delete endpoints |
| `StrataEnvelope` (59) | `type, label, range` | nested inside LocationResponse |
| `LocationResponse` (66) | `id, name, state, lat, lon, ulpin_3d, classification, area, volume, elevation, zone, description, envelopes[], geojson_features?, feature_count?` | `from_attributes=True` |
| `LocationSearchResult` (92) | lightweight subset (no volume/envelopes/geojson) | |
| `ParcelFeatureSchema` (114) | feature row incl. `geometry_json` | ⚠️ **declared but not used by any endpoint response_model** |
| `ParcelSchema` (127) | full parcel incl. nested `features[]` | ⚠️ **declared but not used by any endpoint response_model** |
| `AdminParcelRow` (143) | `id, ulpin_3d, name?, centroid_lat, centroid_lon, total_area, confidence_score, last_verified_date?, feature_count` | used by `GET /admin/parcels` |
| `ULPINValidationResult` (174) | `ulpin, valid, check_digit_expected, check_digit_found, message` | used by `.../validate` |
| `ConfidenceResult` (185) | `ulpin_3d, confidence_score, last_verified_date?, confidence_description` | used by `.../confidence` |
| `DigiLockerStub` (197) | `mock=True, ulpin_id, linked_documents: List[dict], status, note` | stub |
| `BankKYCStub` (219) | `mock=True, ulpin_id, loan_eligibility, estimated_property_value_inr, ltv_ratio_percent, status, note` | stub |
| `FeatureDetailResponse` (245) | `id, parcel_id, fid?, ulpin_3d, height?, area?, floor_level, floor_count, building_type?, feature_name?, notes?, defined_floor_count=0` | used by feature endpoints |
| `FloorResponse` (312) | `id, parcel_feature_id, floor_number, floor_ulpin?, floor_label, created_at, updated_at, flats: List[FlatResponse]=[], flat_count=0` | |
| `FlatResponse` (297) | `id, floor_id, unit_number, unit_ulpin?, unit_type, area_sqm?, owner_name?, created_at, updated_at` | |
| `AssignUlpinResponse` (327) | `id, ulpin_3d, status="assigned", message` | used by assign-ulpin endpoints |

### 11.3 Schema ↔ ORM ↔ endpoint relationship

```
UserSignup/UserLogin ──→ main.signup/login ──→ User (ORM) ──→ TokenResponse + UserResponse
LocationSearchResult ◄── search_locations ──→ Location (ORM)
LocationResponse     ◄── get_parcel ──/──→ Location (ORM, hand-mapped envelopes)
AdminParcelRow       ◄── list_admin_parcels ──→ Parcel + count(ParcelFeature)
FeatureDetailResponse ◄── feature endpoints ──→ ParcelFeature (+ count(ParcelFloor))
FloorResponse ── nested ── FlatResponse      ◄── floor endpoints ──→ ParcelFloor + ParcelFlat
```

### 11.4 Verified mismatches / gaps
1. **`ParcelSchema` and `ParcelFeatureSchema` are dead code** — defined in schemas.py but referenced by no endpoint (no `response_model=` uses them).
2. **`GET /admin/features` returns `response_model=list[dict]`** — no typed schema; clients rely on an ad-hoc key set.
3. **Role case asymmetry:** DB stores `"citizen"` (signup) vs `"SURVEYOR"` (seed) vs `_ADMIN_ROLES` accepting both spellings — a fragile string convention (§8).
4. **`ParcelDetailPage` bypasses `api.getParcel`** and fetches `/parcels/knowledge-park-2` with a raw `fetch()` (`ParcelDetailPage.tsx:29-38`); `api.getParcel`/`api.searchLocations`/`api.getConfidence` exist but are **unused** by any component (§22).
5. **`UserResponse`/frontend `UserProfile`** agree field-for-field (api.ts interfaces mirror the backend), so contract drift is low; the only risk is the ad-hoc geometric JSON string (`geojson_features`) parsed manually with `JSON.parse`.

## 12. Business Logic / Services

Most business logic sits directly inside route handlers in `main.py` (no service layer for most workflows). The two real service modules are described first.

### 12.1 `services/ulpin_generator.py` (Layer 5 — real engine)
- **`generate_ulpin(base_ulpin, vertical_level, unit_code)`** → produces `{base}-V{level:02d}-U{unit_code}-C{check}`.
- **`validate_ulpin(code)`** → `(is_valid, expected, found)`; regex `^(.+)-C(\d)$`, recomputes checksum. Returns `(False,-1,-1)` for malformed input.
- **`_compute_check_digit(payload)`** → weighted positional sum over alphanumerics (`_char_to_val` 0-61, prime weight vector length 32, `%97` then `%10`). Deterministic, position-sensitive.
- **`build_base_ulpin(state_code, district_code, zone_slug)`** → pads/truncates to exactly 14 uppercased chars.
- **`check_spatial_overlap(new_geom_geojson, db)`** → loads **all** `parcel_features` rows and tests Shapely `.intersects()` in Python memory (production would be a PostGIS `ST_Intersects` query). Gracefully no-ops when Shapely is missing.

Business rules encoded here: 3D ULPIN syntax, checksum integrity, spatial non-overlap at seed time.

### 12.2 `services/ai_extraction.py` (Layer 3 — flagged STUB)
- `extract_footprints(geojson)` → returns input `features` unchanged; logs `[Layer 3 STUB]`.
- `estimate_floor_count(feature)` → `max(1, round(est_height/3.0))` — heuristic only.
- Used by seeds, never by HTTP routes.

### 12.3 Route-level business rules (evidence per handler)
- **Registration:** one account per email; bcrypt; role hardcoded `"citizen"` — citizens can never self-escalate (there is no role-update endpoint at all, so privilege levels are effectively fixed by seeding).
- **Search:** substring (ILIKE) on 5 fields, case-insensitive, 20-row cap.
- **Parcel lookup:** Location-first, Layer-4-parcel fallback with deliberate 404 hint (public endpoint must not leak building-level ULPINs).
- **Confidence scoring:** static tier map + `last_verified_date`; "sanction-plan-verified" is the highest tier (per solution doc Novelty 4).
- **Surveyor drill-down:** hierarchy enforced via FK path `parcel → feature → floor → flat`; every nested endpoint re-validates parent existence; floor-number and unit-number uniqueness are enforced per parent with 400 responses; floor/flat generation is **idempotent per unit/floor number** (skips existing).
- **ULPIN assignment:** floor ULPINs and flat ULPINs are generated deterministically and self-checked; flat assignment has an in-building duplicate guard; **no geometry-based overlap validation is performed on assignment** (§6.10 note).

### 12.4 Cross-cutting behaviours
- **Validation:** FastAPI/Pydantic (type + bounds) at the boundary; explicit checks inside handlers for duplicates/missing parents.
- **Error handling:** only `HTTPException`; broad `except Exception` swallowed in seeds (startup continues with a `print` warning) and in `check_spatial_overlap`.
- **Side effects:** all handlers write through ORM + `db.commit()`; no event emission, no external notifications, no cache update.
- **Concurrency:** no locking, no `SELECT ... FOR UPDATE`; race on unique columns relies on SQLite constraints / prior existence checks (single-process prototype).

## 13. External Integrations

There are **no live external integrations**. Complete inventory of every "integration-like" element found:

| Provider | Purpose | SDK/client | Source files | Auth mechanism | Status |
|---|---|---|---|---|---|
| **DigiLocker (govt document vault)** | Mock document list per ULPIN | none (canned JSON) | `main.py:1299-1343`, `schemas.py: DigiLockerStub`, `api.ts: getDigilockerStub` | n/a (public) | **STUB** — `mock: true`; requires MeitY partnership + OTP consent (docstring) |
| **Bank KYC / loan eligibility** | Mock eligibility + property value | none (canned JSON) | `main.py:1344-1374`, `schemas.py: BankKYCStub`, `api.ts: getBankKycStub` | n/a (public) | **STUB** — `mock: true`; requires bilateral lender API agreements (docstring) |
| **DILRMP land records** | Ownership source (future) | none | docstrings in `models.py:144-154`, `README_ARCHITECTURE.md` | — | **Not implemented** (documented intent) |
| **Google OAuth button** | "Continue with Google" | none | `AuthSection.tsx:560-573` | — | **UI-only** — the handler only shows a success toast; no backend link |
| **Supabase** | Auth/DB via `@supabase/supabase-js` | supabase-js 2.x | `package.json:16` only | — | **Unused** — SDK is installed but never imported in `src/` (verified by search) |
| **Google Fonts** | Fonts | browser fetch | `index.html:9-14` | n/a | External static resource; not an API integration |
| **OpenStreetMap / QGIS / satellite** | Digitization basemap | QGIS | `backend/data/*.geojson`, `data/raw/README.md` | n/a | **Data input** (Layer 1), not runtime |

**Verified negative results:** no WhatsApp, Twilio, Telnyx, OpenAI, Groq, Gemini, Redis, RabbitMQ, MinIO, payment gateway, email provider, cloud provider SDK, or analytics SDK anywhere in the tracked source (searched dependency manifests + `import` statements).

## 14. Webhooks

**None.** No webhook receivers, callbacks, signature verifiers, or reverse-direction endpoints exist in the tracked repository (search for `webhook`/`callback`/`verify_signature`/`HMAC` returns nothing).

## 15. Queues / Workers / Background Tasks

**None.** Verified negatives:
- No Celery, RQ, Dramatiq, Kafka, RabbitMQ, Redis, or `asyncio` task patterns (search matched nothing beyond package-lock noise).
- No `BackgroundTasks` usage in FastAPI routes.
- The only "asynchronous-looking" work is **three `@app.on_event("startup")` seeders** (`main.py:334-371`) which run synchronously before serving: `seed_demo_surveyor`, `seed_kp2`, `seed_kp2_layer4`.
- **No API action triggers deferred processing** — every write commits synchronously inside the request.

## 16. Middleware & Security

### 16.1 Middleware inventory (complete — only one middleware exists)

| Middleware | Config (main.py:55-70) | Notes |
|---|---|---|
| `CORSMiddleware` | `allow_origins` = localhost:5173/4173/3000 (+127.0.0.1 variants + one named ngrok domain), `allow_origin_regex` matching `*.ngrok-free.dev|ngrok-free.app|ngrok.io|localhost|127.0.0.1` (+ port), `allow_credentials=True`, methods `*`, headers `*` | The only middleware. No CSRF middleware (not relevant for token-in-header API), no security headers (e.g., HSTS via middleware), no request ID/correlation middleware, no logging middleware, no rate-limit middleware, no body-size middleware. |

The Vite dev/preview server also injects HTTP cache-control headers for its own responses (`vite.config.ts:37-41,79-83`) — not security middleware.

### 16.2 Security-relevant behaviour (observed, no exploitation performed)

| Control | Present? | Evidence |
|---|---|---|
| Authentication enforcement on `/admin/*` | ✅ | `_require_admin` dependency on all 15 admin routes |
| Password hashing | ✅ | bcrypt cost 12 (`auth.py:20`) |
| JWT expiry | ✅ | 24h `exp` claim (`auth.py:42`) |
| JWT algorithm pinning | ✅ | `algorithms=["HS256"]` on decode (`auth.py:64`) |
| Secret from environment | ❌ | Hardcoded module constant (value `[REDACTED]`) |
| Rate limiting | ❌ | None anywhere |
| Input sanitization (XSS) | ⚠️ | No server-side HTML sanitization; React escapes by default; server reflects only stored text |
| SQL injection protection | ✅ | ORM parameterized queries; only raw SQL is the fixed startup `ALTER` |
| Path traversal protection on file serves | ✅ | Backend serves no static files from disk |
| File upload validation | ➖ | No upload endpoints at all |
| Token storage | ⚠️ | `localStorage` (`AuthContext.tsx:16`) — accessible to XSS; no HttpOnly cookie |
| Webhook signature verification | ➖ | No webhooks exist |
| Password change / reset endpoint | ❌ | None |
| Role management endpoints | ❌ | None (roles set only at signup/seed) |

### 16.3 Concurrency / integrity notes
- `check_same_thread=False` permits sharing the engine across threads; SQLAlchemy sessions are created per request via `get_db`.
- Duplicate-email enforcement relies on the unique index plus a pre-check; unique constraints on `ulpin_3d` exist at the DB level.
- No distributed locking needed (single process), but no `FOR UPDATE` used either.

## 17. Error Handling

Error handling is **framework-default**; there are **zero custom exception classes and zero `@app.exception_handler` registrations** in the tracked repo.

| Situation | Behaviour produced by code |
|---|---|
| Authentication failure | `401` `{"detail":"Could not validate credentials or token expired"}` + `WWW-Authenticate: Bearer` (`auth.py:54-58`) |
| Bad login creds | `401` `{"detail":"Invalid email or password. ..."}` (`main.py:437-439`) |
| Authorization failure | `403` `{"detail":"Access denied. Admin or Surveyor role required."}` (`main.py:653`) |
| Duplicate email | `400` `{"detail":"An account with this email address already exists..."}` (`main.py:409-412`) |
| Missing resource (parcel/feature/floor/flat) | `404` `{"detail":"<X> not found..."}` (per handler) |
| Duplicate floor/unit | `400` with explicit message (per handler, e.g. `"Floor <n> already exists in this building."`) |
| ULPIN collision | `400` `"ULPIN Duplicate Collision: ..."` (`main.py:1263-1273`) |
| Checksum self-check failure (assign) | `500` `"Generated ULPIN failed checksum validation."` (main.py:1198, 1281) |
| Pydantic validation failure | `422` default FastAPI `{"detail":[...]}` |
| Unhandled exception | FastAPI 500 `{"detail":"Internal Server Error"}` |
| Seed/startup failures | swallowed with `print("[Startup] WARNING: ...")` and startup continues (main.py:155-158, 262-264) |

**Frontend error mapping** (`api.ts handleResponse`): non-OK responses → reads `detail` (string) or first `detail[].msg` from 422 arrays → throws `ApiError(message, status)`; components render `e.message`.

**Observations:** consistent enough for the prototype, but there is no error-tracking/monitoring integration, no correlation IDs, and DB `IntegrityError`/`OperationalError` paths are not explicitly handled (SQLite duplicate violations surface as 500s unless pre-checked in the handler).

## 18. Configuration & Environment Variables

### 18.1 Backend
- **Zero environment variables are read by the backend** (confirmed: no `os.getenv`/`os.environ` in any tracked Python file). All configuration is hardcoded constants:
  - `SQLALCHEMY_DATABASE_URL` (`database.py:5`) — SQLite path
  - `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_HOURS` (`auth.py:11-13`)
  - CORS origins list (`main.py:57-66`)
  - Port/host (`main.py:1376` — `0.0.0.0:8000`)
- No config classes, no YAML/JSON config files, no feature flags.

### 18.2 Frontend (only place env vars exist)

| Variable | Purpose | Required? | Used by |
|---|---|---|---|
| `VITE_API_BASE_URL` | API base URL; when empty, relative paths route through Vite's proxy | Optional (default `""`) | `src/services/api.ts:212`, `src/pages/ParcelDetailPage.tsx:29` |
| `VITE_API_URL` | Alias fallback for the above | Optional (default `""`) | `src/services/api.ts:212` |

`.env.example` documents only `VITE_API_BASE_URL` (empty template). The README describes the ngrok two-tunnel setup option. There is an **untracked local `Faltu-main/.env`** whose contents were **not inspected** (per audit rules).

### 18.3 Hardcoded non-secret configuration (observations)
- CORS allow-list includes a **specific ngrok subdomain** (`causatively-gonangial-jennefer.ngrok-free.dev`) plus a broad regex for all ngrok domains — a demo-config smell that would need tightening for production.
- The Vite proxy forwards six path prefixes to `127.0.0.1:8000` (`vite.config.ts:12-35`).

## 19. Docker & Deployment

### 19.1 Containerization / CI
- **No `Dockerfile`, no `docker-compose.*`, no `.github/workflows`, no `.gitlab-ci.yml`, no Jenkins/Travis files, no Procfile, no `vercel.json`/`netlify.toml`, no K8s manifests** — verified against the full tracked file list (79 files) and `git ls-files` searches.
- No `requirements.txt` is versioned in Git for the backend (an untracked local copy exists in the working tree, outside the repository).

### 19.2 How the backend is expected to start (documented commands)
From `backend/README_ARCHITECTURE.md` (§Running the Full Pipeline):
```bash
cd backend
pip install fastapi uvicorn sqlalchemy python-jose bcrypt python-multipart shapely   # deps (also EmailStr → email-validator)
python main.py                                   # starts uvicorn on 0.0.0.0:8000, reload=True
# or: uvicorn main:app --reload
python scripts/seed_parcels.py --force           # optional re-seed
```
Startup sequence inside `main.py`:
1. `Base.metadata.create_all` (idempotent table creation)
2. Raw `ALTER TABLE parcel_features ADD COLUMN notes` (best-effort)
3. Three `on_event("startup")` seeders (demo user, KP2 Location, KP2 Layer-4 parcels)
4. Uvicorn serves on **port 8000** (`main.py:1376`)

Frontend:
```bash
npm install        # from Faltu-main/
npm run dev        # Vite dev server on port 5173 (strictPort, host), proxies /auth /api /parcels /locations /admin /integrations → 127.0.0.1:8000
npm run build      # production bundle (emptyOutDir; hashed assets)
npm run preview    # serves build on 5173 with identical proxy rules
```

### 19.3 Deployment topology (as-designed)
```
Browser ──► Vite (5173) ──(proxy)──► FastAPI (8000) ──► SQlite (backend/bhustack.db)
                 │                                             │
                 └── static assets (public/, src/assets)       └── data/kp2_parcel.geojson (seed input)
```
- No health-check contract beyond `GET /`; no readiness/liveness probes; no horizontal scaling config.
- **Startup dependency order:** backend must be listening on `127.0.0.1:8000` before the Vite proxy forwards successfully; SQLite file and GeoJSON must be present (seeds skip with warnings otherwise).

## 20. Testing

| File | Kind | What it exercises | Notes |
|---|---|---|---|
| `backend/test_api.py` | Manual smoke script (plain `urllib`, `print`, **no assertions**) | `GET /`, login (demo surveyor), `GET /auth/me`, signup, duplicate signup (400), invalid login (401), logout | Run as `python test_api.py` from `backend/` with the server already running on localhost:8000. Hitting a live **dev** database (committed `bhustack.db`) — **mutates user rows** (creates `test.citizen@example.com`). |
| Committed `__pycache__/test_api.cpython-313-pytest-9.1.1.pyc` | Evidence | — | Indicates pytest 9.1.1 has been used in this environment at some point, but **no pytest file is committed**; the only test file does not import pytest. |

- **No unit tests, no integration tests, no fixtures, no mocks, no test database** in the repository.
- **Untested areas (by absence of tests):** all admin mutating endpoints, ULPIN assignment logic, seed routines, `ulpin_generator` edge cases, schema serialization, error paths.
- Required test workflow: start backend → run `python test_api.py` → read stdout (manual pass/fail).

## 21. Dependencies

### 21.1 Backend (Python)
**No tracked requirements file.** Dependencies are documented in `backend/README_ARCHITECTURE.md` and were verified by scanning imports:

| Package | Purpose in code | Group |
|---|---|---|
| `fastapi` | Web framework (routes, deps, OpenAPI) | web framework |
| `uvicorn` | ASGI server (`main.py:1376`) | web framework |
| `sqlalchemy` | ORM + engine | database |
| `python-jose` (`jose`) | JWT sign/verify (HS256) | authentication |
| `bcrypt` | Password hashing (cost 12) | authentication |
| `pydantic` + `email-validator` | Schemas; `EmailStr` validation | validation (pydantic ships with fastapi) |
| `shapely` | Geometry repair (L2), overlap checks (L5) — **optional at runtime** (graceful import guards) | geospatial |
| `python-multipart` | Listed in README install line but **no multipart endpoint exists** | (unused) |
| stdlib `urllib`, `json`, `re`, `hashlib`, `argparse` | scripts/tests | — |

### 21.2 Frontend (package.json — versions as locked)
| Package | Purpose | Group |
|---|---|---|
| `react` / `react-dom` 18.3.1 | UI framework | web framework |
| `react-router-dom` 7.18.3 | Routing (`/`, `/parcel/:id`, `/explore/:id`, `/admin`) | web framework |
| `vite` 5.4.2, `@vitejs/plugin-react` | Build/dev server | build |
| `three` 0.169.0, `@react-three/fiber` 8.17.10, `@react-three/drei` 9.114.0, `@types/three` | 3D globe/city/hologram rendering | visualization |
| `framer-motion` 11.11.0 | Animations | UI |
| `lucide-react` 0.446.0 | Icons | UI |
| `tailwindcss` 3.4.1, `postcss`, `autoprefixer` | Styling | UI |
| `typescript` 5.5.3, `typescript-eslint`, `eslint` 9, plugins | Lint/typecheck | tooling |
| `@supabase/supabase-js` 2.57.4 | **Declared but never imported in `src/` — unused** | (unused) |

## 22. Frontend ↔ Backend API Mapping

### 22.1 Client plumbing
- **Single wrapper:** `src/services/api.ts` (`export const api = {...}` — 22 methods found by method-name scan).
- **Base URL resolution** (`api.ts:211-228`): `VITE_API_BASE_URL` → `VITE_API_URL` → `''`; if a remote host is detected but the configured URL points at localhost, it intentionally falls back to `''` (Vite proxy). Trailing slashes stripped.
- **Error handling** (`handleResponse`, api.ts:230+): parses JSON or text; non-OK → `ApiError` with a message extracted from `detail` (string or 422 array).
- **Auth token transport:** all protected calls pass `Authorization: Bearer ${token}`; token stored in `localStorage` by `AuthContext` (`bhustack_access_token`).

### 22.2 Endpoint usage matrix (backend ↔ frontend, verified by search)

| Backend endpoint | api.ts wrapper | Used by components? |
|---|---|---|
| `GET /` | none | no (informational) |
| `POST /auth/signup` | `signup` | ✅ `AuthSection` via `useAuth().signup` |
| `POST /auth/login` | `login` | ✅ `AuthSection` via `useAuth().login` |
| `GET /auth/me` | `getMe` | ✅ `AuthContext` init |
| `POST /auth/logout` | `logout` | ✅ `AuthContext.logout` |
| `GET /locations/search` | `searchLocations` | ❌ **No component calls it** — search in `AuthSection` filters static `INDIAN_LOCATIONS` client-side |
| `GET /parcels/{ulpin_id}` | `getParcel` | ❌ **Not called** — `ParcelDetailPage` does a raw `fetch(.../parcels/knowledge-park-2)` (hardcoded slug) |
| `GET /parcels/{ulpin_id}/validate` | `validateUlpin` | ✅ Admin dashboard "Validate ULPIN" |
| `GET /parcels/{ulpin_id}/confidence` | `getConfidence` | ❌ **No component calls it** |
| `GET /admin/parcels` | `getAdminParcels` | ✅ `AdminDashboard` |
| `GET /admin/features` | **no wrapper** | ❌ unused by frontend |
| `GET /admin/parcels/{id}/features` | `getParcelFeatures` | ✅ `BuildingsView` |
| `PUT .../features/{featureId}` | `updateFeature` | ✅ `BuildingsView` |
| `GET .../floors` | `getBuildingFloors` | ✅ `FloorsView`/`FlatsView` |
| `POST .../floors/generate` | `generateBuildingFloors` | ✅ `FloorsView` |
| `POST .../floors` | `createSingleFloor` | ✅ `FloorsView` |
| `PUT /admin/floors/{id}` | `updateFloor` | ✅ `FloorsView` |
| `DELETE /admin/floors/{id}` | `deleteFloor` | ✅ `FloorsView` |
| `POST /admin/floors/{id}/flats/generate` | `generateFlats` | ✅ `FlatsView` |
| `POST /admin/floors/{id}/flats` | `createSingleFlat` | ✅ `FlatsView` |
| `PUT /admin/flats/{id}` | `updateFlat` | ✅ `FlatsView` |
| `DELETE /admin/flats/{id}` | `deleteFlat` | ✅ `FlatsView` |
| `POST .../floors/{id}/assign-ulpin` | `assignFloorUlpin` | ✅ `FloorsView` |
| `POST .../flats/{id}/assign-ulpin` | `assignFlatUlpin` | ✅ `FlatsView` |
| `GET /integrations/digilocker/{id}` | `getDigilockerStub` | ✅ `AdminDashboard` |
| `GET /integrations/bank-kyc/{id}` | `getBankKycStub` | ✅ `AdminDashboard` |

### 22.3 Gaps identified
- **Backend endpoints unused by frontend:** `GET /locations/search`, `GET /parcels/{ulpin_id}` (as wrapper; raw fetch used instead), `GET /parcels/{ulpin_id}/confidence`, `GET /admin/features`, `GET /`.
- **Dead wrappers:** `api.searchLocations`, `api.getParcel`, `api.getConfidence` (no component calls them); the Google "Continue with Google" button is cosmetic (toast only).
- **Hardcoded client assumptions:** `ParcelDetailPage` requests the specific slug `knowledge-park-2`; `KP2Hologram`/`CityZoomView` consume `geojson_features` (compact JSON) or fall back to the static `/kp2_parcel.geojson`.

## 23. Source File Map

```
backend/ (the entire backend)
├── main.py                    HTTP layer + all business handlers + seeds
├── auth.py                    JWT/bcrypt + current-user dependency
├── database.py                engine/session/Base
├── models.py                  ORM models (7 tables)
├── schemas.py                 Pydantic schemas (26 classes)
├── test_api.py                manual smoke script
├── bhustack.db                committed SQLite database
├── data/…                     GeoJSON inputs + processed output + raw/README
├── scripts/preprocess_geojson.py    Layer 2 pipeline (CLI)
├── scripts/seed_parcels.py          Layer 4 seeder (CLI)
└── services/ulpin_generator.py      Layer 5 ULPIN engine
└── services/ai_extraction.py        Layer 3 STUB

src/ (frontend — API-relevant files)
├── services/api.ts                 API wrapper + TS types (mirrors schemas.py)
├── context/AuthContext.tsx         auth state, token storage
├── pages/AdminDashboard.tsx        admin portal (drill-down router)
├── pages/admin/*.tsx               Buildings/Floors/Flats views
├── pages/ParcelDetailPage.tsx      parcel detail + raw fetch of geojson
├── components/AuthSection.tsx      login/signup forms + search UI
├── data/locations.ts               static demo locations
└── utils/ulpin.ts                  client-side mock ULPIN generator (demo 3D views)
```

| File | Responsibility | Key classes/functions | Depends on |
|---|---|---|---|
| `backend/main.py` | All 26 routes, CORS, seeds, ULPIN orchestration | 26 handlers (`root`…`bank_kyc_stub`), `_require_admin`, `seed_*`, `_location_to_response`, `_extract_base_ulpin` | `auth`, `database`, `models`, `schemas`, `services.ulpin_generator` |
| `backend/auth.py` | JWT + bcrypt + auth dependency | `create_access_token`, `get_current_user`, `hash_password`, `verify_password` | `jose`, `bcrypt`, `fastapi`, `models.User`, `database` |
| `backend/database.py` | DB plumbing | `engine`, `SessionLocal`, `Base`, `get_db` | `sqlalchemy` |
| `backend/models.py` | Schema of record | `User`, `Location`, `Parcel`, `ParcelFeature`, `ParcelOwnership`, `ParcelFloor`, `ParcelFlat` | `database.Base` |
| `backend/schemas.py` | Wire contracts | 26 Pydantic classes (list §11) | `pydantic` |
| `backend/services/ulpin_generator.py` | ULPIN logic | `generate_ulpin`, `validate_ulpin`, `build_base_ulpin`, `check_spatial_overlap` | `re`, `json`, Shapely (optional) |
| `backend/services/ai_extraction.py` | AI stub | `extract_footprints`, `estimate_floor_count` | none |
| `backend/scripts/preprocess_geojson.py` | L2 pipeline | `preprocess`, `validate_crs`, `repair_geometry`, `geometry_hash`, `find_overlaps` | Shapely, hashlib |
| `backend/scripts/seed_parcels.py` | L4 seeding | `run_seed` | models, services, preprocess |
| `src/services/api.ts` | Frontend API client | `api` object (22 methods) + TS interfaces | fetch, env vars |
| `src/context/AuthContext.tsx` | Client auth state | `AuthProvider`, `useAuth` | api |
| `vite.config.ts` | Dev proxy + build | proxy maps (6 prefixes) | vite |

## 24. End-to-End Business Workflows

### W1. User registration → login → session restore
```
Signup: AuthSection (signup form) → validate (name≥2, email regex, password≥6, confirm match)
  → useAuth().signup → api.signup → POST /auth/signup
  → signup() : email normalize → dup check → bcrypt → INSERT users → JWT(sub/email/role)
  → TokenResponse 201 → localStorage + setUser
Login:  similar → POST /auth/login → verify bcrypt → JWT → TokenResponse 200 → localStorage + setUser
Restore: AuthContext mount → api.getMe(storedToken) → GET /auth/me → get_current_user decodes JWT,
  loads User → if fail, localStorage cleared
```

### W2. Citizen parcel search & 3D view (all public)
```
AuthSection search box → client-side filter of INDIAN_LOCATIONS (static)
  → selects location → onLocationSearch → Globe zoom → CityZoomView (procedural buildings, utils/ulpin.ts)
KP2: ParcelDetailPage loads /parcels/knowledge-park-2 (raw fetch)
  → get_parcel finds Location row → LocationResponse.geojson_features (compact 575-feature JSON)
  → KP2Hologram renders; fallback to static /kp2_parcel.geojson
```
(Note: the backend `/locations/search` endpoint is bypassed here entirely — see §22.)

### W3. Surveyor: full cadastral editing lifecycle (admin)
```
Login (surveyor role) → GET /admin/parcels → list
Each parcel: GET /parcels/{ulpin}/validate (public) → valid/invalid badge
Drill-down:
  Level 2 Buildings: GET /admin/parcels/{id}/features → cards; PUT .../features/{fid} edits name/height/notes
  Level 3 Floors:    GET .../features/{fid}/floors → rows;
                     POST .../floors/generate (floor_count, basement_count) OR POST .../floors (manual);
                     PUT/DELETE /admin/floors/{id}; POST /admin/floors/{id}/assign-ulpin (assign floor ULPIN)
  Level 4 Flats:     same floor list, find floor → rows;
                     POST .../floors/{id}/flats/generate (flat_count, start) OR POST .../flats (manual);
                     PUT/DELETE /admin/flats/{id}; POST /admin/flats/{id}/assign-ulpin
                     (400 on duplicate ULPIN renders as row error message)
Stub integrations: expand row → GET /integrations/digilocker/{ulpin} + /integrations/bank-kyc/{ulpin}
  → MOCK panels
```

### W4. Seeding pipeline (startup + CLI)
```
Startup:
  seed_demo_surveyor  → INSERT User (role SURVEYOR) if missing
  seed_kp2            → read data/kp2_parcel.geojson → compute centroid/area/volume →
                        build ULPIN via ulpin_generator (fallback legacy checksum) → INSERT Location
  seed_kp2_layer4     → extract_footprints (stub) → build Parcel + ParcelOwnership (GNIDA) +
                        ParcelFeature per building (ULPIN V00-U00NN) → INSERT
CLI (scripts/seed_parcels.py):
  preprocess (L2, writes data/processed/*_clean.geojson) → extract_footprints (L3 stub) →
  generate_ulpin (L5) → check_spatial_overlap (L5, flags overlapping inserts) →
  INSERT Parcel/Features/Ownership — idempotent; --force deletes + reseeds
```

### W5. ULPIN lifecycle (generation → assignment → validation)
```
Generation:  build_base_ulpin("UP","28","KP2GNIDA0A") → 14-char base
             generate_ulpin(base, level, unit) → "-V{level}-U{unit}-C{check}"
Assignment:  floor/flat assign-ulpin endpoints (see W3) — deterministic codes + self-check
Validation:  GET /parcels/{ulpin}/validate → validate_ulpin re-derives check digit (no DB)
```

## 25. API Dependency Graph

```
                    ┌────────────────────────────────────────────────┐
                    │                Browser (React SPA)            │
                    │  AuthContext ⇄ api.ts (fetch) — localStorage  │
                    └──────────────────────┬────────────────────────┘
                                           │ (relative paths or VITE_API_BASE_URL)
                                           ▼
                    ┌────────────────────────────────────────────────┐
                    │         Vite dev/preview proxy (5173)          │
                    │  /auth /api /parcels /locations /admin         │
                    │  /integrations  → 127.0.0.1:8000               │
                    └──────────────────────┬────────────────────────┘
                                           ▼
                    ┌────────────────────────────────────────────────┐
                    │        FastAPI app: main.py (port 8000)        │
                    │  CORSMiddleware → routes → Depends resolution  │
                    └──────┬──────────┬──────────┬──────────┬────────┘
                           │          │          │          │
                           ▼          ▼          ▼          ▼
                 ┌─────────────┐  ┌────────┐  ┌────────┐  ┌───────────────────┐
                 │ schemas.py  │  │ auth.py│  │services│  │ models.py (ORM)   │
                 └─────────────┘  └────────┘  └───────┬─┘  └────────┬─────────┘
                                                      │        SQLAlchemy engine │
                                                      ▼                ▼
                                       ulpin_generator ──────────► SQLite bhustack.db
                                       ai_extraction (STUB) ───► data/kp2_parcel.geojson (seed)
```

External/integration "edges" beyond the browser: **none at runtime** — DigiLocker/Bank KYC are in-process canned responses (marked `mock: true`).

## 26. Current Implementation Status

Status classification is based **only** on repository evidence.

| Component | Status | Evidence |
|---|---|---|
| FastAPI web layer (26 endpoints) | **Implemented** | all decorators in `main.py` |
| JWT + bcrypt auth | **Implemented** | `auth.py` used by all the right routes |
| L2 GeoJSON pre-processing | **Implemented** | `scripts/preprocess_geojson.py` (real CRS check/repair/dedupe/overlaps) |
| L3 AI extraction | **Stubbed (labelled)** | `services/ai_extraction.py` header: "STUB — NOT A REAL AI MODEL" |
| L4 SQLite cadastral schema + seeds | **Implemented** | `models.py`, startup seeders |
| L5 3D ULPIN engine | **Implemented** | `services/ulpin_generator.py` + live validate endpoint |
| L6 DigiLocker / Bank-KYC integration | **Stubbed (labelled)** | `mock: true` responses; docstrings explain credentials/consent requirements are missing |
| L7 Web citizen portal + admin dashboard | **Implemented** | `src/` (React/R3F); role-gated `/admin` |
| L7 Mobile field app | **Configuration-dependent / future** | explicitly "FUTURE WORK" in README_ARCHITECTURE.md |
| Supabase auth/DB | **Unused dependency** | installed in package.json, zero imports in `src/` |
| `ParcelSchema`/`ParcelFeatureSchema` | **Unused (dead code)** | defined, never referenced by an endpoint |
| `GET /admin/features` | **Implemented but client-less** | no api.ts wrapper, no component consumer |
| `api.searchLocations/getParcel/getConfidence` | **Implemented but unused** | wrappers exist; no callers |
| Tests | **Partially implemented** | single manual smoke script, no automated suite |
| Docker/CI/CD | **Not present** | no files |
| Migrations | **Not present** | `create_all` + one ad-hoc ALTER |
| Production PostgreSQL/PostGIS/3DCityDB | **Not verifiable** | described in docs only; nothing in code uses PostGIS |

## 27. Technical Observations / Risks

Each item is labelled **CONFIRMED** (directly evidenced in code) or **REQUIRES VERIFICATION** (plausible from code but not fully proven without runtime testing).

### Auth & secrets
1. **CONFIRMED — Secret in source:** JWT `SECRET_KEY` is a hardcoded module constant (`auth.py:11`), not environment-driven; no rotation path. Value `[REDACTED]`.
2. **CONFIRMED — No rate limiting / lockout on auth:** unlimited login attempts against bcrypt.
3. **CONFIRMED — Logout is cosmetic:** token stays valid 24 h after logout.
4. **CONFIRMED — Token in localStorage:** XSS-accessible; no HttpOnly cookie; no refresh-token mechanism.
5. **CONFIRMED — Role strings are case-sensitive and duplicated:** `citizen` vs `SURVEYOR` vs `_ADMIN_ROLES` set means a typo in role casing silently changes privileges.

### Architecture & code structure
6. **CONFIRMED — Monolith in one 1,376-line file:** `main.py` contains routes, business logic, seed helpers, and mapping; no routers/blueprints, hard to test in isolation.
7. **CONFIRMED — No service layer for core domain:** most rules live in handlers; `services/` only holds ULPIN + AI-stub.
8. **CONFIRMED — Dead code paths:** `ParcelSchema`, `ParcelFeatureSchema`, `api.getParcel`, `api.searchLocations`, `api.getConfidence`, `@supabase/supabase-js`.
9. **CONFIRMED — Docstring/behaviour drift:** `assign_flat_ulpin` docstring says "overlap/uniqueness check"; the implementation only does an exact-string duplicate check and never calls `check_spatial_overlap()` (§6.10).
10. **CONFIRMED — Response-shape inconsistency:** `/admin/features` has no typed response model; integration stubs are typed but canned.
11. **CONFIRMED — `GET /parcels/{ulpin_id}` returns 404 for feature-level ULPINs that actually exist** (main.py:520-526) — intentional but a potential UX trap for anyone querying a building ULPIN.

### Data & integrity
12. **CONFIRMED — SQLite file committed to Git** (`backend/bhustack.db`): 79-file tree includes a runtime database snapshot; ops hygiene risk; also note committed `__pycache__/*.pyc`.
13. **CONFIRMED — No migration framework:** a raw `ALTER TABLE` in try/except at startup is fragile (re-run every boot; silently skips if it fails for a non-"duplicate column" reason).
14. **CONFIRMED — No soft deletes / no audit trail:** user/ownership/flat deletes are hard; only floors/flats carry `updated_at`.
15. **CONFIRMED — Assign-ULPIN endpoints are NOT idempotent:** repeated calls overwrite ulpin fields with new codes (UI prevents it, API does not).
16. **REQUIRES VERIFICATION — Concurrency races:** no `FOR UPDATE`; duplicate checks are check-then-insert within a single request; under concurrent writes SQLite uniqueness violations may surface as unhandled 500s.

### Security posture
17. **CONFIRMED — CORS is very permissive for a government-data prototype:** wildcard methods/headers + credentials + broad ngrok regex + hardcoded ngrok subdomain.
18. **CONFIRMED — Demo account with known credentials seeded at startup** (documented in README_ARCHITECTURE.md); anyone who runs the repo gets an admin-capable account with credentials in the docs.
19. **CONFIRMED — No security headers / no CSRF protection / no request ID middleware.**
20. **REQUIRES VERIFICATION — XSS via reflected text:** backend stores free-text `notes`/`owner_name`/`feature_name`; React escapes by default, so risk is low but untested.

### Testing & ops
21. **CONFIRMED — Test gap:** only a print-based smoke script; no automated tests for any of the 26 endpoints.
22. **CONFIRMED — No observability:** no logging config, no metrics, no tracing, no error-tracking integration.
23. **CONFIRMED — Backend has zero environment configuration:** deployment knob of any kind (DB, secret, CORS) requires editing source.

## 28. API Quick Reference

Grouped by module. Auth column: `—` public, `JWT` bearer token, `JWT+R` bearer + admin/surveyor role.

### Authentication & Users
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | — | Register (returns JWT) |
| POST | `/auth/login` | — | Login (returns JWT) |
| GET | `/auth/me` | JWT | Current user profile |
| POST | `/auth/logout` | JWT | Logout ack (client discards token) |

### Parcels / Locations (public citizen APIs)
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/locations/search?q=` | — | Cadastral location search (≤20) |
| GET | `/parcels/{ulpin_id}` | — | Full parcel record + GeoJSON envelope |
| GET | `/parcels/{ulpin_id}/validate` | — | ULPIN check-digit validation |
| GET | `/parcels/{ulpin_id}/confidence` | — | Confidence tier + description |

### Admin / Surveyor (all JWT+R)
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/admin/parcels` | List parcels |
| GET | `/admin/features` | List building features (paged) |
| GET | `/admin/parcels/{pid}/features` | Buildings of a parcel |
| PUT | `/admin/parcels/{pid}/features/{fid}` | Edit building name/height/notes |
| GET | `/admin/parcels/{pid}/features/{fid}/floors` | Floors (nested flats) |
| POST | `/admin/parcels/{pid}/features/{fid}/floors/generate` | Bulk-create floors |
| POST | `/admin/parcels/{pid}/features/{fid}/floors` | Create single floor |
| PUT | `/admin/floors/{fid}` | Edit floor |
| DELETE | `/admin/floors/{fid}` | Delete floor (+flats) |
| POST | `/admin/floors/{fid}/flats/generate` | Bulk-create flats |
| POST | `/admin/floors/{fid}/flats` | Create single flat |
| PUT | `/admin/flats/{aid}` | Edit flat |
| DELETE | `/admin/flats/{aid}` | Delete flat |
| POST | `/admin/floors/{fid}/assign-ulpin` | Assign floor ULPIN |
| POST | `/admin/flats/{aid}/assign-ulpin` | Assign flat ULPIN |

### Stub integrations
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/integrations/digilocker/{ulpin_id}` | — | MOCK DigiLocker documents |
| GET | `/integrations/bank-kyc/{ulpin_id}` | — | MOCK loan eligibility |

### Health
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/` | — | Service banner (de-facto health) |
| GET | `/docs` `/openapi.json` | — | Auto-generated OpenAPI (FastAPI) |

## 29. New Engineer Onboarding Guide — Understand this backend in 30 minutes

Order matters. Read in this sequence with the files open:

1. **`backend/README_ARCHITECTURE.md` (5 min)** — the 7-layer concept and what is real vs stub. This is the closest thing to a design doc.
2. **`backend/main.py` (15 min)** — the whole backend. Start with:
   - top (module docstring, `FastAPI(...)`, CORS) → all routes are defined as decorated functions in file order: `/` → auth → locations/parcels → admin → integrations.
   - `_require_admin` and `_extract_base_ulpin` helpers — two small functions that explain the authorization model and ULPIN base derivation.
   - bottom (`if __name__ == "__main__"`) → how it runs.
3. **`backend/auth.py` (3 min)** — JWT creation/validation and the only auth dependency.
4. **`backend/models.py` + `backend/schemas.py` (4 min each)** — tables and wire contracts; note `schemas.py` is mirrored by `src/services/api.ts`.
5. **`backend/services/ulpin_generator.py` (3 min)** — the one genuinely novel algorithm (Layer 5).
6. **`backend/database.py` + `backend/scripts/*.py` (2 min)** — how data is created (seeds) and validated (Layer 2).

Where each concern lives:
- **Entry point:** `main.py` (run `python main.py` from `backend/`; uvicorn on port 8000).
- **Routes:** all in `main.py` — there is no `api/` or `routers/` directory.
- **Auth:** `auth.py` (JWT), enforced via dependencies in `main.py` (`get_current_user`, `_require_admin`).
- **Business logic:** inside route handlers in `main.py`; ULPIN rules in `services/ulpin_generator.py`.
- **DB models:** `models.py`; connection in `database.py`.
- **Integrations:** `main.py` (stub handlers) + `schemas.py` + frontend `api.ts` (no real providers).
- **Background workers:** none — only startup seeds in `main.py`.
- **Run the backend:** `cd Faltu-main/backend && python main.py` (or `uvicorn main:app --reload`).
- **Run the frontend:** `cd Faltu-main && npm run dev` (Vite 5173, proxies to 8000).
- **Run tests:** start the backend, then `cd Faltu-main/backend && python test_api.py` (manual smoke; requires server on :8000).
- **Trace one API (login):** `AuthSection.tsx` → `AuthContext.tsx` → `api.ts login()` → Vite proxy → `main.py login()` → `auth.py` → `models.User` → SQLite. Every other endpoint follows the same shape.

### Fastest orientation facts
- There are **26 endpoints**, all in one file; the API surface is small enough to memorise from §5/§28.
- **SQLite + committed DB file** means the app "just runs" — `bhustack.db` already contains seeded data.
- **Admin access** requires a `SURVEYOR`/`admin`/`surveyor` role; the seeded demo account is documented in `backend/README_ARCHITECTURE.md`.
- **The government integrations are fake by design** (`mock: true`) — do not treat them as real.

## 30. Final Repository Assessment

### Repo-level judgment
This is a **hackathon-grade functional prototype of a complex, ambitious domain** (3D cadastral intelligence / SIH26011). It genuinely implements:
- a complete, coherent **CRUD + specialized domain API** (26 endpoints) with **real auth**,
- a **real (if simplified) 3D-ULPIN algorithm** with live validation,
- a **real GIS pre-processing pipeline**, and
- a **working admin/surveyor workflow** end to end.

It explicitly does **not** implement (by documented design): real AI extraction, real government integrations (DigiLocker/bank), production geospatial storage (PostGIS/3DCityDB), background processing, DevOps scaffolding, and automated tests.

### Strongest assets
- Single-file readability: the entire backend is ~2,000 lines across 6 Python modules; onboarding is fast.
- The 7-layer architecture is thoughtfully documented in-repo (`README_ARCHITECTURE.md`) with explicit real/stub labels.
- The ULPIN checksum engine and Layer-2 processor are real implementations, not placeholders.
- The frontend API client faithfully mirrors backend schemas.

### Biggest risks (for a future production path)
1. **Secret/credential hygiene** — hardcoded JWT secret; demo admin account with documented password.
2. **No governance plumbing** — no migrations, no tests, no observability, no CI/CD, no rate limiting, no container story.
3. **Prototype data committed** — SQLite DB and VM bytecode (`__pycache__`) are versioned.
4. **Stub integrations could be mistaken for real** if shipped without the `mock: true` flag inspection.
5. **Monolithic `main.py`** will become a bottleneck as the domain grows.

### What was and was not verifiable
- **Verified statically:** every endpoint, schema, model, middleware, env var, integration, worker, and test present in tracked code (this report).
- **Not verified (needs runtime):** actual successful boot and response shapes against a live server; concurrency behaviour; OpenAPI serialization details of `list[dict]` responses; the committed `bhustack.db` seed state matches what startup would produce.
- **Out of scope by instruction:** content of the untracked local `.env` and untracked scratch files in the working tree.

---

### Audit verification footer (completeness self-check)
Checked via systematic repository search before finalizing:
- ✅ **All routes inventoried** — regex over `@app.get|post|put|delete...` returned exactly 26; no `APIRouter`, `include_router`, or dynamic route registration exists.
- ✅ **All models inventoried** — 7 SQLAlchemy classes in `models.py`.
- ✅ **All schemas inventoried** — 26 Pydantic classes in `schemas.py` (9 request + 17 response/stub types).
- ✅ **All services** — 2 under `services/` plus 2 CLI scripts.
- ✅ **All middleware** — CORS only; searched for any other `add_middleware`.
- ✅ **All config sources** — no Python env reads; only `VITE_API_BASE_URL`/`VITE_API_URL` (frontend).
- ✅ **No webhooks / no queues / no workers** — verified by targeted search.
- ✅ **No Docker / CI-CD** — verified against the complete tracked file list.
- ✅ **Frontend↔backend coverage matrix** — every wrapper and every raw `fetch` located.
- ✅ **Secrets check** — no credential values, `.env` content, or token material appear in this report (the hardcoded JWT secret, demo password, and any local env values are referenced only as `[REDACTED]` / pointers to source).

*End of report.*