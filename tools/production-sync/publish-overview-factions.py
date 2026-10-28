#!/usr/bin/env python3
"""Faction-aware, guarded Production Overview publisher. Only Overview A3:L46."""
import json, os, sys, urllib.parse, urllib.request

SPREADSHEET="1ezzYU4MYW9VyWWR2mJWQ6jmFlZKxPxvezZAscXtx5q8"
SHEET=1565113984
BASE="https://www.swcombine.com/members/inventory2/index.php"
STATUSES=("Running","Ready Now","Ready w/ Material Move","Blocked","Unassigned")
FACTIONS={"TJO":"1838","TFF":"1174"}
PALETTE=("#E6EEFA","#E4F1E7","#FFF4D4","#F9E5E4","#EDEAF4")

def color(hexcode):
    return {k:int(hexcode[i:i+2],16)/255 for k,i in (("red",1),("green",3),("blue",5))}

def link(ids,owner):
    p=[("entityType","5"),("InvType","2"),("InvID",FACTIONS[owner]),("Mode","3"),
       ("option[0][group]","0"),("option[0][type]","1")]
    for i,uid in enumerate(ids):
        if not str(uid).isdecimal(): raise ValueError("Non-numeric station ID")
        p.extend([(f"option[0][values][{i}][0]","1"),(f"option[0][values][{i}][1]",str(uid))])
    return BASE+"?"+urllib.parse.urlencode(p)

def cell(value=None,bg="#FFFFFF",bold=False,size=10,align="CENTER",fg="#25384B"):
    obj={"userEnteredFormat":{"backgroundColor":color(bg),"horizontalAlignment":align,
         "verticalAlignment":"MIDDLE","textFormat":{"fontSize":size,"bold":bold,
         "foregroundColor":color(fg)}}}
    if value is not None:
        if isinstance(value,str) and value.startswith("="):
            obj["userEnteredValue"]={"formulaValue":value}
        elif isinstance(value,int):
            obj["userEnteredValue"]={"numberValue":value}
        else:obj["userEnteredValue"]={"stringValue":str(value)}
    return obj

def build(preview):
    values=preview.get("values",[])
    groups=preview.get("stationIdsBySystemStatusFaction")
    if (preview.get("mode")!="dry_run" or preview.get("writeAuthorized") is not False
        or preview.get("targetSheet")!="Production Overview" or preview.get("range")!="A5:G26"
        or len(values)!=22 or len(groups or [])!=20 or any(len(r)!=7 for r in values)):
        raise ValueError("Invalid or unsafe validated preview")
    if values[0]!=["System",*STATUSES,"Total"]:raise ValueError("Unexpected header")
    grand=values[-1]
    if grand!=["TOTAL",*[sum(row[j] for row in values[1:-1]) for j in range(1,7)]]:
        raise ValueError("Dashboard totals do not reconcile")
    if grand[-1]!=preview.get("classifiedOrders"):raise ValueError("Classified order mismatch")
    rows=[[cell() for _ in range(12)] for _ in range(42)]
    merges=[]
    seen=set()
    def merge(r0,r1,c0,c1):
        merges.append({"mergeCells":{"range":{"sheetId":SHEET,"startRowIndex":r0,
          "endRowIndex":r1,"startColumnIndex":c0,"endColumnIndex":c1},"mergeType":"MERGE_ALL"}})
    rows[0][0]=cell("System",bg="#E8EFF6",bold=True)
    for j,status in enumerate(STATUSES):
        col=1+2*j
        rows[0][col]=cell(status,bg=PALETTE[j],bold=True)
        merge(4,5,col,col+2)
    rows[0][11]=cell("Total",bg="#E8EFF6",bold=True)
    for i,(v,group) in enumerate(zip(values[1:-1],groups)):
        if not isinstance(group,list) or len(group)!=5:raise ValueError("Invalid status groups")
        r=1+2*i
        rows[r][0]=cell(v[0],bold=True,align="LEFT")
        merge(5+2*i,7+2*i,0,1)
        rows[r][11]=cell(v[6],bg="#E8EFF6",bold=True,size=13)
        merge(5+2*i,7+2*i,11,12)
        all_ids=[]
        for j,g in enumerate(group):
            if set(g)!=set(FACTIONS):raise ValueError("Missing faction grouping")
            tjo,tff=g["TJO"],g["TFF"]
            if not isinstance(tjo,list) or not isinstance(tff,list) or len(tjo)+len(tff)!=v[j+1]:
                raise ValueError("Faction counts do not match combined count")
            if len(set(tjo+tff))!=len(tjo)+len(tff):raise ValueError("Duplicate station in faction groups")
            all_ids+=tjo+tff
            col=1+2*j
            for offset,(faction,ids) in enumerate((("TJO",tjo),("TFF",tff))):
                label=str(len(ids)) if ids else "—"
                value=('=HYPERLINK("'+link(ids,faction)+'","'+label+'")') if ids else label
                rows[r+offset][col]=cell(value,bg=PALETTE[j],size=9,fg="#7B8794")
            rows[r][col+1]=cell(v[j+1],bg=PALETTE[j],bold=True,size=13)
            merge(5+2*i,7+2*i,col+1,col+2)
        if len(all_ids)!=v[6] or len(set(all_ids))!=v[6]:raise ValueError("System station total mismatch")
        for uid in all_ids:
            if uid in seen:raise ValueError("Station repeated across systems")
            seen.add(uid)
    if len(seen)!=grand[-1]:raise ValueError("Global station count mismatch")
    rows[41][0]=cell("TOTAL",bg="#DCE7F2",bold=True)
    rows[41][11]=cell(grand[-1],bg="#DCE7F2",bold=True,size=13)
    for j in range(5):
        col=1+2*j
        rows[41][col]=cell(str(sum(len(g[j]["TJO"]) for g in groups)),bg=PALETTE[j],size=9,fg="#7B8794")
        rows[41][col+1]=cell(grand[j+1],bg=PALETTE[j],bold=True,size=13)
    # Existing top summary row 4 must follow the new grand total cells.
    top=[cell() for _ in range(12)]
    for j in range(5):top[1+2*j]=cell("="+chr(67+2*j)+"46",bg=PALETTE[j],bold=True,size=16)
    top[11]=cell("=L46",bg="#E8EFF6",bold=True,size=16)
    return rows,merges,top

