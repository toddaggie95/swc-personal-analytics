"""CLI: resolve OUTPUT_DIR; intent OUTPUT_DIR before writes; create OUTPUT_DIR after.

An intent invalidates older publication knowledge. Only the latest trusted attempt
is authoritative; missing components never inherit an older matching state.
Creation emits artifact_name/slot outputs. Each phase alternates between two fixed
slots using GITHUB_RUN_ATTEMPT (default 1), preserving the prior attempt on retry.
"""
import hashlib
from datetime import datetime, timedelta, timezone
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile

COMPONENTS = ("overview", "matrix", "changes")
ARTIFACT_NAME = "swc-publication-receipt"
INTENT_NAME = "swc-publication-intent"
ARTIFACT_NAMES = tuple(f"{base}-{slot}" for base in (ARTIFACT_NAME, INTENT_NAME) for slot in (0, 1))
WORKFLOW_PATH = ".github/workflows/production-overview-readonly.yml"
WORKFLOW_NAME = "SWC production overview readiness and publish"


def numeric(value):
    if isinstance(value, bool) or not re.fullmatch(r"[0-9]+", str(value)) or int(value) <= 0:
        raise ValueError("Invalid run identity")
    return str(int(value))


def attempt():
    return int(numeric(os.environ.get("GITHUB_RUN_ATTEMPT", "1")))


def artifact_name(phase, run_attempt):
    return f"{INTENT_NAME if phase == 'intent' else ARTIFACT_NAME}-{run_attempt % 2}"


def normalized_files(files):
    if not isinstance(files, list) or len(files) != 4:
        raise ValueError("Invalid source files")
    normalized = []
    for item in files:
        if not isinstance(item, dict) or item.get("owner") not in ("TFF", "TJO") or item.get("kind") not in ("Stations", "Materials"):
            raise ValueError("Invalid source identity")
        digest = item.get("sha256")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ValueError("Invalid source hash")
        normalized.append({key: item[key] for key in ("owner", "kind", "sha256")})
    if len({(f["owner"], f["kind"]) for f in normalized}) != 4:
        raise ValueError("Repeated source identity")
    return sorted(normalized, key=lambda f: (f["owner"], f["kind"]))


def fingerprint(files):
    triples = [[f["owner"], f["kind"], f["sha256"]] for f in normalized_files(files)]
    return hashlib.sha256(json.dumps(triples, separators=(",", ":")).encode("utf-8")).hexdigest()


def validate_receipt(receipt, report_run_id=None, phase=None):
    if not isinstance(receipt, dict) or type(receipt.get("schemaVersion")) is not int or receipt["schemaVersion"] != 1 or receipt.get("verified") is not True:
        raise ValueError("Unverified publication receipt")
    run_id = numeric(receipt.get("reportRunId"))
    if type(receipt.get("runAttempt")) is not int or receipt["runAttempt"] <= 0:
        raise ValueError("Invalid publication attempt")
    numeric(receipt.get("upstreamRunId"))
    if report_run_id is not None and run_id != numeric(report_run_id):
        raise ValueError("Publication run mismatch")
    if receipt.get("source") not in ("api", "csv"):
        raise ValueError("Invalid publication source")
    if receipt.get("phase") not in ("intent", "complete") or (phase is not None and receipt["phase"] != phase):
        raise ValueError("Invalid publication phase")
    components = receipt.get("components")
    if not isinstance(components, dict) or set(components) != set(COMPONENTS) or any(type(components[c]) is not bool for c in COMPONENTS):
        raise ValueError("Invalid publication components")
    if receipt["phase"] == "intent" and any(components.values()):
        raise ValueError("Intent cannot verify publication")
    if receipt.get("fingerprint") != fingerprint(receipt.get("files")):
        raise ValueError("Publication fingerprint mismatch")
    return receipt


def gh_bytes(endpoint, *flags):
    return subprocess.run(["gh", "api", endpoint, *flags], check=True, stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL, timeout=60).stdout


def gh_json(endpoint, *flags):
    return json.loads(gh_bytes(endpoint, *flags))


def validate_run(run, repo, run_id, allow_active=False):
    try:
        return (isinstance(run, dict) and numeric(run.get("id")) == numeric(run_id)
                and run.get("path") == WORKFLOW_PATH and run.get("name") == WORKFLOW_NAME
                and run.get("status") in (("completed", "in_progress", "queued") if allow_active else ("completed",))
                and isinstance(run.get("head_repository"), dict)
                and run["head_repository"].get("full_name") == repo
                and run.get("event") in ("workflow_run", "workflow_dispatch"))
    except (ValueError, TypeError):
        return False


def read_zip(payload, filename="publication-receipt.json"):
    if len(payload) > 1_000_000:
        raise ValueError("Oversized receipt archive")
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        entries = archive.infolist()
        if len(entries) != 1 or entries[0].filename != filename or entries[0].file_size > 65_536 or entries[0].flag_bits & 1:
            raise ValueError("Unexpected receipt archive contents")
        return json.loads(archive.read(entries[0]))


def environment():
    repo = os.environ["GITHUB_REPOSITORY"]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        raise ValueError("Invalid repository")
    return repo, numeric(os.environ["GITHUB_RUN_ID"])


