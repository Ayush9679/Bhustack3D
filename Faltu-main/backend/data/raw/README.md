# Layer 1 — Data Acquisition: Raw GeoJSON Inputs

## Purpose

This `data/raw/` directory is the designated drop-zone for **Layer 1 output** in the
7-layer Bhustack3D cadastral pipeline (SIH26011 architecture).

Each `.geojson` file placed here represents a parcel cluster digitized from satellite imagery
(QGIS + OpenStreetMap/Google basemap workflow) and is the starting point for the
Layer 2 pre-processing pipeline.

## How Files Get Here

### Prototype / Hackathon Phase (Current)
- Surveyors open QGIS, load a satellite basemap, and manually digitize building footprints
  as polygon features with properties: `fid`, `name`, `area_m2`, `est_height`, `building`
- Export from QGIS: **Layer → Export → Save Features As → GeoJSON**, CRS = EPSG:4326
- Drop the exported `.geojson` file into this folder
- Run `python scripts/preprocess_geojson.py data/raw/<filename>.geojson` to validate + clean

### Production Phase (Future — Not Built Yet)
In production, Layer 1 would be replaced by automated ingestion from:
- **Drone LiDAR feeds** — point cloud to mesh pipeline (e.g., PDAL → Open3D)
- **Satellite imagery** — multi-spectral tile downloads (e.g., Sentinel-2 via STAC API)
- **State government survey APIs** — DILRMP (Digital India Land Records Modernisation Programme)
  bulk shapefile endpoints

This directory would then be written by an automated ingestion daemon, not manually.

## File Naming Convention

```
{location_slug}_{survey_date}_{version}.geojson
e.g.:
  kp2_parcel.geojson           ← current KP2 prototype data
  kp2_parcel_20260911_v2.geojson
  connaught_place_20260915_v1.geojson
```

## Current Files

| File                | Location                    | Features | Source          | Status   |
|---------------------|-----------------------------|----------|-----------------|----------|
| `kp2_parcel.geojson`| Knowledge Park 2, Gr. Noida | See DB   | QGIS + OSM/Sat  | Seeded ✓ |

(Files in `data/raw/` are symbolic references; the master copy lives in `data/kp2_parcel.geojson`
for backward compatibility with the existing seed pipeline.)

## Reference

- EPSG:4326 = WGS 84 Geographic — longitude/latitude in decimal degrees
- OGC CRS84 = equivalent to EPSG:4326 (axis order: lon, lat) — what QGIS exports by default
- Both are accepted by Layer 2's CRS validator
