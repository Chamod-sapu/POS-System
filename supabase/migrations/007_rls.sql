-- ==============================================================================
-- Migration: 007_rls.sql
-- Description: Authentication, Roles, Row Level Security, and pos_products view.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SECURITY DEFINER ROLE HELPER FUNCTIONS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_uid uuid := COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid);
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role INTO v_role
  FROM profiles
  WHERE id = v_uid AND is_active = true;

  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION is_staff()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN current_user_role() IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION is_manager_or_owner()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN current_user_role() IN ('manager', 'owner');
END;
$$;

CREATE OR REPLACE FUNCTION is_owner()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN current_user_role() = 'owner';
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. CASHIER PRODUCTS VIEW (No cost columns, staff only)
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS pos_products;
CREATE VIEW pos_products WITH (security_barrier = true) AS
SELECT 
  id,
  sku,
  barcode,
  name,
  category_id,
  unit,
  allow_decimal_qty,
  selling_price_cents,
  tax_exempt,
  stock_qty,
  is_active
FROM products
WHERE is_staff();

-- ------------------------------------------------------------------------------
-- 3. ENABLE AND FORCE ROW LEVEL SECURITY ON ALL TABLES
-- ------------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_settings FORCE ROW LEVEL SECURITY;

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;

ALTER TABLE stock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batches FORCE ROW LEVEL SECURITY;

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers FORCE ROW LEVEL SECURITY;

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases FORCE ROW LEVEL SECURITY;

ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items FORCE ROW LEVEL SECURITY;

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts FORCE ROW LEVEL SECURITY;

ALTER TABLE bill_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_counters FORCE ROW LEVEL SECURITY;

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales FORCE ROW LEVEL SECURITY;

ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items FORCE ROW LEVEL SECURITY;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;

ALTER TABLE sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_returns FORCE ROW LEVEL SECURITY;

ALTER TABLE sale_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_return_items FORCE ROW LEVEL SECURITY;

ALTER TABLE sms_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_outbox FORCE ROW LEVEL SECURITY;

ALTER TABLE held_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE held_carts FORCE ROW LEVEL SECURITY;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 4. REVOKE ANONYMOUS ACCESS GLOBALLY
-- ------------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON pos_products FROM anon;

GRANT SELECT ON pos_products TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_role TO authenticated;
GRANT EXECUTE ON FUNCTION is_staff TO authenticated;
GRANT EXECUTE ON FUNCTION is_manager_or_owner TO authenticated;
GRANT EXECUTE ON FUNCTION is_owner TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY POLICIES
-- ------------------------------------------------------------------------------

-- (a) profiles: S own row for any staff; S/U all rows owner only; I/D none (Edge Function only)
DROP POLICY IF EXISTS profiles_select_policy ON profiles;
CREATE POLICY profiles_select_policy ON profiles
FOR SELECT USING (
  ((id = COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid)) AND is_staff())
  OR is_owner()
);

DROP POLICY IF EXISTS profiles_update_policy ON profiles;
CREATE POLICY profiles_update_policy ON profiles
FOR UPDATE USING (is_owner())
WITH CHECK (is_owner());

-- (b) shop_settings: S any staff; U owner only
DROP POLICY IF EXISTS shop_settings_select_policy ON shop_settings;
CREATE POLICY shop_settings_select_policy ON shop_settings
FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS shop_settings_update_policy ON shop_settings;
CREATE POLICY shop_settings_update_policy ON shop_settings
FOR UPDATE USING (is_owner())
WITH CHECK (is_owner());

-- (c) categories: S any staff; I/U manager+owner; D owner
DROP POLICY IF EXISTS categories_select_policy ON categories;
CREATE POLICY categories_select_policy ON categories
FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS categories_insert_policy ON categories;
CREATE POLICY categories_insert_policy ON categories
FOR INSERT WITH CHECK (is_manager_or_owner());

DROP POLICY IF EXISTS categories_update_policy ON categories;
CREATE POLICY categories_update_policy ON categories
FOR UPDATE USING (is_manager_or_owner())
WITH CHECK (is_manager_or_owner());

DROP POLICY IF EXISTS categories_delete_policy ON categories;
CREATE POLICY categories_delete_policy ON categories
FOR DELETE USING (is_owner());

-- (d) products: S/I/U manager+owner only (contains cost price); D none
DROP POLICY IF EXISTS products_select_policy ON products;
CREATE POLICY products_select_policy ON products
FOR SELECT USING (is_manager_or_owner());

