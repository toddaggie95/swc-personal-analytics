#!/usr/bin/env python3
"""Read-only Kashyyyk web CSV versus normalized SWC API parity audit."""
import argparse, collections, csv, glob, json, pathlib

def rows(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))

def audit(web_dir, api_dir, output):
    output.mkdir(parents=True, exist_ok=True)
    issues, summary, sources = [], {}, {}
    for faction in ("tff", "tjo"):
        for kind in ("materials", "stations"):
            key = f"{faction}-{kind}"
            web_rows = rows(web_dir / f"{key}.csv")
            candidates = sorted(api_dir.glob(f"{faction}__{kind}__system-kashyyyk__*.json"))
            if len(candidates) != 1:
                raise ValueError(f"{key}: expected exactly one API snapshot, found {len(candidates)}")
            doc = json.loads(candidates[0].read_text(encoding="utf-8"))
            api_rows = doc[kind]
            if doc["summary"]["locationFilter"]["uid"] != "9:104":
                raise ValueError(f"{key}: not a Kashyyyk snapshot")
            w, a = {r["uid"]: r for r in web_rows}, {r["uid"]: r for r in api_rows}
            if len(w) != len(web_rows) or len(a) != len(api_rows):
                raise ValueError(f"{key}: duplicate UID")
            sources[key] = (w, a)
            summary[key] = dict(web=len(w), api=len(a), missing_api=sorted(w.keys()-a.keys()), missing_web=sorted(a.keys()-w.keys()))
            for uid in sorted(w.keys() & a.keys()):
                wr, ar = w[uid], a[uid]
                loc = ar.get("location") or {}
                coords = ar.get("coordinates") or {}
                sys = coords.get("system") or {}
                container = loc.get("container") or {}
                checks = {
                    "name": (wr["name"], ar["name"]),
                    "type": (wr["type_name"].lower(), ar["typeName"].lower()),
                    "owner_uid": (wr["owner_uid"], ar["ownerUid"]),
                    "system_uid": (wr["system_uid"], (loc.get("system") or {}).get("uid")),
                    "sysX": (wr["sysX"], sys.get("x")),
                    "sysY": (wr["sysY"], sys.get("y")),
                }
                if kind == "materials":
                    checks.update({
                        "quantity": (wr["quantity"], ar["quantity"]),
                        "container_uid": (wr["container_uid"], container.get("uid")),
                        "container_type": (wr["container_type_name"].lower().replace("facilities", "facility").rstrip("s"), container.get("type", "").lower()),
                    })
                    for prefix, axis in (("surf", "surface"), ("ground", "ground")):
                        for coord in ("X", "Y"):
                            checks[prefix+coord] = (wr[prefix+coord], (coords.get(axis) or {}).get(coord.lower()))
                else:
                    ops = ar.get("operations") or {}
                    acts = ops.get("productionActions")
                    running = [x.get("value", {}) for x in (acts or []) if isinstance(x.get("value"), dict) and x["value"].get("status") == "running"]
                    tool = ops.get("tooledTo")
                    checks["tooled-to"] = (wr.get("tooled-to"), (tool.get("value") if isinstance(tool, dict) else "") or "")
                    if acts is not None:
                        checks["productionStatus"] = (wr.get("productionStatus"), "running" if running else "")
                    if running:
                        checks["productionQuantity"] = (wr.get("productionQuantity"), running[0].get("quantity"))
                for field, (left, right) in checks.items():
                    lv = "" if left is None else str(left).strip()
                    rv = "" if right is None else str(right).strip()
                    if lv != rv:
                        classification = ("web-blank-api-populated" if key == "tjo-materials" and field in {"system_uid","sysX","sysY","surfX","surfY","groundX","groundY"} and not lv and rv else "value-mismatch")
                        issues.append(dict(dataset=key, uid=uid, field=field, web=lv, api=rv, classification=classification))
    has = {}
    for source_idx, source_name in enumerate(("web", "api")):
        totals, seen = collections.Counter(), set()
        for faction in ("tff", "tjo"):
            for uid, r in sources[f"{faction}-materials"][source_idx].items():
                if uid in seen:
                    continue
                seen.add(uid)
                if source_idx == 0:
                    typ = r["container_type_name"].lower().replace("facilities", "facility").rstrip("s")
                    station, material, quantity = r["container_uid"], r["type_name"].lower(), int(r["quantity"])
                    x, y = r["sysX"], r["sysY"]
                else:
                    loc = r.get("location") or {}
                    container = loc.get("container") or {}
                    typ = container.get("type", "").lower()
                    station, material, quantity = container.get("uid"), r["typeName"].lower(), int(r["quantity"])
                    xy = (r.get("coordinates") or {}).get("system") or {}
                    x, y = xy.get("x"), xy.get("y")
                if typ == "station":
                    totals[(str(x), str(y), str(station), material)] += quantity
        has[source_name] = totals
    with (output/"station-has-comparison.csv").open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["sysX","sysY","station_uid","material","web","api","delta"])
        for k in sorted(has["web"].keys() | has["api"].keys()):
            v1, v2 = has["web"].get(k, 0), has["api"].get(k, 0)
            writer.writerow([*k, v1, v2, v2-v1])
            if v1 != v2:
                issues.append(dict(dataset="station-HAS", uid="|".join(k[:3]), field=k[3], web=str(v1), api=str(v2), classification="value-mismatch"))
    with (output/"discrepancies.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["dataset","uid","field","web","api","classification"])
        writer.writeheader()
        writer.writerows(issues)
    report = dict(scope="Kashyyyk", summary=summary, station_has_cells=dict(web=len(has["web"]),api=len(has["api"])), discrepancy_classifications=dict(collections.Counter(i["classification"] for i in issues)), discrepancies=len(issues), limitations=["Station HAS compares station-contained material totals, not the full production publisher", "Production Changes and readiness require identical assignment matrix and prior accepted snapshot", "Web-blank API coordinates do not imply HAS eligibility", "Captures are not transactional or simultaneous"])
    (output/"summary.json").write_text(json.dumps(report, indent=2)+"\n")
    print(json.dumps(report, indent=2))
    return 1 if any(i["classification"] == "value-mismatch" and i["dataset"] != "tjo-materials" for i in issues) else 0

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--web-dir", required=True, type=pathlib.Path)
    p.add_argument("--api-dir", required=True, type=pathlib.Path)
    p.add_argument("--out-dir", required=True, type=pathlib.Path)
    args = p.parse_args()
    raise SystemExit(audit(args.web_dir, args.api_dir, args.out_dir))
