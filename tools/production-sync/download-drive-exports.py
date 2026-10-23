#!/usr/bin/env python3
"""Download four named CSVs from a shared Google Drive folder. Read-only."""
import json, os, sys, urllib.parse, urllib.request
from pathlib import Path

FILES = {
    "TFF-Stations.csv": "tff-stations.csv",
    "TJO-Stations.csv": "tjo-stations.csv",
    "TFF-Materials.csv": "tff-materials.csv",
    "TJO-Materials.csv": "tjo-materials.csv",
}

def get(url, token):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read()

def main():
    token = os.environ["GOOGLE_ACCESS_TOKEN"]
    folder = os.environ["SWC_EXPORT_FOLDER_ID"]
    dest = Path(os.environ.get("SWC_EXPORT_OUTPUT", "exports"))
    dest.mkdir(parents=True, exist_ok=True)
    query = urllib.parse.urlencode({
        "q": "'" + folder.replace("'", "\\'") + "' in parents and trashed = false",
        "fields": "nextPageToken,files(id,name,mimeType,size,modifiedTime)",
        "page_size": 1000,
    })
    url = "https://www.googleapis.com/drive/v3/files?" + query
    listing = json.loads(get(url, token))
    if listing.get("nextPageToken"):
        raise RuntimeError("Folder contains too many files; pagination not implemented")
    names = {}
    for item in listing["files"]:
        if item["name"] in FILES:
            if item["name"] in names:
                raise RuntimeError("Duplicate file name: " + item["name"])
            names[item["name"]] = item
    if set(names) != set(FILES):
        raise RuntimeError("Missing expected exports: " + str(sorted(set(FILES) - set(names))))
    for name, target in FILES.items():
        item = names[name]
        if item["mimeType"] != "text/csv" and not item["name"].lower().endswith(".csv"):
            raise RuntimeError("Not CSV: " + name)
        url = "https://www.googleapis.com/drive/v3/files/" + urllib.parse.quote(item["id"], safe="") + "?alt=media"
        content = get(url, token)
        if not content or b"," not in content.splitlines()[0]:
            raise RuntimeError("Invalid/empty CSV: " + name)
        (dest / target).write_bytes(content)
        print(name, len(content), "bytes", item.get("modifiedTime", ""))
    print("Four exports downloaded. No Drive files modified.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("Export download failed:", exc, file=sys.stderr)
        sys.exit(1)
