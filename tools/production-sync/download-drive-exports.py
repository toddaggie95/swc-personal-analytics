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

# Seeded from the four exports that passed the 420/420 and 2898/2898 audit.
# These IDs are immutable Drive identities, not filename guesses.
ACCEPTED_BASELINE = {
    "1qlxHQAZCkaGyFEnO92bnX7f45oVyMgfW",  # TJO stations
    "1Gx8HsOak_3bkcsuBm4TiW0eltOUFCq1z",  # TJO materials
    "18_G8GdC2OO2_2ycXdZe-TkVMH2tzDau6", # TFF stations
    "1YNp0kUhGWmUV3aSLz6VCLzdBF1cgxCHi", # TFF materials
}

def discover(files, accepted_ids=None):
    accepted_ids = ACCEPTED_BASELINE if accepted_ids is None else set(accepted_ids)
    previous, fresh = {}, {}
    for item, content in files:
        try:
            key, count = classify(content)
        except ValueError as exc:
            raise ValueError(f"{item['name']!r} (Drive ID {item['id']}): {exc}") from exc
        target = previous if item["id"] in accepted_ids else fresh
        if key in target:
            raise ValueError(f"ambiguous duplicate {key[0]} {key[1]} exports: "
                             f"{target[key]['name']!r} and {item['name']!r}")
        target[key] = {"id": item["id"], "name": item["name"],
                       "modifiedTime": item.get("modifiedTime", ""),
                       "sha256": hashlib.sha256(content).hexdigest(),
                       "rowCount": count, "content": content}
    if fresh:
        missing = set(TARGETS) - set(fresh)
        if missing:
            raise ValueError("incomplete new export batch; missing: " + ", ".join(
                f"{owner} {kind}" for owner, kind in sorted(missing)))
        selected = fresh
    else:
        selected = previous
        missing = set(TARGETS) - set(previous)
        if missing:
            raise ValueError("missing accepted baseline exports: " + ", ".join(
                f"{owner} {kind}" for owner, kind in sorted(missing)))
    return selected

def cleanup_plan(files, selected, accepted_ids=None):
    accepted_ids = ACCEPTED_BASELINE if accepted_ids is None else set(accepted_ids)
    chosen = {item["id"] for item in selected.values()}
    previous = [item for item, _ in files if item["id"] in accepted_ids and item["id"] not in chosen]
    return {"mode": "simulation_only", "requiresSuccessfulValidation": True,
            "previousFilesToTrashAfterAcceptance": previous,
            "filesToKeep": [v["id"] for v in selected.values()],
            "driveChangesPerformed": False}

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
    state_files = [item for item in items if item["name"] == "swc-accepted-batch.json"]
    if len(state_files) > 1:
        raise ValueError("duplicate accepted-batch state files")
    accepted_ids = ACCEPTED_BASELINE
    state = None
    if state_files:
        state_item = state_files[0]
        raw = get("https://www.googleapis.com/drive/v3/files/" +
                  urllib.parse.quote(state_item["id"], safe="") + "?alt=media", token)
        state = json.loads(raw)
        if state.get("schemaVersion") != 1 or len(state.get("files", [])) != 4:
            raise ValueError("invalid accepted-batch manifest")
        keys = {(v["owner"], v["kind"]) for v in state["files"]}
        ids = [v["id"] for v in state["files"]]
        if keys != set(TARGETS) or len(set(ids)) != 4:
            raise ValueError("accepted-batch manifest has duplicate or missing identities")
        accepted_ids = set(ids)
    candidates = []
    for item in items:
        if item["name"].lower().endswith(".csv") or item.get("mimeType") == "text/csv":
            url = ("https://www.googleapis.com/drive/v3/files/" +
                   urllib.parse.quote(item["id"], safe="") + "?alt=media")
            candidates.append((item, get(url, token)))
    if state:
        candidates = [(item, content) for item, content in candidates
                      if item["id"] not in ACCEPTED_BASELINE or item["id"] in accepted_ids]
    found = discover(candidates, accepted_ids)
    for key, target in TARGETS.items():
        (dest / target).write_bytes(found[key]["content"])
    manifest = {"schemaVersion": 1, "files": [
        {"owner": owner, "kind": kind, "canonicalName": TARGETS[(owner, kind)],
         **{k: v for k, v in found[(owner, kind)].items() if k != "content"}}
        for owner, kind in TARGETS]}
    (dest / "export-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    if state:
        previous_by_id = {v["id"]: v for v in state["files"]}
        for entry in manifest["files"]:
            prior = previous_by_id.get(entry["id"])
            if prior and prior["sha256"] != entry["sha256"]:
                raise ValueError("accepted export content changed: " + entry["id"])
    plan = cleanup_plan(candidates, found, accepted_ids)
    (dest / "cleanup-plan.json").write_text(json.dumps(plan, indent=2) + "\\n")
    print(json.dumps(manifest, indent=2))
    print("Cleanup simulation:", json.dumps(plan, indent=2))
    print("Four exports validated and downloaded. No Drive files modified.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("Export discovery failed:", exc, file=sys.stderr)
        sys.exit(1)
