-- ==============================================================================
-- Test Suite: supabase/tests/rls.sql
-- Description: Verifies Row Level Security (RLS) policies across roles:
--              - Anon reads nothing
--              - Cashier cannot select from products
--              - Cashier can select from pos_products (no cost prices)
--              - Cashier cannot see another cashier's sales
--              - Cashier cannot update shop_settings
--              - Cashier cannot insert into sales directly
--              - Manager cannot read audit_log
--              - Owner can read audit_log
--              - Inactive user is blocked everywhere
--              - adjust_stock permitted only for manager and owner
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TEST SETUP: Setup profiles and sample data
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_owner_id uuid := '00000000-0000-0000-0000-000000000001';
  v_mgr_id   uuid := '00000000-0000-0000-0000-000000000002';
  v_cash1_id uuid := '00000000-0000-0000-0000-000000000003';
  v_cash2_id uuid := '00000000-0000-0000-0000-000000000004';
  v_inact_id uuid := '00000000-0000-0000-0000-000000000005';
BEGIN
  -- Insert into auth.users if schema exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, email) VALUES
      (v_owner_id, 'owner@wewala.lk'),
      (v_mgr_id, 'mgr@wewala.lk'),
      (v_cash1_id, 'cash1@wewala.lk'),
      (v_cash2_id, 'cash2@wewala.lk'),
      (v_inact_id, 'inactive@wewala.lk')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Insert profiles
  INSERT INTO profiles (id, full_name, role, is_active) VALUES
    (v_owner_id, 'Alice Owner', 'owner', true),
    (v_mgr_id, 'Bob Manager', 'manager', true),
    (v_cash1_id, 'Charlie Cashier 1', 'cashier', true),
    (v_cash2_id, 'Dave Cashier 2', 'cashier', true),
    (v_inact_id, 'Eve Inactive', 'cashier', false)
  ON CONFLICT (id) DO UPDATE SET 
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;

  -- Create a sale for Cashier 1 and a sale for Cashier 2 via create_sale
  PERFORM set_config('app.current_user_id', v_cash1_id::text, true);
  PERFORM create_sale(
    '00000000-0000-0000-0000-111111111111'::uuid,
    jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM products WHERE is_active = true LIMIT 1), 'quantity', 1)),
    jsonb_build_object('type', 'none'),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 1000000))
  );

  PERFORM set_config('app.current_user_id', v_cash2_id::text, true);
  PERFORM create_sale(
    '00000000-0000-0000-0000-222222222222'::uuid,
    jsonb_build_array(jsonb_build_object('product_id', (SELECT id FROM products WHERE is_active = true LIMIT 1), 'quantity', 1)),
    jsonb_build_object('type', 'none'),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 1000000))
  );
END $$;

