#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bhustack3D  |  Knowledge Park II (KP2)  |  PHASE 1 building-footprint pipeline
===============================================================================

Produces a clean, provenance-tracked CURRENT 2D building-footprint inventory for
Knowledge Park II, Greater Noida, by merging:

  * the existing KP2 building layer  (kp2_EXPORTED.gpkg)
  * Microsoft GlobalML Building Footprints for Bing L9 QuadKey 123121312
    (downloaded from the CURRENT official dataset-links.csv, one tile only)

Phase 1 ONLY: no floor estimation, no 3D.  Satellite imagery (when supplied) is
used solely as supporting visual evidence.

Run from the project root:
    python prepare_kp2_buildings.py
    python prepare_kp2_buildings.py --refresh-links     # force fresh links CSV
    python prepare_kp2_buildings.py --force-download    # re-download the tile
    python prepare_kp2_buildings.py --config KP2_CONFIG.json

Exit code is 0 on success and non-zero on fatal errors.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import logging
import math
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from shapely.geometry import GeometryCollection, MultiPolygon, Point, Polygon, box, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

LOG = logging.getLogger("kp2")

#: Project root is ALWAYS derived from this file - never from the CWD.
PROJECT_ROOT = Path(__file__).resolve().parent


# =============================================================================
# Logging + configuration
# =============================================================================

def setup_logging(log_path: Path, level: str = "INFO") -> None:
    """Send INFO+ logs to stdout AND to log_path (UTF-8). Runs once."""
    log_path.parent.mkdir(parents=True, exist_ok=True)
    LOG.setLevel(getattr(logging, level.upper(), logging.INFO))
    fmt = logging.Formatter("%(asctime)s | %(levelname)-7s | %(message)s", "%Y-%m-%d %H:%M:%S")
    if not LOG.handlers:
        sh = logging.StreamHandler(sys.stdout)
        sh.setFormatter(fmt)
        LOG.addHandler(sh)
        fh = logging.FileHandler(log_path, encoding="utf-8")
        fh.setFormatter(fmt)
        LOG.addHandler(fh)
    else:
        LOG.warning("Logging already configured; only stdout on this run.")

def load_config(path: Path) -> Dict[str, Any]:
    """Load KP2_CONFIG.json and fail loudly when required sections are missing."""
    if not path.exists():
        raise FileNotFoundError(f"Configuration file not found: {path}")
    with open(path, "r", encoding="utf-8") as fh:
        cfg = json.load(fh)
    required = {"aoi", "microsoft", "inputs", "processing", "matching"}
    missing = required - set(cfg.keys())
    if missing:
        raise ValueError(f"{path.name} is missing required sections: {sorted(missing)}")
    return cfg


def resolve_path(value: Any) -> Path:
    """Resolve a config path relative to PROJECT_ROOT (never the CWD)."""
    p = Path(str(value))
    if not p.is_absolute():
        p = PROJECT_ROOT / p
    return p


# =============================================================================
# Input discovery
# =============================================================================

def discover_inputs(cfg: Dict[str, Any]) -> Dict[str, Path]:
    """Locate the parcel reference file and the existing building GPKG."""
    parcel = resolve_path(cfg["inputs"]["parcel_file"])
    existing = resolve_path(cfg["inputs"]["existing_gpkg"])
    if not parcel.exists():
        raise FileNotFoundError(
            f"Required input not found: {parcel}\n"
            "Place KP2_PARCEL.geojson in the project root (or set inputs.parcel_file in KP2_CONFIG.json)."
        )
    if not existing.exists():
        raise FileNotFoundError(
            f"Required input not found: {existing}\n"
            "Place kp2_EXPORTED.gpkg in the project root (or set inputs.existing_gpkg in KP2_CONFIG.json)."
        )
    return {"parcel": parcel, "existing": existing}


def find_satellite_image(cfg: Dict[str, Any]) -> Optional[Path]:
    """Find the georeferenced satellite image, or return None (pipeline continues).

    Order: 1) explicit inputs.satellite_image, 2) glob search of the project
    root and gis-source/ for kp2_satellite* / *satellite* raster files.
    """
    configured = cfg["inputs"].get("satellite_image")
    if configured:
        p = resolve_path(configured)
        if p.exists():
            LOG.info("Using configured satellite image: %s", p)
            return p
        LOG.warning(
            "Configured satellite image does not exist: %s (continuing without imagery)", p
        )

    exts = cfg["inputs"].get("search_satellite_extensions", [".tif", ".tiff", ".png", ".jpg", ".jpeg"])
    patterns: List[str] = []
    for e in exts:
        patterns += [f"kp2_satellite*{e}", f"*satellite*{e}", f"*imagery*{e}", f"*ortho*{e}"]
    found: List[Path] = []
    for d in (PROJECT_ROOT, PROJECT_ROOT / "gis-source"):
        if not d.is_dir():
            continue
        for pat in patterns:
            found.extend(d.glob(pat))
    # Prefer GeoTIFF over PNG/JPG, then larger files.
    def _rank(p: Path) -> Tuple[int, int]:
        kind = 0 if p.suffix.lower() in (".tif", ".tiff") else 1
        return (kind, -p.stat().st_size if p.exists() else 0)

    unique: List[Path] = []
    seen = set()
    for p in sorted(found, key=_rank):
        if p.resolve() in seen:
            continue
        seen.add(p.resolve())
        unique.append(p)
    if unique:
        LOG.info("Discovered satellite image candidate: %s", unique[0])
        return unique[0]
    LOG.warning(
        "No satellite image found. Set inputs.satellite_image in KP2_CONFIG.json "
        "(e.g. kp2_satellite.tif). Satellite-based validation will be SKIPPED."
    )
    return None

# =============================================================================
# Geometry helpers
# =============================================================================

def repair_geometry(geom: Any):
    """Repair an invalid/empty/collection geometry -> Polygon or MultiPolygon.

    Returns None for anything unusable so the caller can drop the feature
    warning-free.  Handles: invalid rings (buffer(0)), GeometryCollection with
    polygon parts, empty geometries, and non-polygon feature types.
    """
    if geom is None:
        return None
    if not isinstance(geom, (Polygon, MultiPolygon, GeometryCollection)):
        return None
    if geom.is_empty:
        return None
    if not geom.is_valid:
        try:
            geom = geom.buffer(0.0)
        except Exception:
            geom = None
    if geom is None or geom.is_empty:
        return None
    if isinstance(geom, GeometryCollection):
        parts = [p for p in geom.geoms if isinstance(p, (Polygon, MultiPolygon))]
        if not parts:
            return None
        geom = unary_union(parts)
    if not geom.is_valid:
        try:
            geom = make_valid(geom)
        except Exception:
            return None
    if geom is None or geom.is_empty:
        return None
    if geom.geom_type not in ("Polygon", "MultiPolygon"):
        return None
    return geom


def clean_layer(gdf: gpd.GeoDataFrame, label: str) -> Tuple[gpd.GeoDataFrame, Dict[str, int]]:
    """Repair every geometry in a frame; drop unusable rows. Returns stats."""
    stats: Dict[str, int] = {"before": int(len(gdf)), "repaired": 0, "dropped": 0, "after": 0}
    repaired: List[Any] = []
    for raw in gdf.geometry:
        g = repair_geometry(raw)
        if g is None:
            stats["dropped"] += 1
            repaired.append(None)
        else:
            if not g.equals(raw):
                stats["repaired"] += 1
            repaired.append(g)
    gdf = gdf.copy()
    gdf["geometry"] = repaired
    gdf = gdf[gdf["geometry"].notna()].copy()
    stats["after"] = int(len(gdf))
    if stats["dropped"] > 0:
        LOG.warning("%s: dropped %d unusable feature(s)", label, stats["dropped"])
    if stats["repaired"] > 0:
        LOG.info("%s: repaired %d invalid geometries", label, stats["repaired"])
    return gdf, stats


def compute_aoi(cfg: Dict[str, Any], file_bounds: Optional[Tuple[float, float, float, float]]
                ) -> Tuple[Polygon, Tuple[float, float, float, float]]:
    """Return (AOI polygon, bounds) - the file extent is authoritative.

    The hard-coded bbox from KP2_CONFIG.json is used as a validation / fallback
    AOI only when the file extent is missing or unusable.
    """
    aoi = cfg["aoi"]
    hard = (float(aoi["west"]), float(aoi["south"]), float(aoi["east"]), float(aoi["north"]))
    if file_bounds is not None and all(math.isfinite(v) for v in file_bounds):
        w, s, e, n = (float(v) for v in file_bounds)
        if abs(w - hard[0]) > 1e-4 or abs(s - hard[1]) > 1e-4 or abs(e - hard[2]) > 1e-4 or abs(n - hard[3]) > 1e-4:
            LOG.warning(
                "File extent deviates from configured AOI - using file extent. "
                "Configured=(%.6f,%.6f,%.6f,%.6f) File=(%.6f,%.6f,%.6f,%.6f)",
                hard[0], hard[1], hard[2], hard[3], w, s, e, n
            )
        return _box(w, s, e, n), (w, s, e, n)
    LOG.warning("File bounds unavailable - falling back to the configured AOI bbox.")
    return _box(*hard), hard


def _box(w: float, s: float, e: float, n: float) -> Polygon:
    """Small helper so the AOI is created consistently, wrapped in try/except."""
    try:
        return box(w, s, e, n)
    except Exception:
        raise RuntimeError(f"Invalid AOI coordinates: west={w} south={s} east={e} north={n}")


