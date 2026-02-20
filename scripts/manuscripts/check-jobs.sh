#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
STATUS_FILTER="${2:-failed}"

echo "Checking OCR jobs at: ${BASE_URL}/api/manuscripts/jobs/ocr?status=${STATUS_FILTER}"
curl -s "${BASE_URL}/api/manuscripts/jobs/ocr?status=${STATUS_FILTER}" | jq .

echo
echo "Tip: retry a failed job with:"
echo "curl -X POST ${BASE_URL}/api/manuscripts/jobs/ocr/<jobId>/retry"