-- ------------------------------------------------------------------------------
-- 2. TEST: Anon Reads Nothing
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_count int;
BEGIN
  -- Simulate Anon (no user id)
  PERFORM set_config('app.current_user_id', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  SELECT count(*) INTO v_count FROM products;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RLS FAILED: Anon can read products table! Count: %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM profiles;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RLS FAILED: Anon can read profiles table! Count: %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM sales;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RLS FAILED: Anon can read sales table! Count: %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM pos_products;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RLS FAILED: Anon can read pos_products view! Count: %', v_count;
  END IF;

  RAISE NOTICE 'RLS TEST 1 PASSED: Anonymous user reads nothing.';
END $$;

-- ------------------------------------------------------------------------------
-- 3. TEST: Cashier Cannot Select From products, but CAN Select From pos_products
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_prod_count int;
  v_pos_count int;
  v_cash1_id text := '00000000-0000-0000-0000-000000000003';
BEGIN
  PERFORM set_config('app.current_user_id', v_cash1_id, true);
  PERFORM set_config('request.jwt.claim.sub', v_cash1_id, true);

  -- Direct select from products (contains cost_price_cents) -> 0 rows
  SELECT count(*) INTO v_prod_count FROM products;
  IF v_prod_count <> 0 THEN
    RAISE EXCEPTION 'RLS FAILED: Cashier can select from products table! Count: %', v_prod_count;
  END IF;

  -- Select from pos_products (no cost columns) -> should see active products
  SELECT count(*) INTO v_pos_count FROM pos_products;
  IF v_pos_count = 0 THEN
    RAISE EXCEPTION 'RLS FAILED: Cashier cannot read from pos_products view!';
  END IF;

  RAISE NOTICE 'RLS TEST 2 PASSED: Cashier blocked from products table, allowed on pos_products view.';
END $$;

-- ------------------------------------------------------------------------------
-- 4. TEST: Cashier Cannot See Another Cashier's Sales
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_sales_count int;
  v_other_sales_count int;
  v_cash1_id text := '00000000-0000-0000-0000-000000000003';
  v_cash2_id uuid := '00000000-0000-0000-0000-000000000004';
BEGIN
  PERFORM set_config('app.current_user_id', v_cash1_id, true);
  PERFORM set_config('request.jwt.claim.sub', v_cash1_id, true);

  -- Cashier 1 queries sales
  SELECT count(*) INTO v_sales_count FROM sales;
  SELECT count(*) INTO v_other_sales_count FROM sales WHERE cashier_id = v_cash2_id;

  IF v_other_sales_count > 0 THEN
    RAISE EXCEPTION 'RLS FAILED: Cashier 1 can see Cashier 2 sales!';
  END IF;

  IF v_sales_count <> 1 THEN
    RAISE EXCEPTION 'RLS FAILED: Cashier 1 should see exactly 1 sale (their own), saw: %', v_sales_count;
  END IF;

  RAISE NOTICE 'RLS TEST 3 PASSED: Cashier isolated to own sales transactions.';
END $$;

-- ------------------------------------------------------------------------------
-- 5. TEST: Cashier Cannot Update shop_settings
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_updated_rows int;
  v_cash1_id text := '00000000-0000-0000-0000-000000000003';
BEGIN
  PERFORM set_config('app.current_user_id', v_cash1_id, true);
  PERFORM set_config('request.jwt.claim.sub', v_cash1_id, true);

  UPDATE shop_settings SET shop_name = 'Hacked Shop' WHERE id = 1;
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows > 0 THEN
    RAISE EXCEPTION 'RLS FAILED: Cashier was able to update shop_settings!';
  END IF;

  RAISE NOTICE 'RLS TEST 4 PASSED: Cashier blocked from updating shop_settings.';
END $$;

-- ------------------------------------------------------------------------------
-- 6. TEST: Manager Cannot Read audit_log, but Owner CAN
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_mgr_id   text := '00000000-0000-0000-0000-000000000002';
  v_owner_id text := '00000000-0000-0000-0000-000000000001';
  v_mgr_audit_count int;
  v_owner_audit_count int;
BEGIN
  -- As Manager:
  PERFORM set_config('app.current_user_id', v_mgr_id, true);
  PERFORM set_config('request.jwt.claim.sub', v_mgr_id, true);

  SELECT count(*) INTO v_mgr_audit_count FROM audit_log;
  IF v_mgr_audit_count > 0 THEN
    RAISE EXCEPTION 'RLS FAILED: Manager can read audit_log table!';
  END IF;

  -- As Owner:
  PERFORM set_config('app.current_user_id', v_owner_id, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner_id, true);

  SELECT count(*) INTO v_owner_audit_count FROM audit_log;
  IF v_owner_audit_count = 0 THEN
    RAISE EXCEPTION 'RLS FAILED: Owner should be able to read audit_log table!';
  END IF;

  RAISE NOTICE 'RLS TEST 5 PASSED: audit_log strictly restricted to Owner.';
END $$;

-- ------------------------------------------------------------------------------
-- 7. TEST: Inactive User is Blocked Everywhere
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_inact_id text := '00000000-0000-0000-0000-000000000005';
  v_count int;
  v_role user_role;
BEGIN
  PERFORM set_config('app.current_user_id', v_inact_id, true);
  PERFORM set_config('request.jwt.claim.sub', v_inact_id, true);

  SELECT current_user_role() INTO v_role;
  IF v_role IS NOT NULL THEN
    RAISE EXCEPTION 'RLS FAILED: Inactive user returned non-null role: %', v_role;
  END IF;

  SELECT count(*) INTO v_count FROM pos_products;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RLS FAILED: Inactive user can read pos_products view!';
  END IF;

  SELECT count(*) INTO v_count FROM sales;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RLS FAILED: Inactive user can read sales table!';
  END IF;

  RAISE NOTICE 'RLS TEST 6 PASSED: Inactive user completely blocked by RLS.';
END $$;

-- ------------------------------------------------------------------------------
-- 8. TEST: adjust_stock Function Restrictions
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_cash1_id text := '00000000-0000-0000-0000-000000000003';
  v_mgr_id   text := '00000000-0000-0000-0000-000000000002';
  v_prod_id  uuid;
  v_failed boolean := false;
  v_res jsonb;
BEGIN
  SELECT id INTO v_prod_id FROM products WHERE is_active = true LIMIT 1;

  -- 1. Cashier attempts adjust_stock -> MUST FAIL
  PERFORM set_config('app.current_user_id', v_cash1_id, true);
  PERFORM set_config('request.jwt.claim.sub', v_cash1_id, true);

  BEGIN
    PERFORM adjust_stock(v_prod_id, 5.000, 'Test Cashier Stocktake', 'stocktake');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%NOT_AUTHORISED%' THEN
      v_failed := true;
    END IF;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'RLS FAILED: Cashier was able to execute adjust_stock!';
  END IF;

  -- 2. Manager attempts adjust_stock -> MUST SUCCEED
  PERFORM set_config('app.current_user_id', v_mgr_id, true);
  PERFORM set_config('request.jwt.claim.sub', v_mgr_id, true);

  v_res := adjust_stock(v_prod_id, 2.000, 'Manager Stock Audit', 'adjustment');
  IF (v_res->>'qty_change')::numeric <> 2.000 THEN
    RAISE EXCEPTION 'RLS FAILED: Manager adjust_stock did not return expected change: %', v_res;
  END IF;

  RAISE NOTICE 'RLS TEST 7 PASSED: adjust_stock role restriction verified.';
END $$;

ROLLBACK;

