#!/bin/bash
set -euo pipefail

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[ERROR] pm2 is not installed or not in PATH." >&2
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "[ERROR] sudo is required to register PM2 startup under launchd." >&2
  exit 1
fi

USER_NAME="${SUDO_USER:-$USER}"
HOME_DIR="$(eval echo "~${USER_NAME}")"
PM2_BIN="$(command -v pm2)"

echo "[...] Saving current PM2 process list..."
pm2 save

echo "[...] Registering PM2 startup with launchd..."
echo "Running: sudo env PATH=$PATH $PM2_BIN startup launchd -u $USER_NAME --hp $HOME_DIR"
sudo env PATH="$PATH" "$PM2_BIN" startup launchd -u "$USER_NAME" --hp "$HOME_DIR"

PM2_LAUNCHD_FILE="/Library/LaunchDaemons/pm2.${USER_NAME}.plist"
if [[ -f "$PM2_LAUNCHD_FILE" ]]; then
  echo "[OK] PM2 launchd service installed: $PM2_LAUNCHD_FILE"
else
  echo "[WARN] PM2 startup command ran, but $PM2_LAUNCHD_FILE was not found."
  echo "Check startup status with: launchctl list | rg -i pm2"
fi

echo "[OK] PM2 startup setup complete."
