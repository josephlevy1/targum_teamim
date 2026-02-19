#!/bin/bash
set -euo pipefail

HOSTNAME="${1:-taam.im}"
FAILED=0

mark_fail() {
  FAILED=1
}

pass_fail_line() {
  local ok="$1"
  local msg="$2"
  if [[ "$ok" -eq 0 ]]; then
    echo "[PASS] $msg"
  else
    echo "[FAIL] $msg"
    mark_fail
  fi
}

get_pmset_ac_value() {
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

echo "== Local app =="
if command -v pnpm >/dev/null 2>&1; then
  pnpm pm2:status || true
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 describe cloudflared-taam >/dev/null 2>&1 && pm2 describe cloudflared-taam | sed -n '1,25p' || true
fi

if command -v lsof >/dev/null 2>&1; then
  lsof -nP -iTCP:3000 -sTCP:LISTEN || true
fi

echo "\n== Required process checks =="
if command -v pm2 >/dev/null 2>&1; then
  if pm2 jlist | node -e '
    const fs = require("fs");
    const rows = JSON.parse(fs.readFileSync(0, "utf8"));
    const required = ["targum-web", "cloudflared-taam"];
    const missing = required.filter((name) => !rows.some((r) => r.name === name && r.pm2_env?.status === "online"));
    if (missing.length) {
      console.error(missing.join(","));
      process.exit(1);
    }
  '; then
    pass_fail_line 0 "PM2 processes online: targum-web, cloudflared-taam"
  else
    pass_fail_line 1 "PM2 processes online: targum-web, cloudflared-taam"
  fi
else
  pass_fail_line 1 "pm2 command available"
fi

echo "\n== cloudflared =="
if command -v cloudflared >/dev/null 2>&1; then
  cloudflared --version
  cloudflared tunnel list || true
  cloudflared tunnel info targum-taam || true
else
  echo "cloudflared not installed"
  mark_fail
fi

echo "\n== Host policy checks =="
if command -v pmset >/dev/null 2>&1; then
  sleep_v="$(get_pmset_ac_value sleep)"
  autorestart_v="$(get_pmset_ac_value autorestart)"
  echo "AC sleep=${sleep_v:-<missing>} (target=0)"
  echo "AC autorestart=${autorestart_v:-<missing>} (target=1)"
  [[ "${sleep_v:-}" == "0" ]]
  pass_fail_line "$?" "AC system sleep disabled"
  [[ "${autorestart_v:-}" == "1" ]]
  pass_fail_line "$?" "Auto-restart enabled after power failure"
else
  pass_fail_line 1 "pmset command available"
fi

echo "\n== launchd conflict checks =="
if command -v launchctl >/dev/null 2>&1; then
  CONFLICTS="$(launchctl list 2>/dev/null | awk '{print $3}' | rg -x 'com.cloudflare.cloudflared|homebrew.mxcl.cloudflared' || true)"
  if [[ -n "$CONFLICTS" ]]; then
    echo "$CONFLICTS"
    pass_fail_line 1 "No conflicting cloudflared launchd jobs loaded"
  else
    pass_fail_line 0 "No conflicting cloudflared launchd jobs loaded"
  fi
else
  pass_fail_line 1 "launchctl command available"
fi

echo "\n== DNS =="
if command -v dig >/dev/null 2>&1; then
  dig +short "$HOSTNAME" || true
  dig +short CNAME "$HOSTNAME" || true
else
  echo "dig not available"
fi

echo "\n== HTTPS =="
if command -v curl >/dev/null 2>&1; then
  HTTP_CODE="$(curl -sS -o /dev/null -w "%{http_code}" "https://${HOSTNAME}" || true)"
  echo "https://${HOSTNAME} -> HTTP ${HTTP_CODE:-<none>}"
  if [[ -n "${HTTP_CODE:-}" && "$HTTP_CODE" =~ ^[23][0-9][0-9]$ ]]; then
    pass_fail_line 0 "Public HTTPS endpoint responds with 2xx/3xx"
  else
    pass_fail_line 1 "Public HTTPS endpoint responds with 2xx/3xx"
  fi
else
  pass_fail_line 1 "curl command available"
fi

echo "\n== Result =="
if [[ "$FAILED" -eq 0 ]]; then
  echo "[OK] Deployment checks passed."
else
  echo "[ERROR] Deployment checks failed."
fi

exit "$FAILED"
