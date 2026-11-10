-- ==============================================================================
-- Migration: 002_core_tables.sql
-- Description: Core entity tables: Profiles, Settings, Products, Inventory, 
--              Customers, Suppliers, Purchasing, Shifts, and Bill Counters.
-- ==============================================================================

-- 1. PROFILES (Extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'cashier',
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. SHOP SETTINGS (Single row guaranteed by id = 1 check)
CREATE TABLE IF NOT EXISTS shop_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shop_name text NOT NULL DEFAULT 'Wewala Grocery Store',
  address text NOT NULL DEFAULT 'Main Street, Wewala, Sri Lanka',
  phone text NOT NULL DEFAULT '+94112345678',
  vat_reg_no text,
  receipt_footer text DEFAULT 'Thank you for shopping with us! Please come again.',
  tax_enabled boolean NOT NULL DEFAULT false,
  tax_rate_percent numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (tax_rate_percent >= 0),
  tax_inclusive boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT false,
  sms_template text DEFAULT 'Thank you for shopping at {shop}. Bill {bill_no}, total {total}, {date}. Enquiries: {phone}',
  max_cashier_discount_percent numeric(5,2) NOT NULL DEFAULT 5.00 CHECK (max_cashier_discount_percent >= 0 AND max_cashier_discount_percent <= 100),
  low_stock_default numeric(12,3) NOT NULL DEFAULT 5.000 CHECK (low_stock_default >= 0),
  currency text NOT NULL DEFAULT 'LKR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL,
  barcode text UNIQUE,
  name text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE RESTRICT,
  unit text NOT NULL CHECK (unit IN ('pcs','kg','g','l','ml','pack','box')),
  allow_decimal_qty boolean NOT NULL DEFAULT false,
  cost_price_cents bigint NOT NULL DEFAULT 0 CHECK (cost_price_cents >= 0),
  selling_price_cents bigint NOT NULL CHECK (selling_price_cents >= 0),
  tax_exempt boolean NOT NULL DEFAULT false,
  stock_qty numeric(12,3) NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  reorder_level numeric(12,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  track_expiry boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. STOCK BATCHES (Expiry tracking breakdown for products with track_expiry = true)
CREATE TABLE IF NOT EXISTS stock_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_no text NOT NULL,
  expiry_date date NOT NULL,
  qty_remaining numeric(12,3) NOT NULL DEFAULT 0 CHECK (qty_remaining >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unq_stock_batch UNIQUE (product_id, batch_no)
);

-- 6. STOCK MOVEMENTS (Append-only immutable audit trail for stock)
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  movement_type movement_type NOT NULL,
  qty_change numeric(12,3) NOT NULL,
  qty_after numeric(12,3) NOT NULL CHECK (qty_after >= 0),
  reference_type text,
  reference_id uuid,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. CUSTOMERS
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text UNIQUE NOT NULL CHECK (phone ~ '^\+94\d{9}$'),
  email text,
  points_balance int NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  credit_balance_cents bigint NOT NULL DEFAULT 0 CHECK (credit_balance_cents >= 0),
  sms_opt_out boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. SUPPLIERS
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  address text,
  balance_cents bigint NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. PURCHASES & PURCHASE ITEMS
CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  invoice_no text,
  status purchase_status NOT NULL DEFAULT 'draft',
  total_cents bigint NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  received_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit_cost_cents bigint NOT NULL CHECK (unit_cost_cents >= 0),
  batch_no text,
  expiry_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. SHIFTS
CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  terminal_name text NOT NULL DEFAULT 'Main Terminal',
  status shift_status NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_float_cents bigint NOT NULL DEFAULT 0 CHECK (opening_float_cents >= 0),
  closed_at timestamptz,
  counted_cash_cents bigint CHECK (counted_cash_cents IS NULL OR counted_cash_cents >= 0),
  expected_cash_cents bigint CHECK (expected_cash_cents IS NULL OR expected_cash_cents >= 0),
  difference_cents bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. BILL COUNTERS (For gapless daily sequence numbers WWL-YYYYMMDD-NNNN)
CREATE TABLE IF NOT EXISTS bill_counters (
  bill_date date PRIMARY KEY,
  last_number int NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

