#!/bin/bash
set -euo pipefail

MODE="${1:---check}"

if [[ "$MODE" != "--check" && "$MODE" != "--apply" ]]; then
  echo "Usage: scripts/harden-mac-mini-uptime.sh [--check|--apply]" >&2
  exit 1
fi

if ! command -v pmset >/dev/null 2>&1; then
  echo "[ERROR] pmset is not available on this system." >&2
  exit 1
fi

get_ac_value() {
  local key="$1"
  pmset -g custom | awk -v key="$key" '
    $0=="AC Power:" { in_ac=1; next }
    in_ac && /^[^[:space:]]/ { in_ac=0 }
    in_ac {
      gsub(/^[ \t]+/, "", $0)
      if ($1 == key) {
        print $2
        exit
      }
    }
  '
}

print_status() {
  local sleep_v autorestart_v womp_v powernap_v displaysleep_v
  sleep_v="$(get_ac_value sleep)"
  autorestart_v="$(get_ac_value autorestart)"
  womp_v="$(get_ac_value womp)"
  powernap_v="$(get_ac_value powernap)"
  displaysleep_v="$(get_ac_value displaysleep)"

  local failed=0

  echo "== Mac mini uptime policy check (AC Power) =="
  echo "sleep:        ${sleep_v:-<missing>} (target: 0)"
  echo "autorestart:  ${autorestart_v:-<missing>} (target: 1)"
  echo "womp:         ${womp_v:-<missing>} (target: 1)"
  echo "powernap:     ${powernap_v:-<missing>} (target: 0)"
  echo "displaysleep: ${displaysleep_v:-<missing>} (target: 10)"

  [[ "${sleep_v:-}" == "0" ]] || failed=1
  [[ "${autorestart_v:-}" == "1" ]] || failed=1
  [[ "${womp_v:-}" == "1" ]] || failed=1
  [[ "${powernap_v:-}" == "0" ]] || failed=1
  [[ "${displaysleep_v:-}" == "10" ]] || failed=1

  if [[ "$failed" -eq 0 ]]; then
    echo "[PASS] Uptime policy matches expected server settings."
  else
    echo "[FAIL] Uptime policy does not match expected server settings."
  fi

  return "$failed"
}

if [[ "$MODE" == "--apply" ]]; then
  echo "[...] Applying uptime policy for AC power (requires sudo)..."
  sudo pmset -c sleep 0
  sudo pmset -c autorestart 1
  sudo pmset -c womp 1
  sudo pmset -c powernap 0
  sudo pmset -c displaysleep 10
  echo "[OK] Applied uptime policy values."
fi

print_status
