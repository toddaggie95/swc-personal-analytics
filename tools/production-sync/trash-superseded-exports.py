#!/usr/bin/env python3
"""Rename verified superseded SWC exports; preserve files in place."""
import json, os, sys, urllib.request, urllib.error, urllib.parse, hashlib
from pathlib import Path
import importlib.util

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("swc_exports", HERE / "download-drive-exports.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def request(url, token, method="GET", data=None):
    headers={"Authorization":"Bearer "+token}
    if data is not None: headers["Content-Type"]="application/json"
    req=urllib.request.Request(url,data=data,headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=90) as res:return json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as err:
        body=err.read().decode("utf-8","replace")[:1200]
        raise RuntimeError(f"Drive {method} HTTP {err.code}: {body}") from err

def plan(accepted, previous_ids, baseline_ids):
    keep={f["id"] for f in accepted["files"]}
    if len(keep)!=4 or {(f["owner"],f["kind"]) for f in accepted["files"]}!=set(module.TARGETS):
        raise ValueError("Invalid accepted batch")
    prior=set(previous_ids)-keep
    candidates=prior if prior else (set(baseline_ids)-keep)
    if len(candidates)>4:
        raise ValueError("Refusing cleanup of more than one superseded batch")
    return keep, candidates

def main():
    if len(sys.argv)!=4:raise ValueError("Usage: cleanup.py export-manifest acceptance-report output-report")
    with open(sys.argv[1]) as f:manifest=json.load(f)
    with open(sys.argv[2]) as f:acceptance=json.load(f)
    if acceptance.get("status")!="accepted":raise ValueError("Batch not accepted")
    accepted={"files":manifest["files"]}
    if set(acceptance["acceptedFiles"])!={f["id"] for f in accepted["files"]}:
        raise ValueError("Acceptance does not match selected exports")
    keep, candidates=plan(accepted,acceptance.get("previousBatchFiles",[]),module.ACCEPTED_BASELINE)
    token=os.environ["GOOGLE_ACCESS_TOKEN"];folder=os.environ["SWC_EXPORT_FOLDER_ID"]
    state_path=HERE/"accepted-batch.json"
    # Workflow checkout can be stale: authoritative accepted state is the post-write GitHub API.
    github=os.environ["GITHUB_REPOSITORY"];gh_token=os.environ["GH_TOKEN"]
    req=urllib.request.Request(f"https://api.github.com/repos/{github}/contents/tools/production-sync/accepted-batch.json",
        headers={"Authorization":"Bearer "+gh_token,"Accept":"application/vnd.github.raw+json"})
    with urllib.request.urlopen(req,timeout=90) as response:
        raw=response.read()
    # GitHub raw media negotiation may return JSON content metadata instead.
    try:
        state=json.loads(raw)
        if "content" in state:
            import base64
            state=json.loads(base64.b64decode(state["content"]))
    except (ValueError,KeyError) as err:raise ValueError("Cannot verify authoritative accepted state") from err
    if state.get("verification")!="verified" or {f["id"]:f["sha256"] for f in state["files"]}!={f["id"]:f["sha256"] for f in accepted["files"]}:
        raise ValueError("Repository accepted state does not match verified batch")
    result={"mode":"rename_only","acceptedFiles":sorted(keep),"candidateIds":sorted(candidates),
            "supersededRenamed":[],"alreadyMarked":[]}
    # Validate each previous export, then mark it with an unambiguous prefix.
    # A rerun must not change the name again, and prior marked files are ignored by discovery.
    pending=[]
    for file_id in sorted(candidates):
        url=f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(file_id,safe='')}?fields=id,name,parents,trashed,mimeType"
        meta=request(url,token)
        if meta.get("trashed") or folder not in meta.get("parents",[]):
            result["alreadyMarked"].append(file_id)
            continue
        if meta["name"].lower().startswith("trash_"):
            result["alreadyMarked"].append(file_id)
            continue
        if not meta.get("name","").lower().endswith(".csv") and meta.get("mimeType")!="text/csv":
            raise ValueError("Superseded candidate is not CSV: "+file_id)
        media=f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(file_id,safe='')}?alt=media"
        req=urllib.request.Request(media,headers={"Authorization":"Bearer "+token})
        with urllib.request.urlopen(req,timeout=90) as response:content=response.read()
        key,_=module.classify(content)
        pending.append((file_id,key,meta["name"]))
    if len({key for _,key,_ in pending})!=len(pending):
        raise ValueError("Duplicate identities in previous export batch")
    for file_id,key,old_name in pending:
        name="trash_"+file_id+"_"+key[0]+"-"+key[1]+".csv"
        url=f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(file_id,safe='')}?fields=id,name,parents,trashed"
        request(url,token,"PATCH",json.dumps({"name":name}).encode())
        after=request(url,token)
        if after.get("name")!=name or after.get("trashed") or folder not in after.get("parents",[]):
            raise RuntimeError("Superseded rename verification failed: "+file_id)
        result["supersededRenamed"].append({"id":file_id,"name":name})
    result["renamed"]=[]
    for entry in accepted["files"]:
        file_id=entry["id"]
        name=f'{entry["owner"]}-{entry["kind"]}.csv'
        url=f"https://www.googleapis.com/drive/v3/files/{urllib.parse.quote(file_id,safe='')}?fields=id,name,parents,trashed"
        before=request(url,token)
        if before.get("trashed") or folder not in before.get("parents",[]):
            raise ValueError("Accepted export missing from active folder: "+file_id)
        if before["name"]!=name:
            request(url,token,"PATCH",json.dumps({"name":name}).encode())
        after=request(url,token)
        if after.get("name")!=name or after.get("trashed") or folder not in after.get("parents",[]):
            raise RuntimeError("Accepted export rename verification failed: "+file_id)
        result["renamed"].append({"id":file_id,"name":name})
    with open(sys.argv[3],"w") as f:json.dump(result,f,indent=2)
    print(json.dumps(result))
if __name__=="__main__":main()
