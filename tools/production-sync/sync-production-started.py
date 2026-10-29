#!/usr/bin/env python3
"""Synchronize tracked shipyard Started flags from accepted TFF/TJO station exports.

Fail closed on station identity/coordinates, ambiguous statuses, formulas and concurrent edits.
Exported 'running' maps to Yes; blank or known nonrunning status maps to blank.
"""
import csv,json,os,sys,urllib.parse,urllib.request
from collections import Counter

def request(url,token,body=None):
 data=json.dumps(body).encode() if body is not None else None
 req=urllib.request.Request(url,data=data,headers={"Authorization":"Bearer "+token,**({"Content-Type":"application/json"} if data is not None else {})},method="POST" if data is not None else "GET")
 with urllib.request.urlopen(req,timeout=90) as r:return json.load(r)

def plan(manifest,stations,rows_by_system,ship_names=None):
 by_uid={}
 for station in stations:
  uid=station.get("uid","").strip()
  if not uid or uid in by_uid:raise ValueError("Missing/duplicate exported station UID "+uid)
  by_uid[uid]=station
 updates=[];unresolved=[];checked=0;seen=set()
 for dest in manifest["destinations"]:
  sheet=dest["system"];rows=rows_by_system[sheet]
  missing=[uid for uid in dest["memberStationUids"] if uid not in by_uid]
  if missing:raise ValueError("Tracked stations missing from exports: "+str(missing[:10]))
  positions={}
  if dest["kind"]=="hub":
   col=dest["target"]["hasColumn"]-2
   header=dest["target"]["materialStartRow"]-11
   if header>=len(rows) or col>=len(rows[header]) or "("+str(dest["center"]["x"])+","+str(dest["center"]["y"])+")" not in str(rows[header][col]):raise ValueError("Hub heading drift "+dest["id"])
   positions={}
   for row_idx in range(header+1,header+10):
    row=rows[row_idx] if row_idx<len(rows) else []
    xy=str(row[col] if col<len(row) else "").replace("(","").replace(")","").replace(" ","")
    if xy:
     if xy in positions:raise ValueError("Duplicate hub coordinate "+dest["id"]+": "+xy)
     positions[xy]=(row_idx,col+3)
   members=[(uid,positions.get(str(by_uid[uid].get("sysX"))+","+str(by_uid[uid].get("sysY")))) for uid in dest["memberStationUids"]]
  elif dest["kind"]=="oneoff-group":
   members=[(one["stationUid"],(one["row"]+(0 if sheet=="Tholatin" else 1),3)) for one in dest.get("oneoffs",[])]
   unrepresented=set(dest["memberStationUids"])-{one["stationUid"] for one in dest.get("oneoffs",[])}
   unexpected=[uid for uid in unrepresented if "shipyard" in by_uid[uid].get("type_name","").lower()]
   if unexpected:raise ValueError("Tracked shipyard absent from one-off rows "+str(unexpected))
  else:raise ValueError("Unknown destination "+dest["kind"])
  for uid,location in members:
   station=by_uid[uid]
   if station.get("system")!=sheet:raise ValueError("System mismatch "+uid)
   if "shipyard" not in station.get("type_name","").lower():continue
   if uid in seen:raise ValueError("Duplicate tracked shipyard "+uid)
   seen.add(uid)
   if location is None:raise ValueError("Shipyard missing from hub "+uid+" at "+str(station.get("sysX"))+","+str(station.get("sysY"))+"; header="+str(header)+" col="+str(col)+"; known="+str(sorted(positions)))
   row_idx,col=location;row=rows[row_idx] if row_idx<len(rows) else []
   coordcol=0 if dest["kind"]=="oneoff-group" else col-3
   xy=str(row[coordcol] if coordcol<len(row) else "").replace("(","").replace(")","").replace(" ","")
   expected=str(station.get("sysX"))+","+str(station.get("sysY"))
   if xy!=expected:raise ValueError("Station coordinate mismatch "+uid+" "+xy+" != "+expected)
   if dest["kind"]=="oneoff-group" and str(row[4] if len(row)>4 else "")!=uid:raise ValueError("Oneoff UID mismatch "+uid)
   status=station.get("productionStatus","").strip().lower()
   current=str(row[col] if col<len(row) else "").strip()
   if current.startswith("="):raise ValueError("Formula in Started "+uid)
   if current.lower() not in ("","yes","no"):raise ValueError("Unknown Started value "+uid+": "+current)
   checked+=1
   if status not in ("","running","paused","stopped","complete","completed","idle","none","cancelled","canceled"):
    raise ValueError("Unrecognized productionStatus "+uid+": "+status)
   desired="Yes" if status=="running" else ""
   if status=="running":
    ship=station.get("tooled-to","").strip()
    qty=station.get("productionQuantity","").strip()
    if not ship or not qty.isdigit() or int(qty)<=0:
     raise ValueError("Running station missing ship/quantity in export "+uid)
    if ship_names is not None and ship not in ship_names:
     raise ValueError("Running station ship absent from Ships master "+uid+": "+ship)
    for offset,proposed,field in ((col-2,ship,"ship"),(col-1,qty,"quantity")):
     previous=str(row[offset] if offset<len(row) else "").strip()
     if previous.startswith("="):raise ValueError("Formula in production assignment "+uid)
     if previous!=proposed:
      updates.append({"uid":uid,"system":sheet,"row":row_idx,"column":offset,"previous":previous,"proposed":proposed,"status":status,"field":field})
   if current!=desired:
    updates.append({"uid":uid,"system":sheet,"row":row_idx,"column":col,"previous":current,"proposed":desired,"status":status,"field":"started"})
 targets=[(c["system"],c["row"],c["column"]) for c in updates]
 if len(targets)!=len(set(targets)):raise ValueError("Two station UIDs mapped to same production cell")
 return {"checkedShipyards":checked,"changes":updates,"unresolved":unresolved,"statuses":dict(Counter(s.get("productionStatus","").strip().lower() for s in stations))}

