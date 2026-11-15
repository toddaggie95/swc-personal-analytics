#!/usr/bin/env bash
set -euo pipefail
output="${1:?Expected output directory}"
mkdir -p "$output"
exec python3 "$(dirname "$0")/publication-receipts.py" resolve "$output"
