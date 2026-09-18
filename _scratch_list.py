import requests
from xml.etree import ElementTree as ET
from urllib.parse import quote

prefix = "2026-08-13/global-buildings.geojsonl/RegionName=India/quadkey=123121312/"
base = "https://bfppub.blob.core.windows.net/%24web"
url = base + "?restype=container&comp=list&prefix=" + quote(prefix, safe="/") + "&maxresults=1000"
r = requests.get(url, timeout=120)
print("status:", r.status_code)
text = r.text
tree = ET.fromstring(text)
blobs = tree.findall(".//Blob")
print("blobs listed:", len(blobs))
names = [b.findtext("Name") for b in blobs]
for n in names:
    print(" ", n)
next_marker = tree.findtext(".//NextMarker")
print("next-marker:", next_marker)