#!/usr/bin/env bash
# ==============================================================================
# Wewala POS: Nightly Database Backup & Cloud Upload (Linux/macOS)
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/wewala_pos}"
PASSPHRASE_FILE="${PASSPHRASE_FILE:-/etc/wewala/backup_passphrase}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DUMP_FILE="${BACKUP_DIR}/wewala_pos_${TIMESTAMP}.sql"
ENC_FILE="${DUMP_FILE}.gpg"

if [ -z "${SUPABASE_DIRECT_DB_URL:-}" ]; then
  echo "Error: SUPABASE_DIRECT_DB_URL environment variable is not set." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "[$TIMESTAMP] Starting database pg_dump..."
pg_dump "$SUPABASE_DIRECT_DB_URL" \
  --format=plain \
  --no-owner \
  --no-acl \
  --file="$DUMP_FILE"

if [ -f "$PASSPHRASE_FILE" ]; then
  echo "Encrypting dump with GPG AES-256..."
  gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "$PASSPHRASE_FILE" -o "$ENC_FILE" "$DUMP_FILE"
  rm -f "$DUMP_FILE"
  FINAL_FILE="$ENC_FILE"
else
  echo "Warning: Passphrase file not found, keeping unencrypted dump."
  FINAL_FILE="$DUMP_FILE"
fi

if command -v aws &> /dev/null; then
  echo "Syncing backup to off-site cloud storage..."
  aws s3 cp "$FINAL_FILE" s3://wewala-pos-secure-backups/database/
fi

# Retention cleanup
find "$BACKUP_DIR" -name "wewala_pos_*" -mtime +30 -delete
echo "Backup finished successfully."