def column_name(index):
 name=""
 while index>=0:
  index,rem=divmod(index,26)
  name=chr(65+rem)+name
  index-=1
 return name

def main():
 if len(sys.argv)!=6:raise SystemExit("Usage: sync-production-started.py manifest tff-stations tjo-stations report.json write-flag")
 with open(sys.argv[1]) as f:manifest=json.load(f)
 stations=[]
 for path in sys.argv[2:4]:
  with open(path,newline="",encoding="utf-8-sig") as f:stations.extend(csv.DictReader(f))
 token=os.environ["GOOGLE_ACCESS_TOKEN"];sid=os.environ["SWC_PRODUCTION_SHEET_ID"]
 systems=sorted({d["system"] for d in manifest["destinations"]})
 base=f"https://sheets.googleapis.com/v4/spreadsheets/{sid}/values"
 ranges=["'"+s.replace("'","''")+"'!A1:AZ200" for s in systems]
 url=base+":batchGet?"+urllib.parse.urlencode([("ranges",r) for r in ranges]+[("valueRenderOption","FORMATTED_VALUE")])
 response=request(url,token)["valueRanges"]
 if len(response)!=len(systems):raise ValueError("Incomplete system read")
 rows={s:[[]]+v.get("values",[]) for s,v in zip(systems,response)}
 ship_response=request(base+":batchGet?"+urllib.parse.urlencode([("ranges","'Ships'!A1:A1000"),("valueRenderOption","FORMATTED_VALUE")]),token)["valueRanges"]
 if len(ship_response)!=1:raise ValueError("Missing Ships master read")
 ship_names={str(r[0]).strip() for r in ship_response[0].get("values",[]) if r and str(r[0]).strip()}
 if not ship_names:raise ValueError("Empty Ships master")
 helper_response=request(base+":batchGet?"+urllib.parse.urlencode([("ranges","'Ships'!BD5:BD400"),("valueRenderOption","FORMATTED_VALUE")]),token)["valueRanges"]
 if len(helper_response)!=1:raise ValueError("Missing Ships dropdown helper read")
 helper_values=[str(r[0]).strip() for r in helper_response[0].get("values",[]) if r and str(r[0]).strip()]
 helper_names=set(helper_values)
 missing=sorted(ship_names-helper_names)
 extra=sorted(helper_names-ship_names-{"None"})
 duplicate=sorted({v for v in helper_values if helper_values.count(v)>1})
 if "None" not in helper_names or missing or extra or duplicate or any(v.startswith("#") for v in helper_values):
  raise ValueError("Ships dropdown mismatch: missing="+repr(missing[:20])+" extra="+repr(extra[:20])+" duplicate="+repr(duplicate[:20])+" None_present="+str("None" in helper_names))

 result=plan(manifest,stations,rows,ship_names);result["status"]="prepared"
 result["transitionCounts"]={"toYes":sum(c.get("field","started")=="started" and c["proposed"]=="Yes" for c in result["changes"]),"toBlank":sum(c.get("field","started")=="started" and c["proposed"]=="" for c in result["changes"])}
 def save():
  with open(sys.argv[4],"w") as f:json.dump(result,f,indent=2)
 save()
 changes=result["changes"]
 if len({c["uid"] for c in changes})>max(100,result["checkedShipyards"]//4):
  result["status"]="blocked_excessive_changes";save()
  raise ValueError("Production status change count exceeds safety threshold: "+str(len(changes)))
 if sys.argv[5]!="true":
  result["status"]="dry_run";save()
  print(json.dumps({"status":"dry_run","checkedShipyards":result["checkedShipyards"],"transitionCounts":result["transitionCounts"]}))
  return
 targets=["'"+c["system"].replace("'","''")+"'!"+column_name(c["column"])+str(c["row"]) for c in changes]
 try:
  if changes:
   response=request(base+":batchGet?"+urllib.parse.urlencode([("ranges",r) for r in targets]+[("valueRenderOption","FORMULA")]),token)["valueRanges"]
   if len(response)!=len(changes):raise ValueError("Incomplete Started preflight")
   for c,v in zip(changes,response):
    observed=str(v.get("values",[[]])[0][0] if v.get("values") and v["values"][0] else "").strip()
    if observed!=c["previous"]:raise ValueError("Concurrent edit "+c["uid"])
   request(base+":batchUpdate",token,{"valueInputOption":"RAW","data":[{"range":r,"values":[[c["proposed"]]]} for r,c in zip(targets,changes)]})
   response=request(base+":batchGet?"+urllib.parse.urlencode([("ranges",r) for r in targets]+[("valueRenderOption","FORMATTED_VALUE")]),token)["valueRanges"]
   if len(response)!=len(changes) or any(str(v.get("values",[[]])[0][0] if v.get("values") and v["values"][0] else "")!=c["proposed"] for v,c in zip(response,changes)):raise ValueError("Started readback mismatch")
  # Reconcile ALL tracked shipyards on a fresh full workbook read, not only changed cells.
  after=request(url,token)["valueRanges"]
  if len(after)!=len(systems):raise ValueError("Incomplete post-write workbook audit")
  verified=plan(manifest,stations,{system:[[]]+item.get("values",[]) for system,item in zip(systems,after)},ship_names)
  if verified["checkedShipyards"]!=result["checkedShipyards"] or verified["changes"]:
   raise ValueError("Full Started reconciliation failed: "+str(verified["changes"][:10]))
  result["status"]="verified";result["verifiedCells"]=len(changes);result["postAuditShipyards"]=verified["checkedShipyards"]
 except Exception as e:
  result["status"]="write_or_verification_failed";result["error"]=str(e);raise
 finally:save()
 print(json.dumps({"status":result["status"],"checkedShipyards":result["checkedShipyards"],"verifiedCells":result["verifiedCells"],"unresolved":len(result["unresolved"])}))
if __name__=="__main__":main()
