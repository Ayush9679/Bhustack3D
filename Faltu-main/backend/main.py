"""
backend/main.py
================
Bhustack3D FastAPI Application — 7-Layer Architecture

Layers served by this module:
  Layer 6 (real):  /parcels/, /locations/, /auth/, /admin/
  Layer 6 (stub):  /integrations/digilocker/, /integrations/bank-kyc/

Database: SQLite (bhustack.db) — prototype substitute for PostgreSQL + PostGIS
See: backend/README_ARCHITECTURE.md for the full architecture documentation.
"""

from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from database import engine, Base, get_db
from models import User, Location, Parcel, ParcelFeature, ParcelFloor, ParcelFlat
from schemas import (
    UserSignup, UserLogin, UserResponse, TokenResponse, MessageResponse,
    LocationResponse, LocationSearchResult, StrataEnvelope,
    AdminParcelRow, ULPINValidationResult, ConfidenceResult,
    DigiLockerStub, BankKYCStub,
    FeatureUpdateRequest, FeatureDetailResponse,
    FloorGenerateRequest, FloorCreateRequest, FloorUpdateRequest, FloorResponse,
    FlatGenerateRequest, FlatCreateRequest, FlatUpdateRequest, FlatResponse,
    AssignUlpinResponse,
)
from services.ulpin_generator import generate_ulpin, validate_ulpin, build_base_ulpin
from auth import hash_password, verify_password, create_access_token, get_current_user
import json, os, re
from datetime import datetime, timezone

# Create SQLite tables (creates new ones without dropping existing ones)
Base.metadata.create_all(bind=engine)
with engine.connect() as _migration_conn:
    try:
        _migration_conn.execute(text("ALTER TABLE parcel_features ADD COLUMN notes TEXT"))
        _migration_conn.commit()
    except Exception:
        pass

app = FastAPI(
    title="Bhustack3D — 7-Layer Cadastral Intelligence API",
    version="2.0.0",
    description=(
        "FastAPI backend implementing the SIH26011 7-layer architecture for 3D cadastral "
        "intelligence. Layer 6 real endpoints: /auth, /locations, /parcels, /admin. "
        "Layer 6 stub endpoints (mock: true): /integrations/digilocker, /integrations/bank-kyc."
    ),
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4173",
        "http://127.0.0.1:3000",
        "https://causatively-gonangial-jennefer.ngrok-free.dev",
    ],
    allow_origin_regex=r"^https?:\/\/([a-zA-Z0-9-]+\.)*(ngrok-free\.dev|ngrok-free\.app|ngrok\.io|localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# KP2 Seed Helpers (legacy — preserves existing Location table seeding)
# ─────────────────────────────────────────────────────────────────────────────

def _compute_ulpin_check_legacy(raw: str) -> int:
    """Legacy check digit used for the Location table ULPIN (sum of digits mod 10)."""
    total = sum(int(ch) for ch in raw if ch.isdigit())
    return total % 10


def _build_kp2_compact_features(features: list) -> str:
    """
    Returns a compact JSON string containing only the fields needed by the
    frontend 3D renderer: fid, name, area_m2, est_height, and geometry.
    """
    compact = []
    for feat in features:
        props = feat.get("properties", {})
        compact.append({
            "fid": props.get("fid"),
            "name": props.get("name") or None,
            "area_m2": props.get("area_m2") or 0,
            "est_height": props.get("est_height") or 6.0,
            "building": props.get("building") or "yes",
            "geometry": feat.get("geometry"),
        })
    return json.dumps(compact, separators=(",", ":"))


def seed_kp2_location(db: Session) -> None:
    """
    One-time seed: read kp2_parcel.geojson, compute centroid, insert Location row.
    Safe to call multiple times — skips if already seeded.
    This seeds the LEGACY Location table used by the Globe / search / portal flow.
    The Layer 4 Parcel table is seeded separately via scripts/seed_parcels.py.
    """
    KP2_ID = "knowledge-park-2"
    existing = db.query(Location).filter(Location.id == KP2_ID).first()
    if existing:
        return  # already seeded

    geojson_path = os.path.join(os.path.dirname(__file__), "data", "kp2_parcel.geojson")
    if not os.path.exists(geojson_path):
        print(f"[Startup] WARNING: {geojson_path} not found — skipping KP2 seed.")
        return

    with open(geojson_path, encoding="utf-8") as f:
        gj = json.load(f)

    features = gj.get("features", [])
    if not features:
        print("[Startup] WARNING: KP2 GeoJSON has no features — skipping seed.")
        return

    # Compute centroid (average of all coordinate vertices)
    all_lons, all_lats = [], []
    total_area = 0.0
    for feat in features:
        props = feat.get("properties", {})
        total_area += props.get("area_m2") or 0
        geom = feat.get("geometry", {})
        gtype = geom.get("type", "")
        coords = geom.get("coordinates", [])
        if gtype == "Polygon":
            for ring in coords:
                for lon, lat in ring:
                    all_lons.append(lon)
                    all_lats.append(lat)
        elif gtype == "MultiPolygon":
            for poly in coords:
                for ring in poly:
                    for lon, lat in ring:
                        all_lons.append(lon)
                        all_lats.append(lat)

    centroid_lat = sum(all_lats) / len(all_lats) if all_lats else 28.4558
    centroid_lon = sum(all_lons) / len(all_lons) if all_lons else 77.5000

    # Generate 3D ULPIN using Layer 5's generator
    try:
        from services.ulpin_generator import generate_ulpin, build_base_ulpin
        base_ulpin = build_base_ulpin("UP", "28", "KP2GNIDA0A")
        ulpin_3d = generate_ulpin(base_ulpin, 0, "0000")
    except Exception:
        # Fallback to legacy method if Layer 5 module unavailable on first boot
        base_ulpin = "UP1228KP2GNIDA0A"[:14].ljust(14, "A")
        raw_for_check = base_ulpin + "0101"
        check = _compute_ulpin_check_legacy(raw_for_check)
        ulpin_3d = f"{base_ulpin}-V01-U0101-C{check}"

    area_str = f"{int(round(total_area)):,} m²"
    avg_height = 9.0
    volume_est = int(round(total_area * avg_height))
    volume_str = f"~{volume_est:,} m³"

    compact_json = _build_kp2_compact_features(features)

    kp2 = Location(
        id=KP2_ID,
        name="Knowledge Park 2, Greater Noida",
        state="Uttar Pradesh",
        lat=round(centroid_lat, 7),
        lon=round(centroid_lon, 7),
        ulpin_3d=ulpin_3d,
        classification="Industrial & Commercial Multi-Cluster (QGIS Real Data)",
        area=area_str,
        volume=volume_str,
        elevation="+198m MSL",
        zone="Knowledge Park-II, GNIDA Special Zone",
        description=(
            f"Real digitized multi-building cluster in Knowledge Park 2, Greater Noida — "
            f"includes India Expo Mart, KP-II Institute buildings, hostels, and {len(features)} "
            "individual commercial/residential/institutional structures. Data sourced from "
            "OpenStreetMap via QGIS export."
        ),
        strata_air="L3 · Commercial & Institutional Air Rights (+9m to +18m above each block)",
        strata_surface="L1 · Knowledge Park-II Industrial & Commercial Land (Ground Level)",
        strata_subsurface="L0 · NMRC Aqua Line Metro Corridor Easement (-12m to 0m)",
        geojson_features=compact_json,
        feature_count=len(features),
    )
    db.add(kp2)
    db.commit()
    print(
        f"[Startup] Seeded KP2 Location: {len(features)} features, "
        f"centroid ({centroid_lat:.6f}°N, {centroid_lon:.6f}°E), "
        f"total area {area_str}, ULPIN: {ulpin_3d}"
    )


