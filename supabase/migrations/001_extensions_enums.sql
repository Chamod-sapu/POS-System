-- ==============================================================================
-- Migration: 001_extensions_enums.sql
-- Description: Core extensions and PostgreSQL enumerated types for Wewala POS
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. ENUMS (created safely with IF NOT EXISTS blocks for re-runnability)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('owner', 'manager', 'cashier');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'movement_type') THEN
    CREATE TYPE movement_type AS ENUM (
      'opening',
      'purchase',
      'sale',
      'sale_void',
      'return',
      'adjustment',
      'damage',
      'stocktake'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sale_status') THEN
    CREATE TYPE sale_status AS ENUM (
      'completed',
      'voided',
      'partially_returned',
      'returned'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE payment_method AS ENUM (
      'cash',
      'card',
      'bank_transfer',
      'store_credit'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sms_status') THEN
    CREATE TYPE sms_status AS ENUM (
      'pending',
      'sending',
      'sent',
      'failed',
      'skipped'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_status') THEN
    CREATE TYPE purchase_status AS ENUM (
      'draft',
      'received',
      'cancelled'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shift_status') THEN
    CREATE TYPE shift_status AS ENUM (
      'open',
      'closed'
    );
  END IF;
END $$;

