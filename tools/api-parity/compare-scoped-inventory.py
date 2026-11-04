#!/usr/bin/env python3
"""Read-only, system-scoped CSV/API inventory parity; fail closed on identity errors."""
import argparse, csv, json, pathlib, collections

def audit(csv_dir, api_dir, system):
    report={"system":system,"datasets":{},"discrepancies":[]}
    for faction in ("tff","tjo"):
        for kind in ("materials","stations"):
            key=f"{faction}-{kind}"
            with (csv_dir/f"{key}.csv").open(encoding="utf-8-sig",newline="") as f:
                web=list(csv.DictReader(f))
            web=[r for r in web if r.get("system","").casefold()==system.casefold()]
            matches=list(api_dir.glob(f"{faction}__{kind}__system-{system.lower()}__*.json"))
            if len(matches)!=1: raise ValueError(f"{key}: expected one scoped API capture, found {len(matches)}")
            doc=json.loads(matches[0].read_text())
            summary=doc["summary"]
            if summary["entityType"]!=kind or summary["locationFilter"]["name"].casefold()!=system.casefold():
                raise ValueError(f"{key}: wrong API capture scope")
            api=doc[kind]
            def indexed(rows):
                ids=[r["uid"] for r in rows]
                if len(ids)!=len(set(ids)) or any(not x for x in ids): raise ValueError(f"{key}: duplicate or blank UID")
                return {r["uid"]:r for r in rows}
            w,a=indexed(web),indexed(api)
            missing=sorted(w.keys()-a.keys());extra=sorted(a.keys()-w.keys())
            issues=[]
            for uid in sorted(w.keys() & a.keys()):
                wr,ar=w[uid],a[uid]
                checks={"ownerUid":(wr.get("owner_uid",""),ar.get("ownerUid","")),
                        "system":(wr.get("system",""),(ar.get("location") or {}).get("system",{}).get("name",""))}
                if kind=="materials": checks["quantity"]=(wr.get("quantity",""),ar.get("quantity",""))
                for field,(wv,av) in checks.items():
                    if str(wv or "").strip().casefold()!=str(av or "").strip().casefold():
                        issues.append({"uid":uid,"field":field,"csv":wv,"api":av})
            report["datasets"][key]={"csv":len(w),"api":len(a),"missingApi":missing,"extraApi":extra,"fieldMismatches":len(issues)}
            report["discrepancies"] += [{"dataset":key,**i} for i in issues]
    report["totalDiscrepancies"]=sum(len(x["missingApi"])+len(x["extraApi"])+x["fieldMismatches"] for x in report["datasets"].values())
    return report

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--csv-dir",type=pathlib.Path,required=True)
    p.add_argument("--api-dir",type=pathlib.Path,required=True)
    p.add_argument("--system",required=True)
    p.add_argument("--out",type=pathlib.Path,required=True)
    a=p.parse_args()
    result=audit(a.csv_dir,a.api_dir,a.system)
    a.out.parent.mkdir(parents=True,exist_ok=True)
    a.out.write_text(json.dumps(result,indent=2)+"\n")
    print(json.dumps({"system":a.system,"datasets":{key:{"csv":v["csv"],"api":v["api"],"missingApiCount":len(v["missingApi"]),"extraApiCount":len(v["extraApi"]),"fieldMismatches":v["fieldMismatches"]} for key,v in result["datasets"].items()},"totalDiscrepancies":result["totalDiscrepancies"]},indent=2))
    raise SystemExit(1 if result["totalDiscrepancies"] else 0)