def seed_kp2_parcels(db: Session) -> None:
    """
    Seed Layer 4 Parcel + ParcelFeature records for KP2 on startup.
    Runs the full Layer 2→3→5→4 pipeline inline (no subprocess needed).
    Safe to call multiple times — skips if already seeded.
    """
    from models import Parcel as P, ParcelFeature as PF, ParcelOwnership

    # Quick check — if any parcels exist, skip
    if db.query(P).count() > 0:
        return

    geojson_path = os.path.join(os.path.dirname(__file__), "data", "kp2_parcel.geojson")
    if not os.path.exists(geojson_path):
        print("[Startup] WARNING: GeoJSON not found — skipping Layer 4 parcel seed.")
        return

    try:
        with open(geojson_path, encoding="utf-8") as f:
            gj = json.load(f)

        from services.ulpin_generator import generate_ulpin, build_base_ulpin
        from services.ai_extraction import extract_footprints

        features = extract_footprints(gj)
        BASE_ULPIN = build_base_ulpin("UP", "28", "KP2GNIDA0A")
        cluster_ulpin = generate_ulpin(BASE_ULPIN, 0, "0000")

        all_lons, all_lats, total_area = [], [], 0.0
        for feat in features:
            props = feat.get("properties", {})
            total_area += float(props.get("area_m2") or 0)
            geom = feat.get("geometry", {})
            for ring in _iter_rings(geom):
                for lon, lat in ring:
                    all_lons.append(lon); all_lats.append(lat)

        centroid_lat = sum(all_lats) / len(all_lats) if all_lats else 28.4558
        centroid_lon = sum(all_lons) / len(all_lons) if all_lons else 77.5000

        parcel = P(
            ulpin_3d=cluster_ulpin,
            parent_land_ulpin=BASE_ULPIN,
            name="Knowledge Park 2 Parcel Cluster, Greater Noida",
            centroid_lat=round(centroid_lat, 7),
            centroid_lon=round(centroid_lon, 7),
            total_area=round(total_area, 3),
            confidence_score="satellite-only",
            last_verified_date=datetime.now(timezone.utc),
        )
        db.add(parcel)
        db.flush()

        db.add(ParcelOwnership(
            parcel_id=parcel.id,
            owner_name="GNIDA — Greater Noida Industrial Development Authority",
            aadhaar_ref=None,
            registration_doc_ref="GNIDA/KP2/MASTER-LEASE/2018/REF001 [STUB]",
            is_verified=False,
        ))

        for i, feat in enumerate(features, start=1):
            props = feat.get("properties", {})
            fid = props.get("fid", i)
            geom = feat.get("geometry", {})
            area = float(props.get("area_m2") or 0)
            height = float(props.get("est_height") or 6.0)
            floor_count = max(1, round(height / 3.0))
            feat_ulpin = generate_ulpin(BASE_ULPIN, 0, f"{i:04d}")
            db.add(PF(
                parcel_id=parcel.id,
                fid=fid,
                ulpin_3d=feat_ulpin,
                geometry_json=json.dumps(geom, separators=(",", ":")),
                height=height,
                area=area,
                floor_level=0,
                floor_count=floor_count,
                building_type=props.get("building") or "yes",
                feature_name=props.get("name") or None,
            ))

        db.commit()
        print(f"[Startup] Seeded Layer 4: {len(features)} ParcelFeature rows, cluster ULPIN: {cluster_ulpin}")

    except Exception as e:
        db.rollback()
        print(f"[Startup] WARNING: Layer 4 parcel seed failed: {e}")


def _iter_rings(geom: dict):
    """Yield coordinate rings from a Polygon or MultiPolygon geometry."""
    gtype = geom.get("type", "")
    coords = geom.get("coordinates", [])
    if gtype == "Polygon":
        yield from coords
    elif gtype == "MultiPolygon":
        for poly in coords:
            yield from poly


