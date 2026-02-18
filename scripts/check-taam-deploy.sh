#!/bin/bash
set -euo pipefail

HOSTNAME="${1:-taam.im}"

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

echo "\n== cloudflared =="
if command -v cloudflared >/dev/null 2>&1; then
  cloudflared --version
  cloudflared tunnel list || true
  cloudflared tunnel info targum-taam || true
else
  echo "cloudflared not installed"
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
  curl -I "https://${HOSTNAME}" || true
fi
