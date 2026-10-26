#!/usr/bin/env python3
"""Persist accepted export IDs only after verified HAS synchronization."""
import json,os,sys,urllib.request,urllib.parse,urllib.error,datetime
STATE_NAME="swc-accepted-batch.json"
def call(url,token,method="GET",data=None,content_type=None):
 headers={"Authorization":"Bearer "+token}
 if content_type:headers["Content-Type"]=content_type
 req=urllib.request.Request(url,data=data,headers=headers,method=method)
 try:
  with urllib.request.urlopen(req,timeout=90) as r:return r.read()
 except urllib.error.HTTPError as err:
  detail=err.read().decode('utf-8','replace')[:1200]
  raise RuntimeError('Drive API request failed: HTTP '+str(err.code)+'; '+detail) from err
def main():
 if len(sys.argv)!=4:raise ValueError("expected export manifest, write report, output report")
 with open(sys.argv[1]) as f:manifest=json.load(f)
 with open(sys.argv[2]) as f:verified=json.load(f)
 if verified.get("status")!="verified":raise ValueError("HAS write verification not successful")
 files=manifest["files"]
 if len(files)!=4 or len({(v["owner"],v["kind"]) for v in files})!=4 or len({v["id"] for v in files})!=4:raise ValueError("Invalid selected export batch")
 token=os.environ["GOOGLE_ACCESS_TOKEN"];folder=os.environ["SWC_EXPORT_FOLDER_ID"]
 query=urllib.parse.urlencode({"q":f"'{folder}' in parents and name = '{STATE_NAME}' and trashed = false","fields":"nextPageToken,files(id,name)","pageSize":100})
 found=json.loads(call("https://www.googleapis.com/drive/v3/files?"+query,token))
 if found.get("nextPageToken") or len(found["files"])>1:raise ValueError("Ambiguous accepted manifest")
 previous=None;state_id=None
 if found["files"]:
  state_id=found["files"][0]["id"]
  previous=json.loads(call(f"https://www.googleapis.com/drive/v3/files/{state_id}?alt=media",token))
  if previous.get("schemaVersion")!=1 or len(previous.get("files",[]))!=4:raise ValueError("Existing state malformed")
  old={v["id"]:v["sha256"] for v in previous["files"]}
  for item in files:
   if item["id"] in old and old[item["id"]]!=item["sha256"]:raise ValueError("Accepted file mutated")
 state={"schemaVersion":1,"acceptedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),"workflowRunId":os.environ.get("GITHUB_RUN_ID"),"verification":"verified","files":[{k:v[k] for k in ("owner","kind","id","sha256","rowCount","modifiedTime") if k in v} for v in files]}
 data=json.dumps(state,indent=2).encode()
 if state_id:
  call(f"https://www.googleapis.com/upload/drive/v3/files/{state_id}?uploadType=media",token,"PATCH",data,"application/json")
 else:
  boundary="swc_batch_manifest_boundary"
  metadata=json.dumps({"name":STATE_NAME,"parents":[folder],"mimeType":"application/json"}).encode()
  payload=(f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".encode()+metadata+f"\r\n--{boundary}\r\nContent-Type: application/json\r\n\r\n".encode()+data+f"\r\n--{boundary}--\r\n".encode())
  call("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",token,"POST",payload,f"multipart/related; boundary={boundary}")
 report={"status":"accepted","acceptedFiles":[v["id"] for v in files],"previousBatchFiles":[v["id"] for v in previous["files"]] if previous else [],"archivePerformed":False}
 with open(sys.argv[3],"w") as f:json.dump(report,f,indent=2)
 print(json.dumps(report))
if __name__=="__main__":main()
