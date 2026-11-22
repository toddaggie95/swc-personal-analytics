"""Publish a verified four-file inventory snapshot to a private shared-drive folder."""
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import uuid4

from download_drive_exports import TARGETS

API = "https://www.googleapis.com"
POINTER = "current-logistics.json"
MANAGED = {"swcLogistics": "1"}


def timestamp(value):
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None or parsed > datetime.now(timezone.utc):
        raise ValueError("Invalid inventory timestamp")
    return parsed.astimezone(timezone.utc)


def request(path, *, method="GET", params=None, data=None, content_type="application/json"):
    url = API + path + ("?" + urlencode(params) if params else "")
    headers = {"Authorization": "Bearer " + os.environ["GOOGLE_ACCESS_TOKEN"],
               "Content-Type": content_type}
    with urlopen(Request(url, data=data, headers=headers, method=method), timeout=90) as response:
        return response.read()


def drive(file_id="", *, method="GET", params=None, metadata=None):
    return json.loads(request(
        "/drive/v3/files" + ("/" + file_id if file_id else ""),
        method=method, params={"supportsAllDrives": "true", **(params or {})},
        data=json.dumps(metadata).encode() if metadata is not None else None))


def upload(metadata, content, mime_type, file_id=""):
    boundary = uuid4().hex
    message = (f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
               .encode() + json.dumps(metadata).encode() +
               f"\r\n--{boundary}\r\nContent-Type: {mime_type}\r\n\r\n".encode() +
               content + f"\r\n--{boundary}--\r\n".encode())
    result = json.loads(request(
        "/upload/drive/v3/files" + ("/" + file_id if file_id else ""),
        method="PATCH" if file_id else "POST", data=message,
        params={"supportsAllDrives": "true", "uploadType": "multipart", "fields": "id,md5Checksum"},
        content_type=f"multipart/related; boundary={boundary}"))
    if result.get("md5Checksum") != hashlib.md5(content, usedforsecurity=False).hexdigest():
        raise ValueError("Drive upload checksum mismatch")
    return result["id"]


def children(folder, drive_id):
    params = {"q": f"'{folder}' in parents and trashed = false",
              "corpora": "drive", "driveId": drive_id, "includeItemsFromAllDrives": "true",
              "fields": "nextPageToken,files(id,name,appProperties)", "pageSize": 100}
    while True:
        page = drive(params=params)
        yield from page["files"]
        if not page.get("nextPageToken"):
            break
        params["pageToken"] = page["nextPageToken"]


def publish(export_dir, progress_file):
    manifest = json.loads((export_dir / "export-manifest.json").read_bytes())
    source = manifest.get("source", "manual_csv")
    entries = manifest["files"]
    if (source not in {"api", "manual_csv"} or len(entries) != len(TARGETS)
            or {entry["canonicalName"] for entry in entries} != set(TARGETS.values())):
        raise ValueError("Expected four validated inventory exports")
    captured = (timestamp(json.loads(progress_file.read_bytes())["createdAt"]) if source == "api"
                else min(timestamp(entry["modifiedTime"]) for entry in entries))
    files = {}
    for entry in entries:
        name = entry["canonicalName"]
        content = (export_dir / name).read_bytes()
        if hashlib.sha256(content).hexdigest() != entry["sha256"]:
            raise ValueError("Export checksum mismatch")
        files[name] = content

    folder = os.environ["SWC_LOGISTICS_FOLDER_ID"]
    if not folder or not all(c.isascii() and (c.isalnum() or c in "_-") for c in folder):
        raise ValueError("Invalid logistics destination ID")
    meta = drive(folder, params={"fields": "driveId,mimeType,capabilities(canAddChildren)"})
    if (meta.get("mimeType") != "application/vnd.google-apps.folder" or not meta.get("driveId")
            or not meta.get("capabilities", {}).get("canAddChildren")):
        raise ValueError("Logistics destination needs a writable shared-drive folder")
    listed = list(children(folder, meta["driveId"]))
    pointers = [item for item in listed if item["name"] == POINTER]
    if len(pointers) > 1 or (pointers and pointers[0].get("appProperties") != MANAGED):
        raise ValueError("Ambiguous logistics manifest")
    pointer_id = pointers[0]["id"] if pointers else ""
    history = (json.loads(request("/drive/v3/files/" + pointer_id,
                                  params={"alt": "media", "supportsAllDrives": "true"}))["snapshots"]
               if pointer_id else [])
    if not history or captured > timestamp(history[0]["capturedAt"]):
        batch = uuid4().hex
        uploaded = {}
        for name, content in files.items():
            uploaded[name] = {"id": upload({"name": f"{batch}-{name}", "parents": [folder],
                                            "appProperties": {**MANAGED, "batch": batch}},
                                           content, "text/csv"),
                              "sha256": hashlib.sha256(content).hexdigest()}
        snapshot = {"source": source, "capturedAt": captured.isoformat(),
                    "timestampBasis": "api_capture_start" if source == "api" else "oldest_drive_modified_time",
                    "workflowRunId": os.environ["GITHUB_RUN_ID"], "files": uploaded}
        history = [snapshot, *history][:4]
        metadata = {} if pointer_id else {"name": POINTER, "parents": [folder], "appProperties": MANAGED}
        upload(metadata, json.dumps({"schemaVersion": 1, "snapshots": history}, indent=2).encode(),
               "application/json", pointer_id)
        print(f"Published logistics snapshot from {source}, captured {captured.isoformat()}.")
    else:
        print("Current logistics snapshot is at least as recent.")

    retained = {file["id"] for snap in history for file in snap["files"].values()}
    for item in listed:
        props = item.get("appProperties", {})
        if props.get("swcLogistics") == "1" and props.get("batch") and item["id"] not in retained:
            drive(item["id"], method="PATCH", metadata={"trashed": True})


if __name__ == "__main__":
    try:
        publish(Path(sys.argv[1]), Path(sys.argv[2]))
    except HTTPError as exc:
        sys.exit(f"Logistics publication failed (Google Drive HTTP {exc.code}).")
    except (OSError, ValueError, KeyError) as exc:
        sys.exit(f"Logistics publication failed ({type(exc).__name__}).")
