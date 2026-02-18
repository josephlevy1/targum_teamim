#!/bin/bash
set -euo pipefail

TUNNEL_NAME="targum-taam"
HOSTNAME="taam.im"
SERVICE_URL="http://localhost:3000"
WITH_WWW=0
INSTALL_SERVICE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tunnel-name)
      TUNNEL_NAME="$2"
      shift 2
      ;;
    --hostname)
      HOSTNAME="$2"
      shift 2
      ;;
    --service-url)
      SERVICE_URL="$2"
      shift 2
      ;;
    --with-www)
      WITH_WWW=1
      shift
      ;;
    --install-service)
      INSTALL_SERVICE=1
      shift
      ;;
    -h|--help)
      cat <<USAGE
Usage: scripts/setup-cloudflared-taam.sh [options]

Options:
  --tunnel-name <name>   Tunnel name (default: targum-taam)
  --hostname <host>      Public hostname (default: taam.im)
  --service-url <url>    Local backend URL (default: http://localhost:3000)
  --with-www             Also route www.<hostname> through the tunnel
  --install-service      Install/start cloudflared under PM2 as persistent service
  -h, --help             Show help
USAGE
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "[ERROR] cloudflared is not installed. Run: brew install cloudflared" >&2
  exit 1
fi

if ! command -v rg >/dev/null 2>&1; then
  echo "[ERROR] ripgrep (rg) is required." >&2
  exit 1
fi

CF_DIR="${HOME}/.cloudflared"
ORIGIN_CERT="${CF_DIR}/cert.pem"

if [[ ! -f "$ORIGIN_CERT" ]]; then
  echo "[ACTION REQUIRED] Cloudflare login required."
  echo "Run: cloudflared tunnel login"
  echo "Then re-run this script."
  exit 1
fi

if ! cloudflared tunnel list >/dev/null 2>&1; then
  echo "[ERROR] Unable to list tunnels. Confirm cloudflared login and permissions." >&2
  exit 1
fi

if ! cloudflared tunnel list | rg -q "\\b${TUNNEL_NAME}\\b"; then
  echo "[...] Creating tunnel: ${TUNNEL_NAME}"
  cloudflared tunnel create "$TUNNEL_NAME"
fi

TUNNEL_ID="$(cloudflared tunnel list | awk -v name="$TUNNEL_NAME" '$2==name {print $1; exit}')"
if [[ -z "$TUNNEL_ID" ]]; then
  echo "[ERROR] Could not determine tunnel ID for ${TUNNEL_NAME}" >&2
  exit 1
fi

CREDENTIALS_FILE="${CF_DIR}/${TUNNEL_ID}.json"
if [[ ! -f "$CREDENTIALS_FILE" ]]; then
  echo "[ERROR] Missing credentials file: $CREDENTIALS_FILE" >&2
  exit 1
fi

CONFIG_PATH="${CF_DIR}/config.yml"
mkdir -p "$CF_DIR"

if [[ -f "$CONFIG_PATH" ]]; then
  cp "$CONFIG_PATH" "${CONFIG_PATH}.bak.$(date +%Y%m%d_%H%M%S)"
fi

cat > "$CONFIG_PATH" <<CFG
tunnel: ${TUNNEL_ID}
credentials-file: ${CREDENTIALS_FILE}

ingress:
  - hostname: ${HOSTNAME}
    service: ${SERVICE_URL}
CFG

if [[ "$WITH_WWW" -eq 1 ]]; then
  cat >> "$CONFIG_PATH" <<CFG
  - hostname: www.${HOSTNAME}
    service: ${SERVICE_URL}
CFG
fi

cat >> "$CONFIG_PATH" <<'CFG'
  - service: http_status:404
CFG

echo "[...] Routing DNS for ${HOSTNAME}"
cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME"

if [[ "$WITH_WWW" -eq 1 ]]; then
  echo "[...] Routing DNS for www.${HOSTNAME}"
  cloudflared tunnel route dns "$TUNNEL_NAME" "www.${HOSTNAME}"
fi

if [[ "$INSTALL_SERVICE" -eq 1 ]]; then
  echo "[...] Starting cloudflared under PM2"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 delete cloudflared-taam >/dev/null 2>&1 || true
    pm2 start /opt/homebrew/bin/cloudflared --name cloudflared-taam -- tunnel --config "$CONFIG_PATH" run
    pm2 save
  else
    echo "[WARN] pm2 not found; skipping persistent tunnel process setup."
  fi
fi

echo "[OK] Tunnel configuration completed"
echo "- Tunnel name: ${TUNNEL_NAME}"
echo "- Tunnel id:   ${TUNNEL_ID}"
echo "- Hostname:    ${HOSTNAME}"
echo "- Service URL: ${SERVICE_URL}"
echo "- Config path: ${CONFIG_PATH}"

echo "Next checks:"
echo "1) cloudflared tunnel info ${TUNNEL_NAME}"
echo "2) pnpm pm2:status"
echo "3) open https://${HOSTNAME}"
