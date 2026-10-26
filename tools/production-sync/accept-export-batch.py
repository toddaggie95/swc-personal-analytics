#!/usr/bin/env python3
"""Persist a verified batch as a GitHub repository file, without deleting exports."""
import base64
import datetime
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

STATE_PATH = "tools/production-sync/accepted-batch.json"

def api(url, token, method="GET", payload=None):
    headers = {"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28"}
    data = None if payload is None else json.dumps(payload).encode()
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        message = exc.read().decode("utf-8", "replace")[:1500]
        if exc.code == 404 and method == "GET":
            return None
        raise RuntimeError("GitHub API HTTP " + str(exc.code) + ": " + message) from exc

def main():
    if len(sys.argv) != 4:
        raise ValueError("expected export manifest, write report, output report")
    with open(sys.argv[1]) as handle:
        manifest = json.load(handle)
    with open(sys.argv[2]) as handle:
        write_report = json.load(handle)
    if write_report.get("status") != "verified":
        raise ValueError("HAS updates have not been verified")
    files = manifest["files"]
    keys = {(item["owner"], item["kind"]) for item in files}
    ids = {item["id"] for item in files}
    if keys != {("TFF", "Stations"), ("TFF", "Materials"),
                ("TJO", "Stations"), ("TJO", "Materials")} or len(files) != 4 or len(ids) != 4:
        raise ValueError("invalid export batch identities")
    repo = os.environ["GITHUB_REPOSITORY"]
    token = os.environ["GH_TOKEN"]
    url = "https://api.github.com/repos/" + repo + "/contents/" + STATE_PATH
    existing = api(url, token)
    old = None
    sha = None
    if existing:
        sha = existing["sha"]
        old = json.loads(base64.b64decode(existing["content"]).decode())
        if old.get("schemaVersion") != 1 or len(old.get("files", [])) != 4:
            raise ValueError("invalid existing accepted batch state")
        old_hashes = {item["id"]: item["sha256"] for item in old["files"]}
        for item in files:
            if item["id"] in old_hashes and old_hashes[item["id"]] != item["sha256"]:
                raise ValueError("previously accepted export was mutated")
    state = {
        "schemaVersion": 1,
        "acceptedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "workflowRunId": os.environ.get("GITHUB_RUN_ID"),
        "verification": "verified",
        "files": [{key: item[key] for key in ("owner", "kind", "id", "sha256", "rowCount", "modifiedTime")
                   if key in item} for item in files],
    }
    payload = {
        "message": "Record verified SWC export batch",
        "content": base64.b64encode((json.dumps(state, indent=2) + "\n").encode()).decode(),
    }
    if sha:
        payload["sha"] = sha
    api(url, token, "PUT", payload)
    report = {
        "status": "accepted",
        "acceptedFiles": [item["id"] for item in files],
        "previousBatchFiles": [item["id"] for item in old["files"]] if old else [],
        "archivePerformed": False,
    }
    with open(sys.argv[3], "w") as handle:
        json.dump(report, handle, indent=2)
    print(json.dumps(report))

if __name__ == "__main__":
    main()