def resolve(output):
    output = Path(output)
    repo, current_run = environment()
    current_attempt = attempt()
    manifest = json.loads((output / "swc-exports/export-manifest.json").read_text(encoding="utf-8-sig"))
    current = fingerprint(manifest.get("files"))
    # Never inherit a stale marker left by an earlier invocation or partial error.
    for component in COMPONENTS:
        (output / f"published-{component}.ok").unlink(missing_ok=True)
    artifacts = []
    for name in ARTIFACT_NAMES:
        pages = gh_json(f"repos/{repo}/actions/artifacts?name={name}&per_page=100", "--paginate", "--slurp")
        if not isinstance(pages, list) or any(not isinstance(p, dict) or not isinstance(p.get("artifacts"), list) for p in pages):
            raise ValueError("Invalid artifact listing")
        artifacts.extend(a for page in pages for a in page["artifacts"] if isinstance(a, dict) and a.get("name") == name)
    artifacts.sort(key=lambda a: int(numeric(a.get("id"))), reverse=True)
    latest = None
    runs = {}

    def trusted(run_id):
        if run_id not in runs:
            runs[run_id] = gh_json(f"repos/{repo}/actions/runs/{run_id}")
        return validate_run(runs[run_id], repo, run_id, allow_active=run_id == current_run)

    for artifact in artifacts:
        if type(artifact.get("expired")) is not bool:
            raise ValueError("Invalid artifact expiry")
        if artifact["expired"]:
            continue
        run_id = numeric(artifact.get("workflow_run", {}).get("id"))
        if not trusted(run_id):
            continue
        phase = "intent" if artifact["name"].startswith(INTENT_NAME + "-") else "complete"
        filename = "publication-intent.json" if phase == "intent" else "publication-receipt.json"
        receipt = read_zip(gh_bytes(f"repos/{repo}/actions/artifacts/{numeric(artifact['id'])}/zip"), filename)
        validate_receipt(receipt, run_id, phase)
        if artifact["name"] != artifact_name(phase, receipt["runAttempt"]):
            raise ValueError("Publication artifact slot mismatch")
        if run_id == current_run and receipt["runAttempt"] >= current_attempt:
            continue
        latest = receipt
        break
    seed = Path(__file__).with_name("legacy-publication-receipt.json")
    if latest is None and seed.exists():
        receipt = json.loads(seed.read_text(encoding="utf-8-sig"))
        expiry = receipt.get("legacyValidUntil")
        if not isinstance(expiry, str):
            raise ValueError("Missing legacy receipt expiry")
        valid_until = datetime.fromisoformat(expiry)
        if valid_until.tzinfo is None or valid_until.utcoffset() != timedelta(0):
            raise ValueError("Legacy receipt expiry must be timezone-aware UTC")
        if valid_until > datetime.now(timezone.utc):
            receipt.setdefault("runAttempt", 1)
            run_id = numeric(receipt.get("reportRunId"))
            if trusted(run_id):
                latest = validate_receipt(receipt, run_id, "complete")
    lines = []
    for component in COMPONENTS:
        matched = latest is not None and latest["fingerprint"] == current and latest["components"][component]
        if matched:
            (output / f"published-{component}.ok").touch()
        lines.append(f"{component}={'false' if matched else 'true'}\n")
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
        stream.writelines(lines)


def create(output, phase="complete"):
    output = Path(output)
    target = output / ("publication-intent.json" if phase == "intent" else "publication-receipt.json")
    target.unlink(missing_ok=True)
    verification_file = output / "accepted-has-verification.json"
    components = {c: phase == "complete" and (output / f"published-{c}.ok").is_file() for c in COMPONENTS}
    if not verification_file.exists():
        print("Publication receipt skipped: no verified publication state.")
        return
    verification = json.loads(verification_file.read_text(encoding="utf-8-sig"))
    if not isinstance(verification, dict) or verification.get("verified") is not True:
        raise ValueError("Invalid accepted verification")
    upstream = numeric(verification.get("hasRunId"))
    if phase == "complete" and not any(components.values()):
        print("Publication receipt skipped: no verified publication state.")
        return
    run_id = numeric(os.environ["GITHUB_RUN_ID"])
    manifest = json.loads((output / "swc-exports/export-manifest.json").read_text(encoding="utf-8-sig"))
    files = normalized_files(manifest.get("files"))
    run_attempt = attempt()
    receipt = {"schemaVersion": 1, "verified": True, "phase": phase, "reportRunId": run_id, "runAttempt": run_attempt, "upstreamRunId": upstream,
               "source": manifest.get("source", "csv"), "files": files, "fingerprint": fingerprint(files), "components": components}
    validate_receipt(receipt)
    target.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
            stream.write(f"artifact_name={artifact_name(phase, run_attempt)}\nslot={run_attempt % 2}\n")
    print("Verified publication receipt created.")


def main():
    try:
        if len(sys.argv) != 3 or sys.argv[1] not in ("resolve", "create", "intent"):
            raise ValueError("Invalid invocation")
        {"resolve": resolve, "create": create, "intent": lambda output: create(output, "intent")}[sys.argv[1]](sys.argv[2])
    except Exception:
        print("Publication receipt verification failed; publishing is blocked.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
