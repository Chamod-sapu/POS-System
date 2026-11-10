-- Migration 011: Live Stock Levels and Realtime Subscriptions
-- Description: Creates the stock_levels table for confidential Realtime streaming to all staff (including cashiers),
-- triggers to keep it synchronized with products, RLS policies, publication configuration, and pos_products view update.

-- ------------------------------------------------------------------------------
-- 1. CREATE stock_levels TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_levels (
  product_id uuid PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  stock_qty numeric(12,3) NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Backfill initial stock levels from products
INSERT INTO stock_levels (product_id, stock_qty, updated_at)
SELECT id, stock_qty, now()
FROM products
ON CONFLICT (product_id) DO UPDATE
SET stock_qty = EXCLUDED.stock_qty,
    updated_at = EXCLUDED.updated_at;

-- ------------------------------------------------------------------------------
-- 2. TRIGGER ON products (AFTER INSERT OR UPDATE OF stock_qty)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_stock_levels()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO stock_levels (product_id, stock_qty, updated_at)
  VALUES (NEW.id, NEW.stock_qty, now())
  ON CONFLICT (product_id) DO UPDATE
  SET stock_qty = EXCLUDED.stock_qty,
      updated_at = EXCLUDED.updated_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_stock_levels ON products;
CREATE TRIGGER trg_sync_stock_levels
AFTER INSERT OR UPDATE OF stock_qty ON products
FOR EACH ROW
EXECUTE FUNCTION sync_stock_levels();

-- ------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY ON stock_levels
-- ------------------------------------------------------------------------------
-- Cashiers cannot read the products table because it contains cost prices.
-- stock_levels exposes ONLY product_id and stock_qty, enabling Realtime streaming
-- to cashiers without compromising commercial confidentiality.
ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_levels FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_levels_select_policy ON stock_levels;
CREATE POLICY stock_levels_select_policy ON stock_levels
  FOR SELECT TO authenticated
  USING (is_staff());

-- Revoke all write permissions from client roles (only trigger/internal functions can write)
REVOKE ALL ON stock_levels FROM anon;
REVOKE INSERT, UPDATE, DELETE ON stock_levels FROM authenticated;
GRANT SELECT ON stock_levels TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. REALTIME PUBLICATION CONFIGURATION
-- ------------------------------------------------------------------------------
ALTER TABLE stock_levels REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'stock_levels'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE stock_levels;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'sales'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE sales;
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. UPDATE pos_products VIEW TO READ FROM stock_levels
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS pos_products;
CREATE VIEW pos_products WITH (security_barrier = true) AS
SELECT 
  p.id,
  p.sku,
  p.barcode,
  p.name,
  p.category_id,
  p.unit,
  p.allow_decimal_qty,
  p.selling_price_cents,
  p.tax_exempt,
  COALESCE(sl.stock_qty, p.stock_qty, 0) AS stock_qty,
  p.is_active
FROM products p
LEFT JOIN stock_levels sl ON p.id = sl.product_id
WHERE is_staff();

REVOKE ALL ON pos_products FROM anon;
GRANT SELECT ON pos_products TO authenticated;

