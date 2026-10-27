#!/usr/bin/env python3
"""Prepare a non-writing, fully validated Production Overview publication preview."""
import json,sys

STATUSES=("building","ready_now","transfer","blocked","unassigned")
HEADERS=["System","Running","Ready Now","Ready w/ Material Move","Blocked","Unassigned","Total"]

def preview(snapshot,audit):
    if snapshot.get("schemaVersion")!=1 or snapshot.get("mode")!="read_only":
        raise ValueError("Unverified readiness snapshot")
    if audit.get("status")!="matched" or audit.get("statistics",{}).get("differences")!=0 or audit["statistics"].get("validationErrors")!=0:
        raise ValueError("Shadow audit did not match")
    coverage=snapshot.get("coverageAudit",{})
    totals=coverage.get("totals",{})
    if totals.get("uncoveredExportShipyardsInTrackedSystems")!=0:
        raise ValueError("Uncovered exported shipyards")
    orders=snapshot.get("orders",[])
    if len(orders)!=totals.get("classifiedOrders") or len(orders)!=snapshot.get("statistics",{}).get("liveOrders"):
        raise ValueError("Production order coverage mismatch")
    summary=snapshot.get("summary",{})
    rows=summary.get("rows",[])
    if not rows or len(rows)!=coverage.get("systems",[]).__len__():
        raise ValueError("System coverage mismatch")
    if len({r["system"] for r in rows})!=len(rows):raise ValueError("Duplicate system")
    output=[]
    for r in sorted(rows,key=lambda x:x["system"]):
        numbers=[r[k] for k in STATUSES]
        if any(type(n)!=int or n<0 for n in numbers) or sum(numbers)!=r["total"]:
            raise ValueError("Invalid per-system status totals")
        output.append([r["system"],*numbers,r["total"]])
    grand=["TOTAL",*[sum(r[i] for r in output) for i in range(1,7)]]
    if grand[-1]!=len(orders) or grand[-1]!=summary.get("totals",{}).get("total"):
        raise ValueError("Global totals mismatch")
    if audit["statistics"].get("overviewOrders")!=len(orders):
        raise ValueError("Shadow order count mismatch")
    return {"schemaVersion":1,"mode":"dry_run","writeAuthorized":False,"targetSheet":"Production Overview",
            "range":"A5:G"+str(6+len(output)),"values":[HEADERS,*output,grand],
            "classifiedOrders":len(orders),"exportedShipyardsInTrackedSystems":totals["exportedShipyardsInTrackedSystems"],
            "notes":["This preview does not change Google Sheets.","Shipyard export count and classified production order count are distinct."]}

def main():
    if len(sys.argv)!=4:raise SystemExit("Usage: overview-publish-preview.py readiness.json shadow-audit.json preview.json")
    with open(sys.argv[1],encoding="utf-8") as f:snapshot=json.load(f)
    with open(sys.argv[2],encoding="utf-8") as f:audit=json.load(f)
    result=preview(snapshot,audit)
    with open(sys.argv[3],"w",encoding="utf-8") as f:json.dump(result,f,indent=2)
    print(json.dumps({"status":"dry_run","systems":len(result["values"])-2,"classifiedOrders":result["classifiedOrders"],"writeAuthorized":False}))

if __name__=="__main__":main()