def projected_crs_for(lon: float, lat: float) -> str:
    """Pick the UTM zone that covers (lon, lat); northern/southern hemisphere aware."""
    zone = int(math.floor((lon + 180.0) / 6.0)) + 1
    zone = max(1, min(60, zone))
    base = 32600 if lat >= 0.0 else 32700
    return f"EPSG:{base + zone}"


def parse_size_to_bytes(value: Any) -> Optional[int]:
    """Parse Microsoft 'Size' strings like '98.0MB' / '391.9KB' into bytes."""
    if value is None:
        return None
    try:
        if isinstance(value, float) and math.isnan(value):
            return None
    except TypeError:
        pass
    text = str(value).strip()
    if not text:
        return None
    units = {"GB": 1e9, "MB": 1e6, "KB": 1e3, "B": 1}
    up = text.upper()
    for unit, mult in units.items():
        if up.endswith(unit):
            try:
                return int(float(text[: -len(unit)].strip()) * mult)
            except ValueError:
                return None
    try:
        return int(float(text))
    except ValueError:
        return None

# =============================================================================
# Download + cache helpers
# =============================================================================

def download_url(url: str, dest: Path, expected_bytes: Optional[int] = None,
                 force: bool = False, label: str = "") -> bool:
    """Download url to dest. Returns True if a download actually happened.

    Skips (returns False) when dest exists and its size is consistent with
    expected_bytes.  Streams to a .part temp file and renames on success, so
    failed transfers never leave a half-written cache file.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and not force:
        actual = dest.stat().st_size
        if expected_bytes is None or abs(actual - expected_bytes) <= max(1024, 0.03 * expected_bytes):
            LOG.info("CACHE HIT: %s (%s bytes)", dest.name, f"{actual:,}")
            return False
        LOG.warning("Cached file size changed (%s != %s); re-downloading.", actual, expected_bytes)

    LOG.info("Downloading %s ...", label or url)
    tmp = dest.with_name(dest.name + ".part")
    try:
        with requests.get(url, stream=True, timeout=900) as resp:
            resp.raise_for_status()
            total = 0
            with open(tmp, "wb") as fh:
                for chunk in resp.iter_content(chunk_size=256 * 1024):
                    if chunk:
                        fh.write(chunk)
                        total += len(chunk)
        if expected_bytes is not None and abs(total - expected_bytes) > max(1024, 0.05 * expected_bytes):
            tmp.unlink(missing_ok=True)
            raise RuntimeError(
                f"Download size mismatch for {url}: got {total} bytes, expected "
                f"~{expected_bytes} bytes. The link table may have changed; rerun with --refresh-links."
            )
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    shutil.move(str(tmp), str(dest))
    LOG.info("Downloaded %s (%s bytes)", dest.name, f"{total:,}")
    return True


def check_gzip_header(path: Path) -> bool:
    """Cheap gzip sanity check (full integrity is verified while parsing)."""
    try:
        with gzip.open(path, "rb") as fh:
            return fh.read(2) == b"\x1f\x8b"
    except Exception:
        return False


def fetch_dataset_links(cfg: Dict[str, Any], cache_dir: Path, force: bool = False) -> pd.DataFrame:
    """Return the CURRENT Microsoft dataset-links.csv (cached for a configurable TTL)."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    url = cfg["microsoft"]["dataset_links_url"]
    dest = cache_dir / "dataset-links.csv"
    ttl_hours = float(cfg["microsoft"].get("links_cache_ttl_hours", 24))
    if dest.exists() and not force:
        age_h = (time.time() - dest.stat().st_mtime) / 3600.0
        if age_h < ttl_hours:
            LOG.info("Using cached dataset-links.csv (age %.1f h)", age_h)
            return pd.read_csv(dest)
    download_url(url, dest, expected_bytes=None, force=True, label="Microsoft dataset-links.csv")
    df = pd.read_csv(dest)
    LOG.info("dataset-links.csv rows: %s", f"{len(df):,}")
    return df

def normalize_link_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Map whatever the CURRENT CSV calls its columns onto a stable schema."""
    rename: Dict[str, str] = {}
    for c in df.columns:
        lc = str(c).strip().lower()
        if lc in ("location", "region", "regionname"):
            rename[c] = "Location"
        elif lc in ("quadkey", "quad_key", "quadkey9"):
            rename[c] = "QuadKey"
        elif lc in ("url", "downloadurl", "download_url", "link", "fileurl"):
            rename[c] = "Url"
        elif lc in ("size", "filesize", "bytes"):
            rename[c] = "Size"
        elif lc in ("uploaddate", "date", "upload_date"):
            rename[c] = "UploadDate"
    return df.rename(columns=rename)


def select_tile_rows(df: pd.DataFrame, cfg: Dict[str, Any]) -> pd.DataFrame:
    """Filter dataset-links.csv to Location + QuadKey; fail with context if absent."""
    df = normalize_link_columns(df)
    missing = {"Location", "QuadKey", "Url"} - set(df.columns)
    if missing:
        raise RuntimeError(
            f"dataset-links.csv columns changed unexpectedly; missing {sorted(missing)}. "
            f"Actual columns: {df.columns.tolist()}\nFirst rows:\n{df.head(5).to_string()}"
        )
    loc_filter = str(cfg["microsoft"].get("location_filter", "India")).strip().lower()
    quadkey = str(cfg["microsoft"]["l9_quadkey"]).strip()
    loc = df["Location"].astype(str).str.strip()
    qv = df["QuadKey"].astype(str).str.strip()
    filtered = df[loc.str.lower().eq(loc_filter) & qv.eq(quadkey)].copy()
    if filtered.empty:
        filtered = df[loc.str.lower().str.contains(loc_filter, na=False) & qv.eq(quadkey)].copy()
    if filtered.empty:
        near = df[qv.eq(quadkey)][["Location", "QuadKey", "Url"]].head(10).to_string(index=False)
        raise RuntimeError(
            f"No dataset-links row matched Location='{loc_filter}' + QuadKey={quadkey}.\n"
            f"Rows available for that QuadKey:\n{near or '(none)'}\n"
            "The official link table may have moved. Inspect it or rerun with --refresh-links."
        )
    LOG.info("MATCHED Microsoft tile row(s): %d", len(filtered))
    for _, row in filtered.iterrows():
        LOG.info("  Location=%s QuadKey=%s Size=%s", row.get("Location"), row.get("QuadKey"), row.get("Size"))
    return filtered


def download_tile_for_rows(rows: pd.DataFrame, cfg: Dict[str, Any], cache_dir: Path,
                           force: bool = False) -> List[Path]:
    """Download the selected tile file(s) with a stable per-URL cache key."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    loc_filter = str(cfg["microsoft"].get("location_filter", "India")).replace(" ", "_")
    paths: List[Path] = []
    for _, row in rows.iterrows():
        url = str(row["Url"]).strip()
        qk = str(row["QuadKey"]).strip()
        key = hashlib.md5(url.encode("utf-8")).hexdigest()[:10]
        dest = cache_dir / f"{loc_filter}_{qk}_{key}.csv.gz"
        expected = parse_size_to_bytes(row.get("Size"))
        if dest.exists() and not force:
            actual = dest.stat().st_size
            if expected is None or abs(actual - expected) <= max(1024, 0.03 * expected):
                LOG.info("CACHE HIT: Microsoft tile %s -> %s", qk, dest.name)
                paths.append(dest)
                continue
            LOG.warning("Cached tile %s has unexpected size (%s); re-downloading.", dest.name, actual)
        download_url(url, dest, expected_bytes=expected, force=True, label=f"Microsoft tile {qk}")
        if not check_gzip_header(dest):
            raise RuntimeError(f"Downloaded tile is not a valid gzip file: {dest}")
        paths.append(dest)
    return paths

# =============================================================================
# Microsoft tile parsing
# =============================================================================

def _coords_extent(coords: Any) -> Tuple[float, float, float, float]:
    """Fast min/max(x, y) over any nested geojson coordinate list."""
    flat: List[float] = []

    def walk(v: Any) -> None:
        if isinstance(v, (int, float)):
            flat.append(float(v))
        else:
            for sub in v:
                walk(sub)

    walk(coords)
    if len(flat) < 2:
        return (0.0, 0.0, 0.0, 0.0)
    xs = flat[0::2]
    ys = flat[1::2]
    return min(xs), min(ys), max(xs), max(ys)


