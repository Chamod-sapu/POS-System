# Wewala POS: Backup, Point-In-Time Recovery & Disaster Recovery Runbook

This document details the complete backup architecture, cloud tier capabilities, automated nightly dump schedules, and disaster recovery drill procedures for Wewala Super Store POS.

---

## 1. Supabase Plan Capabilities & Verification

### Current Plan Details to Verify
Log into the **Supabase Dashboard** (`https://supabase.com/dashboard/project/jcjpekkapiglvesaknmb`) and navigate to:
**Settings $\to$ Billing & Usage $\to$ Subscription** and **Settings $\to$ Database $\to$ Backups**.

| Feature | Free Tier | Pro Tier ($25/mo) | Enterprise / Team Tier |
| :--- | :--- | :--- | :--- |
| **Automatic Daily Backups** | 7 days retention | 7 days retention | 30+ days retention |
| **Point-In-Time Recovery (PITR)** | Not Available | **Included (7 days)** (Add-on up to 30 days) | **Included (30 days)** |
| **Manual Backups (pg_dump)** | Full Access | Full Access | Full Access |
| **Database Compute Egress** | 2 GB / month | 250 GB / month | Custom |

> [!IMPORTANT]
> **Owner Verification Action Required**:
> Check your Supabase Dashboard under **Database $\to$ Backups**. If running on the **Pro Plan**, ensure **Point-In-Time Recovery (PITR)** is toggled to **Enabled**. PITR allows rolling back transactions to the exact second (e.g. immediately prior to an erroneous bulk update or software fault).

### How to Enable Point-In-Time Recovery (PITR)
1. Go to **Supabase Dashboard** $\to$ **Project Settings** $\to$ **Database**.
2. Scroll to the **Backups** section.
3. Click **Enable Point in Time Recovery**.
4. Confirm retention period (default 7 days).
5. Once enabled, the dashboard displays a timeline slider permitting one-click cloning or restoration to any timestamp within the retention window.

---

## 2. Nightly Automated `pg_dump` with Encrypted Off-Site Replication

Regardless of cloud provider snapshots, standard data resilience practice requires an independent, off-site, encrypted copy of your data that the cloud provider cannot touch or lock you out of.

### Automation Scripts

#### Option A: Windows Shop Computer (`scripts/backup-nightly.ps1`)
Runs on the store terminal running Windows 10/11:

```powershell
# ==============================================================================
# Wewala POS: Nightly Database Backup & Cloud Upload (PowerShell)
# ==============================================================================
$ErrorActionPreference = "Stop"

# Configuration
$TIMESTAMP = Get-Date -Format "yyyyMMdd_HHmmss"
$BACKUP_DIR = "C:\POS_Backups"
$DUMP_FILE = "$BACKUP_DIR\wewala_pos_$TIMESTAMP.sql"
$ENC_FILE = "$DUMP_FILE.enc"
$PASSWORD_FILE = "C:\POS_Backups\.backup_secret"
$SUPABASE_DB_URL = "postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"

# 1. Ensure backup directory exists
if (-not (Test-Path $BACKUP_DIR)) { New-Item -ItemType Directory -Path $BACKUP_DIR }

# 2. Execute pg_dump
Write-Host "Starting pg_dump..."
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" --dbname=$SUPABASE_DB_URL --format=plain --no-owner --no-acl --file=$DUMP_FILE

# 3. Encrypt dump using OpenSSL AES-256-CBC
Write-Host "Encrypting dump file..."
& openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 -in $DUMP_FILE -out $ENC_FILE -pass file:$PASSWORD_FILE

# 4. Remove unencrypted plaintext dump
Remove-Item -Path $DUMP_FILE -Force

# 5. Upload to Off-Site Cloud Storage (AWS S3 or Cloudflare R2 via AWS CLI)
Write-Host "Syncing to off-site cloud storage..."
& aws s3 cp $ENC_FILE s3://wewala-pos-secure-backups/database/ --endpoint-url https://[ACCOUNT_ID].r2.cloudflarestorage.com

# 6. Retention Cleanup: Keep 30 daily backups locally
Get-ChildItem -Path $BACKUP_DIR -Filter "*.enc" | Where-Object { $_.CreationTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force
Write-Host "Nightly backup completed successfully."
```

