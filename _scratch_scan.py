import gzip
import json
import time
from collections import Counter
from pathlib import Path

from shapely.geometry import box, shape

src = Path(r"c:\Users\ayush\OneDrive\Desktop\Bhustack3D\cache\India_123121312.csv.gz")
west, south, east, north = 77.4909452, 28.4498386, 77.5053057, 28.4653919
buf = 0.001


def flatten(vals):
    out = []

    def walk(v):
        if isinstance(v, (int, float)):
            out.append(v)
        else:
            for x in v:
                walk(x)

    walk(vals)
    return out


features = []
t0 = time.time()
total = 0
with gzip.open(src, "rt", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        ftr = json.loads(line)
        g = ftr.get("geometry") or {}
        ct = g.get("type")
        coords = g.get("coordinates")
        if not ct or coords is None:
            continue
        vals = flatten(coords)
        xs = vals[0::2]
        ys = vals[1::2]
        if max(xs) < west - buf or min(xs) > east + buf or max(ys) < south - buf or min(ys) > north + buf:
            continue
        features.append(ftr)

print("candidate features (bbox intersects AOI+buf):", len(features))

geoms = [shape(f["geometry"]) for f in features]
props = [f.get("properties", {}) for f in features]
print("geom types:", Counter(g.geom_type for g in geoms).most_common())
print("empty:", sum(1 for g in geoms if g.is_empty))
print("invalid:", sum(1 for g in geoms if not g.is_valid))

heights = [p.get("height") for p in props]
confs = [p.get("confidence") for p in props]
print("height stats:", Counter(heights).most_common(5))
print("height != -1 count:", sum(1 for h in heights if h != -1.0 and h is not None))
print("confidence min/max:", min(confs), max(confs))
print("sample props:", props[:3])

# strict bbox clip check
strict = [g for g in geoms if g.intersects(box(west, south, east, north))]
print("features intersecting strict AOI:", len(strict))
print("elapsed:", round(time.time() - t0, 1))