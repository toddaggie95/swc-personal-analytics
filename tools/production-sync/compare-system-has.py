#!/usr/bin/env python3
"""Read-only system HAS comparison against column AK on tracked system tabs."""
import json,os,sys,urllib.parse,urllib.request
def get(url,token):
 req=urllib.request.Request(url,headers={"Authorization":"Bearer "+token})
 with urllib.request.urlopen(req,timeout=60) as resp:return json.load(resp)
def main():
 with open(sys.argv[1],encoding="utf8") as f:audit=json.load(f)
 systems=audit["systems"];materials=audit["materials"]
 if len(materials)!=21:raise ValueError("Unexpected material count")
 ranges=[f"'{s.replace(chr(39),chr(39)*2)}'!AK13:AK35" for s in systems]
 base=f"https://sheets.googleapis.com/v4/spreadsheets/{os.environ['SWC_PRODUCTION_SHEET_ID']}/values:batchGet?"
 data=get(base+urllib.parse.urlencode([("ranges",r) for r in ranges]+[("valueRenderOption","FORMULA")]),os.environ["GOOGLE_ACCESS_TOKEN"])
 if len(data.get("valueRanges",[]))!=len(systems):raise ValueError("Missing system sheet ranges")
 errors=list(audit["errors"]);differences=[];matching=0
 for sys,vr in zip(systems,data["valueRanges"]):
  rows=vr.get("values",[])
  header=rows[0][0] if rows and rows[0] else ""
  if str(header).strip().lower()!="system has":errors.append({"system":sys,"issue":"System HAS header mismatch","observed":header})
  for i,material in enumerate(materials):
   row=rows[i+1] if i+1<len(rows) else [];raw=row[0] if row else ""
   if isinstance(raw,str) and raw.startswith("="):errors.append({"system":sys,"material":material,"issue":"Formula in System HAS"});continue
   try:current=float(str(raw).replace(",","")) if raw!="" else 0
   except (ValueError,TypeError):errors.append({"system":sys,"material":material,"issue":"Nonnumeric System HAS","observed":raw});continue
   expected=audit["systemTotals"][sys][material]
   if current!=expected:differences.append({"system":sys,"cell":f"AK{i+14}","material":material,"current":current,"calculated":expected,"delta":expected-current,"production":audit["productionTotals"][sys][material],"unassignedReserve":audit["unassigned"].get(sys,{}).get("totals",{}).get(material,0)})
   else:matching+=1
 report={"status":"blocked" if errors else "comparison_complete_no_writes","statistics":{"systems":len(systems),"cellsCompared":matching+len(differences),"matchingCells":matching,"differentCells":len(differences),"validationErrors":len(errors)},"errors":errors,"differences":differences}
 with open(sys.argv[2],"w",encoding="utf8") as f:json.dump(report,f,indent=2)
 print(json.dumps(report["statistics"]))
 if errors:sys.exit(1)
if __name__=="__main__":main()