def request(token,endpoint,payload):
    req=urllib.request.Request("https://sheets.googleapis.com/v4/spreadsheets/"+SPREADSHEET+endpoint,
       data=json.dumps(payload).encode(),method="POST",
       headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=90) as resp:return json.load(resp)

def publish(preview,token):
    rows,merges,top=build(preview)
    # Atomic formatting/value update; no changes outside Production Overview.
    rng={"sheetId":SHEET,"startRowIndex":4,"endRowIndex":46,"startColumnIndex":0,"endColumnIndex":12}
    actions=[
      {"unmergeCells":{"range":rng}},
      {"updateCells":{"range":rng,"rows":[{"values":r} for r in rows],
                      "fields":"userEnteredValue,userEnteredFormat"}},
      {"updateCells":{"start":{"sheetId":SHEET,"rowIndex":3,"columnIndex":0},
                      "rows":[{"values":top}],"fields":"userEnteredValue,userEnteredFormat"}},
      {"updateDimensionProperties":{"range":{"sheetId":SHEET,"dimension":"COLUMNS",
        "startIndex":0,"endIndex":1},"properties":{"pixelSize":160},"fields":"pixelSize"}}
    ]
    for j in range(5):
        actions.extend([
          {"updateDimensionProperties":{"range":{"sheetId":SHEET,"dimension":"COLUMNS",
             "startIndex":1+2*j,"endIndex":2+2*j},"properties":{"pixelSize":90},"fields":"pixelSize"}},
          {"updateDimensionProperties":{"range":{"sheetId":SHEET,"dimension":"COLUMNS",
             "startIndex":2+2*j,"endIndex":3+2*j},"properties":{"pixelSize":54},"fields":"pixelSize"}}])
    actions.append({"updateDimensionProperties":{"range":{"sheetId":SHEET,"dimension":"COLUMNS",
        "startIndex":11,"endIndex":12},"properties":{"pixelSize":68},"fields":"pixelSize"}})
    actions.append({"updateDimensionProperties":{"range":{"sheetId":SHEET,"dimension":"ROWS",
        "startIndex":5,"endIndex":45},"properties":{"pixelSize":19},"fields":"pixelSize"}})
    # Top summary occupies paired faction/total columns, just like status headers.
    # Rewrite row 3 to prevent the old B:G headings from drifting left.
    top_headers=[cell() for _ in range(12)]
    for j,status in enumerate(STATUSES):
        top_headers[1+2*j]=cell(status,bg=PALETTE[j],bold=True)
    top_headers[11]=cell("Total",bg="#E8EFF6",bold=True,size=10)
    top_headers[11]["userEnteredFormat"]["textFormat"]["foregroundColor"]=color("#25384B")
    actions.append({"repeatCell":{"range":{"sheetId":SHEET,"startRowIndex":3,"endRowIndex":4,
        "startColumnIndex":11,"endColumnIndex":12},
        "cell":{"userEnteredFormat":{"backgroundColor":color("#E8EFF6"),
          "horizontalAlignment":"CENTER","verticalAlignment":"MIDDLE",
          "textFormat":{"bold":True,"fontSize":16,"foregroundColor":color("#25384B")}}},
        "fields":"userEnteredFormat"}})
    actions.append({"updateCells":{"start":{"sheetId":SHEET,"rowIndex":2,"columnIndex":0},
                    "rows":[{"values":top_headers}],"fields":"userEnteredValue,userEnteredFormat"}})
    for row in (2,3):
        for j in range(5):
            col=1+2*j
            actions.append({"unmergeCells":{"range":{"sheetId":SHEET,"startRowIndex":row,
                "endRowIndex":row+1,"startColumnIndex":col,"endColumnIndex":col+2}}})
            actions.append({"mergeCells":{"range":{"sheetId":SHEET,"startRowIndex":row,
                "endRowIndex":row+1,"startColumnIndex":col,"endColumnIndex":col+2},
                "mergeType":"MERGE_ALL"}})
    # Reset all old table borders; legacy outlines may remain on arbitrary cells.
    # Only the final TOTAL row receives a dark bottom rule.
    clear_border={"style":"NONE"}
    actions.extend([
      {"updateBorders":{"range":{"sheetId":SHEET,"startRowIndex":4,"endRowIndex":46,
        "startColumnIndex":0,"endColumnIndex":12},
        "top":clear_border,"bottom":clear_border,"left":clear_border,
        "right":clear_border,"innerHorizontal":clear_border,"innerVertical":clear_border}},
      {"updateBorders":{"range":{"sheetId":SHEET,"startRowIndex":45,"endRowIndex":46,
        "startColumnIndex":0,"endColumnIndex":12},
        "bottom":{"style":"SOLID_MEDIUM","color":color("#1F2933")}}},
      {"repeatCell":{"range":{"sheetId":SHEET,"startRowIndex":0,"endRowIndex":100,
        "startColumnIndex":12,"endColumnIndex":16},"cell":{},
        "fields":"userEnteredValue,userEnteredFormat,note,dataValidation"}}
    ])
    # Replace the legacy A5:N25 filter (its green outline and ghost filter icons)
    # with the actual dashboard A5:L46 range.
    actions.extend([
      {"clearBasicFilter":{"sheetId":SHEET}},
      {"setBasicFilter":{"filter":{"range":{"sheetId":SHEET,
        "startRowIndex":4,"endRowIndex":46,"startColumnIndex":0,"endColumnIndex":12}}}}
    ])
    actions+=merges
    request(token,":batchUpdate",{"requests":actions})
    # Read back every populated cell and verify formulas, not just displayed totals.
    encoded=urllib.parse.quote("'Production Overview'!A5:L46",safe="'!:")
    req=urllib.request.Request("https://sheets.googleapis.com/v4/spreadsheets/"+SPREADSHEET+
      "/values/"+encoded+"?valueRenderOption=FORMULA",headers={"Authorization":"Bearer "+token})
    with urllib.request.urlopen(req,timeout=90) as resp:actual=json.load(resp).get("values",[])
    for i,row in enumerate(rows):
        observed=actual[i] if i<len(actual) else []
        for j,expected in enumerate(row):
            v=expected.get("userEnteredValue",{})
            wanted=v.get("formulaValue",v.get("numberValue",v.get("stringValue","")))
            got=observed[j] if j<len(observed) else ""
            if str(got)!=str(wanted):raise ValueError(f"Dashboard readback mismatch row={i+5} col={j+1}: {got!r} != {wanted!r}")
    return {"status":"published_and_verified","orders":preview["classifiedOrders"],"rows":42,"columns":12}

if __name__=="__main__":
    if len(sys.argv)!=2:raise SystemExit("Usage: publish-overview-factions.py preview.json")
    with open(sys.argv[1],encoding="utf-8") as f:p=json.load(f)
    if os.environ.get("ENABLE_OVERVIEW_WRITES")!="true":
        build(p)
        print(json.dumps({"status":"validated_no_write","orders":p["classifiedOrders"]}))
    else:print(json.dumps(publish(p,os.environ["GOOGLE_ACCESS_TOKEN"])))
