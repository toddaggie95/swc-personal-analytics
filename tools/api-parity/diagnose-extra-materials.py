#!/usr/bin/env python3
"""Aggregate, non-identifying diagnosis of API-only material lots. Never print UIDs."""
import argparse, collections, csv, json
from pathlib import Path

def diagnose(csv_dir: Path, api_dir: Path, system: str):
    with (csv_dir/"tff-materials.csv").open(encoding="utf-8-sig", newline="") as f:
        all_csv=list(csv.DictReader(f))
    scoped=[r for r in all_csv if r.get("system","").casefold()==system.casefold()]
    captures=list(api_dir.glob(f"tff__materials__system-{system.lower()}__*.json"))
    if len(captures)!=1:
        raise ValueError("Expected exactly one scoped API materials capture")
    api=json.loads(captures[0].read_text())["materials"]
    csv_by_uid={r["uid"]:r for r in all_csv}
    scoped_uids={r["uid"] for r in scoped}
    extras=[r for r in api if r["uid"] not in scoped_uids]
    common=[r for r in api if r["uid"] in scoped_uids]
    def container_uid(r):
        return ((r.get("location") or {}).get("container") or {}).get("uid")
    known_container_uids={r.get("container_uid","") for r in scoped}
    def counts(values):
        return dict(sorted(collections.Counter(str(v) for v in values).items()))
    def container_class(r):
        c=((r.get("location") or {}).get("container") or {})
        return c.get("type") or "unknown"
    def planet(r):
        return (((r.get("location") or {}).get("planet") or {}).get("name") or "none")
    csv_location_fields=sorted(k for k in (all_csv[0].keys() if all_csv else []) if any(t in k.lower() for t in ("system","planet","container","sector")))
    return {
        "system":system,
        "csvLocationFields":csv_location_fields,
        "extraCsvSystemValues":counts(csv_by_uid[r["uid"]].get("system","") for r in extras if r["uid"] in csv_by_uid),
        "extraCsvContainerTypes":counts(csv_by_uid[r["uid"]].get("container_type_name","") for r in extras if r["uid"] in csv_by_uid),
        "extraCsvContainerMatchesApi":sum(csv_by_uid[r["uid"]].get("container_uid","")==container_uid(r) for r in extras if r["uid"] in csv_by_uid),
        "csvRows":len(scoped),"apiRows":len(api),"extraCount":len(extras),
        "extraUidsFoundElsewhereInFullCsv":sum(r["uid"] in csv_by_uid for r in extras),
        "extraWithContainerAlreadyInScopedCsv":sum(container_uid(r) in known_container_uids for r in extras),
        "extraWithMissingContainer":sum(not container_uid(r) for r in extras),
        "extraContainerTypes":counts(container_class(r) for r in extras),
        "matchedContainerTypes":counts(container_class(r) for r in common),
        "extraPlanets":counts(planet(r) for r in extras),
        "extraMaterialTypes":counts(r.get("typeName") or "unknown" for r in extras),
        "extraQuantities":{"total":sum(r.get("quantity") or 0 for r in extras),
                           "zero":sum((r.get("quantity") or 0)==0 for r in extras)},
        "extraContainerUidCardinality":len({container_uid(r) for r in extras if container_uid(r)}),
    }

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--csv-dir",type=Path,required=True)
    p.add_argument("--api-dir",type=Path,required=True)
    p.add_argument("--system",required=True)
    args=p.parse_args()
    print(json.dumps(diagnose(args.csv_dir,args.api_dir,args.system),indent=2))
