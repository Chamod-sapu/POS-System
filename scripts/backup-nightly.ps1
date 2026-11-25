# ==============================================================================
# Wewala POS: Nightly Database Backup & Cloud Upload (PowerShell)
# ==============================================================================
param(
  [string]$BackupDir = "C:\POS_Backups",
  [string]$SecretFile = "C:\ProgramData\wewala_pos\backup_secret.key"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $SecretFile)) {
  Write-Error "Encryption secret file '$SecretFile' not found. Refusing to create an unencrypted backup."
  exit 1
}

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

try {
  Write-Host "[$TIMESTAMP] Starting database pg_dump..."
  & pg_dump --dbname=$SUPABASE_DB_URL --format=plain --no-owner --no-acl --file=$DUMP_FILE
  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed with exit code $LASTEXITCODE"
  }

  Write-Host "Encrypting database dump with AES-256-CBC..."
  & openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 -in $DUMP_FILE -out $ENC_FILE -pass "file:$SecretFile"
  if ($LASTEXITCODE -ne 0) {
    throw "OpenSSL encryption failed with exit code $LASTEXITCODE"
  }
  Write-Host "Encrypted backup saved to: $ENC_FILE"
} finally {
  if (Test-Path $DUMP_FILE) {
    Remove-Item -Path $DUMP_FILE -Force
  }
}

# Optional S3 / Cloudflare R2 Upload if AWS CLI is installed (encrypted archive only + SSE)
if (Get-Command "aws" -ErrorAction SilentlyContinue) {
  Write-Host "Syncing encrypted backup to off-site cloud storage..."
  & aws s3 cp $ENC_FILE s3://wewala-pos-secure-backups/database/ --sse AES256
  if ($LASTEXITCODE -ne 0) {
    throw "Off-site S3 upload failed with exit code $LASTEXITCODE"
  }
}

# Retention: Remove backups older than 30 days
Get-ChildItem -Path $BackupDir -Filter "*.enc" | Where-Object { $_.CreationTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force
Write-Host "Nightly backup routine complete."

