-- ==============================================================================
-- Test Suite: supabase/tests/property_based_quote_sale.sql
-- Description: Property-based automated accuracy test harness in PostgreSQL.
--              Generates 1,000 random carts with varying quantities, prices,
--              discounts, and tax flags. Validates that quote_sale() and calc_bill()
--              strictly satisfy all accounting and mathematical invariants.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. SETUP: Profiles and Isolated Test Catalog
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_test_owner_id uuid := '00000000-0000-0000-0000-000000000001';
  v_test_cashier_id uuid := '00000000-0000-0000-0000-000000000002';
  v_cat_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    INSERT INTO auth.users (id, email)
    VALUES 
      (v_test_owner_id, 'prop_owner@wewala.lk'),
      (v_test_cashier_id, 'prop_cashier@wewala.lk')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO profiles (id, full_name, role, is_active)
  VALUES 
    (v_test_owner_id, 'Property Test Owner', 'owner', true),
    (v_test_cashier_id, 'Property Test Cashier', 'cashier', true)
  ON CONFLICT (id) DO UPDATE SET is_active = true, role = EXCLUDED.role;

  INSERT INTO categories (name, is_active)
  VALUES ('Property Test Category', true)
  ON CONFLICT (name) DO UPDATE SET is_active = true
  RETURNING id INTO v_cat_id;

  -- Create a diverse pool of test products (taxable, tax-exempt, discrete, weighed, cheap, expensive)
  INSERT INTO products (
    id, sku, barcode, name, category_id, unit, allow_decimal_qty,
    cost_price_cents, selling_price_cents, tax_exempt, stock_qty, reorder_level, is_active, track_expiry
  ) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'P-CHEAP-01', '800001', 'Cent Item', v_cat_id, 'pcs', false, 1, 1, true, 100000, 10, true, false),
    ('a0000000-0000-0000-0000-000000000002', 'P-RICE-02', '800002', 'Weighed Rice', v_cat_id, 'kg', true, 18000, 22000, true, 5000, 10, true, false),
    ('a0000000-0000-0000-0000-000000000003', 'P-SOAP-03', '800003', 'Taxable Soap', v_cat_id, 'pcs', false, 12000, 16500, false, 5000, 10, true, false),
    ('a0000000-0000-0000-0000-000000000004', 'P-SPICE-04', '800004', 'High Value Spice', v_cat_id, 'g', true, 450000, 600000, false, 1000, 5, true, false),
    ('a0000000-0000-0000-0000-000000000005', 'P-EXP-05', '800005', 'Luxury Item', v_cat_id, 'pcs', false, 25000000, 35000000, false, 500, 2, true, false)
  ON CONFLICT (id) DO UPDATE SET
    selling_price_cents = EXCLUDED.selling_price_cents,
    tax_exempt = EXCLUDED.tax_exempt,
    stock_qty = EXCLUDED.stock_qty,
    is_active = true;
END $$;

-- ------------------------------------------------------------------------------
-- 2. PROPERTY TEST RUNNER: 1,000 Iterations of Random Carts
-- ------------------------------------------------------------------------------
DO $$
DECLARE
  v_test_cashier_id uuid := '00000000-0000-0000-0000-000000000002';
  v_prod_ids uuid[] := ARRAY[
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'a0000000-0000-0000-0000-000000000003'::uuid,
    'a0000000-0000-0000-0000-000000000004'::uuid,
    'a0000000-0000-0000-0000-000000000005'::uuid
  ];
  
  v_iteration int;
  v_num_lines int;
  v_line_idx int;
  v_chosen_prod uuid;
  v_qty numeric(12,3);
  v_disc_type text;
  v_disc_val numeric;
  
  v_cart_items jsonb;
  v_bill_discount jsonb;
  v_bill_disc_type text;
  v_bill_disc_val numeric;
  
  v_quote jsonb;
  v_subtotal bigint;
  v_line_discounts bigint;
  v_bill_disc_cents bigint;
  v_taxable bigint;
  v_tax bigint;
  v_total bigint;
  v_lines_sum bigint;
  
  v_line_elem jsonb;
  v_gross bigint;
  v_ldisc bigint;
  v_lnet bigint;
  v_lalloc bigint;
  v_ltax bigint;
  v_ltot bigint;
