#!/usr/bin/env python3
"""Guarded write-back of previously validated HAS comparison differences."""
import json,os,sys,urllib.request,urllib.parse
def request(url,token,body=None):
 data=None if body is None else json.dumps(body).encode()
 req=urllib.request.Request(url,data=data,headers={"Authorization":"Bearer "+token,**({"Content-Type":"application/json"} if data else {})},method="POST" if data else "GET")
 with urllib.request.urlopen(req,timeout=90) as r:return json.load(r)
def number(v):
 if isinstance(v,str) and v.startswith("="):raise ValueError("Formula at HAS target")
 return float(str(v).replace(",","")) if v!="" else 0.
def main():
 with open(sys.argv[1]) as f:p=json.load(f)
 with open(sys.argv[2]) as f:s=json.load(f)
 if p.get("status")!="comparison_complete_no_writes" or s.get("status")!="comparison_complete_no_writes" or p.get("validationErrors") or s.get("errors"):raise ValueError("Comparison validation failed")
 changes=[(d["sheet"],d["cell"],d["current"],d["proposed"]) for d in p["differences"]]+[(d["system"],d["cell"],d["current"],d["calculated"]) for d in s["differences"]]
 if len(changes)!=len(set((x[0],x[1]) for x in changes)):raise ValueError("Duplicate target")
 if len(changes)!=p["statistics"]["differentCells"]+s["statistics"]["differentCells"]:raise ValueError("Change count mismatch")
 token=os.environ["GOOGLE_ACCESS_TOKEN"];sid=os.environ["SWC_PRODUCTION_SHEET_ID"]
 base=f"https://sheets.googleapis.com/v4/spreadsheets/{sid}/values"
 ranges=["'"+sheet.replace("'","''")+"'!"+cell for sheet,cell,_,_ in changes]
 def read():
  if not ranges:return []
  u=base+":batchGet?"+urllib.parse.urlencode([("ranges",r) for r in ranges]+[("valueRenderOption","FORMULA")])
  results=request(u,token)["valueRanges"]
  if len(results)!=len(changes):raise ValueError("Incomplete readback")
  return [v.get("values",[[]])[0][0] if v.get("values") and v["values"][0] else "" for v in results]
 old=read()
 for (sheet,cell,expected,_),observed in zip(changes,old):
  if number(observed)!=expected:raise ValueError(f"Preflight concurrent edit: {sheet}!{cell}")
 report={"status":"prepared","changes":[{"sheet":a,"cell":b,"previous":c,"proposed":d} for a,b,c,d in changes]}
 def save():
  with open(sys.argv[3],"w") as f:json.dump(report,f,indent=2)
 save()
 if os.environ.get("SWC_ENABLE_HAS_WRITES")!="true":
  report["status"]="dry_run";save();print(json.dumps({"proposed":len(changes)}));return
 try:
  if changes:
   request(base+":batchUpdate",token,{"valueInputOption":"RAW","data":[{"range":r,"values":[[v]]} for r,(_,_,_,v) in zip(ranges,changes)]})
  after=read()
  bad=[r for r,v,(_,_,_,expected) in zip(ranges,after,changes) if number(v)!=expected]
  if bad:raise ValueError("Read-back mismatch: "+str(bad[:10]))
  report["status"]="verified";report["verifiedCells"]=len(changes)
 except Exception as e:
  report["status"]="write_or_verification_failed";report["error"]=str(e);raise
 finally:save()
 print(json.dumps({"verified":len(changes)}))
if __name__=="__main__":main()
