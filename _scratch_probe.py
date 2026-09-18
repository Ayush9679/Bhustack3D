import requests

base = "https://bfppub.z5.web.core.windows.net/2026-08-13/global-buildings.geojsonl/RegionName=India/quadkey=123121312/"
probe = list(range(0, 20)) + list(range(100, 112))
u = "part-{i:05d}-110f5303-ff85-4c71-a2bf-c6070024fec8.c000.csv.gz"
session = requests.Session()
found = []
for i in probe:
    url = base + u.format(i=i)
    try:
        r = session.head(url, timeout=15, allow_redirects=True)
        print(i, r.status_code, r.headers.get("Content-Length"))
        if r.status_code == 200:
            found.append(i)
    except Exception as e:
        print(i, "ERR", e)
print("found parts:", found)