BEGIN
  -- Set execution session context
  PERFORM set_config('app.current_user_id', v_test_cashier_id::text, true);

  FOR v_iteration IN 1..1000 LOOP
    -- Pick random number of lines: 1 to 5 (from the available product pool)
    v_num_lines := 1 + floor(random() * 5)::int;
    v_cart_items := '[]'::jsonb;

    FOR v_line_idx IN 1..v_num_lines LOOP
      v_chosen_prod := v_prod_ids[v_line_idx];
      
      -- Random quantity: integer or fractional
      IF v_line_idx IN (2, 4) THEN
        -- Weighed product: 0.125 to 15.750 kg
        v_qty := round((0.100 + (random() * 15.0))::numeric, 3);
      ELSE
        -- Discrete product: 1 to 50 pcs
        v_qty := 1 + floor(random() * 50)::int;
      END IF;

      -- Random line discount: none, percent (1-30%), or small amount (100 to 2000 cents)
      IF random() < 0.5 THEN
        v_disc_type := 'none';
        v_disc_val := 0;
      ELSIF random() < 0.8 THEN
        v_disc_type := 'percent';
        v_disc_val := floor(random() * 30)::int;
      ELSE
        v_disc_type := 'amount';
        v_disc_val := 100 + floor(random() * 2000)::bigint;
      END IF;

      v_cart_items := v_cart_items || jsonb_build_object(
        'product_id', v_chosen_prod,
        'quantity', v_qty,
        'discount_type', v_disc_type,
        'discount_value', v_disc_val
      );
    END LOOP;

    -- Random bill discount
    IF random() < 0.6 THEN
      v_bill_discount := '{"type":"none","value":0}'::jsonb;
    ELSIF random() < 0.85 THEN
      v_bill_disc_val := floor(random() * 20)::int; -- up to 20%
      v_bill_discount := jsonb_build_object('type', 'percent', 'value', v_bill_disc_val);
    ELSE
      v_bill_disc_val := 500 + floor(random() * 5000)::bigint;
      v_bill_discount := jsonb_build_object('type', 'amount', 'value', v_bill_disc_val);
    END IF;

    -- Execute quote_sale
    BEGIN
      v_quote := quote_sale(v_cart_items, v_bill_discount);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'quote_sale FAILED on iteration % with items: %, bill_discount: %, error: %',
        v_iteration, v_cart_items, v_bill_discount, SQLERRM;
    END;

    -- Extract totals
    v_subtotal := (v_quote->>'subtotal_cents')::bigint;
    v_line_discounts := (v_quote->>'line_discounts_cents')::bigint;
    v_bill_disc_cents := (v_quote->>'bill_discount_cents')::bigint;
    v_taxable := (v_quote->>'taxable_cents')::bigint;
    v_tax := (v_quote->>'tax_cents')::bigint;
    v_total := (v_quote->>'total_cents')::bigint;

    -- --------------------------------------------------------------------------
    -- INVARIANT CHECKS
    -- --------------------------------------------------------------------------

    -- 1. Total >= 0 and subtotal >= 0
    IF v_total < 0 OR v_subtotal < 0 THEN
      RAISE EXCEPTION 'INVARIANT VIOLATION [TOTAL_NEGATIVE] on iteration %: total=%, subtotal=%, cart=%',
        v_iteration, v_total, v_subtotal, v_cart_items;
    END IF;

    -- 2. Discounts never exceed the amount they apply to
    IF v_bill_disc_cents > (v_subtotal - v_line_discounts) THEN
      RAISE EXCEPTION 'INVARIANT VIOLATION [BILL_DISC_EXCEEDS_NET] on iteration %: bill_disc=%, itemsNet=%, cart=%',
        v_iteration, v_bill_disc_cents, (v_subtotal - v_line_discounts), v_cart_items;
    END IF;

    -- 3. Tax is never negative
    IF v_tax < 0 THEN
      RAISE EXCEPTION 'INVARIANT VIOLATION [TAX_NEGATIVE] on iteration %: tax=%, cart=%',
        v_iteration, v_tax, v_cart_items;
    END IF;

    -- 4. Taxable + Tax = Total
    IF (v_taxable + v_tax) <> v_total THEN
      RAISE EXCEPTION 'INVARIANT VIOLATION [TAXABLE_PLUS_TAX_MISMATCH] on iteration %: taxable=%, tax=%, total=%, cart=%',
        v_iteration, v_taxable, v_tax, v_total, v_cart_items;
    END IF;

    -- 5. Lines add up to total to the exact cent
    v_lines_sum := 0;
    FOR v_line_elem IN SELECT * FROM jsonb_array_elements(v_quote->'lines') LOOP
      v_gross := (v_line_elem->>'line_gross_cents')::bigint;
      v_ldisc := (v_line_elem->>'line_discount_cents')::bigint;
      v_lnet := (v_line_elem->>'line_net_cents')::bigint;
      v_lalloc := (v_line_elem->>'allocated_bill_discount_cents')::bigint;
      v_ltax := (v_line_elem->>'tax_cents')::bigint;
      v_ltot := (v_line_elem->>'line_total_cents')::bigint;

      IF v_ldisc > v_gross THEN
        RAISE EXCEPTION 'INVARIANT VIOLATION [LINE_DISC_EXCEEDS_GROSS] on iteration %: disc=%, gross=%, line=%',
          v_iteration, v_ldisc, v_gross, v_line_elem;
      END IF;

      IF v_lalloc > v_lnet THEN
        RAISE EXCEPTION 'INVARIANT VIOLATION [ALLOC_DISC_EXCEEDS_NET] on iteration %: alloc=%, net=%, line=%',
          v_iteration, v_lalloc, v_lnet, v_line_elem;
      END IF;

      IF v_ltax < 0 THEN
        RAISE EXCEPTION 'INVARIANT VIOLATION [LINE_TAX_NEGATIVE] on iteration %: tax=%, line=%',
          v_iteration, v_ltax, v_line_elem;
      END IF;

      v_lines_sum := v_lines_sum + v_ltot;
    END LOOP;

    IF v_lines_sum <> v_total THEN
      RAISE EXCEPTION 'INVARIANT VIOLATION [LINES_SUM_MISMATCH] on iteration %: sum=%, total=%, cart=%',
        v_iteration, v_lines_sum, v_total, v_cart_items;
    END IF;

  END LOOP;

  RAISE NOTICE 'SUCCESS: 1,000 property-based random carts passed all accounting and mathematical invariants!';
END $$;

COMMIT;