DROP POLICY IF EXISTS products_insert_policy ON products;
CREATE POLICY products_insert_policy ON products
FOR INSERT WITH CHECK (is_manager_or_owner());

DROP POLICY IF EXISTS products_update_policy ON products;
CREATE POLICY products_update_policy ON products
FOR UPDATE USING (is_manager_or_owner())
WITH CHECK (is_manager_or_owner());

-- (e) stock_batches & stock_movements: S manager+owner; writes fn only
DROP POLICY IF EXISTS stock_batches_select_policy ON stock_batches;
CREATE POLICY stock_batches_select_policy ON stock_batches
FOR SELECT USING (is_manager_or_owner());

DROP POLICY IF EXISTS stock_movements_select_policy ON stock_movements;
CREATE POLICY stock_movements_select_policy ON stock_movements
FOR SELECT USING (is_manager_or_owner());

-- (f) customers: S/I/U any staff; D owner
DROP POLICY IF EXISTS customers_select_policy ON customers;
CREATE POLICY customers_select_policy ON customers
FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS customers_insert_policy ON customers;
CREATE POLICY customers_insert_policy ON customers
FOR INSERT WITH CHECK (is_staff());

DROP POLICY IF EXISTS customers_update_policy ON customers;
CREATE POLICY customers_update_policy ON customers
FOR UPDATE USING (is_staff())
WITH CHECK (is_staff());

DROP POLICY IF EXISTS customers_delete_policy ON customers;
CREATE POLICY customers_delete_policy ON customers
FOR DELETE USING (is_owner());

-- (g) suppliers, purchases, purchase_items: S/I/U manager+owner; D none
DROP POLICY IF EXISTS suppliers_select_policy ON suppliers;
CREATE POLICY suppliers_select_policy ON suppliers
FOR SELECT USING (is_manager_or_owner());

DROP POLICY IF EXISTS suppliers_insert_policy ON suppliers;
CREATE POLICY suppliers_insert_policy ON suppliers
FOR INSERT WITH CHECK (is_manager_or_owner());

DROP POLICY IF EXISTS suppliers_update_policy ON suppliers;
CREATE POLICY suppliers_update_policy ON suppliers
FOR UPDATE USING (is_manager_or_owner())
WITH CHECK (is_manager_or_owner());

DROP POLICY IF EXISTS purchases_select_policy ON purchases;
CREATE POLICY purchases_select_policy ON purchases
FOR SELECT USING (is_manager_or_owner());

DROP POLICY IF EXISTS purchases_insert_policy ON purchases;
CREATE POLICY purchases_insert_policy ON purchases
FOR INSERT WITH CHECK (is_manager_or_owner());

DROP POLICY IF EXISTS purchases_update_policy ON purchases;
CREATE POLICY purchases_update_policy ON purchases
FOR UPDATE USING (is_manager_or_owner())
WITH CHECK (is_manager_or_owner());

DROP POLICY IF EXISTS purchase_items_select_policy ON purchase_items;
CREATE POLICY purchase_items_select_policy ON purchase_items
FOR SELECT USING (is_manager_or_owner());

DROP POLICY IF EXISTS purchase_items_insert_policy ON purchase_items;
CREATE POLICY purchase_items_insert_policy ON purchase_items
FOR INSERT WITH CHECK (is_manager_or_owner());

DROP POLICY IF EXISTS purchase_items_update_policy ON purchase_items;
CREATE POLICY purchase_items_update_policy ON purchase_items
FOR UPDATE USING (is_manager_or_owner())
WITH CHECK (is_manager_or_owner());

-- (h) sales, sale_items, payments: S cashier sees own (cashier_id = auth.uid()), manager+owner see all; I/U/D fn only
DROP POLICY IF EXISTS sales_select_policy ON sales;
CREATE POLICY sales_select_policy ON sales
FOR SELECT USING (
  ((cashier_id = COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid)) AND is_staff())
  OR is_manager_or_owner()
);

DROP POLICY IF EXISTS sale_items_select_policy ON sale_items;
CREATE POLICY sale_items_select_policy ON sale_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM sales s
    WHERE s.id = sale_items.sale_id
      AND (((s.cashier_id = COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid)) AND is_staff())
           OR is_manager_or_owner())
  )
);

