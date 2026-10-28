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
    demand={m:sum(row["materials"][m]["required"] for row in systems) for m in mats}
    usage={m:sum(1 for o in snapshot.get("orders",[]) if not o.get("started") and (o.get("bill") or {}).get(m,0)>0) for m in mats}
    mats=sorted(mats,key=lambda m:(-demand[m],-usage[m],m))
    # Mirror the dashboard: row 5 header; production systems at rows 6,8,...44.
    rows=[[""] for _ in range(57)]
    rows[4]=["System",*[m.title() for m in mats]]
    totals={k:{m:0 for m in mats} for k in ("missing","excess","net")}
    colors=[]
    for index,s in enumerate(all_systems):
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
        target=5+2*index if index<len(systems) else 46+(index-len(systems))
        rows[target]=row
        colors.append((target,shades))
    for key,label,sign in (("missing","TOTAL MISSING",-1),("excess","TOTAL EXCESS",1),("net","NET BALANCE",1)):
        rows[54+("missing","excess","net").index(key)]=[label,*[sign*totals[key][m] for m in mats]]
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
    end=START+22;bottom=len(rows)
    meta=request(token,"?fields=sheets(properties(sheetId,gridProperties),conditionalFormats)")
    prop=next(s["properties"] for s in meta["sheets"] if s["properties"]["sheetId"]==TAB_ID)
    grid=prop["gridProperties"];actions=[]
    if grid["columnCount"]<end:
        actions.append({"updateSheetProperties":{"properties":{"sheetId":TAB_ID,"gridProperties":{"columnCount":end}},"fields":"gridProperties.columnCount"}})
    if grid["rowCount"]<bottom:
        actions.append({"updateSheetProperties":{"properties":{"sheetId":TAB_ID,"gridProperties":{"rowCount":bottom}},"fields":"gridProperties.rowCount"}})
    def cell(v):
        return {"userEnteredValue":{"numberValue":v} if type(v)==int else {"stringValue":str(v)}}
    payload=[{"values":[cell(v) for v in (row+[""]*(22-len(row)))]} for row in rows]
    actions.append({"updateCells":{"range":{"sheetId":TAB_ID,"startRowIndex":0,"endRowIndex":bottom,"startColumnIndex":START,"endColumnIndex":end},"rows":payload,"fields":"userEnteredValue"}})
    # Reset previous highlights so changed balances cannot retain stale colors.
    actions.append({"repeatCell":{"range":{"sheetId":TAB_ID,"startRowIndex":1,"endRowIndex":bottom,"startColumnIndex":START+1,"endColumnIndex":end},"cell":{"userEnteredFormat":{"backgroundColor":{"red":1,"green":1,"blue":1}}},"fields":"userEnteredFormat.backgroundColor"}})
    # The legacy always-white conditional rule must not override matrix fills.
    sheet=next(s for s in meta["sheets"] if s["properties"]["sheetId"]==TAB_ID)
    for idx,rule in enumerate(sheet.get("conditionalFormats",[])):
        rg=rule.get("ranges",[])
        cond=rule.get("booleanRule",{}).get("condition",{})
        if cond.get("type")=="CUSTOM_FORMULA" and cond.get("values",[{}])[0].get("userEnteredValue")=="=TRUE" and any(r.get("startColumnIndex")==12 and r.get("endColumnIndex")==35 for r in rg):
            new_rule=json.loads(json.dumps(rule))
            new_rule["ranges"]=[{"sheetId":TAB_ID,"startRowIndex":0,"endRowIndex":grid["rowCount"],"startColumnIndex":12,"endColumnIndex":13}]
            actions.append({"updateConditionalFormatRule":{"index":idx,"rule":new_rule}})
    for i,shades in colors:
        for j,shade in enumerate(shades):
            if shade:
                r,g,b=PALETTE[shade]
                actions.append({"repeatCell":{"range":{"sheetId":TAB_ID,"startRowIndex":i,"endRowIndex":i+1,"startColumnIndex":START+j,"endColumnIndex":START+j+1},"cell":{"userEnteredFormat":{"backgroundColor":{"red":r,"green":g,"blue":b}}},"fields":"userEnteredFormat.backgroundColor"}})
    # Consistent readable headings, widths, numeric grouping, and summary emphasis.
    actions.extend([
      {"repeatCell":{"range":{"sheetId":TAB_ID,"startRowIndex":0,"endRowIndex":1,"startColumnIndex":START,"endColumnIndex":end},"cell":{"userEnteredFormat":{"backgroundColor":{"red":0.12,"green":0.20,"blue":0.30},"textFormat":{"foregroundColor":{"red":1,"green":1,"blue":1},"bold":True},"horizontalAlignment":"CENTER","verticalAlignment":"MIDDLE"}},"fields":"userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment"}},
      {"updateDimensionProperties":{"range":{"sheetId":TAB_ID,"dimension":"COLUMNS","startIndex":START,"endIndex":START+1},"properties":{"pixelSize":172},"fields":"pixelSize"}},
      {"updateDimensionProperties":{"range":{"sheetId":TAB_ID,"dimension":"COLUMNS","startIndex":START+1,"endIndex":end},"properties":{"pixelSize":116},"fields":"pixelSize"}},
      {"repeatCell":{"range":{"sheetId":TAB_ID,"startRowIndex":1,"endRowIndex":bottom,"startColumnIndex":START+1,"endColumnIndex":end},"cell":{"userEnteredFormat":{"numberFormat":{"type":"NUMBER","pattern":"#,##0;-#,##0;–"},"horizontalAlignment":"RIGHT"}},"fields":"userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment"}},
      {"repeatCell":{"range":{"sheetId":TAB_ID,"startRowIndex":bottom-3,"endRowIndex":bottom,"startColumnIndex":START,"endColumnIndex":end},"cell":{"userEnteredFormat":{"textFormat":{"bold":True},"backgroundColor":{"red":0.90,"green":0.94,"blue":0.98}}},"fields":"userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor"}},
      {"updateDimensionProperties":{"range":{"sheetId":TAB_ID,"dimension":"ROWS","startIndex":0,"endIndex":1},"properties":{"pixelSize":34},"fields":"pixelSize"}}
    ])
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