def parse_microsoft_tile(tile_path: Path, bounds: Tuple[float, float, float, float],
                         ) -> gpd.GeoDataFrame:
    """Stream-parse a Microsoft GeoJSONL .csv.gz, keeping footprints near KP2.

    A cheap raw-coordinate bbox check happens BEFORE shapely geometry creation,
    so the ~1M features of the whole India tile cost tens of seconds instead of
    minutes and never load 'the whole India dataset' in any meaningful sense.
    """
    west, south, east, north = bounds
    props_rows: List[Dict[str, Any]] = []
    geom_rows: List[Any] = []
    total = 0
    malformed = 0
    t0 = time.time()
    with gzip.open(tile_path, "rt", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            total += 1
            try:
                feat = json.loads(line)
            except json.JSONDecodeError:
                malformed += 1
                continue
            geom = feat.get("geometry") or {}
            gtype = geom.get("type")
            coords = geom.get("coordinates")
            if gtype not in ("Polygon", "MultiPolygon") or not coords:
                malformed += 1
                continue
            try:
                minx, miny, maxx, maxy = _coords_extent(coords)
            except Exception:
                malformed += 1
                continue
            if maxx < west or minx > east or maxy < south or miny > north:
                continue
            try:
                g = shape(geom)
            except Exception:
                malformed += 1
                continue
            if g.is_empty:
                continue
            props_rows.append(dict(feat.get("properties") or {}))
            geom_rows.append(g)
    if malformed:
        LOG.warning("parse_microsoft_tile: skipped %d malformed features", malformed)
    dt = time.time() - t0
    LOG.info(
        "Parsed %s features from %s; kept %s near AOI (%.1f s)",
        f"{total:,}", tile_path.name, f"{len(geom_rows):,}", dt
    )
    if not geom_rows:
        return gpd.GeoDataFrame({"ms_id": pd.Series([], dtype=str)}, geometry=[],
                                crs="EPSG:4326")
    df = pd.DataFrame(props_rows)
    df.insert(0, "ms_id", [f"ms-{i:06d}" for i in range(len(df))])
    gdf = gpd.GeoDataFrame(df, geometry=geom_rows, crs="EPSG:4326")
    return gdf


def normalize_ms_fields(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Map raw Microsoft properties (confidence/height) into clean columns.

    height == -1.0 means 'no estimate' in the Microsoft pipeline and becomes
    NaN here - never fabricated or replaced with a guess.
    """
    gdf = gdf.copy()
    if "confidence" in gdf.columns:
        gdf["microsoft_confidence"] = pd.to_numeric(gdf["confidence"], errors="coerce")
    else:
        gdf["microsoft_confidence"] = np.nan
    if "height" in gdf.columns:
        h = pd.to_numeric(gdf["height"], errors="coerce")
        gdf["height_raw"] = h
        gdf["microsoft_height_m"] = h.where(h > 0)  # -1 -> NaN
    else:
        gdf["height_raw"] = np.nan
        gdf["microsoft_height_m"] = np.nan
    return gdf

# =============================================================================
# Near-duplicate removal (Microsoft within-tile)
# =============================================================================

def deduplicate_near_intersecting(gdf: gpd.GeoDataFrame, metric_crs: str,
                                  iou_thr: float, area_ratio_thr: float) -> Tuple[pd.Series, Dict[str, Any]]:
    """Flag near-identical Microsoft footprints (same building digitised twice).

    Uses pairwise IoU + area-ratio in a metric CRS.  Returns:
      - dedup["is_dup"]  : bool Series indexed like gdf
      - dedup["stats"]   : summary dict
    The representative kept per duplicate group = highest confidence, then
    lowest ms_id (fully deterministic).
    """
    n = len(gdf)
    stats: Dict[str, Any] = {"groups": 0, "removed": 0, "pairs_checked": 0}
    is_dup = pd.Series(False, index=gdf.index)
    if n < 2:
        return is_dup, stats

    m = gdf.to_crs(metric_crs)
    m = m.reset_index(drop=True)
    m["_area"] = m.geometry.area
    bufs = m.geometry.buffer(2.0)
    rows, cols = m.sindex.query_bulk(bufs, predicate="intersects")
    pairs = sorted(
        (int(i), int(j)) for i, j in zip(rows, cols) if i != j
    )
    stats["pairs_checked"] = len(pairs)

    parent: Dict[int, int] = {i: i for i in range(n)}

    def _find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def _union(a: int, b: int) -> None:
        ra, rb = _find(a), _find(b)
        if ra != rb:
            parent[rb] = ra

    seen_pairs = set()
    for i, j in pairs:
        if (i, j) in seen_pairs or (j, i) in seen_pairs:
            continue
        seen_pairs.add((i, j))
        a = m.geometry.iloc[i]
        b = m.geometry.iloc[j]
        try:
            inter = a.intersection(b).area
        except Exception:
            continue
        if inter <= 0:
            continue
        a1, a2 = m["_area"].iloc[i], m["_area"].iloc[j]
        union = a1 + a2 - inter
        if union <= 0:
            continue
        iou = inter / union
        ar = min(a1, a2) / max(a1, a2) if max(a1, a2) > 0 else 0.0
        if iou >= iou_thr and ar >= area_ratio_thr:
            _union(i, j)

    groups: Dict[int, List[int]] = {}
    for i in range(n):
        groups.setdefault(_find(i), []).append(i)

    def _key(i: int) -> Tuple[float, str]:
        c = m["microsoft_confidence"].iloc[i]
        c = float(c) if pd.notna(c) else 0.0
        return (-c, str(m["ms_id"].iloc[i]))  # best confidence first

    for members in groups.values():
        if len(members) < 2:
            continue
        stats["groups"] += 1
        srt = sorted(members, key=_key)
        for dup_i in srt[1:]:
            is_dup.loc[gdf.index[dup_i]] = True
            stats["removed"] += 1
    if stats["removed"]:
        LOG.info(
            "Microsoft near-duplicate removal: %d footprint(s) flagged duplicate "
            "from %d group(s) (IoU>=%.2f, area-ratio>=%.2f)",
            stats["removed"], stats["groups"], iou_thr, area_ratio_thr
        )
    return is_dup, stats

# =============================================================================
# Footprint matching (Microsoft vs existing) in a metric CRS
# =============================================================================

def _classify_microsoft(existing: gpd.GeoDataFrame, ms: gpd.GeoDataFrame,
                        cfg: Dict[str, Any], metric_crs: str,
                        strict_bounds: Tuple[float, float, float, float],
                        ) -> List[Dict[str, Any]]:
    """Classify every Microsoft footprint against the existing footprints.

    All area / distance / IoU math happens in `metric_crs` (auto UTM zone).
    Statuses: MATCHED | POSSIBLE_DUPLICATE | LIKELY_MISSING | REVIEW |
              DROPPED_OUTSIDE_AOI
    Thresholds live in KP2_CONFIG.json under 'matching'.
    """
    mcfg = cfg["matching"]
    match_iou = float(mcfg["match_iou"])
    match_ratio_ms = float(mcfg["match_ratio_ms"])
    poss_iou = float(mcfg["possible_duplicate_iou"])
    poss_ratio_ms = float(mcfg["possible_duplicate_ratio_ms"])
    near_m = float(mcfg["near_distance_m"])
    min_area = float(cfg["processing"].get("min_building_area_m2", 5.0))

    em = existing.to_crs(metric_crs).copy().reset_index(drop=True)
    em["_area"] = em.geometry.area
    em_exid = em["existing_id"].astype(str).tolist()
    em_area = em["_area"].tolist()
    em_geom = em.geometry.tolist()
    em_sidx = em.sindex

    mm = ms.to_crs(metric_crs).copy().reset_index(drop=True)
    mm["_area"] = mm.geometry.area
    ms_geom = mm.geometry.tolist()
    ms_area = mm["_area"].tolist()

    strict_box = box(*strict_bounds)
    ms_records: List[Dict[str, Any]] = []

    for i in range(len(mm)):
        g = ms_geom[i]
        area_i = ms_area[i]
        rep = g.representative_point()
        in_strict = bool(strict_box.contains(rep))
        tiny = bool(area_i < min_area)
        buf = g.buffer(near_m)
        hits = sorted(int(h) for h in em_sidx.query(buf, predicate="intersects"))

        best: Optional[Dict[str, Any]] = None
        n_strong = 0
        inter_any = False
        for j in hits:
            try:
                inter = g.intersection(em_geom[j]).area
            except Exception:
                continue
            if inter <= 1e-9:
                continue
            inter_any = True
            ea = em_area[j]
            ratio_ms = inter / area_i if area_i > 0 else 0.0
            ratio_ex = inter / ea if ea > 0 else 0.0
            union = area_i + ea - inter
            iou = inter / union if union > 0 else 0.0
            if (iou >= match_iou) or (ratio_ms >= match_ratio_ms):
                n_strong += 1
            if best is None or iou > best["iou"]:
                best = {"eid": em_exid[j], "iou": iou, "ratio_ms": ratio_ms,
                        "ratio_ex": ratio_ex, "pos": j}

        nearest: Optional[float] = None
        if not inter_any and hits:
            try:
                nearest = float(min(g.distance(em_geom[j]) for j in hits))
            except Exception:
                nearest = None

        rec: Dict[str, Any] = {
            "ms_id": str(mm["ms_id"].iloc[i]),
            "ms_confidence": float(mm["microsoft_confidence"].iloc[i])
            if pd.notna(mm["microsoft_confidence"].iloc[i]) else None,
            "ms_height_m": float(mm["microsoft_height_m"].iloc[i])
            if pd.notna(mm["microsoft_height_m"].iloc[i]) else None,
            "ms_area_m2": float(area_i),
            "in_strict_aoi": bool(in_strict),
            "tiny_sliver": tiny,
            "nearest_dist_m": nearest,
            "n_strong": n_strong,
            "best_existing_id": best["eid"] if best else None,
            "best_iou": best["iou"] if best else 0.0,
            "best_ratio_ms": best["ratio_ms"] if best else 0.0,
            "best_ratio_ex": best["ratio_ex"] if best else 0.0,
            "status": "UNSET",
            "review_reason": None,
        }

        if n_strong >= 2:
            rec.update(status="REVIEW", review_reason=(
                f"this Microsoft footprint overlaps {n_strong} existing footprint(s) strongly"))
        elif best is not None and (best["iou"] >= match_iou or best["ratio_ms"] >= match_ratio_ms):
            rec.update(status="MATCHED")
        elif best is not None and (best["iou"] >= poss_iou or best["ratio_ms"] >= poss_ratio_ms):
            rec.update(status="POSSIBLE_DUPLICATE", review_reason=(
                f"moderate overlap with existing footprint {best['eid']} "
                f"(iou={best['iou']:.3f}, ms-ratio={best['ratio_ms']:.3f})"))
        elif inter_any:
            rec.update(status="REVIEW", review_reason=(
                f"weak/sliver overlap with existing footprint {best['eid'] if best else '?'}"))
        elif hits:
            similar = any(abs(em_area[j] - area_i) / max(area_i, 1.0) <= 0.5 for j in hits)
            if similar and nearest is not None and nearest <= near_m:
                rec.update(status="REVIEW", review_reason=(
                    f"disjoint but similar-size existing footprint(s) within ~{near_m:.0f} m; "
                    "verify not a duplicate"))
            elif in_strict:
                rec.update(status="LIKELY_MISSING")
            else:
                rec.update(status="DROPPED_OUTSIDE_AOI")
        elif in_strict:
            rec.update(status="LIKELY_MISSING")
        else:
            rec.update(status="DROPPED_OUTSIDE_AOI")

        if rec["status"] == "LIKELY_MISSING" and tiny:
            rec.update(status="REVIEW", review_reason=(
                "tiny Microsoft footprint (< min_building_area_m2); verify manually"))

        ms_records.append(rec)

    return ms_records

def _assemble_existing(existing: gpd.GeoDataFrame, ms_records: List[Dict[str, Any]],
                       ) -> List[Dict[str, Any]]:
    """Map matched Microsoft footprints back onto the existing footprints."""
    matched_by_eid: Dict[str, List[Dict[str, Any]]] = {}
    poss_by_eid: Dict[str, List[Dict[str, Any]]] = {}
    for rec in ms_records:
        if rec["status"] == "MATCHED" and rec["best_existing_id"]:
            matched_by_eid.setdefault(rec["best_existing_id"], []).append(rec)
        elif rec["status"] == "POSSIBLE_DUPLICATE" and rec["best_existing_id"]:
            poss_by_eid.setdefault(rec["best_existing_id"], []).append(rec)

    existing_records: List[Dict[str, Any]] = []
    for pos, exid in enumerate(existing["existing_id"].astype(str).tolist()):
        geom = existing.geometry.iloc[pos]
        name = existing["name"].iloc[pos] if "name" in existing.columns else None
        matched = matched_by_eid.get(exid, [])
        possible = poss_by_eid.get(exid, [])
        if matched:
            primary = max(matched, key=lambda r: r["best_iou"])
            status, src = "MATCHED_EXISTING", "BOTH"
            reason = None
            if len(matched) > 1:
                reason = (
                    f"{len(matched)} Microsoft footprints matched this existing footprint; "
                    "likely a large complex digitised as several polygons."
                )
            existing_records.append({
                "existing_id": exid, "match_status": status, "source": src,
                "matched_ms_ids": sorted(r["ms_id"] for r in matched),
                "primary_ms_id": primary["ms_id"],
                "best_iou": primary["best_iou"], "best_ratio_ms": primary["best_ratio_ms"],
                "best_ratio_ex": primary["best_ratio_ex"],
                "ms_confidence": primary["ms_confidence"], "ms_height_m": primary["ms_height_m"],
                "review_reason": reason, "geometry": geom,
                "existing_name": name,
            })
        elif possible:
            primary = max(possible, key=lambda r: r["best_iou"])
            existing_records.append({
                "existing_id": exid, "match_status": "EXISTING_BASE", "source": "EXISTING",
                "matched_ms_ids": [], "primary_ms_id": None,
                "best_iou": primary["best_iou"], "best_ratio_ms": primary["best_ratio_ms"],
                "best_ratio_ex": primary["best_ratio_ex"],
                "ms_confidence": primary["ms_confidence"], "ms_height_m": primary["ms_height_m"],
                "review_reason": "possible-duplicate Microsoft footprint overlaps this building",
                "geometry": geom, "existing_name": name,
            })
        else:
            existing_records.append({
                "existing_id": exid, "match_status": "EXISTING_BASE", "source": "EXISTING",
                "matched_ms_ids": [], "primary_ms_id": None,
                "best_iou": 0.0, "best_ratio_ms": 0.0, "best_ratio_ex": 0.0,
                "ms_confidence": None, "ms_height_m": None,
                "review_reason": None, "geometry": geom, "existing_name": name,
            })
    return existing_records


def match_and_classify(existing: gpd.GeoDataFrame, ms: gpd.GeoDataFrame,
                       cfg: Dict[str, Any], metric_crs: str,
                       strict_bounds: Tuple[float, float, float, float],
                       ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Run the full matching pipeline.  Returns (ms_records, existing_records)."""
    ms_records = _classify_microsoft(existing, ms, cfg, metric_crs, strict_bounds)
    existing_records = _assemble_existing(existing, ms_records)

    summary: Dict[str, int] = {}
    for rec in ms_records:
        summary[rec["status"]] = summary.get(rec["status"], 0) + 1
    LOG.info(
        "Matching summary (Microsoft): matched=%d possible_dup=%d likely_missing=%d "
        "review=%d dropped_outside_aoi=%d",
        summary.get("MATCHED", 0), summary.get("POSSIBLE_DUPLICATE", 0),
        summary.get("LIKELY_MISSING", 0), summary.get("REVIEW", 0),
        summary.get("DROPPED_OUTSIDE_AOI", 0),
    )
    return ms_records, existing_records

# =============================================================================
# Final layer assembly
# =============================================================================

FINAL_COLUMNS: List[str] = [
    "building_id", "source", "source_ids", "area_m2",
    "centroid_lon", "centroid_lat",
    "height_m", "microsoft_height_m", "microsoft_confidence",
    "matched_existing_id",
    "overlap_ratio_ms_to_existing", "overlap_ratio_existing_to_ms", "iou",
    "candidate_status", "review_reason",
    "existing_id", "ms_id", "name", "microsoft_tile_url",
    "floor_count", "basement_count", "ground_floor", "top_floor",
    "building_name", "plot_no", "gnida_allotment_no", "rera_no",
    "geometry",
]

#: Phase-2 columns reserved for manual entry - never fabricated by this script.
PHASE2_COLUMNS: List[str] = [
    "floor_count", "basement_count", "ground_floor", "top_floor",
    "building_name", "plot_no", "gnida_allotment_no", "rera_no",
]


def _exid_est_heights(existing: gpd.GeoDataFrame) -> Dict[str, Dict[str, Any]]:
    """Map existing_id -> {est_height, building:levels} directly from the OSM layer."""
    out: Dict[str, Dict[str, Any]] = {}
    for pos, exid in enumerate(existing["existing_id"].astype(str).tolist()):
        rec: Dict[str, Any] = {}
        if "est_height" in existing.columns:
            rec["est_height"] = pd.to_numeric(existing["est_height"].iloc[pos], errors="coerce")
        else:
            rec["est_height"] = None
        if "building:levels" in existing.columns:
            rec["building_levels"] = existing["building:levels"].iloc[pos]
        else:
            rec["building_levels"] = None
        out[exid] = rec
    return out


def ms_status_mapping(status: str) -> str:
    """Map a per-MS classification to the FINAL candidate_status vocabulary."""
    return {
        "MATCHED": "MATCHED_EXISTING",
        "POSSIBLE_DUPLICATE": "REVIEW",
        "LIKELY_MISSING": "LIKELY_MISSING",
        "REVIEW": "REVIEW",
        "DROPPED_OUTSIDE_AOI": "DROPPED_OUTSIDE_AOI",
        "DUPLICATE_REMOVED": "DUPLICATE_REMOVED",
    }.get(status, "REVIEW")


def build_final_gdf(existing: gpd.GeoDataFrame, existing_records: List[Dict[str, Any]],
                    ms_records: List[Dict[str, Any]], geom_by_msid: Dict[str, Any],
                    metric_crs: str, tile_url: str,
                    ) -> Tuple[gpd.GeoDataFrame, Dict[str, str], Dict[str, str]]:
    """Assemble the clean final 2D layer plus bid-lookup maps for the CSV."""
    est = _exid_est_heights(existing)
    rows: List[Dict[str, Any]] = []
    exid_to_bid: Dict[str, str] = {}
    msid_to_bid: Dict[str, str] = {}

    # --- existing-derived records -------------------------------------------
    for er in existing_records:
        exid = er["existing_id"]
        e = est.get(exid, {})
        src_ids = [exid] + list(er.get("matched_ms_ids", []))
        rows.append({
            "source": er["source"],
            "source_ids": json.dumps(src_ids),
            "height_m": e.get("est_height"),
            "microsoft_height_m": er.get("ms_height_m"),
            "microsoft_confidence": er.get("ms_confidence"),
            "matched_existing_id": exid,
            "overlap_ratio_ms_to_existing": er["best_ratio_ms"],
            "overlap_ratio_existing_to_ms": er["best_ratio_ex"],
            "iou": er["best_iou"],
            "candidate_status": er["match_status"],
            "review_reason": er.get("review_reason"),
            "existing_id": exid,
            "ms_id": None,
            "name": er.get("existing_name"),
            "geometry": er["geometry"],
        })

    # --- Microsoft-derived records (only those that enter the final layer) ---
    for rec in sorted(ms_records, key=lambda r: r["ms_id"]):
        if rec["status"] not in ("LIKELY_MISSING", "REVIEW"):
            continue
        geom = geom_by_msid.get(rec["ms_id"])
        if geom is None:
            LOG.warning("No geometry for %s; skipping record in final layer", rec["ms_id"])
            continue
        rows.append({
            "source": "MICROSOFT",
            "source_ids": json.dumps([rec["ms_id"]]),
            "height_m": None,
            "microsoft_height_m": rec.get("ms_height_m"),
            "microsoft_confidence": rec.get("ms_confidence"),
            "matched_existing_id": rec.get("best_existing_id"),
            "overlap_ratio_ms_to_existing": rec.get("best_ratio_ms", 0.0),
            "overlap_ratio_existing_to_ms": rec.get("best_ratio_ex", 0.0),
            "iou": rec.get("best_iou", 0.0),
            "candidate_status": ms_status_mapping(rec["status"]),
            "review_reason": rec.get("review_reason"),
            "existing_id": None,
            "ms_id": rec["ms_id"],
            "name": None,
            "geometry": geom,
        })

    gdf = gpd.GeoDataFrame(rows, geometry=[r["geometry"] for r in rows], crs="EPSG:4326")

    # metric attributes (never computed in EPSG:4326)
    gdf["area_m2"] = gdf.to_crs(metric_crs).geometry.area
    gdf["centroid_lon"] = gdf.geometry.centroid.x
    gdf["centroid_lat"] = gdf.geometry.centroid.y

    # phase-2 reserved columns (all null - manual entry later)
    for col in PHASE2_COLUMNS:
        gdf[col] = None

    # deterministic record ordering / ids
    gdf["_sort"] = gdf["existing_id"].fillna(gdf["ms_id"]).astype(str)
    gdf = gdf.sort_values("_sort", kind="mergesort").reset_index(drop=True)
    gdf["building_id"] = [f"KP2-{i + 1:05d}" for i in range(len(gdf))]
    gdf["microsoft_tile_url"] = tile_url
    gdf = gdf[FINAL_COLUMNS]

    for _, row in gdf.iterrows():
        if pd.notna(row["existing_id"]):
            exid_to_bid[str(row["existing_id"])] = row["building_id"]
        if pd.notna(row["ms_id"]):
            msid_to_bid[str(row["ms_id"])] = row["building_id"]
    return gdf, exid_to_bid, msid_to_bid

# =============================================================================
# Comparison CSV (full provenance table)
# =============================================================================

COMPARISON_COLUMNS: List[str] = [
    "record_kind", "building_id", "source", "source_ids",
    "existing_id", "ms_id",
    "ms_confidence", "ms_height_m", "ms_area_m2",
    "in_strict_aoi", "nearest_dist_m", "n_strong",
    "matched_existing_id",
    "overlap_ratio_ms_to_existing", "overlap_ratio_existing_to_ms", "iou",
    "classification", "candidate_status", "review_reason",
]


def _build_comparison(ms_records: List[Dict[str, Any]], existing_records: List[Dict[str, Any]],
                      exid_to_bid: Dict[str, str], msid_to_bid: Dict[str, str],
                      ) -> pd.DataFrame:
    """One row per existing building and per Microsoft footprint (full audit)."""
    rows: List[Dict[str, Any]] = []

    for er in existing_records:
        exid = er["existing_id"]
        rows.append({
            "record_kind": "EXISTING",
            "building_id": exid_to_bid.get(exid, ""),
            "source": er["source"],
            "source_ids": json.dumps([exid] + list(er.get("matched_ms_ids", []))),
            "existing_id": exid,
            "ms_id": None,
            "ms_confidence": er.get("ms_confidence"),
            "ms_height_m": er.get("ms_height_m"),
            "ms_area_m2": None,
            "in_strict_aoi": True,
            "nearest_dist_m": None,
            "n_strong": None,
            "matched_existing_id": exid,
            "overlap_ratio_ms_to_existing": er.get("best_ratio_ms", 0.0),
            "overlap_ratio_existing_to_ms": er.get("best_ratio_ex", 0.0),
            "iou": er.get("best_iou", 0.0),
            "classification": er["match_status"],
            "candidate_status": er["match_status"],
            "review_reason": er.get("review_reason"),
        })

    for rec in sorted(ms_records, key=lambda r: r["ms_id"]):
        msid = rec["ms_id"]
        rows.append({
            "record_kind": "MICROSOFT",
            "building_id": msid_to_bid.get(msid, ""),
            "source": "MICROSOFT",
            "source_ids": json.dumps([msid]),
            "existing_id": rec.get("best_existing_id"),
            "ms_id": msid,
            "ms_confidence": rec.get("ms_confidence"),
            "ms_height_m": rec.get("ms_height_m"),
            "ms_area_m2": rec.get("ms_area_m2"),
            "in_strict_aoi": rec.get("in_strict_aoi"),
            "nearest_dist_m": rec.get("nearest_dist_m"),
            "n_strong": rec.get("n_strong"),
            "matched_existing_id": rec.get("best_existing_id"),
            "overlap_ratio_ms_to_existing": rec.get("best_ratio_ms", 0.0),
            "overlap_ratio_existing_to_ms": rec.get("best_ratio_ex", 0.0),
            "iou": rec.get("best_iou", 0.0),
            "classification": rec["status"],
            "candidate_status": ms_status_mapping(rec["status"]),
            "review_reason": rec.get("review_reason"),
        })

    df = pd.DataFrame(rows, columns=COMPARISON_COLUMNS)
    df = df.sort_values(["record_kind", "ms_id", "existing_id"], kind="mergesort").reset_index(drop=True)
    return df

# =============================================================================
# Satellite imagery validation + QA maps
# =============================================================================

def inspect_satellite(path: Optional[Path]) -> Dict[str, Any]:
    """Return raster metadata and whether the image is actually georeferenced."""
    if path is None or not path.exists():
        return {"available": False, "reason": "satellite image not found"}
    try:
        import rasterio
    except ImportError:
        return {"available": False, "reason": "rasterio not installed"}
    info: Dict[str, Any] = {"available": False, "path": str(path)}
    try:
        with rasterio.open(path) as ds:
            info["crs"] = None if ds.crs is None else ds.crs.to_string()
            info["width"] = ds.width
            info["height"] = ds.height
            info["count"] = ds.count
            b = ds.bounds
            t = ds.transform
            # A georeferenced raster has a real pixel size and a CRS.
            geo = ds.crs is not None and t is not None and not (abs(t.a) < 1e-12 and abs(t.e) < 1e-12)
            info["georeferenced"] = bool(geo)
            if geo:
                try:
                    from rasterio.warp import transform_bounds
                    if ds.crs.to_string() == "EPSG:4326":
                        info["bounds4326"] = (b.left, b.bottom, b.right, b.top)
                    else:
                        info["bounds4326"] = tuple(transform_bounds(ds.crs, "EPSG:4326", *b))
                except Exception as exc:
                    info["bounds4326"] = (b.left, b.bottom, b.right, b.top)
                    info["bounds_note"] = f"could not transform to 4326: {exc}"
                info["crs_native_bounds"] = (b.left, b.bottom, b.right, b.top)
            else:
                info["reason"] = (
                    "the raster has no CRS and/or no geotransform, so it cannot be "
                    "spatially aligned with the footprints"
                )
            info["available"] = True
            return info
    except Exception as exc:
        info["reason"] = f"could not open with rasterio: {exc}"
        return info


def render_overlay_map(img_info: Dict[str, Any], overlay_gdfs: List[Tuple[str, gpd.GeoDataFrame, str, float]],
                       out_path: Path, title: str) -> bool:
    """Render an overlay QA map (imagery + vectors), or vector-only fallback.

    Returns True when imagery was actually used.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out_path.parent.mkdir(parents=True, exist_ok=True)
    used_imagery = False
    try:
        fig, ax = plt.subplots(figsize=(11, 9), dpi=130)
        if img_info.get("available") and img_info.get("georeferenced"):
            try:
                import rasterio
                from rasterio.enums import Resampling
                with rasterio.open(img_info["path"]) as ds:
                    target = 1300
                    scale = max(ds.width, ds.height) / target
                    reduce = max(1, int(math.ceil(scale)))
                    h = int(ds.height // reduce)
                    w = int(ds.width // reduce)
                    data = ds.read(
                        out_shape=(min(3, ds.count), h, w),
                        resampling=Resampling.average,
                    )
                    if data.ndim == 2:
                        data = data[None, :, :]
                    if data.shape[0] == 1:
                        rgb = np.repeat(data, 3, axis=0)
                    else:
                        rgb = data[:3]
                    rgb = np.moveaxis(rgb, 0, 2).astype("float64")
                    if ds.nodata is not None:
                        rgb[rgb == float(ds.nodata)] = np.nan
                    rgb = np.where(np.isfinite(rgb), rgb, np.nan)
                    lo, hi = np.nanpercentile(rgb, (2, 98))
                    if hi - lo < 1e-6:
                        hi = lo + 1.0
                    rgb = (rgb - lo) / (hi - lo)
                    rgb = np.clip(rgb, 0, 1)
                    rgb = np.where(np.isfinite(rgb), rgb, 0.85)
                    left, bottom, right, top = ds.bounds
                    ax.imshow(rgb, extent=(left, right, bottom, top), origin="upper",
                              interpolation="nearest")
                used_imagery = True
                # vectors projected into the raster CRS
                for label, gdf, color, alpha in overlay_gdfs:
                    try:
                        g2 = gdf.to_crs(img_info["crs"]) if img_info["crs"] else gdf
                    except Exception:
                        g2 = gdf
                    g2.plot(ax=ax, facecolor=color, edgecolor="black", linewidth=0.3,
                            alpha=alpha, label=label)
            except Exception as exc:
                LOG.warning("render_overlay_map: could not use imagery (%s); vector-only", exc)
                used_imagery = False
        if not used_imagery:
            ax.set_facecolor("#eef1f5")
            for label, gdf, color, alpha in overlay_gdfs:
                gdf.plot(ax=ax, facecolor=color, edgecolor="black", linewidth=0.3,
                         alpha=alpha, label=label)
            ax.set_xlabel("longitude")
            ax.set_ylabel("latitude")
            ax.grid(True, linestyle=":", linewidth=0.4, color="#cccccc")
        ax.set_title(title, fontsize=10)
        ax.legend(loc="upper left", fontsize=7)
        fig.savefig(out_path, dpi=150, bbox_inches="tight")
        plt.close(fig)
        LOG.info("Wrote QA map: %s%s", out_path.name, " (with imagery)" if used_imagery else " (vector-only)")
        return used_imagery
    except Exception as exc:
        LOG.error("render_overlay_map failed for %s: %s", out_path.name, exc)
        try:
            plt.close("all")
        except Exception:
            pass
        return used_imagery

# =============================================================================
# HTML QA report
# =============================================================================

def _html_table(headers: List[str], rows: List[List[Any]]) -> str:
    """Render a compact HTML table."""
    thead = "".join(f"<th>{h}</th>" for h in headers)
    body = ""
    for r in rows:
        tds = "".join(f"<td>{'' if v is None else str(v)}</td>" for v in r)
        body += f"<tr>{tds}</tr>"
    return f"<table><thead><tr>{thead}</tr></thead><tbody>{body}</tbody></table>"


def _embed_png(path: Path) -> str:
    """Base64-embed a PNG for inline display in the report."""
    import base64
    try:
        return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")
    except Exception:
        return ""


def build_html_report(report: Dict[str, Any], out_path: Path) -> None:
    """Write the human-readable QA report."""
    mcfg = report.get("matching_config", {})
    top = report.get("top_suspicious", [])
    headers = ["building_id", "source", "candidate_status", "area_m2",
               "conf", "matched_existing_id", "iou", "review_reason"]
    rows = [[r.get("building_id"), r.get("source"), r.get("candidate_status"),
             round(r.get("area_m2") or 0, 1), r.get("microsoft_confidence"),
             r.get("matched_existing_id"), r.get("iou"), r.get("review_reason")]
            for r in top]

    sat = report.get("satellite", {})
    sat_state = "validated" if sat.get("georeferenced") else (
        "NOT PERFORMED" if not sat.get("available") else "IMAGE NOT GEOREFERENCED"
    )

    map_path = report.get("map_path")
    if map_path is None:
        map_path = out_path.parent / "qa" / "kp2_missing_candidates_vs_satellite.png"
    map_uri = _embed_png(Path(map_path)) if Path(map_path).exists() else ""
    n = report.get("aoi_named", {})
    summary = [
        ["AOI (EPSG:4326)",
         f"w={n.get('west', 0):.6f} s={n.get('south', 0):.6f} e={n.get('east', 0):.6f} n={n.get('north', 0):.6f}"],
        ["Storage CRS", report.get("storage_crs")],
        ["Metric CRS (for math)", report.get("metric_crs")],
        ["Microsoft location / quadkey", f'{report.get("location_filter")} / {report.get("quadkey")}'],
        ["Microsoft tile URL", report.get("tile_url")],
        ["Tile cache path", report.get("tile_path")],
        ["Existing buildings", str(report.get("n_existing"))],
        ["Microsoft footprints near AOI", str(report.get("n_ms_near_aoi"))],
        ["Microsoft footprints in AOI", str(report.get("n_ms_in_aoi"))],
        ["Matched (merged into existing)", str(report.get("n_matched"))],
        ["Possible duplicates (-> review)", str(report.get("n_possible_dup"))],
        ["Likely missing (candidates)", str(report.get("n_missing"))],
        ["Review", str(report.get("n_review"))],
        ["Dropped (outside strict AOI)", str(report.get("n_dropped"))],
        ["Microsoft near-duplicates removed", str(report.get("n_dup_removed"))],
        ["Invalid geometry fixes (existing / MS)",
         f'{report.get("fix_existing")} / {report.get("fix_ms")}'],
        ["Satellite validation", sat_state],
        ["Final building count", str(report.get("n_final"))],
    ]

html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>KP2 building footprint QA report</title>
<style>
 body {{ font-family: 'Segoe UI', Arial, sans-serif; margin: 24px; color: #222; }}
 h1 {{ color: #0b3d91; }} h2 {{ color: #0b3d91; border-bottom: 1px solid #ccc; padding-bottom: 4px; }}
 table {{ border-collapse: collapse; margin: 10px 0; font-size: 12px; }}
 th, td {{ border: 1px solid #bbb; padding: 3px 7px; text-align: left; }}
 th {{ background: #eef2fa; }}
 .warn {{ background: #fff6dd; padding: 8px; border-left: 4px solid #d9a500; }}
 .ok {{ background: #e7f4e4; padding: 8px; border-left: 4px solid #2e7d32; }}
 .img {{ max-width: 100%; border: 1px solid #999; }}
</style></head><body>
<h1>Knowledge Park II (KP2) - Phase 1 building-footprint QA report</h1>
<p>Generated: {report.get('generated_at')} &middot; Project: {report.get('project_root')}</p>

<h2>Summary</h2>
{_html_table(["Metric", "Value"], summary)}

<h2>Satellite imagery</h2>
<div class="{ 'ok' if sat.get('georeferenced') else 'warn' }">
<b>Status:</b> {sat_state}<br>
"""
    if sat.get("georeferenced"):
        html += f"<b>File:</b> {sat.get('path')}<br><b>CRS:</b> {sat.get('crs')} " \
                f"<b>Bounds(4326):</b> {sat.get('bounds4326')}"
    else:
        html += f"<b>Reason:</b> {sat.get('reason', 'no image supplied')}. " \
                "Set <code>inputs.satellite_image</code> in KP2_CONFIG.json. " \
                "QA maps are vector-only; imagery is NOT treated as evidence."
    html += "</div>"

    if map_uri:
        html += '<h2>Map - missing candidates &amp; final footprints</h2>'
        html += f'<img class="img" src="{map_uri}" alt="QA map">'

    html += "<h2>Matching thresholds used</h2>"
    html += _html_table(["Parameter", "Value"], [
        ["match_iou", str(mcfg.get("match_iou"))],
        ["match_ratio_ms", str(mcfg.get("match_ratio_ms"))],
        ["possible_duplicate_iou", str(mcfg.get("possible_duplicate_iou"))],
        ["possible_duplicate_ratio_ms", str(mcfg.get("possible_duplicate_ratio_ms"))],
        ["near_distance_m", str(mcfg.get("near_distance_m"))],
        ["dedup_iou", str(mcfg.get("dedup_iou"))],
        ["dedup_area_ratio", str(mcfg.get("dedup_area_ratio"))],
        ["min_building_area_m2", str(mcfg.get("min_building_area_m2"))],
    ])

    html += "<h2>Top suspicious cases (review / largest missing)</h2>"
    html += _html_table(headers, rows) if rows else "<p>None flagged.</p>"

    html += "<h2>Outputs</h2><ul>"
    for p in report.get("outputs", []):
        html += f"<li><code>{p}</code></li>"
    html += "</ul>"

    html += ("<p><i>Phase 1 only - no floor counts, no 3D models were produced. "
             "floor_count / basement_count / rera_no etc. are reserved columns "
             "left empty for later manual entry.</i></p></body></html>")
    out_path.write_text(html, encoding="utf-8")
    LOG.info("Wrote QA report: %s", out_path.name)

# =============================================================================
# Output writers
# =============================================================================

def write_vector_output(gdf: gpd.GeoDataFrame, gpkg_path: Optional[Path],
                        geojson_path: Optional[Path], layer: str = "default") -> None:
    """Write a GeoDataFrame to GPKG and/or GeoJSON; never crash the run on I/O."""
    if gpkg_path is not None:
        try:
            gdf.to_file(gpkg_path, layer=layer, driver="GPKG")
            LOG.info("Wrote %s (%s features)", gpkg_path.name, len(gdf))
        except Exception as exc:
            LOG.error("Failed to write GPKG %s: %s", gpkg_path, exc)
    if geojson_path is not None:
        try:
            gdf.to_file(geojson_path, driver="GeoJSON")
            LOG.info("Wrote %s (%s features)", geojson_path.name, len(gdf))
        except Exception as exc:
            LOG.error("Failed to write GeoJSON %s: %s", geojson_path, exc)


# =============================================================================
# Main pipeline
# =============================================================================

def main(argv: Optional[Sequence[str]] = None) -> int:
    t0 = time.time()
    parser = argparse.ArgumentParser(
        description="KP2 Phase 1 building-footprint pipeline (existing + Microsoft GlobalML)."
    )
    parser.add_argument("--config", default="KP2_CONFIG.json",
                        help="Path to KP2_CONFIG.json (default: KP2_CONFIG.json)")
    parser.add_argument("--refresh-links", action="store_true",
                        help="Force re-download of Microsoft dataset-links.csv")
    parser.add_argument("--force-download", action="store_true",
                        help="Force re-download of the Microsoft tile cache file")
    parser.add_argument("--log-level", default="INFO", help="INFO|WARNING|ERROR|DEBUG")
    args = parser.parse_args(argv)

    config_path = resolve_path(args.config)
    cfg = load_config(config_path)

    out_dir = PROJECT_ROOT / "outputs"
    qa_dir = out_dir / "qa"
    cache_dir = PROJECT_ROOT / "cache"
    out_dir.mkdir(parents=True, exist_ok=True)
    qa_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)

    setup_logging(out_dir / "kp2_processing_log.txt", args.log_level)
    LOG.info("=" * 78)
    LOG.info("Bhustack3D KP2 building-footprint pipeline (Phase 1)")

    # ---- inputs ----------------------------------------------------------
    inputs = discover_inputs(cfg)
    parcel_path = inputs["parcel"]
    existing_path = inputs["existing"]
    LOG.info("Parcel/AOI reference : %s", parcel_path)
    LOG.info("Existing building GPKG : %s", existing_path)

    sat_path = find_satellite_image(cfg)
    sat_info: Dict[str, Any] = {"available": False}
    if sat_path is not None:
        sat_info = inspect_satellite(sat_path)
        if sat_info.get("georeferenced"):
            LOG.info("Satellite image is georeferenced: crs=%s bounds4326=%s",
                     sat_info["crs"], sat_info.get("bounds4326"))
        else:
            LOG.warning("Satellite image present but NOT georeferenced: %s",
                        sat_info.get("reason", "unknown"))

    # ---- existing layer ----------------------------------------------------
    layers = gpd.list_layers(existing_path)
    layer_name = str(layers.iloc[0]["name"]) if len(layers) else None
    if layer_name is None:
        raise RuntimeError(f"No layer found in existing building GPKG: {existing_path}")
    existing_raw = gpd.read_file(existing_path, layer=layer_name)
    LOG.info("Existing GPKG layer '%s': %s features, crs=%s",
             layer_name, len(existing_raw), existing_raw.crs)
    if existing_raw.crs is None:
        existing_raw = existing_raw.set_crs(4326)
    existing_raw = existing_raw.to_crs("EPSG:4326")
    existing, ex_stats = clean_layer(existing_raw, "existing layer")
    if "id" in existing.columns:
        ids = existing["id"].astype(str)
        fallback = "existing-" + pd.RangeIndex(len(existing)).astype(str)
        existing["existing_id"] = [
            i if i not in ("nan", "<NA>", "None", "") else f for i, f in zip(ids, fallback)
        ]
    else:
        existing["existing_id"] = "existing-" + pd.RangeIndex(len(existing)).astype(str)
    LOG.info("Existing buildings after cleaning: %s", len(existing))
    LOG.info("Existing bounds: %s", existing.total_bounds.tolist())

    # ---- AOI ----------------------------------------------------------------
    aoi_poly, aoi_bounds_full = compute_aoi(cfg, tuple(existing.total_bounds))
    aoi_named = {"west": aoi_bounds_full[0], "south": aoi_bounds_full[1],
                 "east": aoi_bounds_full[2], "north": aoi_bounds_full[3]}
    aoi_gdf = gpd.GeoDataFrame(
        {"name": ["KP2 AOI (from existing building layer extent)"], "crs": ["EPSG:4326"]},
        geometry=[aoi_poly], crs="EPSG:4326",
    )
    aoi_gdf.to_file(out_dir / "kp2_aoi.geojson", driver="GeoJSON")
    LOG.info("AOI exported: outputs/kp2_aoi.geojson")

    metric_crs = cfg["processing"].get("metric_crs_override")
    if not metric_crs:
        metric_crs = projected_crs_for(
            (aoi_bounds_full[0] + aoi_bounds_full[2]) / 2.0,
            (aoi_bounds_full[1] + aoi_bounds_full[3]) / 2.0,
        )
    LOG.info("Metric CRS for calculations: %s", metric_crs)

# ---- Microsoft links + tile download -----------------------------------
    links_df = fetch_dataset_links(cfg, cache_dir, force=args.refresh_links)
    tile_rows = select_tile_rows(links_df, cfg)
    tile_rows.to_csv(out_dir / "kp2_tile_links.csv", index=False)
    tile_pathes = download_tile_for_rows(tile_rows, cfg, cache_dir, force=args.force_download)
    tile_row = tile_rows.iloc[0]
    tile_url = str(tile_row["Url"])
    quadkey = str(tile_row["QuadKey"]).strip()
    LOG.info("Microsoft tile URL: %s", tile_url)
    LOG.info("Microsoft tile cache: %s", [str(p) for p in tile_pathes])

    # ---- parse tile (streamed) ----------------------------------------------
    buf_deg = float(cfg["processing"].get("aoi_buffer_deg", 0.001))
    inflate_bounds = (aoi_named["west"] - buf_deg, aoi_named["south"] - buf_deg,
                      aoi_named["east"] + buf_deg, aoi_named["north"] + buf_deg)
    ms_raw = parse_microsoft_tile(tile_pathes[0], inflate_bounds)
    ms_raw = normalize_ms_fields(ms_raw)
    ms_raw, ms_stats = clean_layer(ms_raw, "Microsoft tile (near AOI)")
    if len(ms_raw) == 0:
        raise RuntimeError("No Microsoft footprints found near the KP2 AOI - check the tile.")

    # strict-AOI flags + metric area
    strict_box = box(*aoi_bounds_full)
    ms_proj = ms_raw.to_crs(metric_crs)
    ms_raw = ms_raw.copy()
    ms_raw["area_m2"] = ms_proj.geometry.area.values
    ms_raw["in_strict_aoi"] = ms_proj.geometry.representative_point().within(strict_box).values
    ms_raw = ms_raw.reset_index(drop=True)

    # ---- near-duplicate removal (Microsoft within tile) ----------------------
    mcfg = cfg["matching"]
    is_dup, dup_stats = deduplicate_near_intersecting(
        ms_raw, metric_crs, float(mcfg["dedup_iou"]), float(mcfg["dedup_area_ratio"])
    )
    ms_raw["dup_removed"] = is_dup.values

    geom_by_msid: Dict[str, Any] = {
        str(mid): geom for mid, geom in zip(ms_raw["ms_id"].astype(str), ms_raw.geometry)
    }

    ms = ms_raw[~ms_raw["dup_removed"]].copy()
    LOG.info(
        "Microsoft footprints near AOI: %s total, %s in strict AOI, %s used for matching",
        len(ms_raw), int(ms_raw["in_strict_aoi"].sum()), len(ms)
    )

    # ---- matching -------------------------------------------------------------
    ms_matches, existing_records = match_and_classify(
        existing, ms, cfg, metric_crs, aoi_bounds_full
    )

    # append DUPLICATE_REMOVED records from the within-tile dedup step
    geom_by_msid_s = geom_by_msid
    for _, row in ms_raw[ms_raw["dup_removed"]].iterrows():
        mid = str(row["ms_id"])
        ms_matches.append({
            "ms_id": mid,
            "ms_confidence": float(row["microsoft_confidence"])
            if pd.notna(row["microsoft_confidence"]) else None,
            "ms_height_m": float(row["microsoft_height_m"])
            if pd.notna(row["microsoft_height_m"]) else None,
            "ms_area_m2": float(row["area_m2"]),
            "in_strict_aoi": bool(row["in_strict_aoi"]),
            "tiny_sliver": False,
            "nearest_dist_m": None,
            "n_strong": 0,
            "best_existing_id": None,
            "best_iou": 0.0, "best_ratio_ms": 0.0, "best_ratio_ex": 0.0,
            "status": "DUPLICATE_REMOVED",
            "review_reason": "near-identical duplicate of another Microsoft footprint",
        })

    # ---- final layer -----------------------------------------------------------
    final_gdf, exid_to_bid, msid_to_bid = build_final_gdf(
        existing, existing_records, ms_matches, geom_by_msid_s, metric_crs, tile_url
    )
    LOG.info("Final layer: %s records", len(final_gdf))

    final_gdf.to_file(out_dir / "kp2_final_buildings.gpkg", layer="kp2_final_buildings", driver="GPKG")
    final_gdf.to_file(out_dir / "kp2_final_buildings.geojson", driver="GeoJSON")
    LOG.info("Wrote outputs/kp2_final_buildings.gpkg and .geojson")

    missing_gdf = final_gdf[final_gdf["candidate_status"] == "LIKELY_MISSING"].copy()
    missing_gdf.to_file(out_dir / "kp2_missing_building_candidates.gpkg", layer="missing_candidates", driver="GPKG")
    missing_gdf.to_file(out_dir / "kp2_missing_building_candidates.geojson", driver="GeoJSON")
    LOG.info("Likely-missing candidates exported: %s", len(missing_gdf))

    # ---- comparison CSV ----------------------------------------------------------
    comp = _build_comparison(ms_matches, existing_records, exid_to_bid, msid_to_bid)
    comp.to_csv(out_dir / "kp2_building_comparison.csv", index=False, encoding="utf-8")
    LOG.info("Wrote outputs/kp2_building_comparison.csv (%s rows)", len(comp))

# ---- audit layers -----------------------------------------------------------
    match_lookup = {er["existing_id"]: er for er in existing_records}
    audit_cols: List[str] = []
    for c in ("id", "name", "building", "amenity", "est_height", "height", "building:levels"):
        if c in existing.columns:
            audit_cols.append(c)
    audit = existing[audit_cols + ["existing_id", "geometry"]].copy()
    audit["match_status"] = [match_lookup.get(eid, {}).get("match_status", "EXISTING_BASE")
                             for eid in audit["existing_id"]]
    audit["matched_ms_ids"] = [",".join(match_lookup.get(eid, {}).get("matched_ms_ids", []))
                               for eid in audit["existing_id"]]
    audit["best_iou"] = [match_lookup.get(eid, {}).get("best_iou", 0.0)
                         for eid in audit["existing_id"]]
    audit["bounding_area_m2"] = audit.to_crs(metric_crs).geometry.area
    audit.to_file(out_dir / "kp2_existing_audit.gpkg", layer="existing_audit", driver="GPKG")
    LOG.info("Wrote outputs/kp2_existing_audit.gpkg")

    audit_ms = gpd.GeoDataFrame(
        {
            "ms_id": [r["ms_id"] for r in ms_matches],
            "status": [r["status"] for r in ms_matches],
            "candidate_status": [ms_status_mapping(r["status"]) for r in ms_matches],
            "best_existing_id": [r.get("best_existing_id") for r in ms_matches],
            "best_iou": [r.get("best_iou", 0.0) for r in ms_matches],
            "best_ratio_ms": [r.get("best_ratio_ms", 0.0) for r in ms_matches],
            "best_ratio_ex": [r.get("best_ratio_ex", 0.0) for r in ms_matches],
            "nearest_dist_m": [r.get("nearest_dist_m") for r in ms_matches],
            "ms_area_m2": [r.get("ms_area_m2") for r in ms_matches],
            "ms_confidence": [r.get("ms_confidence") for r in ms_matches],
            "in_strict_aoi": [r.get("in_strict_aoi") for r in ms_matches],
            "review_reason": [r.get("review_reason") for r in ms_matches],
        },
        geometry=[geom_by_msid_s.get(r["ms_id"]) for r in ms_matches],
        crs="EPSG:4326",
    )
    audit_ms.to_file(out_dir / "kp2_matching_audit.gpkg", layer="microsoft_relationships", driver="GPKG")
    LOG.info("Wrote outputs/kp2_matching_audit.gpkg (%s records)", len(audit_ms))

    # ---- Microsoft buildings layer (whole near-AOI extract) -------------------
    ms_out = ms_raw[["ms_id", "microsoft_confidence", "microsoft_height_m",
                     "area_m2", "in_strict_aoi", "dup_removed", "geometry"]].copy()
    ms_out.rename(columns={"microsoft_confidence": "confidence"},
                  inplace=True)
    ms_out.to_file(out_dir / "kp2_microsoft_buildings.gpkg", layer="microsoft_buildings", driver="GPKG")
    ms_out.to_file(out_dir / "kp2_microsoft_buildings.geojson", driver="GeoJSON")
    LOG.info("Wrote outputs/kp2_microsoft_buildings.gpkg and .geojson")

# ---- QA maps ----------------------------------------------------------------
    all_ex = existing[["existing_id", "geometry"]].copy()
    used_sat = render_overlay_map(
        sat_info if sat_info.get("georeferenced") else {"available": False},
        [("existing footprints", all_ex, "#c62828", 0.5)],
        qa_dir / "kp2_existing_vs_satellite.png",
        "Existing KP2 footprints over satellite imagery",
    )
    render_overlay_map(
        sat_info if sat_info.get("georeferenced") else {"available": False},
        [("microsoft footprints", ms_out[["ms_id", "geometry"]], "#1565c0", 0.45)],
        qa_dir / "kp2_microsoft_vs_satellite.png",
        "Microsoft GlobalML footprints over satellite imagery",
    )
    overlay_missing: List[Tuple[str, gpd.GeoDataFrame, str, float]] = []
    if len(missing_gdf):
        overlay_missing.append(("likely missing", missing_gdf[["geometry"]], "#e65100", 0.6))
    if len(all_ex):
        overlay_missing.append(("existing context", all_ex[["geometry"]], "#9e9e9e", 0.35))
    render_overlay_map(
        sat_info if sat_info.get("georeferenced") else {"available": False},
        overlay_missing,
        qa_dir / "kp2_missing_candidates_vs_satellite.png",
        "Likely-missing building candidates over satellite imagery",
    )

# ---- report statistics ------------------------------------------------------
    status_counts: Dict[str, int] = {}
    for rec in ms_matches:
        status_counts[rec["status"]] = status_counts.get(rec["status"], 0) + 1
    n_matched = status_counts.get("MATCHED", 0)
    n_poss = status_counts.get("POSSIBLE_DUPLICATE", 0)
    n_missing = status_counts.get("LIKELY_MISSING", 0)
    n_review = status_counts.get("REVIEW", 0)
    n_dropped = status_counts.get("DROPPED_OUTSIDE_AOI", 0)
    n_dup_removed = status_counts.get("DUPLICATE_REMOVED", dup_stats.get("removed", 0))
    n_existing = len(existing)
    n_ms_in_aoi = int(ms_raw["in_strict_aoi"].sum())
    n_ms_near = len(ms_raw)

    # deterministic top-suspicious rows
    suspicious = final_gdf[final_gdf["candidate_status"] == "REVIEW"].copy()
    missing_big = final_gdf[final_gdf["candidate_status"] == "LIKELY_MISSING"].copy()
    suspicious = suspicious.sort_values("area_m2", ascending=False, kind="mergesort")
    missing_big = missing_big.sort_values("area_m2", ascending=False, kind="mergesort")
    top_pool = pd.concat([suspicious[["building_id", "source", "candidate_status", "area_m2",
                                      "microsoft_confidence", "matched_existing_id", "iou",
                                      "review_reason"]],
                          missing_big[["building_id", "source", "candidate_status", "area_m2",
                                       "microsoft_confidence", "matched_existing_id", "iou",
                                       "review_reason"]]], ignore_index=True)
    top_suspicious = top_pool.head(30).to_dict("records")

    report_cfg = dict(cfg["matching"])
    report_cfg["min_building_area_m2"] = cfg["processing"].get("min_building_area_m2")
    mstats = {"matching_config": report_cfg,
              "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
              "project_root": str(PROJECT_ROOT),
              "aoi_named": aoi_named,
              "storage_crs": "EPSG:4326", "metric_crs": metric_crs,
              "location_filter": cfg["microsoft"].get("location_filter"),
              "quadkey": quadkey, "tile_url": tile_url,
              "tile_path": str(tile_pathes[0]),
              "n_existing": n_existing, "n_ms_near_aoi": n_ms_near,
              "n_ms_in_aoi": n_ms_in_aoi, "n_matched": n_matched,
              "n_possible_dup": n_poss, "n_missing": n_missing,
              "n_review": n_review, "n_dropped": n_dropped,
              "n_dup_removed": n_dup_removed, "n_final": len(final_gdf),
              "fix_existing": ex_stats.get("repaired", 0), "fix_ms": ms_stats.get("repaired", 0),
              "satellite": sat_info,
              "top_suspicious": top_suspicious,
              "map_path": str(qa_dir / "kp2_missing_candidates_vs_satellite.png"),
              "outputs": sorted(str(p.relative_to(PROJECT_ROOT)) for p in out_dir.rglob("*") if p.is_file()),
              }
    build_html_report(mstats, out_dir / "kp2_qa_report.html")

    # ---- verification + final summary ---------------------------------------
    empty_final = int(final_gdf.geometry.is_empty.sum())
    if empty_final:
        LOG.warning("FINAL CHECKS: %s empty geometry(ies) found in final layer", empty_final)
    LOG.info("FINAL CHECKS: final CRS=%s, empty_geometries=%s, records=%s",
             final_gdf.crs, empty_final, len(final_gdf))
    LOG.info("Original inputs were not modified: %s, %s", existing_path, parcel_path)

    elapsed = time.time() - t0
    summary_lines = [
        "=" * 70, "KP2 PIPELINE COMPLETE", "=" * 70,
        f"Microsoft tile (India / {quadkey}):",
        f"  {tile_url}",
        f"Existing buildings                     : {n_existing}",
        f"Microsoft footprints near AOI          : {n_ms_near}  (in AOI: {n_ms_in_aoi})",
        f"Matched into existing                  : {n_matched}",
        f"Possible duplicates                    : {n_poss}",
        f"Likely missing (candidates exported)   : {n_missing}",
        f"Sent to review                         : {n_review}",
        f"Duplicate footprints removed (MS)      : {n_dup_removed}",
        f"Dropped outside strict AOI            : {n_dropped}",
        f"Final layer records                    : {len(final_gdf)}",
        f"Elapsed                               : {elapsed:.1f}s",
        "=" * 70,
        "Final GeoJSON : outputs/kp2_final_buildings.geojson",
        "Final GPKG    : outputs/kp2_final_buildings.gpkg",
        "Comparisons   : outputs/kp2_building_comparison.csv",
        "QA report     : outputs/kp2_qa_report.html",
        "",
        "Rerun command : python prepare_kp2_buildings.py",
    ]
    print("\n".join(summary_lines))
    for line in summary_lines:
        LOG.info(line)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:
        LOG.error("FATAL FAILURE: %s", exc, exc_info=True)
        print(f"\nERROR: {exc}")
        sys.exit(1)

# __CHUNK_END__