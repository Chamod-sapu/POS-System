# ==============================================================================
# Wewala POS: Nightly Database Backup & Cloud Upload (PowerShell)
# ==============================================================================
param(
  [string]$BackupDir = "C:\POS_Backups",
  [string]$SecretFile = "C:\POS_Backups\.backup_secret"
)

$ErrorActionPreference = "Stop"

$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"
$DUMP_FILE = "$BackupDir\wewala_pos_$TIMESTAMP.sql"
$ENC_FILE = "$DUMP_FILE.enc"

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$SUPABASE_DB_URL = $env:SUPABASE_DIRECT_DB_URL
if (-not $SUPABASE_DB_URL) {
  Write-Error "Environment variable SUPABASE_DIRECT_DB_URL is not configured."
  exit 1
}

Write-Host "[$TIMESTAMP] Starting database pg_dump..."
& pg_dump --dbname=$SUPABASE_DB_URL --format=plain --no-owner --no-acl --file=$DUMP_FILE

if (Test-Path $SecretFile) {
  Write-Host "Encrypting database dump with AES-256-CBC..."
  & openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 -in $DUMP_FILE -out $ENC_FILE -pass file:$SecretFile
  Remove-Item -Path $DUMP_FILE -Force
  Write-Host "Encrypted backup saved to: $ENC_FILE"
} else {
  Write-Warning "Secret file $SecretFile not found. Retaining plaintext dump."
}

# Optional S3 / Cloudflare R2 Upload if AWS CLI is installed
if (Get-Command "aws" -ErrorAction SilentlyContinue) {
  Write-Host "Syncing to off-site cloud storage..."
  & aws s3 cp (if (Test-Path $ENC_FILE) { $ENC_FILE } else { $DUMP_FILE }) s3://wewala-pos-secure-backups/database/
}

# Retention: Remove backups older than 30 days
Get-ChildItem -Path $BackupDir -Filter "*.enc" | Where-Object { $_.CreationTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force
Write-Host "Nightly backup routine complete."

