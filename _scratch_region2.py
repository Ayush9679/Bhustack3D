import gzip
import json
from collections import Counter
from pathlib import Path

src = Path(r"c:\Users\ayush\OneDrive\Desktop\Bhustack3D\cache\India_123121312.csv.gz")
kp2 = (77.4909452, 28.4498386, 77.5053057, 28.4653919)
ctrl = (77.6200, 28.5500, 77.6350, 28.5710)
ctrl2 = (77.4200, 28.3200, 77.4450, 28.3450)


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
        vals = flatten(ftr["geometry"]["coordinates"])
        xs = vals[0::2]
        ys = vals[1::2]
        minx, miny, maxx, maxy = min(xs), min(ys), max(xs), max(ys)
        if maxx < kp2[0] or minx > kp2[2] or maxy < kp2[1] or miny > kp2[3]:
            in_ctrl = not (maxx < ctrl[0] or minx > ctrl[2] or maxy < ctrl[1] or miny > ctrl[3])
            in_ctrl2 = not (maxx < ctrl2[0] or minx > ctrl2[2] or maxy < ctrl2[1] or miny > ctrl2[3])
            if in_ctrl:
                counts["ctrl1"] += 1
            elif in_ctrl2:
                counts["ctrl2"] += 1
            else:
                counts["outside"] += 1
        else:
            counts["kp2"] += 1
print(counts)
a1 = (ctrl[2] - ctrl[0]) * 111.0 * (ctrl[3] - ctrl[1]) * 111.0
a2 = (ctrl2[2] - ctrl2[0]) * 111.0 * (ctrl2[3] - ctrl2[1]) * 111.0
akp = (kp2[2] - kp2[0]) * 111.0 * (kp2[3] - kp2[1]) * 111.0
print("ctrl1 km2:", round(a1, 2), "density:", round(counts["ctrl1"] / a1, 1), "/km2")
print("ctrl2 km2:", round(a2, 2), "density:", round(counts["ctrl2"] / a2, 1), "/km2")
print("kp2 km2:", round(akp, 2), "density:", round(counts["kp2"] / akp, 1), "/km2")