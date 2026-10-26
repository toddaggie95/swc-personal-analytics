#!/usr/bin/env python3
"""Discover and validate the four SWC exports by CSV content, not filenames."""
import csv
import hashlib
import io
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

TARGETS = {(owner, kind): f"{owner.lower()}-{kind.lower()}.csv"
           for owner in ("TFF", "TJO") for kind in ("Stations", "Materials")}
STATION_FIELDS = {"uid", "name", "owner_name", "type_name", "system", "sysX", "sysY", "tooled-to"}
MATERIAL_FIELDS = {"uid", "quantity", "type_name", "container_type_name", "container_uid", "owner_name"}
OWNERS = {"The Faerytail Family": "TFF",
          "The Faerytail Family: The Je`daii Order": "TJO"}

def get(url, token):
    request = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()

def classify(content):
    try:
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text, newline=""))
        header = set(reader.fieldnames or [])
        if not reader.fieldnames or len(header) != len(reader.fieldnames):
            raise ValueError("missing or duplicate CSV columns")
        is_station = STATION_FIELDS <= header
        is_material = MATERIAL_FIELDS <= header
        if is_station == is_material:
            raise ValueError("cannot uniquely identify stations versus materials from columns")
        kind = "Stations" if is_station else "Materials"
        rows = list(reader)
        if not rows:
            raise ValueError("CSV has no data rows")
        if any(None in row or any(value is None for value in row.values()) for row in rows):
            raise ValueError("malformed CSV row")
        if any(not row["uid"].strip() for row in rows):
            raise ValueError("missing entity UID")
        owner_set = {OWNERS.get(row["owner_name"].strip()) for row in rows}
        if len(owner_set) != 1 or None in owner_set:
            raise ValueError("unknown or mixed export ownership")
        owner = owner_set.pop()
        if kind == "Materials" and any(not row["quantity"].strip().isdigit() for row in rows):
            raise ValueError("invalid material quantity")
        return (owner, kind), len(rows)
    except (UnicodeError, csv.Error) as exc:
        raise ValueError("invalid CSV: " + str(exc)) from exc

def discover(files):
    result = {}
    for item, content in files:
        key, count = classify(content)
        if key in result:
            raise ValueError(f"ambiguous duplicate {key[0]} {key[1]} exports: "
                             f"{result[key]['name']!r} and {item['name']!r}; "
                             "keep exactly one snapshot of each type in the folder")
        result[key] = {"id": item["id"], "name": item["name"],
                       "modifiedTime": item.get("modifiedTime", ""),
                       "sha256": hashlib.sha256(content).hexdigest(),
                       "rowCount": count, "content": content}
    missing = set(TARGETS) - set(result)
    if missing:
        raise ValueError("missing exports: " + ", ".join(
            f"{owner} {kind}" for owner, kind in sorted(missing)))
    return result

def main():
    token = os.environ["GOOGLE_ACCESS_TOKEN"]
    folder = os.environ["SWC_EXPORT_FOLDER_ID"]
    dest = Path(os.environ.get("SWC_EXPORT_OUTPUT", "exports"))
    dest.mkdir(parents=True, exist_ok=True)
    items = []
    page_token = None
    while True:
        query = {"q": "'" + folder.replace("'", "\\'") + "' in parents and trashed = false",
                 "fields": "nextPageToken,files(id,name,mimeType,size,modifiedTime)",
                 "pageSize": 1000}
        if page_token:
            query["pageToken"] = page_token
        listing = json.loads(get("https://www.googleapis.com/drive/v3/files?" +
                                 urllib.parse.urlencode(query), token))
        items.extend(listing.get("files", []))
        page_token = listing.get("nextPageToken")
        if not page_token:
            break
    candidates = []
    for item in items:
        if item["name"].lower().endswith(".csv") or item.get("mimeType") == "text/csv":
            url = ("https://www.googleapis.com/drive/v3/files/" +
                   urllib.parse.quote(item["id"], safe="") + "?alt=media")
            candidates.append((item, get(url, token)))
    found = discover(candidates)
    for key, target in TARGETS.items():
        (dest / target).write_bytes(found[key]["content"])
    manifest = {"schemaVersion": 1, "files": [
        {"owner": owner, "kind": kind, "canonicalName": TARGETS[(owner, kind)],
         **{k: v for k, v in found[(owner, kind)].items() if k != "content"}}
        for owner, kind in TARGETS]}
    (dest / "export-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))
    print("Four exports validated and downloaded. No Drive files modified.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("Export discovery failed:", exc, file=sys.stderr)
        sys.exit(1)
