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
def verify_readback(report, changes):
    # Read back the published report. A successful write response alone is insufficient.
    import urllib.parse
    check_range=urllib.parse.quote("'Production Changes'!A1:B4",safe="")
    req=urllib.request.Request(
        "https://sheets.googleapis.com/v4/spreadsheets/"+ID+"/values/"+check_range,
        headers={"Authorization":"Bearer "+os.environ["GOOGLE_ACCESS_TOKEN"]})
    with urllib.request.urlopen(req,timeout=90) as response:
        actual=json.load(response).get("values",[])
    expected=[["Production Changes"],["Previous accepted batch",value(report.get("previousBatch"))],
              ["Current accepted batch",value(report.get("currentBatch"))],["Stations changed",str(len(changes))]]
    # Sheets omits trailing empty cells, especially for the first baseline.
    normalize=lambda rows: [row + [""]*(2-len(row)) for row in rows]
    if normalize(actual)!=normalize(expected):
        raise RuntimeError("Production Changes readback failed: "+repr(actual))

def group_station_notices(changes):
    """One presentation row per UID; raw field-level events remain untouched."""
    by_uid={}
    for change in changes:
        uid=value(change.get("uid"))
        if not uid:raise ValueError("Missing change station UID")
        row=by_uid.setdefault(uid,{"uid":uid,"system":"","sector":"","coordinates":"","fields":{},"types":[]})
        after=change.get("after")
        before=change.get("before")
        system=change.get("system") or (after.get("system") if isinstance(after,dict) else None) or (before.get("system") if isinstance(before,dict) else None)
        if system and row["system"] and system!=row["system"]:raise ValueError("Conflicting station systems "+uid)
        row["system"]=system or row["system"]
        for key in ("sector","coordinates"):
            location=change.get(key) or (after.get(key) if isinstance(after,dict) else None) or (before.get(key) if isinstance(before,dict) else None)
            if location and row[key] and location!=row[key]:raise ValueError("Conflicting station "+key+" "+uid)
            row[key]=location or row[key]
        field=change.get("field")
        if field:
            if field in row["fields"]:raise ValueError("Duplicate change field "+uid+" "+field)
            row["fields"][field]={"before":change.get("before"),"after":change.get("after")}
        row["types"].append(change.get("type"))
    notices=[]
    for row in by_uid.values():
        fields=row["fields"]
        started=fields.get("started")
        if started and started["before"] is False and started["after"] is True:notice="Production Started"
        elif started and started["before"] is True and started["after"] is False:notice="Production Stopped"
        elif "station_added" in row["types"]:notice="Station Added"
        elif "station_removed" in row["types"]:notice="Station Removed"
        elif "ship" in fields or "quantity" in fields:notice="Assignment Changed"
        elif "readiness" in fields:notice="Readiness Changed"
        else:notice="Station Updated"
        details="; ".join(k+": "+value(v["before"])+" → "+value(v["after"]) for k,v in fields.items())
        if not details:details="; ".join(row["types"])
        def transition(field):
            if field not in fields:return ""
            v=fields[field]
            return value(v["before"])+" → "+value(v["after"])
        others="; ".join(k+": "+value(v["before"])+" → "+value(v["after"]) for k,v in fields.items() if k not in ("ship","quantity","started","status","readiness"))
        notices.append([value(row["system"]),value(row["sector"]),value(row["coordinates"]),row["uid"],notice,
                        transition("ship"),transition("quantity"),transition("started"),
                        transition("status"),transition("readiness"),others or ("; ".join(row["types"]) if not fields else "")])
    return sorted(notices,key=lambda r:(r[0],r[1]))

def publish(report):
    if report.get("status") not in ("compared","baseline_created") or not isinstance(report.get("changes"),list):raise ValueError("Invalid report")
    changes=report["changes"]
    notices=group_station_notices(changes)
    rows=[["Production Changes"],["Previous accepted batch",value(report.get("previousBatch"))],["Current accepted batch",value(report.get("currentBatch"))],["Stations changed",len(notices)],["System","Sector","System Coordinates","Station UID","Notice","Ship","Quantity","Started","Status","Readiness","Other Changes"]]
    if report["status"]=="baseline_created":rows.append(["Baseline established","No previous accepted snapshot"])
    elif not changes:rows.append(["No production changes","No differences since previous accepted import"])
    else:rows.extend(notices)
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
      {"repeatCell":{"range":{"sheetId":sheet,"startRowIndex":0,"endRowIndex":1,"startColumnIndex":0,"endColumnIndex":11},"cell":{"userEnteredFormat":{"backgroundColor":{"red":0.13,"green":0.22,"blue":0.32},"textFormat":{"foregroundColor":{"red":1,"green":1,"blue":1},"bold":True,"fontSize":15}}},"fields":"userEnteredFormat"}},
      {"repeatCell":{"range":{"sheetId":sheet,"startRowIndex":4,"endRowIndex":5,"startColumnIndex":0,"endColumnIndex":6},"cell":{"userEnteredFormat":{"backgroundColor":{"red":0.88,"green":0.93,"blue":0.98},"textFormat":{"bold":True}}},"fields":"userEnteredFormat"}},
      {"updateDimensionProperties":{"range":{"sheetId":sheet,"dimension":"COLUMNS","startIndex":0,"endIndex":6},"properties":{"pixelSize":150},"fields":"pixelSize"}}
    ]
    requests.append({"repeatCell":{"range":{"sheetId":sheet,"startRowIndex":5,"endRowIndex":max(6,len(rows)),"startColumnIndex":0,"endColumnIndex":11},"cell":{"userEnteredFormat":{"verticalAlignment":"MIDDLE","wrapStrategy":"WRAP"}},"fields":"userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy"}})
    call(":batchUpdate",{"requests":requests})
    verify_readback(report, notices)
    print("Published and verified Production Changes:",len(notices),"station notices from",len(changes),"field changes")
if __name__=="__main__":
    if len(sys.argv)!=2:raise SystemExit("Usage: publish-production-changes.py report.json")
    if os.getenv("ACCEPTED_HAS_BATCH")!="true":raise SystemExit("Refusing unverified HAS publication")
    with open(sys.argv[1],encoding="utf-8") as f:publish(json.load(f))
