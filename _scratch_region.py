import gzip
import json
import math
from collections import Counter
from pathlib import Path

src = Path(r"c:\Users\ayush\OneDrive\Desktop\Bhustack3D\cache\India_123121312.csv.gz")

# KP2 area
kp2 = (77.4909452, 28.4498386, 77.5053057, 28.4653919)
# control region: same size, ~1.2 deg west, north of KP2, still inside quadkey
ctrl = (76.30, 28.55, 76.315, 28.57)


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


counts = Counter()
with gzip.open(src, "rt", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        ftr = json.loads(line)
        g = ftr["geometry"]
        c = g["coordinates"]
        vals = flatten(c)
        xs = vals[0::2]
        ys = vals[1::2]
        minx, miny, maxx, maxy = min(xs), min(ys), max(xs), max(ys)
        if max(xs) < kp2[0] or min(xs) > kp2[2] or max(ys) < kp2[1] or min(ys) > kp2[3]:
            # KP2 miss; check control region
            if max(xs) < ctrl[0] or min(xs) > ctrl[2] or max(ys) < ctrl[1] or min(ys) > ctrl[3]:
                counts["outside"] += 1
            else:
                counts["ctrl"] += 1
        else:
            counts["kp2"] += 1
        if sum(counts.values()) > 2_000_000:
            break
print(counts)