def _location_to_response(loc: Location) -> LocationResponse:
    """Convert a Location ORM row to a LocationResponse."""
    envelopes = [
        StrataEnvelope(type="air", label=loc.strata_air, range=loc.strata_air.split("(")[-1].rstrip(")") if "(" in loc.strata_air else ""),
        StrataEnvelope(type="surface", label=loc.strata_surface, range="Ground Level"),
        StrataEnvelope(type="subsurface", label=loc.strata_subsurface, range=loc.strata_subsurface.split("(")[-1].rstrip(")") if "(" in loc.strata_subsurface else ""),
    ]
    return LocationResponse(
        id=loc.id,
        name=loc.name,
        state=loc.state,
        lat=loc.lat,
        lon=loc.lon,
        ulpin_3d=loc.ulpin_3d,
        classification=loc.classification,
        area=loc.area,
        volume=loc.volume,
        elevation=loc.elevation,
        zone=loc.zone,
        description=loc.description,
        envelopes=envelopes,
        geojson_features=loc.geojson_features,
        feature_count=loc.feature_count,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Startup Events
# ─────────────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def seed_demo_surveyor():
    """Seed a demo administrative surveyor account if not already present."""
    db = next(get_db())
    try:
        demo_email = "rajesh.verma@bhustack.gov.in"
        existing = db.query(User).filter(User.email == demo_email).first()
        if not existing:
            demo_user = User(
                name="Dr. Rajesh Verma",
                email=demo_email,
                hashed_password=hash_password("Surveyor@123"),
                role="SURVEYOR",
            )
            db.add(demo_user)
            db.commit()
            print("[Startup] Seeded demo account: rajesh.verma@bhustack.gov.in (Role: SURVEYOR)")
    finally:
        db.close()


@app.on_event("startup")
def seed_kp2():
    """Seed the Knowledge Park 2 real parcel data (Location table)."""
    db = next(get_db())
    try:
        seed_kp2_location(db)
    finally:
        db.close()


@app.on_event("startup")
def seed_kp2_layer4():
    """Seed Layer 4 Parcel + ParcelFeature records for KP2."""
    db = next(get_db())
    try:
        seed_kp2_parcels(db)
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Health & Root
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Bhustack3D Geospatial Intelligence API",
        "version": "2.0.0",
        "architecture": "7-layer SIH26011",
        "layers": {
            "L1": "Data Acquisition — QGIS manual digitization (real)",
            "L2": "Pre-processing — Shapely validation/repair (real)",
            "L3": "AI Extraction — STUB pass-through (see /services/ai_extraction.py)",
            "L4": "3D Cadastral DB — SQLite/SQLAlchemy (real, simplified)",
            "L5": "ULPIN Generation — Verhoeff checksum (real)",
            "L6": "API Layer — /parcels /admin real; /integrations STUB",
            "L7": "Application — React citizen portal + Admin Dashboard",
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Auth Routes (unchanged)
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/auth/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(data: UserSignup, db: Session = Depends(get_db)):
    """Register a new user, store with bcrypt hash, and return access token."""
    email_clean = data.email.lower().strip()
    existing_user = db.query(User).filter(User.email == email_clean).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists. Please log in.",
        )

    new_user = User(
        name=data.name.strip(),
        email=email_clean,
        hashed_password=hash_password(data.password),
        role="citizen",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token({"sub": str(new_user.id), "email": new_user.email, "role": new_user.role})
    return TokenResponse(access_token=token, token_type="bearer", user=new_user)


@app.post("/auth/login", response_model=TokenResponse)
def login(data: UserLogin, db: Session = Depends(get_db)):
    """Authenticate email and password against bcrypt hash and issue JWT access token."""
    email_clean = data.email.lower().strip()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Please check your credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token({"sub": str(user.id), "email": user.email, "role": user.role})
    return TokenResponse(access_token=token, token_type="bearer", user=user)


@app.get("/auth/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Protected route: returns the logged-in user's profile based on the JWT token."""
    return current_user


@app.post("/auth/logout", response_model=MessageResponse)
def logout(current_user: User = Depends(get_current_user)):
    """Instruct the frontend client to discard the access token."""
    return MessageResponse(detail="Successfully logged out. Please discard your access token.")


# ─────────────────────────────────────────────────────────────────────────────
# Location / Parcel Routes (Layer 6 — Real)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/locations/search", response_model=list[LocationSearchResult])
def search_locations(
    q: str = Query(..., min_length=1, description="Search query — location name, state, ULPIN, or classification"),
    db: Session = Depends(get_db),
):
    """
    Fuzzy-search registered cadastral locations by name, state, ULPIN, or zone.
    Returns lightweight results without the heavy geojson_features blob.
    """
    term = f"%{q.lower().strip()}%"
    results = (
        db.query(Location)
        .filter(
            Location.name.ilike(term)
            | Location.state.ilike(term)
            | Location.ulpin_3d.ilike(term)
            | Location.zone.ilike(term)
            | Location.classification.ilike(term)
        )
        .limit(20)
        .all()
    )
    return [
        LocationSearchResult(
            id=loc.id,
            name=loc.name,
            state=loc.state,
            lat=loc.lat,
            lon=loc.lon,
            ulpin_3d=loc.ulpin_3d,
            classification=loc.classification,
            area=loc.area,
            elevation=loc.elevation,
            feature_count=loc.feature_count,
        )
        for loc in results
    ]


@app.get("/parcels/{ulpin_id}", response_model=LocationResponse)
def get_parcel(ulpin_id: str, db: Session = Depends(get_db)):
    """
    Retrieve full parcel data by ULPIN code or location slug.
    For multi-unit parcels (e.g. Knowledge Park 2), the response includes
    geojson_features: a JSON array of all sub-feature geometries for 3D rendering.

    Searches the Location table (legacy cluster registry) first,
    then falls back to the Parcel table (Layer 4) for feature-level lookups.
    """
    # Try Location table first (by ULPIN then by slug)
    loc = db.query(Location).filter(Location.ulpin_3d == ulpin_id).first()
    if not loc:
        loc = db.query(Location).filter(Location.id == ulpin_id).first()

    # Fallback: check Layer 4 Parcel table
    if not loc:
        parcel = db.query(Parcel).filter(Parcel.ulpin_3d == ulpin_id).first()
        if parcel:
            # Build a synthetic LocationResponse from the Parcel record
            feature_count = db.query(ParcelFeature).filter(ParcelFeature.parcel_id == parcel.id).count()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"Parcel '{ulpin_id}' found in Layer 4 DB (feature-level ULPIN). "
                    f"Use /admin/parcels to browse all parcels."
                ),
            )

    if not loc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parcel '{ulpin_id}' not found in the cadastral registry.",
        )
    return _location_to_response(loc)