#### Option B: Linux / macOS Small Server (`scripts/backup-nightly.sh`)
```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/wewala_pos"
DUMP_FILE="$BACKUP_DIR/wewala_pos_${TIMESTAMP}.sql"
ENC_FILE="${DUMP_FILE}.gpg"
PASSPHRASE_FILE="/etc/wewala/backup_passphrase"
SUPABASE_DB_URL="${SUPABASE_DIRECT_DB_URL}"

mkdir -p "$BACKUP_DIR"

# 1. Export schema and data atomically
pg_dump "$SUPABASE_DB_URL" \
  --format=plain \
  --no-owner \
  --no-acl \
  --file="$DUMP_FILE"

# 2. Encrypt with GPG (AES-256)
gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "$PASSPHRASE_FILE" -o "$ENC_FILE" "$DUMP_FILE"
rm -f "$DUMP_FILE"

# 3. Off-site sync to S3 / Cloudflare R2
aws s3 cp "$ENC_FILE" s3://wewala-pos-secure-backups/database/

# 4. Prune local files older than 30 days
find "$BACKUP_DIR" -name "*.gpg" -mtime +30 -delete
```

### Scheduling Instructions

#### Windows Task Scheduler (Shop Computer)
Run as Administrator in PowerShell:
```powershell
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File C:\POS-System\scripts\backup-nightly.ps1"
$Trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "WewalaPOS_NightlyBackup" -Action $Action -Trigger $Trigger -Principal $Principal -Description "Automated 2 AM encrypted database backup for Wewala POS"
```

#### Linux Crontab
```bash
crontab -e
# Add line:
0 2 * * * /opt/pos/scripts/backup-nightly.sh >> /var/log/wewala_backup.log 2>&1
```

---

## 3. Owner-Only 'Export All Data' Feature

Under **Settings $\to$ Backup & Data Portability**, store owners with **AAL2 (MFA)** can download instant CSV archives of all 7 critical operational tables:
1. `products` (SKU, barcode, inventory levels, cost & selling prices)
2. `sales` (historical transaction header records)
3. `sale_items` (individual line items sold with snapshot costs and discounts)
4. `payments` (cash, card, bank transfer, and credit settlements)
5. `customers` (customer directory, phone numbers, loyalty points, store credit balances)
6. `suppliers` (supplier directory and balance accounts)
7. `stock_movements` (immutable ledger of all inventory adjustments, sales, purchases, and returns)

---

## 4. Disaster Recovery & Restore Rehearsal Checklist

Execute this dry-run drill once every quarter to ensure total business continuity.

### Rehearsal Checklist

- [ ] **Step 1: Declare Drill & Set Up Isolated Sandbox**
  - Never test restores against the live production database.
  - Create a new temporary Supabase project or spin up a local PostgreSQL container (`docker run --name pg-test -e POSTGRES_PASSWORD=test -p 5433:5432 -d postgres:16`).

- [ ] **Step 2: Fetch and Decrypt Latest Backup**
  - Download the most recent `.enc` or `.gpg` file from your off-site bucket.
  - Decrypt using your stored offline passphrase:
    ```bash
    # OpenSSL decryption
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -in wewala_pos_latest.sql.enc -out restored.sql -pass file:.backup_secret
    ```

- [ ] **Step 3: Ingest Dump into Test Database**
  ```bash
  psql -h localhost -p 5433 -U postgres -d postgres -f restored.sql
  ```

- [ ] **Step 4: Execute Four-Way Ledger Reconciliation Test**
  - Run the ledger reconciliation function in the restored database:
    ```sql
    SELECT * FROM public.report_reconciliation(
      (now() - interval '90 days')::date,
      now()::date
    );
    ```
  - Confirm:
    1. `payments_balance_check = true` (zero cent discrepancy).
    2. `line_items_balance_check = true`.
    3. `stock_ledger_check = true`.
    4. `bill_sequence_gap_check = true`.

- [ ] **Step 5: Verify Critical State Counts**
  ```sql
  SELECT 'products' AS tbl, count(*) FROM products
  UNION ALL SELECT 'sales', count(*) FROM sales
  UNION ALL SELECT 'customers', count(*) FROM customers
  UNION ALL SELECT 'stock_movements', count(*) FROM stock_movements;
  ```
  - Cross-check record counts against the previous day's executive summary.

- [ ] **Step 6: Confirm Recovery Time Objective (RTO) & Recovery Point Objective (RPO)**
  - Document total drill elapsed time (RTO target: $\le 45\text{ minutes}$).
  - Document maximum data age from last dump (RPO target: $\le 24\text{ hours}$ without PITR, $\le 5\text{ minutes}$ with PITR).
  - Clean up test container and sign off on the rehearsal audit log.

