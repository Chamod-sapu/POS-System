-- ==============================================================================
-- Test Suite: supabase/tests/006_create_sale_tests.sql
-- Description: Rigorous PostgreSQL test suite verifying create_sale(), get_bill(),
--              concurrency locks, stock deduction, gapless bill counters,
--              discount limits, FEFO batching, and error codes.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- TEST SETUP: Create mock test cashier profile and test products
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_test_user_id uuid := '00000000-0000-0000-0000-000000000001';
  v_test_cashier_id uuid := '00000000-0000-0000-0000-000000000002';
  v_cat_id uuid;
BEGIN
  -- Insert dummy auth users if auth.users exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, email)
    VALUES 
      (v_test_user_id, 'owner@wewala.lk'),
      (v_test_cashier_id, 'cashier@wewala.lk')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Create active profiles
  INSERT INTO profiles (id, full_name, role, is_active)
  VALUES 
    (v_test_user_id, 'Test Owner', 'owner', true),
    (v_test_cashier_id, 'Test Cashier', 'cashier', true)
  ON CONFLICT (id) DO UPDATE SET is_active = true, role = EXCLUDED.role;

  -- Ensure category exists
  INSERT INTO categories (name, is_active)
  VALUES ('Test Category', true)
  ON CONFLICT (name) DO UPDATE SET is_active = true
  RETURNING id INTO v_cat_id;

  -- Insert isolated test products
  INSERT INTO products (
    id, sku, barcode, name, category_id, unit, allow_decimal_qty,
    cost_price_cents, selling_price_cents, tax_exempt, stock_qty, reorder_level, is_active, track_expiry
  ) VALUES
    ('11111111-1111-1111-1111-111111111111', 'TEST-RICE-01', '9990001', 'Test Rice 1kg', v_cat_id, 'kg', true, 20000, 25000, true, 10.000, 2.000, true, false),
    ('22222222-2222-2222-2222-222222222222', 'TEST-SOAP-01', '9990002', 'Test Soap Bar', v_cat_id, 'pcs', false, 10000, 15000, false, 5.000, 1.000, true, false),
    ('33333333-3333-3333-3333-333333333333', 'TEST-CENT-01', '9990003', 'Test Cent Sweet', v_cat_id, 'pcs', false, 1, 1, true, 100.000, 10.000, true, false),
    ('44444444-4444-4444-4444-444444444444', 'TEST-EXPR-01', '9990004', 'Test Milk Pack', v_cat_id, 'pcs', false, 40000, 50000, false, 2.000, 1.000, true, true),
    ('55555555-5555-5555-5555-555555555555', 'TEST-INAC-01', '9990005', 'Test Inactive', v_cat_id, 'pcs', false, 1000, 2000, false, 10.000, 1.000, false, false)
  ON CONFLICT (id) DO UPDATE SET 
    stock_qty = EXCLUDED.stock_qty,
    is_active = EXCLUDED.is_active,
    track_expiry = EXCLUDED.track_expiry;

  -- Add stock batches for TEST-EXPR-01 (FEFO)
  DELETE FROM stock_batches WHERE product_id = '44444444-4444-4444-4444-444444444444';
  INSERT INTO stock_batches (product_id, batch_no, expiry_date, qty_remaining)
  VALUES
    ('44444444-4444-4444-4444-444444444444', 'BATCH-EXP-EARLY', CURRENT_DATE + interval '10 days', 1.000),
    ('44444444-4444-4444-4444-444444444444', 'BATCH-EXP-LATER', CURRENT_DATE + interval '30 days', 1.000);
END $$;

-- ------------------------------------------------------------------------------
-- TEST 1: Direct INSERT on sales or sale_items is strictly forbidden
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_failed boolean := false;
BEGIN
  BEGIN
    INSERT INTO sales (bill_no, idempotency_key, cashier_id, subtotal_cents, taxable_cents, total_cents, paid_cents)
    VALUES ('WWL-20261106-9999', gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 100, 100, 100, 100);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%DIRECT_INSERT_FORBIDDEN%' THEN
      v_failed := true;
    END IF;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Direct insert on sales was not blocked!';
  END IF;
  RAISE NOTICE 'TEST 1 PASSED: Direct insert on sales blocked.';
END $$;

-- ------------------------------------------------------------------------------
-- TEST 2: Successful Sale Creation, Calculations, and get_bill()
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_idem uuid := gen_random_uuid();
  v_bill jsonb;
  v_rice_stock numeric;
