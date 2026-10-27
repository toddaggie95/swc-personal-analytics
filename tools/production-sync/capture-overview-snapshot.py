#!/usr/bin/env python3
"""Capture live production workbook inputs without modifying any Google Sheets cells."""
import json,os,sys,urllib.parse,urllib.request
def get(url,token):
 req=urllib.request.Request(url,headers={"Authorization":"Bearer "+token})
 with urllib.request.urlopen(req,timeout=60) as response:return json.load(response)
def capture(token,sid,manifest,orders):
 systems=sorted({o["system"] for o in orders["orders"]} | {d["system"] for d in manifest["destinations"]})
 # Keep each system read bounded; includes all eight hub blocks and one-offs.
 ranges=["'Ships'!A1:AF400"]+[f"'{s.replace(chr(39),chr(39)*2)}'!A1:AZ120" for s in systems]
 url=f"https://sheets.googleapis.com/v4/spreadsheets/{sid}/values:batchGet?"+urllib.parse.urlencode([("ranges",r) for r in ranges]+[("valueRenderOption","FORMATTED_VALUE")])
 response=get(url,token);items=response.get("valueRanges",[])
 if len(items)!=len(ranges):raise ValueError("Incomplete workbook snapshot")
 rowsBySystem={system:([[]]+item.get("values",[])) for system,item in zip(systems,items[1:])}
 # Spreadsheet API starts ranges at row 1; preserve one-based indexing.
 for system,rows in rowsBySystem.items():
  if len(rows)<3:raise ValueError("Missing system tab content "+system)
 shipRows=items[0].get("values",[])
 if len(shipRows)<4:raise ValueError("Ships master unexpectedly empty")
 return {"schemaVersion":1,"manifest":manifest,"auditedOrders":orders["orders"],"rowsBySystem":rowsBySystem,"shipRows":shipRows}
def main():
 if len(sys.argv)!=4:raise SystemExit("Usage: capture-overview-snapshot.py manifest.json audited-production-orders.json output.json")
 token=os.environ["GOOGLE_ACCESS_TOKEN"];sid=os.environ["SWC_PRODUCTION_SHEET_ID"]
 with open(sys.argv[1],encoding="utf8") as f:manifest=json.load(f)
 with open(sys.argv[2],encoding="utf8") as f:orders=json.load(f)
 snapshot=capture(token,sid,manifest,orders)
 with open(sys.argv[3],"w",encoding="utf8") as f:json.dump(snapshot,f,indent=2)
 print(json.dumps({"systems":len(snapshot["rowsBySystem"]),"auditedOrders":len(snapshot["auditedOrders"]),"mode":"read_only"}))
if __name__=="__main__":main()
