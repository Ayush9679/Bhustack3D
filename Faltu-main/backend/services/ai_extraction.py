"""
backend/services/ai_extraction.py
===================================
Layer 3 — AI/ML Extraction Engine

╔══════════════════════════════════════════════════════════════════════════════╗
║  STUB — NOT A REAL AI MODEL                                                  ║
║                                                                              ║
║  In production, this module would call a trained segmentation model          ║
║  (e.g., U-Net or Segment Anything Model / SAM, fine-tuned on Indian          ║
║  cadastral satellite imagery per Section 7 of the SIH26011 solution doc).    ║
║  That model would:                                                            ║
║    1. Accept raw satellite raster tiles as input                              ║
║    2. Produce building-footprint polygons via instance segmentation           ║
║    3. Estimate floor counts from shadow analysis / LiDAR returns              ║
║    4. Output a GeoJSON FeatureCollection ready for Layer 4 ingestion          ║
║                                                                              ║
║  For this hackathon prototype, manual digitization in QGIS already           ║
║  produces the same output that this AI step would eventually automate.        ║
║  This stub passes pre-digitized features through unchanged, preserving        ║
║  the pipeline's architecture so the real model can be swapped in later.      ║
╚══════════════════════════════════════════════════════════════════════════════╝

References:
  - U-Net: Ronneberger et al. (2015), arXiv:1505.04597
  - SAM:   Kirillov et al. (2023), arXiv:2304.02643
  - SIH26011 solution document, Section 7 (AI Pipeline)
"""

from __future__ import annotations
from typing import Any


def extract_footprints(geojson_input: dict[str, Any]) -> list[dict[str, Any]]:
    """
    [STUB] Extract building footprint features from input data.

    STUB BEHAVIOUR:
        Simply returns the 'features' list from the input GeoJSON unchanged.
        The pre-digitized QGIS data is already in the correct format that a
        real segmentation model would produce — so passing it through is a
        valid prototype substitute.

    PRODUCTION BEHAVIOUR (not implemented):
        - Accept a raster image path or satellite tile coordinates
        - Run inference through a trained U-Net / SAM model
        - Post-process predictions into GeoJSON polygons
        - Estimate building heights from shadow / DSM analysis
        - Return a list of GeoJSON Feature dicts with properties:
          {fid, name, area_m2, est_height, building, confidence}

    Parameters
    ----------
    geojson_input : dict
        A GeoJSON FeatureCollection dict (already loaded from disk and
        validated by Layer 2's preprocess_geojson.py).

    Returns
    -------
    list[dict]
        List of GeoJSON Feature dicts ready for Layer 4 DB insertion.
    """
    # STUB: pass-through the pre-digitized features
    features = geojson_input.get("features", [])
    print(
        f"[Layer 3 STUB] extract_footprints: passing through {len(features)} "
        "pre-digitized features (no AI model called — see docstring)."
    )
    return features


def estimate_floor_count(feature: dict[str, Any]) -> int:
    """
    [STUB] Estimate the floor count for a single building feature.

    STUB BEHAVIOUR:
        Derives floor count from est_height using a standard 3m-per-floor rule.

    PRODUCTION BEHAVIOUR (not implemented):
        - Use shadow-length analysis on high-resolution satellite imagery
        - Or read LiDAR DSM/DTM difference at the centroid
        - Or read building:levels tag if OSM-sourced

    Parameters
    ----------
    feature : dict
        A single GeoJSON Feature dict with a 'properties' key.

    Returns
    -------
    int
        Estimated floor count (minimum 1).
    """
    props = feature.get("properties", {})
    est_height = float(props.get("est_height") or 3.0)
    # STUB: 3m per floor heuristic
    return max(1, round(est_height / 3.0))
