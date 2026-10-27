#!/usr/bin/env python3
"""Publish a validated overview preview, and verify the written range.

Only the Production Overview A5:G26 values are writable. No HAS or system tab access.
"""
import json,os,sys,urllib.request,urllib.parse
SHEET_ID=1565113984
SPREADSHEET_ID="1ezzYU4MYW9VyWWR2mJWQ6jmFlZKxPxvezZAscXtx5q8"
RANGE="'Production Overview'!A5:G26"

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
    url=f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/"+urllib.parse.quote(RANGE,safe="'!:") 
    payload=json.dumps({"range":RANGE,"majorDimension":"ROWS","values":values}).encode()
    req=urllib.request.Request(url+"?valueInputOption=RAW",data=payload,method="PUT",headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=60) as resp: result=json.load(resp)
    if result.get("updatedCells")!=154:raise ValueError("Unexpected number of updated cells")
    req=urllib.request.Request(url+"?valueRenderOption=UNFORMATTED_VALUE",headers={"Authorization":"Bearer "+token})
    with urllib.request.urlopen(req,timeout=60) as resp:readback=json.load(resp)
    if readback.get("values")!=values:raise ValueError("Published dashboard failed readback")
    return {"status":"published_and_verified","cells":154,"orders":totals[-1]}

def main():
    if len(sys.argv)!=2:raise SystemExit("Usage: publish-overview.py preview.json")
    with open(sys.argv[1],encoding="utf-8") as f:preview=json.load(f)
    if os.environ.get("ENABLE_OVERVIEW_WRITES")!="true":
        print(json.dumps({"status":"write_disabled","previewValid":preview.get("mode")=="dry_run"}));return
    print(json.dumps(publish(preview,os.environ["GOOGLE_ACCESS_TOKEN"])))
if __name__=="__main__":main()
