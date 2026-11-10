-- ==============================================================================
-- Migration: 003_sales_tables.sql
-- Description: Financial and Sales tables: Sales, Sale Items, Payments, Returns,
--              SMS Outbox, Held Carts, and Audit Log.
-- ==============================================================================

-- 12. SALES (Single source of truth for POS transactions)
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_no text UNIQUE NOT NULL CHECK (bill_no ~ '^WWL-\d{8}-\d{4}$'),
  idempotency_key uuid UNIQUE NOT NULL,
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
  cashier_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES customers(id) ON DELETE RESTRICT,
  customer_phone text CHECK (customer_phone IS NULL OR customer_phone ~ '^\+94\d{9}$'),
  status sale_status NOT NULL DEFAULT 'completed',
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
  line_discount_cents bigint NOT NULL DEFAULT 0 CHECK (line_discount_cents >= 0),
  bill_discount_cents bigint NOT NULL DEFAULT 0 CHECK (bill_discount_cents >= 0),
  taxable_cents bigint NOT NULL CHECK (taxable_cents >= 0),
  tax_cents bigint NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents bigint NOT NULL CHECK (total_cents >= 0),
  tax_rate_percent_snapshot numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (tax_rate_percent_snapshot >= 0),
  tax_inclusive_snapshot boolean NOT NULL DEFAULT true,
  paid_cents bigint NOT NULL CHECK (paid_cents >= 0),
  change_cents bigint NOT NULL DEFAULT 0 CHECK (change_cents >= 0),
  print_count int NOT NULL DEFAULT 0 CHECK (print_count >= 0),
  voided_at timestamptz,
  voided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Core financial integrity constraints
  CONSTRAINT chk_tax_exclusive_total CHECK (
    tax_inclusive_snapshot = true OR total_cents = (taxable_cents + tax_cents)
  ),
  CONSTRAINT chk_bill_discount_limit CHECK (
    bill_discount_cents <= subtotal_cents
  )
);

-- 13. SALE ITEMS (Immutable historical line item snapshot)
CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name_snapshot text NOT NULL,
  sku_snapshot text NOT NULL,
  unit_snapshot text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_price_cents_snapshot bigint NOT NULL CHECK (unit_price_cents_snapshot >= 0),
  unit_cost_cents_snapshot bigint NOT NULL DEFAULT 0 CHECK (unit_cost_cents_snapshot >= 0),
  line_discount_cents bigint NOT NULL DEFAULT 0 CHECK (line_discount_cents >= 0),
  line_tax_cents bigint NOT NULL DEFAULT 0 CHECK (line_tax_cents >= 0),
  line_total_cents bigint NOT NULL CHECK (line_total_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 14. PAYMENTS (Split payments support per sale)
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  method payment_method NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 15. SALE RETURNS & SALE RETURN ITEMS
CREATE TABLE IF NOT EXISTS sale_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  return_no text UNIQUE NOT NULL,
  reason text NOT NULL,
  refund_method payment_method NOT NULL,
  refund_cents bigint NOT NULL CHECK (refund_cents >= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES sale_returns(id) ON DELETE RESTRICT,
  sale_item_id uuid NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  refund_cents bigint NOT NULL CHECK (refund_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 16. SMS OUTBOX (Queue for transactional customer SMS receipts/alerts)
CREATE TABLE IF NOT EXISTS sms_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES sales(id) ON DELETE RESTRICT,
  phone text NOT NULL CHECK (phone ~ '^\+94\d{9}$'),
  message text NOT NULL,
  status sms_status NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 17. HELD CARTS (Temporary cashier saved state)
CREATE TABLE IF NOT EXISTS held_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  cart_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 18. AUDIT LOG (Tamper-evident append-only ledger for all sensitive actions)
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

