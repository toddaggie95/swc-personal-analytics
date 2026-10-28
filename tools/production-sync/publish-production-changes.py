#!/usr/bin/env python3
"""Publish only the most recent verified HAS production comparison."""
import json, os, sys, urllib.request
ID="1ezzYU4MYW9VyWWR2mJWQ6jmFlZKxPxvezZAscXtx5q8"
ROOT="https://sheets.googleapis.com/v4/spreadsheets/"+ID
def call(path, data=None):
    body=None if data is None else json.dumps(data).encode()
    req=urllib.request.Request(ROOT+path,data=body,headers={"Authorization":"Bearer "+os.environ["GOOGLE_ACCESS_TOKEN"],"Content-Type":"application/json"},method="GET" if data is None else "POST")
    with urllib.request.urlopen(req,timeout=90) as response:return json.load(response)
def value(x):
    if x is None:return ""
    if isinstance(x,bool):return "Yes" if x else "No"
    if isinstance(x,dict):return json.dumps(x,sort_keys=True)
    return str(x)
def publish(report):
    if report.get("status") not in ("compared","baseline_created") or not isinstance(report.get("changes"),list):raise ValueError("Invalid report")
    changes=report["changes"]
    rows=[["Production Changes"],["Previous accepted batch",value(report.get("previousBatch"))],["Current accepted batch",value(report.get("currentBatch"))],["Changes detected",len(changes)],["System","Station UID","Change Type","Field","Previous","Current"]]
    if report["status"]=="baseline_created":rows.append(["Baseline established","No previous accepted snapshot"])
    elif not changes:rows.append(["No production changes","No differences since previous accepted import"])
    else:
        for c in changes:
            before,after=c.get("before"),c.get("after")
            system=c.get("system") or (after.get("system") if isinstance(after,dict) else None) or (before.get("system") if isinstance(before,dict) else None)
            rows.append([value(system),value(c.get("uid")),value(c.get("type")),value(c.get("field")),value(before),value(after)])
    sheets=call("?fields=sheets(properties(sheetId,title))")["sheets"]
    matches=[s["properties"]["sheetId"] for s in sheets if s["properties"]["title"]=="Production Changes"]
    if matches:sheet=matches[0]
    else:
        overview=next((s["properties"] for s in sheets if s["properties"]["title"]=="Production Overview"),None)
        properties={"title":"Production Changes"}
        if overview is not None:
            properties["index"]=overview.get("index",0)+1
        sheet=call(":batchUpdate",{"requests":[{"addSheet":{"properties":properties}}]})["replies"][0]["addSheet"]["properties"]["sheetId"]
    requests=[
      {"updateCells":{"range":{"sheetId":sheet},"fields":"userEnteredValue"}},
      {"updateCells":{"start":{"sheetId":sheet,"rowIndex":0,"columnIndex":0},"rows":[{"values":[{"userEnteredValue":{"numberValue":v} if isinstance(v,(int,float)) else {"stringValue":str(v)}} for v in row]} for row in rows],"fields":"userEnteredValue"}},
      {"repeatCell":{"range":{"sheetId":sheet,"startRowIndex":0,"endRowIndex":1,"startColumnIndex":0,"endColumnIndex":6},"cell":{"userEnteredFormat":{"backgroundColor":{"red":0.13,"green":0.22,"blue":0.32},"textFormat":{"foregroundColor":{"red":1,"green":1,"blue":1},"bold":True,"fontSize":15}}},"fields":"userEnteredFormat"}},
      {"repeatCell":{"range":{"sheetId":sheet,"startRowIndex":4,"endRowIndex":5,"startColumnIndex":0,"endColumnIndex":6},"cell":{"userEnteredFormat":{"backgroundColor":{"red":0.88,"green":0.93,"blue":0.98},"textFormat":{"bold":True}}},"fields":"userEnteredFormat"}},
      {"updateDimensionProperties":{"range":{"sheetId":sheet,"dimension":"COLUMNS","startIndex":0,"endIndex":6},"properties":{"pixelSize":175},"fields":"pixelSize"}}
    ]
    call(":batchUpdate",{"requests":requests})
    # Read back the published report. A successful write response alone is insufficient.
    import urllib.parse
    check_range=urllib.parse.quote("'Production Changes'!A1:B4",safe="")
    req=urllib.request.Request(
        "https://sheets.googleapis.com/v4/spreadsheets/"+ID+"/values/"+check_range,
        headers={"Authorization":"Bearer "+os.environ["GOOGLE_ACCESS_TOKEN"]})
    with urllib.request.urlopen(req,timeout=90) as response:
        actual=json.load(response).get("values",[])
    expected=[["Production Changes"],["Previous accepted batch",value(report.get("previousBatch"))],
              ["Current accepted batch",value(report.get("currentBatch"))],["Changes detected",str(len(changes))]]
    if actual!=expected:
        raise RuntimeError("Production Changes readback failed: "+repr(actual))
    print("Published and verified Production Changes:",len(changes),"changes")
if __name__=="__main__":
    if len(sys.argv)!=2:raise SystemExit("Usage: publish-production-changes.py report.json")
    if os.getenv("ACCEPTED_HAS_BATCH")!="true":raise SystemExit("Refusing unverified HAS publication")
    with open(sys.argv[1],encoding="utf-8") as f:publish(json.load(f))
