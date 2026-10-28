#!/usr/bin/env python3
"""Publish a signed 21-material matrix beside Production Overview, never over A:L."""
import json,os,sys,urllib.request,urllib.parse
SHEET_ID="1ezzYU4MYW9VyWWR2mJWQ6jmFlZKxPxvezZAscXtx5q8"
TAB_ID=1565113984
START=13  # N, zero based
def matrix(snapshot):
    b=snapshot["materialBalance"]
    mats=b["materials"]
    systems=b["systems"]
    extra=b.get("inventoryOnlySystems",[])
    all_systems=systems+extra
    if snapshot["mode"]!="read_only" or len(mats)!=21 or len(systems)!=20:
        raise ValueError("Unexpected material balance scope")
    if len(set(mats))!=21 or len({s["system"] for s in all_systems})!=len(all_systems):
        raise ValueError("Duplicate system/material")
    rows=[["System",*mats]]
    totals={k:{m:0 for m in mats} for k in ("missing","excess","net")}
    colors=[]
    for s in all_systems:
        row=[s["system"]]; shades=[None]
        for m in mats:
            v=s["materials"][m]
            if v["have"]-v["required"]!=v["net"] or v["excess"]-v["missing"]!=v["net"]:
                raise ValueError("Unreconciled material "+m)
            for k in totals:totals[k][m]+=v[k]
            if v["missing"]:
                row.append(-v["missing"])
                ratio=v["missing"]/v["required"] if v["required"] else 1
                shades.append("green" if ratio<=.10 else "yellow" if ratio<=.30 else "red")
            elif v["showExcess"] and v["excess"]:
                row.append(v["excess"]);shades.append("lavender")
            else:row.append("");shades.append(None)
        rows.append(row);colors.append(shades)
    for key,label,sign in (("missing","TOTAL MISSING",-1),("excess","TOTAL EXCESS",1),("net","NET BALANCE",1)):
        rows.append([label,*[sign*totals[key][m] for m in mats]])
    if any(b["totals"][k]!=totals[k] for k in totals):
        raise ValueError("Balance summary mismatch")
    return rows,colors
PALETTE={"green":(0.84,0.94,0.85),"yellow":(1,0.95,0.70),
         "red":(0.98,0.82,0.81),"lavender":(0.88,0.83,0.96)}
def request(token,path,payload=None):
    req=urllib.request.Request("https://sheets.googleapis.com/v4/spreadsheets/"+SHEET_ID+path,
      data=json.dumps(payload).encode() if payload is not None else None,
      method="POST" if payload is not None else "GET",
      headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=90) as r:return json.load(r)
def publish(snapshot,token):
    rows,colors=matrix(snapshot)
    end=START+len(rows[0]);bottom=len(rows)
    meta=request(token,"?fields=sheets(properties(sheetId,gridProperties))")
    prop=next(s["properties"] for s in meta["sheets"] if s["properties"]["sheetId"]==TAB_ID)
    grid=prop["gridProperties"];actions=[]
    if grid["columnCount"]<end:
        actions.append({"updateSheetProperties":{"properties":{"sheetId":TAB_ID,"gridProperties":{"columnCount":end}},"fields":"gridProperties.columnCount"}})
    if grid["rowCount"]<bottom:
        actions.append({"updateSheetProperties":{"properties":{"sheetId":TAB_ID,"gridProperties":{"rowCount":bottom}},"fields":"gridProperties.rowCount"}})
    def cell(v):
        return {"userEnteredValue":{"numberValue":v} if type(v)==int else {"stringValue":str(v)}}
    payload=[{"values":[cell(v) for v in row]} for row in rows]
    actions.append({"updateCells":{"range":{"sheetId":TAB_ID,"startRowIndex":0,"endRowIndex":bottom,"startColumnIndex":START,"endColumnIndex":end},"rows":payload,"fields":"userEnteredValue"}})
    for i,shades in enumerate(colors,1):
        for j,shade in enumerate(shades):
            if shade:
                r,g,b=PALETTE[shade]
                actions.append({"repeatCell":{"range":{"sheetId":TAB_ID,"startRowIndex":i,"endRowIndex":i+1,"startColumnIndex":START+j,"endColumnIndex":START+j+1},"cell":{"userEnteredFormat":{"backgroundColor":{"red":r,"green":g,"blue":b}}},"fields":"userEnteredFormat.backgroundColor"}})
    request(token,":batchUpdate",{"requests":actions})
    rng=urllib.parse.quote("'Production Overview'!N1:AI"+str(bottom),safe="")
    actual=request(token,"/values/"+rng+"?valueRenderOption=UNFORMATTED_VALUE").get("values",[])
    for i,row in enumerate(rows):
        got=actual[i] if i<len(actual) else []
        for j,want in enumerate(row):
            if (got[j] if j<len(got) else "")!=want:
                raise ValueError("Readback mismatch row "+str(i+1)+" column "+str(j+14))
    return {"status":"published_and_verified","systems":20,"additionalSystems":len(snapshot["materialBalance"].get("inventoryOnlySystems",[])),"materials":21}
if __name__=="__main__":
    with open(sys.argv[1],encoding="utf-8") as f:s=json.load(f)
    if os.getenv("ENABLE_MATERIAL_BALANCE_WRITES")=="true" and os.getenv("ACCEPTED_HAS_BATCH")=="true":
        print(json.dumps(publish(s,os.environ["GOOGLE_ACCESS_TOKEN"])))
    else:
        rows,_=matrix(s);print(json.dumps({"status":"validated_no_write","rows":len(rows)}))