DROP POLICY IF EXISTS payments_select_policy ON payments;
CREATE POLICY payments_select_policy ON payments
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM sales s
    WHERE s.id = payments.sale_id
      AND (((s.cashier_id = COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid)) AND is_staff())
           OR is_manager_or_owner())
  )
);

-- (i) sale_returns & sale_return_items: S same as sales; writes fn only
DROP POLICY IF EXISTS sale_returns_select_policy ON sale_returns;
CREATE POLICY sale_returns_select_policy ON sale_returns
FOR SELECT USING (
  ((created_by = COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid)) AND is_staff())
  OR is_manager_or_owner()
);

DROP POLICY IF EXISTS sale_return_items_select_policy ON sale_return_items;
CREATE POLICY sale_return_items_select_policy ON sale_return_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM sale_returns sr
    WHERE sr.id = sale_return_items.return_id
      AND (((sr.created_by = COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid)) AND is_staff())
           OR is_manager_or_owner())
  )
);

-- (j) shifts: S cashier sees own, manager+owner all; writes fn only
DROP POLICY IF EXISTS shifts_select_policy ON shifts;
CREATE POLICY shifts_select_policy ON shifts
FOR SELECT USING (
  ((cashier_id = COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid)) AND is_staff())
  OR is_manager_or_owner()
);

-- (k) held_carts: S/I/U/D own rows only
DROP POLICY IF EXISTS held_carts_all_policy ON held_carts;
CREATE POLICY held_carts_all_policy ON held_carts
FOR ALL USING (
  (cashier_id = COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid)) AND is_staff()
)
WITH CHECK (
  (cashier_id = COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid)) AND is_staff()
);

-- (l) sms_outbox: S manager+owner; writes fn only
DROP POLICY IF EXISTS sms_outbox_select_policy ON sms_outbox;
CREATE POLICY sms_outbox_select_policy ON sms_outbox
FOR SELECT USING (is_manager_or_owner());

-- (m) audit_log: S owner only; no client writes
DROP POLICY IF EXISTS audit_log_select_policy ON audit_log;
CREATE POLICY audit_log_select_policy ON audit_log
FOR SELECT USING (is_owner());

-- (n) bill_counters: NO client policies (only accessed via SECURITY DEFINER functions)

-- ------------------------------------------------------------------------------
-- 6. STOCK ADJUSTMENT FUNCTION (MANAGER + OWNER ONLY)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adjust_stock(
  p_product_id uuid,
  p_qty_change numeric,
  p_reason text,
  p_type movement_type DEFAULT 'adjustment'
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid);
  v_prod products%ROWTYPE;
  v_new_stock numeric(12,3);
BEGIN
  -- 1. Authorization: Only managers or owners
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  -- 2. Validation: Mandatory reason
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT:Reason is mandatory';
  END IF;

  IF p_type NOT IN ('opening', 'purchase', 'adjustment', 'damage', 'stocktake') THEN
    RAISE EXCEPTION 'INVALID_INPUT:Invalid adjustment movement type';
  END IF;

  -- 3. Lock product row for atomic update
  SELECT * INTO v_prod
  FROM products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;

  v_new_stock := v_prod.stock_qty + p_qty_change;

  -- 4. Prevent negative resulting stock
  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'OUT_OF_STOCK:%:%', v_prod.sku, v_prod.stock_qty;
  END IF;

  -- 5. Update product stock
  UPDATE products
  SET stock_qty = v_new_stock,
      updated_at = now()
  WHERE id = p_product_id;

  -- 6. Append to stock_movements ledger
  INSERT INTO stock_movements (
    product_id,
    movement_type,
    qty_change,
    qty_after,
    reason,
    created_by,
    created_at
  ) VALUES (
    p_product_id,
    p_type,
    p_qty_change,
    v_new_stock,
    p_reason,
    v_user_id,
    now()
  );

  -- 7. Write to audit_log
  INSERT INTO audit_log (
    user_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  ) VALUES (
    v_user_id,
    'stock.adjust',
    'products',
    p_product_id::text,
    jsonb_build_object('stock_qty', v_prod.stock_qty),
    jsonb_build_object(
      'stock_qty', v_new_stock,
      'qty_change', p_qty_change,
      'movement_type', p_type,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'product_id', v_prod.id,
    'sku', v_prod.sku,
    'name', v_prod.name,
    'old_stock_qty', v_prod.stock_qty,
    'new_stock_qty', v_new_stock,
    'qty_change', p_qty_change,
    'movement_type', p_type
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION adjust_stock TO authenticated;

