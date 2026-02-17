#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=== Targum Editor — Stopping ==="

# 1. Run final backup
echo "[...] Running final backup..."
bash scripts/backup-db.sh

# 2. Stop PM2 processes
echo "[...] Stopping PM2 processes..."
pm2 delete all 2>/dev/null || true
echo "[OK]  PM2 stopped"

# 3. Unload backup schedule
echo "[...] Unloading backup schedule..."
launchctl unload ~/Library/LaunchAgents/com.targum.backup.plist 2>/dev/null || true
echo "[OK]  Backup schedule unloaded"

echo ""
echo "=== All services stopped ==="
