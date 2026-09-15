# -*- coding: utf-8 -*-
"""
backend/scripts/seed_parcels.py
=================================
Layer 4 Database Seeder -- Full KP2 Pipeline

This script runs the complete import pipeline for all Knowledge Park 2 features:
  Layer 2 -> Layer 3 (stub) -> Layer 5 -> Layer 4 DB insert

Usage (run from backend/ directory):
  python scripts/seed_parcels.py

It is idempotent — safe to re-run; existing parcel records are skipped
unless --force is passed.

Architecture note:
  Uses SQLite (bhustack.db) as the prototype database.
  Production would use PostgreSQL + PostGIS 3D + 3DCityDB.
  See: backend/README_ARCHITECTURE.md
"""

from __future__ import annotations
import argparse
import json
import os
import sys
from datetime import datetime, timezone

# Ensure backend/ is on the path so we can import sibling modules
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _BACKEND_DIR)

from database import engine, Base, SessionLocal
import models  # noqa: F401 — ensures tables are registered before create_all


def run_seed(force: bool = False) -> None:
    """
    Full pipeline:
      1. Layer 2: preprocess + validate KP2 GeoJSON
      2. Layer 3: AI stub pass-through
      3. Layer 5: generate 3D ULPIN per feature
      4. Layer 4: insert Parcel + ParcelFeature rows
    """
    # ── Setup ──────────────────────────────────────────────────────────────
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    print("\n" + "=" * 70)
    print("  BHUSTACK3D — LAYER 4 DATABASE SEED (KP2 Full Pipeline)")
    print("=" * 70)

    # ── Load raw GeoJSON ────────────────────────────────────────────────────
    geojson_path = os.path.join(_BACKEND_DIR, "data", "kp2_parcel.geojson")
    if not os.path.exists(geojson_path):
        print(f"  ERROR: GeoJSON not found at {geojson_path}")
        db.close()
        sys.exit(1)

    with open(geojson_path, encoding="utf-8") as f:
        geojson = json.load(f)

    # ── Layer 2: Pre-processing ─────────────────────────────────────────────
    print("\n[Layer 2] Running pre-processing pipeline...")
    from scripts.preprocess_geojson import preprocess

    processed_dir = os.path.join(_BACKEND_DIR, "data", "processed")
    os.makedirs(processed_dir, exist_ok=True)
    processed_path = os.path.join(processed_dir, "kp2_parcel_clean.geojson")

    report = preprocess(geojson_path, processed_path)

    if report["errors"]:
        print("  [Layer 2] ERRORS - aborting seed:")
        for err in report["errors"]:
            print(f"    [FAIL] {err}")
        db.close()
        sys.exit(1)

    print(f"  [OK] CRS: {report['crs_message']}")
    print(f"  [OK] Features: {report['feature_count_raw']} raw -> {report['feature_count_clean']} clean")
    if report["repaired_count"]:
        print(f"  [WARN] {report['repaired_count']} geometries repaired")
    if report["duplicate_count"]:
        print(f"  [WARN] {report['duplicate_count']} duplicates removed")
    if report["overlap_pairs"]:
        print(f"  [WARN] {len(report['overlap_pairs'])} overlap pair(s) detected")

    # Load the cleaned GeoJSON
    with open(processed_path, encoding="utf-8") as f:
        clean_geojson = json.load(f)

    # ── Layer 3: AI Stub pass-through ───────────────────────────────────────
    print("\n[Layer 3 STUB] Running AI extraction stub (pass-through)...")
    from services.ai_extraction import extract_footprints
    features = extract_footprints(clean_geojson)
    print(f"  [OK] {len(features)} features received from Layer 3 stub")

    # ── Layer 5: ULPIN Generation ───────────────────────────────────────────
    print("\n[Layer 5] Generating 3D ULPINs...")
    from services.ulpin_generator import generate_ulpin, build_base_ulpin

    BASE_ULPIN = build_base_ulpin("UP", "28", "KP2GNIDA0A")
    print(f"  Base ULPIN (14 chars): {BASE_ULPIN}")

    # ── Layer 4: Database Insert ─────────────────────────────────────────────
    print("\n[Layer 4] Inserting into SQLite database...")

    from models import Parcel, ParcelFeature, ParcelOwnership

    inserted_parcels = 0
    inserted_features = 0
    skipped = 0

    # Compute cluster centroid for the top-level Parcel record
    all_lons, all_lats = [], []
    total_area = 0.0
    for feat in features:
        props = feat.get("properties", {})
        total_area += float(props.get("area_m2") or 0)
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

    # Generate cluster-level ULPIN (V00 = cluster root, U0000 = cluster unit)
    cluster_ulpin = generate_ulpin(BASE_ULPIN, 0, "0000")

    # Check if this cluster parcel already exists
    existing_parcel = db.query(Parcel).filter(Parcel.ulpin_3d == cluster_ulpin).first()
    if existing_parcel and not force:
        print(f"  Parcel {cluster_ulpin} already seeded. Use --force to re-seed.")
        skipped = len(features)
    else:
        if existing_parcel and force:
            # Delete old data
            db.query(ParcelOwnership).filter(ParcelOwnership.parcel_id == existing_parcel.id).delete()
            db.query(ParcelFeature).filter(ParcelFeature.parcel_id == existing_parcel.id).delete()
            db.delete(existing_parcel)
            db.flush()
            print("  --force: Deleted existing parcel data, re-seeding...")

        # Insert top-level Parcel record
        parcel = Parcel(
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
        db.flush()  # Get parcel.id without committing
        inserted_parcels += 1

        # Add placeholder ownership (stub — real data would come from DILRMP)
        ownership = ParcelOwnership(
            parcel_id=parcel.id,
            owner_name="GNIDA — Greater Noida Industrial Development Authority",
            aadhaar_ref=None,  # Voluntary — not provided
            registration_doc_ref="GNIDA/KP2/MASTER-LEASE/2018/REF001 [STUB — not a real document]",
            is_verified=False,
        )
        db.add(ownership)

        # Insert one ParcelFeature per building
        for i, feat in enumerate(features, start=1):
            props = feat.get("properties", {})
            fid = props.get("fid", i)
            geom = feat.get("geometry", {})
            area = float(props.get("area_m2") or 0)
            height = float(props.get("est_height") or 6.0)
            floor_count = int(props.get("floor_count") or max(1, round(height / 3.0)))
            name = props.get("name") or None
            building_type = props.get("building") or "yes"

            # Generate unique 3D ULPIN for this feature
            unit_code = f"{i:04d}"
            feat_ulpin = generate_ulpin(BASE_ULPIN, 0, unit_code)

            # Check for spatial overlaps (topology validation — Layer 5 / Layer 7 Step 5)
            from services.ulpin_generator import check_spatial_overlap
            overlapping = check_spatial_overlap(geom, db)
            if overlapping:
                print(
                    f"  [WARN] fid={fid} overlaps with existing features: {overlapping[:3]}"
                    f"{'...' if len(overlapping) > 3 else ''} - inserting anyway (flagged)"
                )

            pf = ParcelFeature(
                parcel_id=parcel.id,
                fid=fid,
                ulpin_3d=feat_ulpin,
                geometry_json=json.dumps(geom, separators=(",", ":")),
                height=height,
                area=area,
                floor_level=0,
                floor_count=floor_count,
                building_type=building_type,
                feature_name=name,
            )
            db.add(pf)
            inserted_features += 1

            if i % 10 == 0 or i == len(features):
                print(f"  Inserted {i}/{len(features)} features...")

        db.commit()

    # ── Summary ──────────────────────────────────────────────────────────────
    print("\n" + "-" * 70)
    print("  SEED COMPLETE")
    print(f"  Parcels inserted:  {inserted_parcels}")
    print(f"  Features inserted: {inserted_features}")
    print(f"  Skipped (already exists): {skipped}")
    print(f"\n  Cluster ULPIN: {cluster_ulpin}")
    print(f"  Base ULPIN:    {BASE_ULPIN}")
    print(f"  Total area:    {total_area:,.1f} m2")
    print(f"  Centroid:      {centroid_lat:.6f}N, {centroid_lon:.6f}E")
    print("-" * 70 + "\n")

    db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Bhustack3D Layer 4 — Seed KP2 parcel data from GeoJSON"
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Delete existing KP2 parcel data and re-seed from scratch"
    )
    args = parser.parse_args()
    run_seed(force=args.force)