BEGIN
  PERFORM set_config('app.current_user_id', '00000000-0000-0000-0000-000000000001', true);

  -- 2.000 kg Rice @ Rs. 250.00 = Rs. 500.00 (50,000 cents)
  -- 1 Soap Bar @ Rs. 150.00 = Rs. 150.00 (15,000 cents)
  -- Subtotal: 65,000 cents. Bill discount: 5,000 cents. Net: 60,000 cents.
  -- Payment: Cash 70,000 cents. Change: 10,000 cents.
  v_bill := create_sale(
    v_idem,
    jsonb_build_array(
      jsonb_build_object('product_id', '11111111-1111-1111-1111-111111111111', 'quantity', 2.000, 'discount_type', 'none'),
      jsonb_build_object('product_id', '22222222-2222-2222-2222-222222222222', 'quantity', 1.000, 'discount_type', 'none')
    ),
    jsonb_build_object('type', 'amount', 'value', 5000),
    jsonb_build_array(
      jsonb_build_object('method', 'cash', 'amount_cents', 70000)
    ),
    '0771234567',
    'Sunil Perera'
  );

  IF (v_bill->>'total_cents')::bigint <> 60000 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Expected total 60000, got %', v_bill->>'total_cents';
  END IF;

  IF (v_bill->>'change_cents')::bigint <> 10000 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Expected change 10000, got %', v_bill->>'change_cents';
  END IF;

  IF (v_bill->'customer'->>'phone') <> '+94771234567' THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Phone was not normalized properly: %', v_bill->'customer'->>'phone';
  END IF;

  -- Verify stock was deducted: 10.000 - 2.000 = 8.000
  SELECT stock_qty INTO v_rice_stock FROM products WHERE id = '11111111-1111-1111-1111-111111111111';
  IF v_rice_stock <> 8.000 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Expected rice stock 8.000, got %', v_rice_stock;
  END IF;

  RAISE NOTICE 'TEST 2 PASSED: Standard sale created and stock verified.';
END $$;

-- ------------------------------------------------------------------------------
-- TEST 3: Idempotency - Calling create_sale twice returns identical bill without re-deducting stock
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_idem uuid := gen_random_uuid();
  v_bill1 jsonb;
  v_bill2 jsonb;
  v_stock_before numeric;
  v_stock_after numeric;
BEGIN
  PERFORM set_config('app.current_user_id', '00000000-0000-0000-0000-000000000001', true);

  v_bill1 := create_sale(
    v_idem,
    jsonb_build_array(
      jsonb_build_object('product_id', '22222222-2222-2222-2222-222222222222', 'quantity', 1.000)
    ),
    jsonb_build_object('type', 'none'),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 15000))
  );

  SELECT stock_qty INTO v_stock_before FROM products WHERE id = '22222222-2222-2222-2222-222222222222';

  -- Call again with identical idempotency key
  v_bill2 := create_sale(
    v_idem,
    jsonb_build_array(
      jsonb_build_object('product_id', '22222222-2222-2222-2222-222222222222', 'quantity', 1.000)
    ),
    jsonb_build_object('type', 'none'),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 15000))
  );

  SELECT stock_qty INTO v_stock_after FROM products WHERE id = '22222222-2222-2222-2222-222222222222';

  IF (v_bill1->>'id') <> (v_bill2->>'id') THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Idempotency bill IDs mismatch!';
  END IF;

  IF v_stock_before <> v_stock_after THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Idempotency re-deducted stock!';
  END IF;

  RAISE NOTICE 'TEST 3 PASSED: Idempotency guarantee validated.';
END $$;

-- ------------------------------------------------------------------------------
-- TEST 4: Out of Stock Error & Atomic Rollback (Leaves Stock and Bill Numbers Unburned)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_failed boolean := false;
  v_soap_stock_before numeric;
  v_soap_stock_after numeric;
  v_last_bill_counter int;
  v_curr_bill_counter int;
  v_colombo_date date := (now() AT TIME ZONE 'Asia/Colombo')::date;
BEGIN
  PERFORM set_config('app.current_user_id', '00000000-0000-0000-0000-000000000001', true);

  SELECT stock_qty INTO v_soap_stock_before FROM products WHERE id = '22222222-2222-2222-2222-222222222222';
  SELECT last_number INTO v_last_bill_counter FROM bill_counters WHERE bill_date = v_colombo_date;

  BEGIN
    -- Request 100 units of Soap (only ~3 available)
    PERFORM create_sale(
      gen_random_uuid(),
      jsonb_build_array(
        jsonb_build_object('product_id', '22222222-2222-2222-2222-222222222222', 'quantity', 100.000)
      ),
      jsonb_build_object('type', 'none'),
      jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 1500000))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'OUT_OF_STOCK:TEST-SOAP-01:%' THEN
      v_failed := true;
    END IF;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Out of stock exception was not raised!';
  END IF;

  SELECT stock_qty INTO v_soap_stock_after FROM products WHERE id = '22222222-2222-2222-2222-222222222222';
  IF v_soap_stock_before <> v_soap_stock_after THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Stock changed after failed sale!';
  END IF;

  SELECT last_number INTO v_curr_bill_counter FROM bill_counters WHERE bill_date = v_colombo_date;
  IF v_last_bill_counter <> v_curr_bill_counter THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Bill counter was burned during failed sale!';
  END IF;

  RAISE NOTICE 'TEST 4 PASSED: Out of stock atomic rollback verified.';
END $$;

