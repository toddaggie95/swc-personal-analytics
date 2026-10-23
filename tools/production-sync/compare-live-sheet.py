#!/usr/bin/env python3
"""Read-only comparison of audited ledger against current SWC Production Google Sheet."""
import json,os,sys,urllib.parse,urllib.request,collections

def get(url,token):
 req=urllib.request.Request(url,headers={"Authorization":"Bearer "+token})
 with urllib.request.urlopen(req,timeout=60) as resp:return json.load(resp)
def col(n):
 s=""
 while n:n,r=divmod(n-1,26);s=chr(65+r)+s
 return s
def main():
 token=os.environ["GOOGLE_ACCESS_TOKEN"]; sid=os.environ["SWC_PRODUCTION_SHEET_ID"]
 with open(sys.argv[1],encoding="utf8") as f:ledger=json.load(f)
 if "cells" not in ledger:raise ValueError("Ledger missing cells")
 destinations=ledger["destinations"]
 ranges=[]
 for d in destinations:
  t=d["target"];c=col(t["hasColumn"]+1);start=t["materialStartRow"]+1
  title=t["sheet"].replace("'","''")
  ranges.append(f"'{title}'!{c}{start-1}:{c}{start+20}")
 base=f"https://sheets.googleapis.com/v4/spreadsheets/{sid}/values:batchGet?"
 params=[("ranges",r) for r in ranges]+[("valueRenderOption","FORMULA")]
 data=get(base+urllib.parse.urlencode(params),token)
 vr=data.get("valueRanges",[])
 if len(vr)!=len(destinations):raise ValueError("Missing destination range results")
 diffs=[];errors=[];same=0
 for d,values in zip(destinations,vr):
  t=d["target"];rows=values.get("values",[])
  head=rows[0][0] if rows and rows[0] else ""
  if str(head).strip().upper()!="HAS":errors.append({"destination":d["id"],"issue":"HAS header mismatch","observed":head,"range":values.get("range")})
  for idx,(material,expected) in enumerate(d["totals"].items()):
   row=rows[idx+1] if idx+1<len(rows) else []
   raw=row[0] if row else ""
   if isinstance(raw,str) and raw.startswith("="):
    errors.append({"destination":d["id"],"material":material,"issue":"HAS cell contains formula","observed":raw});continue
   try:actual=float(str(raw).replace(",","")) if raw!="" else 0
   except (TypeError,ValueError):
    errors.append({"destination":d["id"],"material":material,"issue":"HAS cell nonnumeric","observed":raw});continue
   if actual!=expected:diffs.append({"destination":d["id"],"system":d["system"],"sheet":t["sheet"],"cell":f"{col(t['hasColumn']+1)}{t['materialStartRow']+idx+1}","material":material,"current":actual,"proposed":expected,"delta":expected-actual})
   else:same+=1
 report={"status":"blocked" if errors else "comparison_complete_no_writes","statistics":{"destinations":len(destinations),"cellsCompared":same+len(diffs),"matchingCells":same,"differentCells":len(diffs),"validationErrors":len(errors),"unassignedStationPiles":ledger["statistics"]["unassignedStationPiles"]},"validationErrors":errors,"differences":diffs,"unassigned":ledger["unassigned"]}
 with open(sys.argv[2],"w",encoding="utf8") as f:json.dump(report,f,indent=2)
 print(json.dumps(report["statistics"]))
 if errors:sys.exit(1)
if __name__=="__main__":main()
