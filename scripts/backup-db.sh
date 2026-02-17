#!/bin/bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_PATH="$PROJECT_ROOT/data/app.db"
BACKUP_DIR="$PROJECT_ROOT/data/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/app_${TIMESTAMP}.db"
MAX_BACKUPS=168  # 7 days of hourly backups

# Ensure DB exists
if [ ! -f "$DB_PATH" ]; then
  echo "[$(date)] SKIP: Database not found at $DB_PATH"
  exit 0
fi

mkdir -p "$BACKUP_DIR"

# Use SQLite .backup for WAL-safe consistent snapshots
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# Verify integrity
if sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "ok"; then
  echo "[$(date)] Backup OK: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
else
  echo "[$(date)] ERROR: Backup integrity check failed: $BACKUP_FILE" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Prune old backups beyond MAX_BACKUPS
cd "$BACKUP_DIR"
ls -1t app_*.db 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -f 2>/dev/null || true

echo "[$(date)] Backups retained: $(ls -1 app_*.db 2>/dev/null | wc -l | tr -d ' ')"
