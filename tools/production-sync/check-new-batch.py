#!/usr/bin/env python3
"""Compare downloaded export identities with the last accepted batch."""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

def identity(files):
    return sorted((x["owner"], x["kind"], x["id"], x["sha256"]) for x in files)

def main():
    with open(sys.argv[1]) as f:
        current = json.load(f)
    url = ("https://api.github.com/repos/" + os.environ["GITHUB_REPOSITORY"]
           + "/contents/tools/production-sync/accepted-batch.json")
    request = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + os.environ["GH_TOKEN"],
        "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(request) as response:
            record = json.load(response)
        previous = json.loads(base64.b64decode(record["content"]))
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        previous = None
    changed = previous is None or identity(current["files"]) != identity(previous["files"])
    with open(os.environ["GITHUB_OUTPUT"], "a") as f:
        f.write("new_batch=" + str(changed).lower() + "\n")
    print("New export batch:", changed)

if __name__ == "__main__":
    main()