@app.get("/parcels/{ulpin_id}/validate", response_model=ULPINValidationResult)
def validate_parcel_ulpin(ulpin_id: str):
    """
    Layer 5 + 6 Integration: Validate a 3D ULPIN's check digit live.

    Re-derives the check digit using the same Verhoeff-inspired algorithm used
    by generate_ulpin() and compares it against the digit embedded in the code.

    This is a genuinely functional validation — test with a deliberately corrupted
    ULPIN (e.g. change the final digit) to see it return valid: false.

    No database lookup required — validation is purely algorithmic.
    """
    from services.ulpin_generator import validate_ulpin

    is_valid, expected, found = validate_ulpin(ulpin_id)

    if expected == -1:
        # Could not parse — malformed ULPIN
        return ULPINValidationResult(
            ulpin=ulpin_id,
            valid=False,
            check_digit_expected=-1,
            check_digit_found=-1,
            message=(
                "INVALID FORMAT: Could not parse ULPIN structure. "
                "Expected format: {14-char base}-V{level}-U{unit}-C{digit}"
            ),
        )

    return ULPINValidationResult(
        ulpin=ulpin_id,
        valid=is_valid,
        check_digit_expected=expected,
        check_digit_found=found,
        message=(
            f"VALID: Check digit {found} is correct ✓"
            if is_valid
            else f"INVALID: Check digit {found} does not match expected {expected} ✗"
        ),
    )