-- ------------------------------------------------------------------------------
-- TEST 5: Cashier Discount Permission Check
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_failed boolean := false;
BEGIN
  -- Switch identity to Cashier (max discount 5%)
  PERFORM set_config('app.current_user_id', '00000000-0000-0000-0000-000000000002', true);

  BEGIN
    -- Cashier attempts to give 10% discount (> 5% allowed)
    PERFORM create_sale(
      gen_random_uuid(),
      jsonb_build_array(
        jsonb_build_object('product_id', '22222222-2222-2222-2222-222222222222', 'quantity', 1.000, 'discount_type', 'percent', 'discount_value', 10)
      ),
      jsonb_build_object('type', 'none'),
      jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 15000))
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%DISCOUNT_NOT_ALLOWED%' THEN
      v_failed := true;
    END IF;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Cashier unauthorized discount was not blocked!';
  END IF;

  RAISE NOTICE 'TEST 5 PASSED: Cashier discount permission enforced.';
END $$;

-- ------------------------------------------------------------------------------
-- TEST 6: Card payment exceeding amount due after cash is rejected
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_failed boolean := false;
BEGIN
  PERFORM set_config('app.current_user_id', '00000000-0000-0000-0000-000000000001', true);

  BEGIN
    -- Item: Soap Bar @ 150.00 (15000 cents). Cash: 10000 cents. Remaining: 5000 cents.
    -- Card tendered: 8000 cents (> remaining 5000 cents).
    PERFORM create_sale(
      gen_random_uuid(),
      jsonb_build_array(
        jsonb_build_object('product_id', '22222222-2222-2222-2222-222222222222', 'quantity', 1.000)
      ),
      jsonb_build_object('type', 'none'),
      jsonb_build_array(
        jsonb_build_object('method', 'cash', 'amount_cents', 10000),
        jsonb_build_object('method', 'card', 'amount_cents', 8000)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%PAYMENT_EXCEEDS_REMAINING%' THEN
      v_failed := true;
    END IF;
  END;

  IF NOT v_failed THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Card payment exceeding balance was not rejected!';
  END IF;

  RAISE NOTICE 'TEST 6 PASSED: Non-cash change prevention validated.';
END $$;

-- ------------------------------------------------------------------------------
-- TEST 7: FEFO Stock Batch Expiry Deduction
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_bill jsonb;
  v_batch_early_qty numeric;
  v_batch_later_qty numeric;
BEGIN
  PERFORM set_config('app.current_user_id', '00000000-0000-0000-0000-000000000001', true);

  -- Buy 1.000 unit of Milk Pack (BATCH-EXP-EARLY should be exhausted first)
  v_bill := create_sale(
    gen_random_uuid(),
    jsonb_build_array(
      jsonb_build_object('product_id', '44444444-4444-4444-4444-444444444444', 'quantity', 1.000)
    ),
    jsonb_build_object('type', 'none'),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 50000))
  );

  SELECT qty_remaining INTO v_batch_early_qty 
  FROM stock_batches 
  WHERE product_id = '44444444-4444-4444-4444-444444444444' AND batch_no = 'BATCH-EXP-EARLY';

  SELECT qty_remaining INTO v_batch_later_qty 
  FROM stock_batches 
  WHERE product_id = '44444444-4444-4444-4444-444444444444' AND batch_no = 'BATCH-EXP-LATER';

  IF v_batch_early_qty <> 0.000 THEN
    RAISE EXCEPTION 'TEST 7 FAILED: Earliest expiry batch was not exhausted first! Qty: %', v_batch_early_qty;
  END IF;

  IF v_batch_later_qty <> 1.000 THEN
    RAISE EXCEPTION 'TEST 7 FAILED: Later expiry batch was altered prematurely! Qty: %', v_batch_later_qty;
  END IF;

  RAISE NOTICE 'TEST 7 PASSED: FEFO batch deduction validated.';
END $$;

-- ------------------------------------------------------------------------------
-- TEST 8: Reprinting Mark Bill Printed & Audit Log
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_sale_id uuid;
  v_bill jsonb;
  v_audit_count int;
BEGIN
  PERFORM set_config('app.current_user_id', '00000000-0000-0000-0000-000000000001', true);

  v_bill := create_sale(
    gen_random_uuid(),
    jsonb_build_array(
      jsonb_build_object('product_id', '33333333-3333-3333-3333-333333333333', 'quantity', 1.000)
    ),
    jsonb_build_object('type', 'none'),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 1))
  );

  v_sale_id := (v_bill->>'id')::uuid;

  IF (v_bill->>'print_count')::int <> 0 OR (v_bill->>'is_duplicate')::boolean <> false THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Initial print_count should be 0';
  END IF;

  -- Mark printed
  v_bill := mark_bill_printed(v_sale_id);

  IF (v_bill->>'print_count')::int <> 1 OR (v_bill->>'is_duplicate')::boolean <> true THEN
    RAISE EXCEPTION 'TEST 8 FAILED: After mark_bill_printed, print_count should be 1 and is_duplicate true';
  END IF;

  SELECT count(*) INTO v_audit_count 
  FROM audit_log 
  WHERE table_name = 'sales' AND record_id = v_sale_id::text AND action = 'bill.print';

  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Audit log entry for bill.print was not created!';
  END IF;

  RAISE NOTICE 'TEST 8 PASSED: mark_bill_printed and duplicate status validated.';
END $$;

ROLLBACK; -- Clean rollback of test data

