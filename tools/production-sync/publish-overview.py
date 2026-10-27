#!/usr/bin/env python3
"""Publish a validated overview preview, and verify the written range.

Only the Production Overview A5:G26 values are writable. No HAS or system tab access.
"""
import json,os,sys,urllib.request,urllib.parse

SWC_INVENTORY='https://www.swcombine.com/members/inventory2/index.php'
SHEET_ID=1565113984
SPREADSHEET_ID="1ezzYU4MYW9VyWWR2mJWQ6jmFlZKxPxvezZAscXtx5q8"
RANGE="'Production Overview'!A5:G26"

def station_link(ids):
    params=[('entityType','5'),('InvType','2'),('InvID','1838'),('Mode','3'),
            ('option[0][group]','0'),('option[0][type]','1')]
    for i,uid in enumerate(ids):
        if not str(uid).isdecimal():raise ValueError('Non-numeric station ID')
        params.extend([(f'option[0][values][{i}][0]','1'),(f'option[0][values][{i}][1]',str(uid))])
    return SWC_INVENTORY+'?'+urllib.parse.urlencode(params)

def publish(preview,token):
    if preview.get("mode")!="dry_run" or preview.get("writeAuthorized") is not False:
        raise ValueError("Missing validated preview")
    values=preview.get("values")
    if preview.get("targetSheet")!="Production Overview" or preview.get("range")!="A5:G26" or len(values)!=22 or any(len(row)!=7 for row in values):
        raise ValueError("Unsafe publication target or shape")
    if values[0]!=["System","Running","Ready Now","Ready w/ Material Move","Blocked","Unassigned","Total"]:
        raise ValueError("Unexpected dashboard headers")
    totals=[sum(row[c] for row in values[1:-1]) for c in range(1,7)]
    if values[-1]!=["TOTAL",*totals] or totals[-1]!=preview.get("classifiedOrders"):
        raise ValueError("Publication totals mismatch")
    groups=preview.get("stationIdsBySystemStatus")
    if not isinstance(groups,list) or len(groups)!=20:
        raise ValueError("Missing station ID groups")
    formulas=[row.copy() for row in values]
    for i,(row,group) in enumerate(zip(values[1:-1],groups),start=1):
        if not isinstance(group,list) or len(group)!=5:raise ValueError("Invalid station groups")
        for j,ids in enumerate(group,start=1):
            if not isinstance(ids,list) or len(ids)!=row[j] or len(set(ids))!=len(ids):
                raise ValueError("Station ID count mismatch")
            if ids:
                url=station_link(ids)
                formulas[i][j]='=HYPERLINK("'+url+'","'+str(row[j])+'")'
        all_ids=sorted([uid for ids in group for uid in ids],key=int)
        if len(all_ids)!=row[6]:raise ValueError("System total station count mismatch")
        if all_ids:formulas[i][6]='=HYPERLINK("'+station_link(all_ids)+'","'+str(row[6])+'")'
    if len({uid for group in groups for ids in group for uid in ids})!=totals[-1]:
        raise ValueError("Duplicate station IDs across dashboard")
    url=f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/"+urllib.parse.quote(RANGE,safe="'!:") 
    payload=json.dumps({"range":RANGE,"majorDimension":"ROWS","values":formulas}).encode()
    req=urllib.request.Request(url+"?valueInputOption=USER_ENTERED",data=payload,method="PUT",headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=60) as resp: result=json.load(resp)
    if result.get("updatedCells")!=154:raise ValueError("Unexpected number of updated cells")
    req=urllib.request.Request(url+"?valueRenderOption=UNFORMATTED_VALUE",headers={"Authorization":"Bearer "+token})
    with urllib.request.urlopen(req,timeout=60) as resp:readback=json.load(resp)
    actual=readback.get("values",[])
    if len(actual)!=len(values):raise ValueError("Published dashboard row count mismatch")
    for i,(expected,observed) in enumerate(zip(values,actual)):
        if len(expected)!=len(observed):raise ValueError("Published dashboard column count mismatch")
        for j,(want,got) in enumerate(zip(expected,observed)):
            if 1<=i<len(values)-1 and 1<=j<=6 and want>0:
                if str(got)!=str(want):raise ValueError("Published linked count mismatch")
            elif got!=want:raise ValueError("Published dashboard value mismatch")
    req=urllib.request.Request(url+"?valueRenderOption=FORMULA",headers={"Authorization":"Bearer "+token})
    with urllib.request.urlopen(req,timeout=60) as resp:formula_readback=json.load(resp)
    if formula_readback.get("values")!=formulas:raise ValueError("Published hyperlinks failed readback")
    return {"status":"published_and_verified","cells":154,"orders":totals[-1]}

def main():
    if len(sys.argv)!=2:raise SystemExit("Usage: publish-overview.py preview.json")
    with open(sys.argv[1],encoding="utf-8") as f:preview=json.load(f)
    if os.environ.get("ENABLE_OVERVIEW_WRITES")!="true":
        print(json.dumps({"status":"write_disabled","previewValid":preview.get("mode")=="dry_run"}));return
    print(json.dumps(publish(preview,os.environ["GOOGLE_ACCESS_TOKEN"])))
if __name__=="__main__":main()
