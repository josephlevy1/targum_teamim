#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=== Targum Editor — Starting Production ==="

# 1. Check .env
if [ ! -f apps/web/.env ]; then
  echo "[ERROR] apps/web/.env not found. Copy apps/web/.env.example and configure." >&2
  exit 1
fi

# 2. Create log directory
mkdir -p logs

# 3. Build packages + web app
echo "[...] Building..."
pnpm -r build
echo "[OK]  Build complete"

# 4. Start PM2
echo "[...] Starting PM2..."
pm2 start ecosystem.config.cjs
echo "[OK]  PM2 started"

# 5. Load backup schedule
echo "[...] Loading backup schedule..."
launchctl load ~/Library/LaunchAgents/com.targum.backup.plist 2>/dev/null || true
echo "[OK]  Hourly backups scheduled"

# 7. Run initial backup
echo "[...] Running initial backup..."
bash scripts/backup-db.sh

echo ""
echo "=== All services running ==="
pm2 list
echo ""
echo "Local: http://127.0.0.1:3000"
echo "Stop:  pnpm stop:prod"
