"""Send an SWC audit summary to the configured Gmail account."""
import json
import os
import re
import smtplib
import ssl
import sys
from email.message import EmailMessage
from pathlib import Path

OPERATION_LABELS = {
    "successfullyRestarted": "Confirmed restarts",
    "needsStart": "Mines to review for a new start",
    "misnamedDepleted": "Named Depleted with a positive deposit",
    "needsDepletedName": "Depleted mines that need renaming",
}


def read_summary(path):
    if not path.is_file():
        return None
    for line in reversed(path.read_text(encoding="utf-8").splitlines()):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(entry, dict) and isinstance(entry.get("operationalCounts"), dict):
            return entry
    return None


def count(value):
    if type(value) is not int or value < 0:
        raise ValueError("Invalid audit count")
    return f"{value:,}"


def build_message(address, summary, run_url, status):
    message = EmailMessage()
    message["From"] = address
    message["To"] = address
    if status != "success" or summary is None:
        message["Subject"] = "SWC mine audit needs attention"
        lines = ["The workflow did not publish a complete audit result.", ""]
    else:
        scope = summary["system"]
        complete = summary["complete"] is True
        message["Subject"] = f"SWC mine audit — {scope} — {'complete' if complete else 'partial'}"
        lines = [
            f"Scope: {scope}",
            f"Coverage: {count(summary['checkedDetails'])} checked, {count(summary['pendingDetails'])} pending",
            f"Resume candidates: {count(summary['categories']['paused-with-space-candidate'])}",
        ]
        for key, label in OPERATION_LABELS.items():
            lines.append(f"{label}: {count(summary['operationalCounts'][key])}")
        lines.extend([
            f"Unfamiliar Infotext: {count(summary['unfamiliarInfotextValues'])} distinct values",
            "",
            "This audit was read-only. Candidate mines were not restarted.",
            "",
            "The encrypted mine-by-mine report is in the run's Artifacts section.",
        ])
    lines.extend(["", run_url])
    message.set_content("\n".join(lines) + "\n")
    return message


def main():
    address = os.environ.get("SWC_MINE_REPORT_EMAIL", "").strip()
    password = os.environ.get("SWC_MINE_REPORT_GMAIL_APP_PASSWORD", "").replace(" ", "").strip()
    if not address and not password:
        print("Mine report email skipped: delivery credentials are not configured.")
        return
    if not re.fullmatch(r"[A-Za-z0-9._%+-]+@gmail\.com", address, re.IGNORECASE) or not password:
        raise ValueError("Mine report email configuration incomplete.")
    repo = os.environ["GITHUB_REPOSITORY"]
    run_id = os.environ["GITHUB_RUN_ID"]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo) or not run_id.isdecimal():
        raise ValueError("Invalid GitHub run identity.")
    run_url = f"https://github.com/{repo}/actions/runs/{run_id}"
    summary = read_summary(Path(sys.argv[1]))
    message = build_message(address, summary, run_url, os.environ.get("AUDIT_STATUS", "unknown"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30, context=ssl.create_default_context()) as smtp:
        smtp.login(address, password)
        smtp.send_message(message)
    print("Mine report email accepted by Gmail.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, smtplib.SMTPException, ValueError, KeyError, IndexError):
        print("::warning::Mine report email was not confirmed. Check the mail secrets and run report.", file=sys.stderr)
        sys.exit(1)
