#!/usr/bin/env python3
"""Read-only comparison of manual SWC CSV exports and API-generated CSV exports.

No Google API calls, no writes to Drive or Sheets, and no dependency on the
production-sync scripts. A nonzero exit code indicates an unsafe mismatch.
"""
import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

KINDS = ("TFF-Stations", "TJO-Stations", "TFF-Materials", "TJO-Materials")
STATION_CRITICAL = (
    "uid", "owner_uid", "commander_uid", "sector_uid", "sector",
    "system_uid", "system", "planet_uid", "planet", "galX", "galY",
    "sysX", "sysY", "type_uid", "type_name", "productionStatus",
    "productionQuantity", "tooled-to", "constructionStatus",
)
MATERIAL_CRITICAL = (
    "uid", "owner_uid", "type_uid", "type_name", "quantity",
    "sector_uid", "sector", "system_uid", "system", "planet_uid",
    "planet", "galX", "galY", "sysX", "sysY", "surfX", "surfY",
    "groundX", "groundY", "container_type_uid", "container_uid",
)
def load(path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames or []
        if len(fields) != len(set(fields)) or "uid" not in fields:
            raise ValueError(f"{path}: duplicate headers or missing UID")
        rows = {}
        for index, row in enumerate(reader, 2):
            if None in row:
                raise ValueError(f"{path}:{index}: extra CSV cells")
            uid = (row.get("uid") or "").strip()
            if not uid or uid in rows:
                raise ValueError(f"{path}:{index}: empty/duplicate UID {uid!r}")
            rows[uid] = row
    return fields, rows

def compare(manual_dir, api_dir, sample_limit=15):
    output = {"mode": "shadow_read_only", "safeToPromote": True, "files": {}}
    for name in KINDS:
        manual_path = manual_dir / (name + ".csv")
        api_path = api_dir / (name + ".csv")
        entry = {"manualFile": str(manual_path), "apiFile": str(api_path)}
        output["files"][name] = entry
        try:
            mf, mr = load(manual_path)
            af, ar = load(api_path)
            critical = STATION_CRITICAL if name.endswith("Stations") else MATERIAL_CRITICAL
            missing_fields = sorted(set(mf) - set(af))
            extra_fields = sorted(set(af) - set(mf))
            missing_critical = sorted(set(critical) - set(af))
            missing_manual_critical = sorted(set(critical) - set(mf))
            missing_uids = sorted(mr.keys() - ar.keys())
            extra_uids = sorted(ar.keys() - mr.keys())
            common = mr.keys() & ar.keys()
            mismatches = Counter()
            examples = []
            for uid in sorted(common):
                for field in critical:
                    if field in mf and field in af and mr[uid][field] != ar[uid][field]:
                        mismatches[field] += 1
                        if len(examples) < sample_limit:
                            examples.append({"uid": uid, "field": field,
                                             "manual": mr[uid][field], "api": ar[uid][field]})
            entry.update({
                "manualRows": len(mr), "apiRows": len(ar),
                "missingColumns": missing_fields, "extraColumns": extra_fields,
                "missingCriticalColumns": missing_critical,
                "missingManualCriticalColumns": missing_manual_critical,
                "missingUidsCount": len(missing_uids), "extraUidsCount": len(extra_uids),
                "missingUidsSample": missing_uids[:sample_limit],
                "extraUidsSample": extra_uids[:sample_limit],
                "criticalFieldMismatchCounts": dict(mismatches),
                "criticalMismatchExamples": examples,
            })
            entry["exactMatch"] = not (missing_fields or extra_fields or missing_critical
                                         or missing_manual_critical or missing_uids or extra_uids or mismatches)
        except (OSError, ValueError, csv.Error) as exc:
            entry["error"] = str(exc)
            entry["exactMatch"] = False
        if not entry["exactMatch"]:
            output["safeToPromote"] = False
    return output

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manual-dir", type=Path, required=True)
    parser.add_argument("--api-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    result = compare(args.manual_dir, args.api_dir)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"safeToPromote": result["safeToPromote"],
                      "files": {k: v.get("exactMatch") for k,v in result["files"].items()}}))
    raise SystemExit(0 if result["safeToPromote"] else 1)

if __name__ == "__main__":
    main()
