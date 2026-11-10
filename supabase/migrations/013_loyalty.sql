-- Migration 013: Loyalty Points System & create_sale Integration
-- Description: Adds loyalty_enabled and loyalty_points_per_100_lkr to shop_settings,
-- creates the append-only customer_points_ledger, and replaces create_sale and get_bill
-- to award loyalty points atomically: floor(total / 10000 * rate).

-- ------------------------------------------------------------------------------
-- 1. ADD LOYALTY SETTINGS TO shop_settings
-- ------------------------------------------------------------------------------
ALTER TABLE shop_settings 
  ADD COLUMN IF NOT EXISTS loyalty_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE shop_settings 
  ADD COLUMN IF NOT EXISTS loyalty_points_per_100_lkr numeric(8,2) NOT NULL DEFAULT 1.00;

-- ------------------------------------------------------------------------------
-- 2. CREATE customer_points_ledger TABLE (APPEND-ONLY)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES sales(id) ON DELETE SET NULL,
  points int NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_points_ledger_customer 
  ON customer_points_ledger(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_points_ledger_sale 
  ON customer_points_ledger(sale_id);

ALTER TABLE customer_points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_points_ledger FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_points_ledger_select_policy ON customer_points_ledger;
CREATE POLICY customer_points_ledger_select_policy ON customer_points_ledger
  FOR SELECT TO authenticated
  USING (is_staff());

DROP POLICY IF EXISTS customer_points_ledger_insert_policy ON customer_points_ledger;
CREATE POLICY customer_points_ledger_insert_policy ON customer_points_ledger
  FOR INSERT TO authenticated
  WITH CHECK (is_staff());

REVOKE ALL ON customer_points_ledger FROM anon;
REVOKE UPDATE, DELETE ON customer_points_ledger FROM authenticated;
GRANT SELECT, INSERT ON customer_points_ledger TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. REPLACE get_bill WITH LOYALTY INFORMATION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_bill(p_sale_id uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_shop record;
  v_cashier_name text;
  v_customer record;
  v_lines jsonb;
  v_payments jsonb;
  v_points_earned int := 0;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_NOT_FOUND';
  END IF;

  SELECT shop_name, address, phone, vat_reg_no, receipt_footer, loyalty_enabled 
  INTO v_shop 
  FROM shop_settings 
  WHERE id = 1;

  SELECT full_name INTO v_cashier_name 
  FROM profiles 
  WHERE id = v_sale.cashier_id;

  SELECT id, name, phone, points_balance INTO v_customer 
  FROM customers 
  WHERE id = v_sale.customer_id;

  IF v_customer.id IS NOT NULL THEN
    SELECT COALESCE(points, 0) INTO v_points_earned
    FROM customer_points_ledger
    WHERE sale_id = v_sale.id
    LIMIT 1;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'product_id', product_id,
      'name', product_name_snapshot,
      'sku', sku_snapshot,
      'unit', unit_snapshot,
      'quantity', quantity,
      'unit_price_cents', unit_price_cents_snapshot,
      'line_discount_cents', line_discount_cents,
      'line_tax_cents', line_tax_cents,
      'line_total_cents', line_total_cents
    ) ORDER BY created_at ASC
  ) INTO v_lines
  FROM sale_items
  WHERE sale_id = p_sale_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'method', method,
      'amount_cents', amount_cents,
      'reference', reference
    ) ORDER BY created_at ASC
  ) INTO v_payments
  FROM payments
  WHERE sale_id = p_sale_id;

  RETURN jsonb_build_object(
    'id', v_sale.id,
    'bill_no', v_sale.bill_no,
    'idempotency_key', v_sale.idempotency_key,
    'date_time', to_char(v_sale.created_at AT TIME ZONE 'Asia/Colombo', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
    'status', v_sale.status,
    'print_count', v_sale.print_count,
    'is_duplicate', (v_sale.print_count >= 1),
    'shop', jsonb_build_object(
      'name', COALESCE(v_shop.shop_name, 'Wewala Store'),
      'address', COALESCE(v_shop.address, ''),
      'phone', COALESCE(v_shop.phone, ''),
      'vat_reg_no', v_shop.vat_reg_no,
      'footer', COALESCE(v_shop.receipt_footer, '')
    ),
    'cashier', jsonb_build_object(
      'id', v_sale.cashier_id,
      'name', COALESCE(v_cashier_name, 'Cashier')
    ),
    'customer', CASE 
      WHEN v_customer.id IS NOT NULL THEN jsonb_build_object(
        'id', v_customer.id,
        'name', v_customer.name,
        'phone', v_customer.phone,
        'points_balance', v_customer.points_balance,
        'points_earned', COALESCE(v_points_earned, 0)
      )
      ELSE NULL
    END,
    'lines', COALESCE(v_lines, '[]'::jsonb),
    'subtotal_cents', v_sale.subtotal_cents,
    'line_discount_cents', v_sale.line_discount_cents,
    'bill_discount_cents', v_sale.bill_discount_cents,
    'tax', jsonb_build_object(
      'rate_percent', v_sale.tax_rate_percent_snapshot,
      'mode', CASE WHEN v_sale.tax_inclusive_snapshot THEN 'inclusive' ELSE 'exclusive' END,
      'taxable_cents', v_sale.taxable_cents,
      'tax_cents', v_sale.tax_cents
    ),
    'total_cents', v_sale.total_cents,
    'payments', COALESCE(v_payments, '[]'::jsonb),
    'paid_cents', v_sale.paid_cents,
    'change_cents', v_sale.change_cents
  );
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 4. REPLACE create_sale WITH ATOMIC LOYALTY POINTS EARNING
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_sale(
  p_idempotency_key uuid,
  p_items jsonb,
  p_bill_discount jsonb,
  p_payments jsonb,
  p_customer_phone text DEFAULT NULL,
  p_customer_name text DEFAULT NULL
) RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_role user_role;
  v_user_active boolean;
  v_existing_sale_id uuid;
  v_calc jsonb;
  v_subtotal_cents bigint;
  v_line_discounts_total bigint;
  v_bill_discount_cents bigint;
  v_total_cents bigint;
  v_taxable_cents bigint;
  v_tax_cents_total bigint;
  v_tax_rate numeric(5,2);
  v_calc_lines jsonb;
  v_shop record;
  v_paid_cents bigint := 0;
  v_cash_cents bigint := 0;
  v_non_cash_cents bigint := 0;
  v_change_cents bigint := 0;
  v_remaining_after_cash bigint;
  v_pay_elem jsonb;
  v_pay_amount bigint;
  v_pay_method payment_method;
  v_colombo_date date;
  v_bill_seq int;
  v_bill_no text;
  v_customer_id uuid := NULL;
  v_customer_sms_opt_out boolean := false;
  v_norm_phone text := NULL;
  v_shift_id uuid := NULL;
  v_sale_id uuid;
  v_line_elem jsonb;
  v_sms_body text;
  v_batch_needed numeric(12,3);
  v_batch record;
  v_prod_stock numeric(12,3);
  v_track_exp boolean;
  v_points_earned int := 0;
BEGIN
  -- Mark execution context to permit inserts on sales and sale_items
  PERFORM set_config('app.in_create_sale', 'true', true);

  -- 1. Identity Check
  v_user_id := COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  SELECT role, is_active INTO v_user_role, v_user_active
  FROM profiles
  WHERE id = v_user_id;

  IF NOT FOUND OR NOT v_user_active THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  -- 2. Idempotency Check
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT:idempotency_key is required';
  END IF;

  SELECT id INTO v_existing_sale_id
  FROM sales
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN get_bill(v_existing_sale_id);
  END IF;

  -- 3. Calculate Bill with FOR UPDATE row locks (atomic single source of truth)
  v_calc := calc_bill(p_items, p_bill_discount, true);

  v_subtotal_cents := (v_calc->>'subtotal_cents')::bigint;
  v_line_discounts_total := (v_calc->>'line_discount_cents')::bigint;
  v_bill_discount_cents := (v_calc->>'bill_discount_cents')::bigint;
  v_total_cents := (v_calc->>'total_cents')::bigint;
  v_taxable_cents := (v_calc->'tax'->>'taxable_cents')::bigint;
  v_tax_cents_total := (v_calc->'tax'->>'tax_cents')::bigint;
  v_tax_rate := (v_calc->'tax'->>'rate_percent')::numeric;
  v_calc_lines := v_calc->'lines';

  SELECT * INTO v_shop FROM shop_settings WHERE id = 1;

  -- 4. Validate Payments
  IF p_payments IS NULL OR jsonb_array_length(p_payments) = 0 THEN
    IF v_total_cents > 0 THEN
      RAISE EXCEPTION 'INVALID_PAYMENT:Payment required for non-zero total';
    END IF;
  ELSE
    FOR v_pay_elem IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
      v_pay_amount := (v_pay_elem->>'amount_cents')::bigint;
      IF v_pay_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_PAYMENT:Payment amount must be greater than zero';
      END IF;

      v_pay_method := (v_pay_elem->>'method')::payment_method;
      IF v_pay_method = 'cash' THEN
        v_cash_cents := v_cash_cents + v_pay_amount;
      ELSE
        v_non_cash_cents := v_non_cash_cents + v_pay_amount;
      END IF;

      v_paid_cents := v_paid_cents + v_pay_amount;
    END LOOP;
  END IF;

  IF v_paid_cents < v_total_cents THEN
    RAISE EXCEPTION 'PAYMENT_UNDERPAID:%:%', v_total_cents, v_paid_cents;
  END IF;

  v_remaining_after_cash := GREATEST(0, v_total_cents - v_cash_cents);
  IF v_non_cash_cents > v_remaining_after_cash THEN
    RAISE EXCEPTION 'PAYMENT_EXCEEDS_REMAINING:%:%', v_remaining_after_cash, v_non_cash_cents;
  END IF;

  v_change_cents := v_paid_cents - v_total_cents;

  -- 5. Gapless Daily Bill Number
  v_colombo_date := (now() AT TIME ZONE 'Asia/Colombo')::date;

  INSERT INTO bill_counters (bill_date, last_number)
  VALUES (v_colombo_date, 1)
  ON CONFLICT (bill_date)
  DO UPDATE SET last_number = bill_counters.last_number + 1
  RETURNING last_number INTO v_bill_seq;

  v_bill_no := 'WWL-' || to_char(v_colombo_date, 'YYYYMMDD') || '-' || lpad(v_bill_seq::text, 4, '0');

  -- 6. Customer Upsert
  IF p_customer_phone IS NOT NULL AND trim(p_customer_phone) <> '' THEN
    v_norm_phone := normalize_phone_number(p_customer_phone);

    INSERT INTO customers (name, phone)
    VALUES (
      COALESCE(NULLIF(trim(p_customer_name), ''), 'Customer ' || right(v_norm_phone, 4)),
      v_norm_phone
    )
    ON CONFLICT (phone) DO UPDATE SET
      name = COALESCE(NULLIF(trim(EXCLUDED.name), ''), customers.name)
    RETURNING id, sms_opt_out INTO v_customer_id, v_customer_sms_opt_out;
  END IF;

  -- 7. Cashier Shift
  SELECT id INTO v_shift_id
  FROM shifts
  WHERE cashier_id = v_user_id AND status = 'open'
  LIMIT 1;

  -- 8. Insert Sale
  INSERT INTO sales (
    bill_no,
    idempotency_key,
    shift_id,
    cashier_id,
    customer_id,
    customer_phone,
    status,
    subtotal_cents,
    line_discount_cents,
    bill_discount_cents,
    taxable_cents,
    tax_cents,
    total_cents,
    tax_rate_percent_snapshot,
    tax_inclusive_snapshot,
    paid_cents,
    change_cents,
    print_count,
    created_at
  ) VALUES (
    v_bill_no,
    p_idempotency_key,
    v_shift_id,
    v_user_id,
    v_customer_id,
    v_norm_phone,
    'completed',
    v_subtotal_cents,
    v_line_discounts_total,
    v_bill_discount_cents,
    v_taxable_cents,
    v_tax_cents_total,
    v_total_cents,
    v_tax_rate,
    v_shop.tax_inclusive,
    v_paid_cents,
    v_change_cents,
    0,
    now()
  )
  RETURNING id INTO v_sale_id;

  -- 8b. Award Loyalty Points (if loyalty enabled & customer identified)
  -- Formula: floor(total / 10000 * rate) where total is in cents (10000 cents = 100 LKR)
  IF v_customer_id IS NOT NULL AND v_shop.loyalty_enabled AND v_shop.loyalty_points_per_100_lkr > 0 THEN
    v_points_earned := floor((v_total_cents::numeric / 10000.0) * v_shop.loyalty_points_per_100_lkr)::int;
    IF v_points_earned > 0 THEN
      INSERT INTO customer_points_ledger (customer_id, sale_id, points, reason)
      VALUES (v_customer_id, v_sale_id, v_points_earned, 'Sale ' || v_bill_no);

      UPDATE customers
      SET points_balance = points_balance + v_points_earned
      WHERE id = v_customer_id;
    END IF;
  END IF;

  -- 9. Insert Sale Items
  FOR v_line_elem IN SELECT * FROM jsonb_array_elements(v_calc_lines) LOOP
    INSERT INTO sale_items (
      sale_id,
      product_id,
      product_name_snapshot,
      sku_snapshot,
      unit_snapshot,
      quantity,
      unit_price_cents_snapshot,
      unit_cost_cents_snapshot,
      line_discount_cents,
      line_tax_cents,
      line_total_cents,
      created_at
    ) VALUES (
      v_sale_id,
      (v_line_elem->>'product_id')::uuid,
      v_line_elem->>'name',
      v_line_elem->>'sku',
      v_line_elem->>'unit',
      (v_line_elem->>'quantity')::numeric(12,3),
      (v_line_elem->>'unit_price_cents')::bigint,
      (v_line_elem->>'cost_price_cents')::bigint,
      (v_line_elem->>'line_discount_cents')::bigint + (v_line_elem->>'allocated_bill_discount_cents')::bigint,
      (v_line_elem->>'line_tax_cents')::bigint,
      (v_line_elem->>'line_total_cents')::bigint,
      now()
    );
  END LOOP;

  -- 10. Insert Payments
  IF p_payments IS NOT NULL AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_pay_elem IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
      INSERT INTO payments (
        sale_id,
        method,
        amount_cents,
        reference,
        created_at
      ) VALUES (
        v_sale_id,
        (v_pay_elem->>'method')::payment_method,
        (v_pay_elem->>'amount_cents')::bigint,
        v_pay_elem->>'reference',
        now()
      );
    END LOOP;
  END IF;

  -- 11. Deduct Stock and FEFO Batches
  FOR v_line_elem IN SELECT * FROM jsonb_array_elements(v_calc_lines) LOOP
    UPDATE products
    SET stock_qty = stock_qty - (v_line_elem->>'quantity')::numeric(12,3)
    WHERE id = (v_line_elem->>'product_id')::uuid
    RETURNING stock_qty, track_expiry INTO v_prod_stock, v_track_exp;

    INSERT INTO stock_movements (
      product_id,
      movement_type,
      qty_change,
      qty_after,
      reference_type,
      reference_id,
      reason,
      created_by,
      created_at
    ) VALUES (
      (v_line_elem->>'product_id')::uuid,
      'sale',
      -((v_line_elem->>'quantity')::numeric(12,3)),
      v_prod_stock,
      'sale',
      v_sale_id,
      'Sale ' || v_bill_no,
      v_user_id,
      now()
    );

    IF v_track_exp THEN
      v_batch_needed := (v_line_elem->>'quantity')::numeric(12,3);

      FOR v_batch IN 
        SELECT id, qty_remaining 
        FROM stock_batches 
        WHERE product_id = (v_line_elem->>'product_id')::uuid AND qty_remaining > 0 
        ORDER BY expiry_date ASC, created_at ASC 
        FOR UPDATE
      LOOP
        IF v_batch.qty_remaining >= v_batch_needed THEN
          UPDATE stock_batches 
          SET qty_remaining = qty_remaining - v_batch_needed 
          WHERE id = v_batch.id;
          v_batch_needed := 0;
          EXIT;
        ELSE
          v_batch_needed := v_batch_needed - v_batch.qty_remaining;
          UPDATE stock_batches 
          SET qty_remaining = 0 
          WHERE id = v_batch.id;
        END IF;
      END LOOP;

      IF v_batch_needed > 0 THEN
        RAISE EXCEPTION 'BATCH_MISMATCH:%', v_line_elem->>'sku';
      END IF;
    END IF;
  END LOOP;

  -- 12. Queue SMS
  IF v_shop.sms_enabled AND v_norm_phone IS NOT NULL AND NOT v_customer_sms_opt_out THEN
    v_sms_body := replace(
      replace(
        replace(
          COALESCE(v_shop.sms_template, 'Thank you for shopping at {shop_name}. Bill: {bill_no}, Total: {total}.'),
          '{shop_name}', v_shop.shop_name
        ),
        '{bill_no}', v_bill_no
      ),
      '{total}', 'Rs. ' || to_char(v_total_cents / 100.0, 'FM999,999,990.00')
    );

    INSERT INTO sms_outbox (sale_id, phone, message, status)
    VALUES (v_sale_id, v_norm_phone, v_sms_body, 'pending');
  END IF;

  -- 13. Audit Log
  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
  VALUES (
    v_user_id,
    'sale.create',
    'sales',
    v_sale_id::text,
    jsonb_build_object(
      'bill_no', v_bill_no,
      'total_cents', v_total_cents,
      'paid_cents', v_paid_cents,
      'points_earned', v_points_earned,
      'items_count', jsonb_array_length(v_calc_lines)
    )
  );

  RETURN get_bill(v_sale_id);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_bill TO authenticated, anon;
GRANT EXECUTE ON FUNCTION create_sale TO authenticated, anon;