@app.get("/parcels/{ulpin_id}/confidence", response_model=ConfidenceResult)
def get_parcel_confidence(ulpin_id: str, db: Session = Depends(get_db)):
    """
    Return the confidence score and last verified date for a parcel.

    Confidence tiers (per SIH26011 Novelty 4 — Data Authenticity):
      satellite-only         — footprint from satellite imagery only
      drone-verified         — confirmed by drone survey
      lidar-verified         — confirmed by LiDAR point cloud
      sanction-plan-verified — matched against approved building sanction plan
    """
    CONFIDENCE_DESCRIPTIONS = {
        "satellite-only": (
            "Footprint digitized from satellite imagery only. "
            "Geometry is approximate (±1-3m accuracy). "
            "Not yet validated by ground survey or official records."
        ),
        "drone-verified": (
            "Building confirmed by drone LiDAR/photogrammetry survey. "
            "Geometry accuracy ±10cm. Heights verified."
        ),
        "lidar-verified": (
            "Full LiDAR point cloud capture completed. "
            "3D model accuracy ±5cm. Floor plans verified."
        ),
        "sanction-plan-verified": (
            "Matched against approved building sanction plan. "
            "Highest confidence tier — legally validated cadastral record."
        ),
    }

    # Check Layer 4 Parcel table first
    parcel = db.query(Parcel).filter(Parcel.ulpin_3d == ulpin_id).first()
    if parcel:
        return ConfidenceResult(
            ulpin_3d=parcel.ulpin_3d,
            confidence_score=parcel.confidence_score,
            last_verified_date=parcel.last_verified_date,
            confidence_description=CONFIDENCE_DESCRIPTIONS.get(
                parcel.confidence_score, "Unknown confidence tier."
            ),
        )

    # Check legacy Location table
    loc = db.query(Location).filter(
        (Location.ulpin_3d == ulpin_id) | (Location.id == ulpin_id)
    ).first()
    if loc:
        return ConfidenceResult(
            ulpin_3d=loc.ulpin_3d,
            confidence_score="satellite-only",
            last_verified_date=None,
            confidence_description=CONFIDENCE_DESCRIPTIONS["satellite-only"],
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Parcel '{ulpin_id}' not found.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Admin / Government Dashboard Routes (Layer 7 — Real, Role-Protected)
# ─────────────────────────────────────────────────────────────────────────────

_ADMIN_ROLES = {"admin", "ADMIN", "surveyor", "SURVEYOR"}


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency: ensure the caller has admin or surveyor role."""
    if current_user.role not in _ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Admin or Surveyor role required.",
        )
    return current_user


@app.get("/admin/parcels", response_model=list[AdminParcelRow])
def list_admin_parcels(
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """
    Admin/Surveyor endpoint: list all parcels in the Layer 4 database.
    Returns lightweight rows (no geometry) for the Admin Dashboard table.
    Requires role: admin or surveyor (SURVEYOR).
    """
    parcels = db.query(Parcel).order_by(Parcel.id).all()
    rows = []
    for p in parcels:
        feat_count = db.query(ParcelFeature).filter(ParcelFeature.parcel_id == p.id).count()
        rows.append(AdminParcelRow(
            id=p.id,
            ulpin_3d=p.ulpin_3d,
            name=p.name,
            centroid_lat=p.centroid_lat,
            centroid_lon=p.centroid_lon,
            total_area=p.total_area,
            confidence_score=p.confidence_score,
            last_verified_date=p.last_verified_date,
            feature_count=feat_count,
        ))
    return rows


@app.get("/admin/features", response_model=list[dict])
def list_admin_features(
    parcel_id: int = Query(None, description="Filter by parcel ID"),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """
    Admin endpoint: list individual ParcelFeature records (per-building ULPINs).
    Requires role: admin or surveyor.
    """
    q = db.query(ParcelFeature)
    if parcel_id:
        q = q.filter(ParcelFeature.parcel_id == parcel_id)
    features = q.offset(offset).limit(limit).all()
    return [
        {
            "id": f.id,
            "parcel_id": f.parcel_id,
            "fid": f.fid,
            "ulpin_3d": f.ulpin_3d,
            "height": f.height,
            "area": f.area,
            "floor_level": f.floor_level,
            "floor_count": f.floor_count,
            "building_type": f.building_type,
            "feature_name": f.feature_name,
        }
        for f in features
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Surveyor Edit Access — Drill-Down (Parcel → Building → Floor → Flat)
# ─────────────────────────────────────────────────────────────────────────────

def _extract_base_ulpin(parcel: Parcel) -> str:
    """Extract or construct a 14-character base ULPIN from a parcel."""
    if parcel.parent_land_ulpin and len(parcel.parent_land_ulpin.strip()) == 14:
        return parcel.parent_land_ulpin.strip()
    if parcel.ulpin_3d:
        candidate = parcel.ulpin_3d.split("-")[0].strip()
        if len(candidate) == 14:
            return candidate
    return build_base_ulpin("UP", "28", "KP2GNIDA0A")


@app.get("/admin/parcels/{parcel_id}/features", response_model=list[FeatureDetailResponse])
def get_parcel_features(
    parcel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """
    List all buildings / features belonging to a parcel.
    Includes count of defined floors in parcel_floors for that building.
    """
    parcel = db.query(Parcel).filter(Parcel.id == parcel_id).first()
    if not parcel:
        raise HTTPException(status_code=404, detail=f"Parcel {parcel_id} not found.")

    features = db.query(ParcelFeature).filter(ParcelFeature.parcel_id == parcel_id).order_by(ParcelFeature.id).all()
    results = []
    for f in features:
        defined_count = db.query(ParcelFloor).filter(ParcelFloor.parcel_feature_id == f.id).count()
        results.append(FeatureDetailResponse(
            id=f.id,
            parcel_id=f.parcel_id,
            fid=f.fid,
            ulpin_3d=f.ulpin_3d,
            height=f.height,
            area=f.area,
            floor_level=f.floor_level,
            floor_count=f.floor_count,
            building_type=f.building_type,
            feature_name=f.feature_name,
            notes=getattr(f, "notes", None),
            defined_floor_count=defined_count,
        ))
    return results


@app.put("/admin/parcels/{parcel_id}/features/{feature_id}", response_model=FeatureDetailResponse)
def update_feature_attributes(
    parcel_id: int,
    feature_id: int,
    body: FeatureUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """Edit building/feature's basic attributes (name/label, height, notes)."""
    feature = db.query(ParcelFeature).filter(
        ParcelFeature.id == feature_id,
        ParcelFeature.parcel_id == parcel_id,
    ).first()
    if not feature:
        raise HTTPException(status_code=404, detail="Building / feature not found on this parcel.")

    if body.name is not None:
        feature.feature_name = body.name.strip() or None
    if body.height is not None:
        feature.height = float(body.height)
    if body.notes is not None:
        feature.notes = body.notes

    db.commit()
    db.refresh(feature)
    defined_count = db.query(ParcelFloor).filter(ParcelFloor.parcel_feature_id == feature.id).count()
    return FeatureDetailResponse(
        id=feature.id,
        parcel_id=feature.parcel_id,
        fid=feature.fid,
        ulpin_3d=feature.ulpin_3d,
        height=feature.height,
        area=feature.area,
        floor_level=feature.floor_level,
        floor_count=feature.floor_count,
        building_type=feature.building_type,
        feature_name=feature.feature_name,
        notes=getattr(feature, "notes", None),
        defined_floor_count=defined_count,
    )


@app.get("/admin/parcels/{parcel_id}/features/{feature_id}/floors", response_model=list[FloorResponse])
def list_building_floors(
    parcel_id: int,
    feature_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """Returns all floors (with nested flats) for that building."""
    feature = db.query(ParcelFeature).filter(
        ParcelFeature.id == feature_id,
        ParcelFeature.parcel_id == parcel_id,
    ).first()
    if not feature:
        raise HTTPException(status_code=404, detail="Building not found.")

    floors = (
        db.query(ParcelFloor)
        .filter(ParcelFloor.parcel_feature_id == feature_id)
        .order_by(ParcelFloor.floor_number.desc())
        .all()
    )

    results = []
    for fl in floors:
        flats = (
            db.query(ParcelFlat)
            .filter(ParcelFlat.floor_id == fl.id)
            .order_by(ParcelFlat.unit_number.asc())
            .all()
        )
        flat_schemas = [FlatResponse.model_validate(flat) for flat in flats]
        results.append(
            FloorResponse(
                id=fl.id,
                parcel_feature_id=fl.parcel_feature_id,
                floor_number=fl.floor_number,
                floor_ulpin=fl.floor_ulpin,
                floor_label=fl.floor_label,
                created_at=fl.created_at,
                updated_at=fl.updated_at,
                flats=flat_schemas,
                flat_count=len(flat_schemas),
            )
        )
    return results


@app.post("/admin/parcels/{parcel_id}/features/{feature_id}/floors/generate", response_model=list[FloorResponse])
def generate_building_floors(
    parcel_id: int,
    feature_id: int,
    body: FloorGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """
    Auto-generates floor rows for that building:
    floor numbers 1 through floor_count (plus -1 through -basement_count for basements),
    each with default floor_label ("Floor 1", "Floor 2", ... "Basement 1", etc.)
    and NO ulpin assigned yet.
    """
    feature = db.query(ParcelFeature).filter(
        ParcelFeature.id == feature_id,
        ParcelFeature.parcel_id == parcel_id,
    ).first()
    if not feature:
        raise HTTPException(status_code=404, detail="Building not found.")

    existing_numbers = {
        row[0] for row in db.query(ParcelFloor.floor_number)
        .filter(ParcelFloor.parcel_feature_id == feature_id).all()
    }

    # Basements: -1 down to -basement_count
    for b in range(1, body.basement_count + 1):
        num = -b
        if num not in existing_numbers:
            label = f"Basement {b}"
            fl = ParcelFloor(
                parcel_feature_id=feature_id,
                floor_number=num,
                floor_ulpin=None,
                floor_label=label,
            )
            db.add(fl)

    # Above ground: 1 through floor_count
    for f in range(1, body.floor_count + 1):
        if f not in existing_numbers:
            label = f"Floor {f}"
            fl = ParcelFloor(
                parcel_feature_id=feature_id,
                floor_number=f,
                floor_ulpin=None,
                floor_label=label,
            )
            db.add(fl)

    db.commit()

    total_defined = db.query(ParcelFloor).filter(ParcelFloor.parcel_feature_id == feature_id).count()
    if total_defined > feature.floor_count:
        feature.floor_count = total_defined
        db.commit()

    return list_building_floors(parcel_id, feature_id, db, current_user)


@app.post("/admin/parcels/{parcel_id}/features/{feature_id}/floors", response_model=FloorResponse)
def create_single_floor(
    parcel_id: int,
    feature_id: int,
    body: FloorCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """Surveyor manual single-floor creation."""
    feature = db.query(ParcelFeature).filter(
        ParcelFeature.id == feature_id,
        ParcelFeature.parcel_id == parcel_id,
    ).first()
    if not feature:
        raise HTTPException(status_code=404, detail="Building not found.")

    existing = db.query(ParcelFloor).filter(
        ParcelFloor.parcel_feature_id == feature_id,
        ParcelFloor.floor_number == body.floor_number,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Floor {body.floor_number} already exists in this building.")

    if body.floor_label and body.floor_label.strip():
        label = body.floor_label.strip()
    elif body.floor_number < 0:
        label = f"Basement {abs(body.floor_number)}"
    elif body.floor_number == 0:
        label = "Ground Floor"
    else:
        label = f"Floor {body.floor_number}"

    fl = ParcelFloor(
        parcel_feature_id=feature_id,
        floor_number=body.floor_number,
        floor_ulpin=None,
        floor_label=label,
    )
    db.add(fl)
    db.commit()
    db.refresh(fl)

    total_defined = db.query(ParcelFloor).filter(ParcelFloor.parcel_feature_id == feature_id).count()
    if total_defined > feature.floor_count:
        feature.floor_count = total_defined
        db.commit()

    return FloorResponse(
        id=fl.id,
        parcel_feature_id=fl.parcel_feature_id,
        floor_number=fl.floor_number,
        floor_ulpin=fl.floor_ulpin,
        floor_label=fl.floor_label,
        created_at=fl.created_at,
        updated_at=fl.updated_at,
        flats=[],
        flat_count=0,
    )


@app.put("/admin/floors/{floor_id}", response_model=FloorResponse)
def update_floor(
    floor_id: int,
    body: FloorUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """Edit a floor's label/floor_number manually."""
    floor = db.query(ParcelFloor).filter(ParcelFloor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found.")

    if body.floor_number is not None:
        conflict = db.query(ParcelFloor).filter(
            ParcelFloor.parcel_feature_id == floor.parcel_feature_id,
            ParcelFloor.floor_number == body.floor_number,
            ParcelFloor.id != floor.id,
        ).first()
        if conflict:
            raise HTTPException(status_code=400, detail=f"Floor {body.floor_number} already exists in this building.")
        floor.floor_number = body.floor_number

    if body.floor_label is not None and body.floor_label.strip():
        floor.floor_label = body.floor_label.strip()

    floor.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(floor)

    flats = db.query(ParcelFlat).filter(ParcelFlat.floor_id == floor.id).order_by(ParcelFlat.unit_number.asc()).all()
    flat_schemas = [FlatResponse.model_validate(flat) for flat in flats]
    return FloorResponse(
        id=floor.id,
        parcel_feature_id=floor.parcel_feature_id,
        floor_number=floor.floor_number,
        floor_ulpin=floor.floor_ulpin,
        floor_label=floor.floor_label,
        created_at=floor.created_at,
        updated_at=floor.updated_at,
        flats=flat_schemas,
        flat_count=len(flat_schemas),
    )


@app.delete("/admin/floors/{floor_id}", response_model=MessageResponse)
def delete_floor(
    floor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """Remove a floor (and cascade-delete its flats)."""
    floor = db.query(ParcelFloor).filter(ParcelFloor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found.")

    db.delete(floor)
    db.commit()
    return MessageResponse(detail=f"Floor {floor_id} and all its units were deleted.")


@app.post("/admin/floors/{floor_id}/flats/generate", response_model=list[FlatResponse])
def generate_flats(
    floor_id: int,
    body: FlatGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """
    Auto-generates flat rows for that floor:
    unit_number values combining floor number + sequence (e.g. floor 7 + flat 4 = "704"),
    each with NO ulpin assigned yet.
    """
    floor = db.query(ParcelFloor).filter(ParcelFloor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found.")

    existing_units = {
        row[0] for row in db.query(ParcelFlat.unit_number)
        .filter(ParcelFlat.floor_id == floor_id).all()
    }

    fl_num = floor.floor_number
    for i in range(body.flat_count):
        seq = body.starting_unit_number + i
        if fl_num > 0:
            unit_num = f"{fl_num}{seq:02d}"
        elif fl_num == 0:
            unit_num = f"G{seq:02d}"
        else:
            unit_num = f"B{abs(fl_num)}{seq:02d}"

        if unit_num not in existing_units:
            flat = ParcelFlat(
                floor_id=floor.id,
                unit_number=unit_num,
                unit_ulpin=None,
                unit_type="Residential",
                area_sqm=75.0,
                owner_name=None,
            )
            db.add(flat)

    db.commit()
    flats = db.query(ParcelFlat).filter(ParcelFlat.floor_id == floor.id).order_by(ParcelFlat.unit_number.asc()).all()
    return [FlatResponse.model_validate(f) for f in flats]


@app.post("/admin/floors/{floor_id}/flats", response_model=FlatResponse)
def create_single_flat(
    floor_id: int,
    body: FlatCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """Surveyor manual single-flat creation."""
    floor = db.query(ParcelFloor).filter(ParcelFloor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found.")

    unit_clean = body.unit_number.strip()
    existing = db.query(ParcelFlat).filter(
        ParcelFlat.floor_id == floor_id,
        ParcelFlat.unit_number == unit_clean,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Unit '{unit_clean}' already exists on this floor.")

    flat = ParcelFlat(
        floor_id=floor.id,
        unit_number=unit_clean,
        unit_ulpin=None,
        unit_type=body.unit_type or "Residential",
        area_sqm=body.area_sqm,
        owner_name=body.owner_name.strip() if body.owner_name else None,
    )
    db.add(flat)
    db.commit()
    db.refresh(flat)
    return FlatResponse.model_validate(flat)


@app.put("/admin/flats/{flat_id}", response_model=FlatResponse)
def update_flat(
    flat_id: int,
    body: FlatUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """Edit a flat's unit_number, unit_type, area_sqm, owner_name manually."""
    flat = db.query(ParcelFlat).filter(ParcelFlat.id == flat_id).first()
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found.")

    if body.unit_number is not None and body.unit_number.strip():
        unit_clean = body.unit_number.strip()
        conflict = db.query(ParcelFlat).filter(
            ParcelFlat.floor_id == flat.floor_id,
            ParcelFlat.unit_number == unit_clean,
            ParcelFlat.id != flat.id,
        ).first()
        if conflict:
            raise HTTPException(status_code=400, detail=f"Unit '{unit_clean}' already exists on this floor.")
        flat.unit_number = unit_clean

    if body.unit_type is not None:
        flat.unit_type = body.unit_type
    if body.area_sqm is not None:
        flat.area_sqm = body.area_sqm
    if body.owner_name is not None:
        flat.owner_name = body.owner_name.strip() or None

    flat.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(flat)
    return FlatResponse.model_validate(flat)


@app.delete("/admin/flats/{flat_id}", response_model=MessageResponse)
def delete_flat(
    flat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """Remove a flat."""
    flat = db.query(ParcelFlat).filter(ParcelFlat.id == flat_id).first()
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found.")

    db.delete(flat)
    db.commit()
    return MessageResponse(detail=f"Unit {flat_id} deleted.")


@app.post("/admin/floors/{floor_id}/assign-ulpin", response_model=AssignUlpinResponse)
def assign_floor_ulpin(
    floor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """
    Generates and saves a real 3D ULPIN for this floor using the EXISTING
    generate_ulpin() function from Layer 5, with vertical_level = this floor's floor_number
    and unit_code = a floor-level placeholder ("0000").
    Saves the result into floor_ulpin. Returns the generated code.
    """
    floor = db.query(ParcelFloor).filter(ParcelFloor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found.")

    feature = db.query(ParcelFeature).filter(ParcelFeature.id == floor.parcel_feature_id).first()
    if not feature:
        raise HTTPException(status_code=404, detail="Parent building not found.")

    parcel = db.query(Parcel).filter(Parcel.id == feature.parcel_id).first()
    if not parcel:
        raise HTTPException(status_code=404, detail="Parent parcel not found.")

    base_ulpin = _extract_base_ulpin(parcel)
    generated = generate_ulpin(base_ulpin, floor.floor_number, "0000")
    valid, expected, found = validate_ulpin(generated)
    if not valid:
        raise HTTPException(status_code=500, detail="Generated ULPIN failed checksum validation.")

    floor.floor_ulpin = generated
    floor.updated_at = datetime.now(timezone.utc)
    db.commit()

    return AssignUlpinResponse(
        id=floor.id,
        ulpin_3d=generated,
        status="assigned",
        message=f"Floor ULPIN '{generated}' successfully assigned with valid checksum (C{found}).",
    )


@app.post("/admin/flats/{flat_id}/assign-ulpin", response_model=AssignUlpinResponse)
def assign_flat_ulpin(
    flat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_require_admin),
):
    """
    Generates and saves a real 3D ULPIN for this flat using generate_ulpin() with
    vertical_level = its parent floor's floor_number and unit_code = its unit_number.
    Saves into unit_flat's unit_ulpin.
    Runs the EXISTING overlap/uniqueness check before saving (reject if this exact
    vertical_level + unit_code combination already has a ULPIN issued under the same
    parent building, return a clear error).
    """
    flat = db.query(ParcelFlat).filter(ParcelFlat.id == flat_id).first()
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found.")

    floor = db.query(ParcelFloor).filter(ParcelFloor.id == flat.floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Parent floor not found.")

    feature = db.query(ParcelFeature).filter(ParcelFeature.id == floor.parcel_feature_id).first()
    if not feature:
        raise HTTPException(status_code=404, detail="Parent building not found.")

    parcel = db.query(Parcel).filter(Parcel.id == feature.parcel_id).first()
    if not parcel:
        raise HTTPException(status_code=404, detail="Parent parcel not found.")

    # Clean unit code to alphanumeric (max 6 chars)
    clean_unit = re.sub(r"[^A-Za-z0-9]", "", flat.unit_number).upper()
    if not clean_unit:
        clean_unit = f"{flat.id:04d}"
    clean_unit = clean_unit[:6]

    base_ulpin = _extract_base_ulpin(parcel)
    generated_code = generate_ulpin(base_ulpin, floor.floor_number, clean_unit)

    # Overlap / uniqueness check: look for any other flat in the same parent building
    # with the same assigned unit_ulpin
    sibling_floor_ids = [
        sf.id for sf in db.query(ParcelFloor.id)
        .filter(ParcelFloor.parcel_feature_id == feature.id).all()
    ]

    conflicting_flat = (
        db.query(ParcelFlat)
        .filter(
            ParcelFlat.floor_id.in_(sibling_floor_ids),
            ParcelFlat.id != flat.id,
            ParcelFlat.unit_ulpin == generated_code,
        )
        .first()
    )

    if conflicting_flat:
        raise HTTPException(
            status_code=400,
            detail=(
                f"ULPIN Duplicate Collision: Building #{feature.fid or feature.id} already has an assigned ULPIN "
                f"'{generated_code}' at level V{floor.floor_number} for unit '{conflicting_flat.unit_number}'. "
                "A unit cannot duplicate an existing 3D strata parcel within the same building."
            ),
        )

    valid, expected, found = validate_ulpin(generated_code)
    if not valid:
        raise HTTPException(status_code=500, detail="Generated ULPIN failed internal checksum verification.")

    flat.unit_ulpin = generated_code
    flat.updated_at = datetime.now(timezone.utc)
    db.commit()

    return AssignUlpinResponse(
        id=flat.id,
        ulpin_3d=generated_code,
        status="assigned",
        message=f"Flat ULPIN '{generated_code}' assigned with verified checksum (C{found}).",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Layer 6 — Stub Integration Endpoints
# (MOCK — clearly labeled, not real government API connections)
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/integrations/digilocker/{ulpin_id}", response_model=DigiLockerStub)
def digilocker_stub(ulpin_id: str):
    """
    ╔══════════════════════════════════════════════════════════════════════════╗
    ║  STUB — NOT A REAL DIGILOCKER INTEGRATION                               ║
    ║                                                                          ║
    ║  Returns mock: true. This endpoint demonstrates the INTENT of Layer 6's  ║
    ║  DigiLocker integration point for pitch/demo purposes.                   ║
    ║                                                                          ║
    ║  A real integration would require:                                       ║
    ║    - MeitY DigiLocker Partner API credentials (government partnership)   ║
    ║    - Citizen OTP consent flow (Aadhaar-linked)                           ║
    ║    - Bilateral data sharing agreement with DILRMP                        ║
    ║                                                                          ║
    ║  None of these are available at hackathon stage.                         ║
    ╚══════════════════════════════════════════════════════════════════════════╝
    """
    return DigiLockerStub(
        mock=True,
        ulpin_id=ulpin_id,
        linked_documents=[
            {
                "doc_type": "Sale Deed",
                "doc_ref": "REGSTRY/UP/GBN/2019/00112345",
                "issued_by": "Sub-Registrar Office, Gautam Buddha Nagar",
                "verified": False,
                "note": "MOCK — not a real document",
            },
            {
                "doc_type": "Building Sanction Plan",
                "doc_ref": "GNIDA/BSP/KP2/2017/00098",
                "issued_by": "Greater Noida Industrial Development Authority",
                "verified": False,
                "note": "MOCK — not a real document",
            },
        ],
        status="mock_linked",
        note=(
            "STUB RESPONSE — mock: true. Real DigiLocker integration requires "
            "MeitY Partner API credentials and citizen OTP consent. "
            "See SIH26011 solution document Section 6 for production integration spec."
        ),
    )


@app.get("/integrations/bank-kyc/{ulpin_id}", response_model=BankKYCStub)
def bank_kyc_stub(ulpin_id: str):
    """
    ╔══════════════════════════════════════════════════════════════════════════╗
    ║  STUB — NOT A REAL BANK KYC INTEGRATION                                  ║
    ║                                                                          ║
    ║  Returns mock: true. Demonstrates Layer 6's loan-eligibility integration  ║
    ║  intent for pitch/demo purposes.                                          ║
    ║                                                                          ║
    ║  A real integration would require:                                        ║
    ║    - Bilateral API agreement with participating lenders (SBI, HDFC, etc.) ║
    ║    - RBI-compliant KYC data handling                                      ║
    ║    - Property valuation certified API (govt-approved valuers)             ║
    ╚══════════════════════════════════════════════════════════════════════════╝
    """
    return BankKYCStub(
        mock=True,
        ulpin_id=ulpin_id,
        loan_eligibility="eligible",
        estimated_property_value_inr=45_000_000,
        ltv_ratio_percent=75.0,
        status="mock_approved",
        note=(
            "STUB RESPONSE — mock: true. Real bank KYC integration requires bilateral "
            "API agreements with lenders and RBI-compliant property valuation. "
            "See SIH26011 solution document Section 6 for production integration spec."
        ),
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
