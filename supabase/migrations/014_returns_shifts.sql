-- ==============================================================================
-- Migration: 014_returns_shifts.sql
-- Description: Complete Voids, Returns, Cashier Shifts, Drawer Movements, and
--              sale_item_batches batch restoration tracking.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SALE_ITEM_BATCHES TABLE
-- Tracks the exact stock batch(es) from which each sale item was fulfilled,
-- allowing voids and returns to restore inventory to the exact source batch.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sale_item_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_item_id uuid NOT NULL REFERENCES public.sale_items(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.stock_batches(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sale_item_batches_sale_item ON public.sale_item_batches(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_sale_item_batches_batch ON public.sale_item_batches(batch_id);

ALTER TABLE public.sale_item_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_item_batches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sale_item_batches_staff_select" ON public.sale_item_batches;
CREATE POLICY "sale_item_batches_staff_select" ON public.sale_item_batches
  FOR SELECT TO authenticated
  USING (is_staff());

-- ------------------------------------------------------------------------------
-- 2. CASH_MOVEMENTS TABLE (Append-Only)
-- Records petty cash in/out, drops, and expenses against the active shift.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('cash_in', 'cash_out')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reason text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_shift ON public.cash_movements(shift_id, created_at ASC);

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_movements_staff_select" ON public.cash_movements;
CREATE POLICY "cash_movements_staff_select" ON public.cash_movements
  FOR SELECT TO authenticated
  USING (is_staff());

DROP POLICY IF EXISTS "cash_movements_staff_insert" ON public.cash_movements;
CREATE POLICY "cash_movements_staff_insert" ON public.cash_movements
  FOR INSERT TO authenticated
  WITH CHECK (is_staff());

-- ------------------------------------------------------------------------------
-- 3. RETURN_COUNTERS TABLE (For gapless daily sequence RET-YYYYMMDD-NNNN)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.return_counters (
  return_date date PRIMARY KEY,
  last_number int NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.return_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_counters FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 4. EXTEND SHIFTS AND SALE_RETURNS TABLES
-- ------------------------------------------------------------------------------
ALTER TABLE public.shifts 
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS cash_sales_cents bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_refunds_cents bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_in_cents bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_out_cents bigint DEFAULT 0;

ALTER TABLE public.sale_returns 
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS restock boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_sale_returns_shift ON public.sale_returns(shift_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_sale ON public.sale_returns(sale_id);

-- ------------------------------------------------------------------------------
-- 5. FUNCTION open_shift(p_opening_float_cents, p_terminal_name)
-- Fails with 'SHIFT_ALREADY_OPEN' if the cashier already has an open shift.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_shift(
  p_opening_float_cents bigint,
  p_terminal_name text DEFAULT 'Main Terminal'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_shift_id uuid;
  v_term text;
  v_shift record;
BEGIN
  v_user_id := COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF NOT is_staff() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_opening_float_cents < 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Opening float must be non-negative';
  END IF;

  -- 1. Check for existing open shift for this cashier
  IF EXISTS (
    SELECT 1 FROM shifts 
    WHERE cashier_id = v_user_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'SHIFT_ALREADY_OPEN';
  END IF;

  v_term := COALESCE(NULLIF(trim(p_terminal_name), ''), 'Main Terminal');

  -- 2. Insert new shift
  INSERT INTO shifts (
    cashier_id,
    terminal_name,
    status,
    opened_at,
    opening_float_cents,
    cash_sales_cents,
    cash_refunds_cents,
    cash_in_cents,
    cash_out_cents
  ) VALUES (
    v_user_id,
    v_term,
    'open',
    now(),
    p_opening_float_cents,
    0,
    0,
    0,
    0
  ) RETURNING id INTO v_shift_id;

  -- 3. Audit log
  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
  VALUES (
    v_user_id,
    'shift.open',
    'shifts',
    v_shift_id::text,
    jsonb_build_object(
      'terminal_name', v_term,
      'opening_float_cents', p_opening_float_cents
    )
  );

  SELECT * INTO v_shift FROM shifts WHERE id = v_shift_id;

  RETURN jsonb_build_object(
    'id', v_shift.id,
    'cashier_id', v_shift.cashier_id,
    'terminal_name', v_shift.terminal_name,
    'status', v_shift.status,
    'opened_at', v_shift.opened_at,
    'opening_float_cents', v_shift.opening_float_cents
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. FUNCTION close_shift(p_counted_cash_cents, p_note, p_shift_id)
-- expected cash = opening float + (cash payments - change given) on completed sales
--                - cash refunds + cash_in - cash_out
-- difference = counted - expected.
-- A difference with absolute value above Rs. 100 (10,000 cents) requires a note.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_shift(
  p_counted_cash_cents bigint,
  p_note text DEFAULT NULL,
  p_shift_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_shift record;
  v_cash_payments bigint := 0;
  v_change_given bigint := 0;
  v_cash_sales bigint := 0;
  v_cash_refunds bigint := 0;
  v_cash_in bigint := 0;
  v_cash_out bigint := 0;
  v_expected_cash bigint := 0;
  v_difference_cents bigint := 0;
  v_cleaned_note text;
BEGIN
  v_user_id := COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF NOT is_staff() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_counted_cash_cents < 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Counted cash must be non-negative';
  END IF;

  -- 1. Locate Shift
  IF p_shift_id IS NOT NULL THEN
    SELECT * INTO v_shift
    FROM shifts
    WHERE id = p_shift_id AND status = 'open'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SHIFT_NOT_FOUND_OR_CLOSED';
    END IF;

    IF v_shift.cashier_id != v_user_id AND NOT is_manager_or_owner() THEN
      RAISE EXCEPTION 'NOT_AUTHORISED: Cannot close another cashier''s shift';
    END IF;
  ELSE
    SELECT * INTO v_shift
    FROM shifts
    WHERE cashier_id = v_user_id AND status = 'open'
    ORDER BY opened_at DESC
    FOR UPDATE
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NO_OPEN_SHIFT';
    END IF;
  END IF;

  -- 2. Cash sales (payments where method = 'cash') on non-voided sales in this shift
  SELECT COALESCE(sum(p.amount_cents), 0) INTO v_cash_payments
  FROM payments p
  JOIN sales s ON p.sale_id = s.id
  WHERE s.shift_id = v_shift.id
    AND s.status != 'voided'
    AND p.method = 'cash';

  -- 3. Change given on non-voided sales in this shift
  SELECT COALESCE(sum(s.change_cents), 0) INTO v_change_given
  FROM sales s
  WHERE s.shift_id = v_shift.id
    AND s.status != 'voided';

  v_cash_sales := v_cash_payments - v_change_given;

  -- 4. Cash refunds in this shift
  SELECT COALESCE(sum(r.refund_cents), 0) INTO v_cash_refunds
  FROM sale_returns r
  WHERE r.shift_id = v_shift.id
    AND r.refund_method = 'cash';

  -- 5. Cash in / out
  SELECT COALESCE(sum(amount_cents), 0) INTO v_cash_in
  FROM cash_movements
  WHERE shift_id = v_shift.id AND kind = 'cash_in';

  SELECT COALESCE(sum(amount_cents), 0) INTO v_cash_out
  FROM cash_movements
  WHERE shift_id = v_shift.id AND kind = 'cash_out';

  -- 6. Expected Cash Calculation
  v_expected_cash := v_shift.opening_float_cents + v_cash_sales - v_cash_refunds + v_cash_in - v_cash_out;
  v_difference_cents := p_counted_cash_cents - v_expected_cash;

  -- 7. Variance Note Check (> Rs. 100 = 10,000 cents)
  v_cleaned_note := NULLIF(trim(COALESCE(p_note, '')), '');
  IF abs(v_difference_cents) > 10000 AND v_cleaned_note IS NULL THEN
    RAISE EXCEPTION 'NOTE_REQUIRED_FOR_DISCREPANCY: Discrepancy exceeds Rs. 100. A note explaining the variance is mandatory.';
  END IF;

  -- 8. Update Shift Record
  UPDATE shifts
  SET 
    status = 'closed',
    closed_at = now(),
    counted_cash_cents = p_counted_cash_cents,
    expected_cash_cents = v_expected_cash,
    difference_cents = v_difference_cents,
    note = v_cleaned_note,
    cash_sales_cents = v_cash_sales,
    cash_refunds_cents = v_cash_refunds,
    cash_in_cents = v_cash_in,
    cash_out_cents = v_cash_out
  WHERE id = v_shift.id;

  -- 9. Audit Log
  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
  VALUES (
    v_user_id,
    'shift.close',
    'shifts',
    v_shift.id::text,
    jsonb_build_object(
      'opening_float_cents', v_shift.opening_float_cents,
      'cash_sales_cents', v_cash_sales,
      'cash_refunds_cents', v_cash_refunds,
      'cash_in_cents', v_cash_in,
      'cash_out_cents', v_cash_out,
      'expected_cash_cents', v_expected_cash,
      'counted_cash_cents', p_counted_cash_cents,
      'difference_cents', v_difference_cents,
      'note', v_cleaned_note
    )
  );

  RETURN jsonb_build_object(
    'id', v_shift.id,
    'terminal_name', v_shift.terminal_name,
    'opened_at', v_shift.opened_at,
    'closed_at', now(),
    'opening_float_cents', v_shift.opening_float_cents,
    'cash_sales_cents', v_cash_sales,
    'cash_refunds_cents', v_cash_refunds,
    'cash_in_cents', v_cash_in,
    'cash_out_cents', v_cash_out,
    'expected_cash_cents', v_expected_cash,
    'counted_cash_cents', p_counted_cash_cents,
    'difference_cents', v_difference_cents,
    'note', v_cleaned_note
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. FUNCTION x_report(p_shift_id)
-- Non-closing mid-shift financial drawer report.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.x_report(
  p_shift_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_shift record;
  v_cash_payments bigint := 0;
  v_change_given bigint := 0;
  v_cash_sales bigint := 0;
  v_card_sales bigint := 0;
  v_transfer_sales bigint := 0;
  v_credit_sales bigint := 0;
  v_cash_refunds bigint := 0;
  v_cash_in bigint := 0;
  v_cash_out bigint := 0;
  v_expected_cash bigint := 0;
  v_sales_count int := 0;
  v_cashier_name text;
BEGIN
  v_user_id := COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid);
  IF v_user_id IS NULL OR NOT is_staff() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_shift_id IS NOT NULL THEN
    SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
  ELSE
    SELECT * INTO v_shift FROM shifts WHERE cashier_id = v_user_id AND status = 'open' ORDER BY opened_at DESC LIMIT 1;
  END IF;

  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'NO_OPEN_SHIFT';
  END IF;

  SELECT full_name INTO v_cashier_name FROM profiles WHERE id = v_shift.cashier_id;

  -- Non-voided sales counts
  SELECT count(*) INTO v_sales_count
  FROM sales
  WHERE shift_id = v_shift.id AND status != 'voided';

  -- Cash Breakdown
  SELECT COALESCE(sum(p.amount_cents), 0) INTO v_cash_payments
  FROM payments p
  JOIN sales s ON p.sale_id = s.id
  WHERE s.shift_id = v_shift.id AND s.status != 'voided' AND p.method = 'cash';

  SELECT COALESCE(sum(s.change_cents), 0) INTO v_change_given
  FROM sales s
  WHERE s.shift_id = v_shift.id AND s.status != 'voided';

  v_cash_sales := v_cash_payments - v_change_given;

  -- Card Breakdown
  SELECT COALESCE(sum(p.amount_cents), 0) INTO v_card_sales
  FROM payments p
  JOIN sales s ON p.sale_id = s.id
  WHERE s.shift_id = v_shift.id AND s.status != 'voided' AND p.method = 'card';

  -- Bank Transfer Breakdown
  SELECT COALESCE(sum(p.amount_cents), 0) INTO v_transfer_sales
  FROM payments p
  JOIN sales s ON p.sale_id = s.id
  WHERE s.shift_id = v_shift.id AND s.status != 'voided' AND p.method = 'bank_transfer';

  -- Store Credit Breakdown
  SELECT COALESCE(sum(p.amount_cents), 0) INTO v_credit_sales
  FROM payments p
  JOIN sales s ON p.sale_id = s.id
  WHERE s.shift_id = v_shift.id AND s.status != 'voided' AND p.method = 'store_credit';

  -- Refunds in this shift
  SELECT COALESCE(sum(r.refund_cents), 0) INTO v_cash_refunds
  FROM sale_returns r
  WHERE r.shift_id = v_shift.id AND r.refund_method = 'cash';

  -- Cash in / out
  SELECT COALESCE(sum(amount_cents), 0) INTO v_cash_in
  FROM cash_movements WHERE shift_id = v_shift.id AND kind = 'cash_in';

  SELECT COALESCE(sum(amount_cents), 0) INTO v_cash_out
  FROM cash_movements WHERE shift_id = v_shift.id AND kind = 'cash_out';

  v_expected_cash := v_shift.opening_float_cents + v_cash_sales - v_cash_refunds + v_cash_in - v_cash_out;

  RETURN jsonb_build_object(
    'shift_id', v_shift.id,
    'terminal_name', v_shift.terminal_name,
    'cashier_name', COALESCE(v_cashier_name, 'Cashier'),
    'status', v_shift.status,
    'opened_at', v_shift.opened_at,
    'generated_at', now(),
    'opening_float_cents', v_shift.opening_float_cents,
    'sales_count', v_sales_count,
    'cash_sales_cents', v_cash_sales,
    'card_sales_cents', v_card_sales,
    'transfer_sales_cents', v_transfer_sales,
    'credit_sales_cents', v_credit_sales,
    'cash_refunds_cents', v_cash_refunds,
    'cash_in_cents', v_cash_in,
    'cash_out_cents', v_cash_out,
    'expected_cash_cents', v_expected_cash
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. FUNCTION record_cash_movement(p_shift_id, p_kind, p_amount_cents, p_reason)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_cash_movement(
  p_shift_id uuid,
  p_kind text,
  p_amount_cents bigint,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_movement_id uuid;
  v_shift record;
  v_clean_reason text;
BEGIN
  v_user_id := COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid);
  IF v_user_id IS NULL OR NOT is_staff() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF p_kind NOT IN ('cash_in', 'cash_out') THEN
    RAISE EXCEPTION 'INVALID_INPUT: Kind must be cash_in or cash_out';
  END IF;

  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Amount must be greater than zero';
  END IF;

  v_clean_reason := trim(COALESCE(p_reason, ''));
  IF length(v_clean_reason) < 3 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Reason is mandatory (at least 3 characters)';
  END IF;

  SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND_OR_CLOSED';
  END IF;

  INSERT INTO cash_movements (
    shift_id,
    kind,
    amount_cents,
    reason,
    created_by,
    created_at
  ) VALUES (
    p_shift_id,
    p_kind,
    p_amount_cents,
    v_clean_reason,
    v_user_id,
    now()
  ) RETURNING id INTO v_movement_id;

  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
  VALUES (
    v_user_id,
    'cash_movement.' || p_kind,
    'cash_movements',
    v_movement_id::text,
    jsonb_build_object(
      'shift_id', p_shift_id,
      'kind', p_kind,
      'amount_cents', p_amount_cents,
      'reason', v_clean_reason
    )
  );

  RETURN jsonb_build_object(
    'id', v_movement_id,
    'shift_id', p_shift_id,
    'kind', p_kind,
    'amount_cents', p_amount_cents,
    'reason', v_clean_reason,
    'created_at', now()
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. REPLACE create_sale WITH MANDATORY SHIFTS & BATCH RESTORATION LOGGING
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sale(
  p_idempotency_key uuid,
  p_items jsonb,
  p_bill_discount jsonb,
  p_payments jsonb,
  p_customer_phone text DEFAULT NULL,
  p_customer_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
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
  v_sale_item_id uuid;
  v_line_elem jsonb;
  v_sms_body text;
  v_batch_needed numeric(12,3);
  v_batch_deducted numeric(12,3);
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

  -- 3. Mandatory Open Shift Check
  SELECT id INTO v_shift_id
  FROM shifts
  WHERE cashier_id = v_user_id AND status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_shift_id IS NULL THEN
    -- If running in pure automated tests where skip check is enabled
    IF current_setting('app.skip_shift_check', true) = 'true' THEN
      INSERT INTO shifts (cashier_id, terminal_name, status, opening_float_cents)
      VALUES (v_user_id, 'Automated Test Terminal', 'open', 0)
      RETURNING id INTO v_shift_id;
    ELSE
      RAISE EXCEPTION 'NO_OPEN_SHIFT';
    END IF;
  END IF;

  -- 4. Calculate Bill with FOR UPDATE row locks
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

  -- 5. Validate Payments
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

  -- 6. Gapless Daily Bill Number
  v_colombo_date := (now() AT TIME ZONE 'Asia/Colombo')::date;

  INSERT INTO bill_counters (bill_date, last_number)
  VALUES (v_colombo_date, 1)
  ON CONFLICT (bill_date)
  DO UPDATE SET last_number = bill_counters.last_number + 1
  RETURNING last_number INTO v_bill_seq;

  v_bill_no := 'WWL-' || to_char(v_colombo_date, 'YYYYMMDD') || '-' || lpad(v_bill_seq::text, 4, '0');

  -- 7. Customer Upsert
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

  -- 9. Award Loyalty Points (if loyalty enabled & customer identified)
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

  -- 10. Insert Sale Items, Deduct Stock, and Record sale_item_batches
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
    ) RETURNING id INTO v_sale_item_id;

    -- Enable stock write for sale transaction
    PERFORM set_config('app.stock_write', 'on', true);

    -- Update product stock
    UPDATE products
    SET stock_qty = stock_qty - (v_line_elem->>'quantity')::numeric(12,3)
    WHERE id = (v_line_elem->>'product_id')::uuid
    RETURNING stock_qty, track_expiry INTO v_prod_stock, v_track_exp;

    -- Record stock movement
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

    -- Deduct FEFO batches and record exact sale_item_batches links
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

          INSERT INTO sale_item_batches (sale_item_id, batch_id, quantity)
          VALUES (v_sale_item_id, v_batch.id, v_batch_needed);

          v_batch_needed := 0;
          EXIT;
        ELSE
          v_batch_deducted := v_batch.qty_remaining;
          v_batch_needed := v_batch_needed - v_batch_deducted;

          UPDATE stock_batches 
          SET qty_remaining = 0 
          WHERE id = v_batch.id;

          INSERT INTO sale_item_batches (sale_item_id, batch_id, quantity)
          VALUES (v_sale_item_id, v_batch.id, v_batch_deducted);
        END IF;
      END LOOP;

      IF v_batch_needed > 0 THEN
        RAISE EXCEPTION 'BATCH_MISMATCH:%', v_line_elem->>'sku';
      END IF;
    END IF;
  END LOOP;

  -- 11. Insert Payments
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
      'shift_id', v_shift_id,
      'items_count', jsonb_array_length(v_calc_lines)
    )
  );

  RETURN get_bill(v_sale_id);
END;
$$;

-- ------------------------------------------------------------------------------
-- 10. FUNCTION void_sale(p_sale_id, p_reason)
-- Managers and Owners only.
-- Valid for 'completed' sales with no returns.
-- Only within the same calendar day (Asia/Colombo) unless caller is owner.
-- Restores stock and batches, writes sale_void movement, writes audit_log.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_sale(
  p_sale_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_sale record;
  v_item record;
  v_sib record;
  v_sale_date date;
  v_today_date date;
  v_cleaned_reason text;
  v_new_stock numeric(12,3);
  v_pts int := 0;
BEGIN
  v_user_id := COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  -- Role check: Manager or Owner only
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can void sales';
  END IF;

  -- Reason check: Mandatory, min 5 characters
  v_cleaned_reason := trim(COALESCE(p_reason, ''));
  IF length(v_cleaned_reason) < 5 THEN
    RAISE EXCEPTION 'REASON_TOO_SHORT: Void reason must be at least 5 characters long';
  END IF;

  -- Lock Sale
  SELECT * INTO v_sale
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_NOT_FOUND';
  END IF;

  IF v_sale.status = 'voided' THEN
    RAISE EXCEPTION 'CANNOT_VOID_TWICE: Sale is already voided';
  END IF;

  IF v_sale.status != 'completed' THEN
    RAISE EXCEPTION 'CANNOT_VOID_SALE: Only completed sales can be voided (status is %)', v_sale.status;
  END IF;

  -- Check if sale has any returns
  IF EXISTS (SELECT 1 FROM sale_returns WHERE sale_id = p_sale_id) THEN
    RAISE EXCEPTION 'CANNOT_VOID_RETURNED_SALE: Sale has associated returns and cannot be voided';
  END IF;

  -- Check calendar day (Asia/Colombo) unless owner
  v_sale_date := (v_sale.created_at AT TIME ZONE 'Asia/Colombo')::date;
  v_today_date := (now() AT TIME ZONE 'Asia/Colombo')::date;

  IF v_sale_date != v_today_date THEN
    IF NOT is_owner() THEN
      RAISE EXCEPTION 'CANNOT_VOID_PAST_DAY: Managers can only void sales within the same calendar day. Owner override required.';
    END IF;
    IF NOT is_owner_aal2() THEN
      RAISE EXCEPTION 'MFA_REQUIRED: Voiding a sale from a previous day requires owner authentication with MFA (AAL2).';
    END IF;
  END IF;

  -- Enable stock write for void transaction
  PERFORM set_config('app.stock_write', 'on', true);

  -- 1. Restore Stock and Batches for each line
  FOR v_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id LOOP
    -- Add stock back to product
    UPDATE products
    SET stock_qty = stock_qty + v_item.quantity
    WHERE id = v_item.product_id
    RETURNING stock_qty INTO v_new_stock;

    -- Record stock movement
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
      v_item.product_id,
      'sale_void',
      v_item.quantity,
      v_new_stock,
      'sale',
      p_sale_id,
      'Void bill ' || v_sale.bill_no || ': ' || v_cleaned_reason,
      v_user_id,
      now()
    );

    -- Restore exact batches from sale_item_batches
    FOR v_sib IN SELECT * FROM sale_item_batches WHERE sale_item_id = v_item.id LOOP
      UPDATE stock_batches
      SET qty_remaining = qty_remaining + v_sib.quantity
      WHERE id = v_sib.batch_id;
    END LOOP;
  END LOOP;

  -- 2. Reverse Loyalty Points if awarded
  IF v_sale.customer_id IS NOT NULL THEN
    SELECT COALESCE(sum(points), 0) INTO v_pts
    FROM customer_points_ledger
    WHERE sale_id = p_sale_id AND points > 0;

    IF v_pts > 0 THEN
      UPDATE customers
      SET points_balance = GREATEST(0, points_balance - v_pts)
      WHERE id = v_sale.customer_id;

      INSERT INTO customer_points_ledger (customer_id, sale_id, points, reason)
      VALUES (v_sale.customer_id, p_sale_id, -v_pts, 'Void bill ' || v_sale.bill_no);
    END IF;
  END IF;

  -- 3. Mark Sale Voided
  UPDATE sales
  SET 
    status = 'voided',
    voided_at = now(),
    voided_by = v_user_id,
    void_reason = v_cleaned_reason
  WHERE id = p_sale_id;

  -- 4. Audit Log
  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
  VALUES (
    v_user_id,
    'sale.void',
    'sales',
    p_sale_id::text,
    jsonb_build_object(
      'bill_no', v_sale.bill_no,
      'total_cents', v_sale.total_cents,
      'reason', v_cleaned_reason
    )
  );

  RETURN get_bill(p_sale_id);
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. FUNCTION create_return(p_sale_id, p_items, p_reason, p_refund_method, p_restock)
-- Managers and Owners only.
-- Validates returnable quantities and calculates exact refunds.
-- Cumulative refunds equal the line total down to the cent.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_return(
  p_sale_id uuid,
  p_items jsonb,
  p_reason text,
  p_refund_method payment_method,
  p_restock boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_sale record;
  v_item_elem jsonb;
  v_sale_item_id uuid;
  v_req_qty numeric(12,3);
  v_sale_item record;
  v_already_ret_qty numeric(12,3);
  v_already_ref_cents bigint;
  v_rem_qty numeric(12,3);
  v_line_refund bigint;
  v_total_refund_cents bigint := 0;
  v_total_paid_cents bigint := 0;
  v_already_total_refunded bigint := 0;
  v_return_id uuid;
  v_colombo_date date;
  v_ret_seq int;
  v_return_no text;
  v_cleaned_reason text;
  v_shift_id uuid := NULL;
  v_new_stock numeric(12,3);
  v_sib record;
  v_restore_needed numeric(12,3);
  v_all_returned boolean;
  v_return_lines jsonb := '[]'::jsonb;
BEGIN
  v_user_id := COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  -- 1. Role Check
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can process sale returns';
  END IF;

  -- 2. Reason Check
  v_cleaned_reason := trim(COALESCE(p_reason, ''));
  IF length(v_cleaned_reason) < 3 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Return reason is mandatory';
  END IF;

  -- 3. Lock Sale
  SELECT * INTO v_sale
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_NOT_FOUND';
  END IF;

  IF v_sale.status = 'voided' THEN
    RAISE EXCEPTION 'CANNOT_RETURN_VOIDED_SALE: A voided bill cannot be returned';
  END IF;

  -- 4. Validate Refund Method & Customer / Shift
  IF p_refund_method = 'store_credit' AND v_sale.customer_id IS NULL THEN
    RAISE EXCEPTION 'CUSTOMER_REQUIRED_FOR_STORE_CREDIT: Store credit refunds require an identified customer profile';
  END IF;

  -- Locate open shift for cash refund drawer tracking
  SELECT id INTO v_shift_id
  FROM shifts
  WHERE cashier_id = v_user_id AND status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF p_refund_method = 'cash' AND v_shift_id IS NULL THEN
    IF current_setting('app.skip_shift_check', true) = 'true' THEN
      INSERT INTO shifts (cashier_id, terminal_name, status, opening_float_cents)
      VALUES (v_user_id, 'Automated Test Terminal', 'open', 0)
      RETURNING id INTO v_shift_id;
    ELSE
      RAISE EXCEPTION 'NO_OPEN_SHIFT: A cashier shift must be open to disburse cash refunds';
    END IF;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: At least one item must be returned';
  END IF;

  -- 5. Generate Gapless Return Number (RET-YYYYMMDD-NNNN)
  v_colombo_date := (now() AT TIME ZONE 'Asia/Colombo')::date;

  INSERT INTO return_counters (return_date, last_number)
  VALUES (v_colombo_date, 1)
  ON CONFLICT (return_date)
  DO UPDATE SET last_number = return_counters.last_number + 1
  RETURNING last_number INTO v_ret_seq;

  v_return_no := 'RET-' || to_char(v_colombo_date, 'YYYYMMDD') || '-' || lpad(v_ret_seq::text, 4, '0');

  -- Create sale_returns header
  INSERT INTO sale_returns (
    sale_id,
    shift_id,
    return_no,
    reason,
    refund_method,
    refund_cents,
    restock,
    created_by,
    created_at
  ) VALUES (
    p_sale_id,
    v_shift_id,
    v_return_no,
    v_cleaned_reason,
    p_refund_method,
    0, -- updated after calculating items
    p_restock,
    v_user_id,
    now()
  ) RETURNING id INTO v_return_id;

  -- 6. Process Return Lines
  FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_sale_item_id := (v_item_elem->>'sale_item_id')::uuid;
    v_req_qty := (v_item_elem->>'quantity')::numeric(12,3);

    IF v_req_qty <= 0 THEN
      RAISE EXCEPTION 'INVALID_RETURN_QTY: Return quantity must be greater than zero';
    END IF;

    SELECT * INTO v_sale_item
    FROM sale_items
    WHERE id = v_sale_item_id AND sale_id = p_sale_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALE_ITEM_NOT_FOUND:%', v_sale_item_id;
    END IF;

    -- Calculate already returned quantity and refunded cents
    SELECT 
      COALESCE(sum(sri.quantity), 0),
      COALESCE(sum(sri.refund_cents), 0)
    INTO v_already_ret_qty, v_already_ref_cents
    FROM sale_return_items sri
    JOIN sale_returns sr ON sri.return_id = sr.id
    WHERE sri.sale_item_id = v_sale_item_id;

    v_rem_qty := v_sale_item.quantity - v_already_ret_qty;

    IF v_req_qty > v_rem_qty THEN
      RAISE EXCEPTION 'RETURN_QTY_EXCEEDED: Requested return qty % exceeds returnable qty % for %',
        v_req_qty, v_rem_qty, v_sale_item.sku_snapshot;
    END IF;

    -- Refund calculation rule:
    -- If final return of line, refund exactly the remainder so cumulative refund equals line_total_cents to the cent!
    IF (v_already_ret_qty + v_req_qty) = v_sale_item.quantity THEN
      v_line_refund := v_sale_item.line_total_cents - v_already_ref_cents;
    ELSE
      v_line_refund := round_half_up(v_sale_item.line_total_cents * v_req_qty, v_sale_item.quantity);
    END IF;

    v_total_refund_cents := v_total_refund_cents + v_line_refund;

    -- Record return line item
    INSERT INTO sale_return_items (
      return_id,
      sale_item_id,
      quantity,
      refund_cents,
      created_at
    ) VALUES (
      v_return_id,
      v_sale_item_id,
      v_req_qty,
      v_line_refund,
      now()
    );

    v_return_lines := v_return_lines || jsonb_build_object(
      'sale_item_id', v_sale_item_id,
      'product_name', v_sale_item.product_name_snapshot,
      'sku', v_sale_item.sku_snapshot,
      'quantity', v_req_qty,
      'unit', v_sale_item.unit_snapshot,
      'refund_cents', v_line_refund
    );

    -- Stock and batch restoration
    IF p_restock THEN
      PERFORM set_config('app.stock_write', 'on', true);
      UPDATE products
      SET stock_qty = stock_qty + v_req_qty
      WHERE id = v_sale_item.product_id
      RETURNING stock_qty INTO v_new_stock;

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
        v_sale_item.product_id,
        'return',
        v_req_qty,
        v_new_stock,
        'return',
        v_return_id,
        'Return ' || v_return_no || ': ' || v_cleaned_reason,
        v_user_id,
        now()
      );

      -- Restore batch quantities
      v_restore_needed := v_req_qty;
      FOR v_sib IN 
        SELECT sib.batch_id, sib.quantity 
        FROM sale_item_batches sib 
        WHERE sib.sale_item_id = v_sale_item_id 
        ORDER BY sib.created_at DESC 
      LOOP
        IF v_restore_needed <= 0 THEN
          EXIT;
        END IF;

        IF v_sib.quantity >= v_restore_needed THEN
          UPDATE stock_batches
          SET qty_remaining = qty_remaining + v_restore_needed
          WHERE id = v_sib.batch_id;
          v_restore_needed := 0;
        ELSE
          UPDATE stock_batches
          SET qty_remaining = qty_remaining + v_sib.quantity
          WHERE id = v_sib.batch_id;
          v_restore_needed := v_restore_needed - v_sib.quantity;
        END IF;
      END LOOP;
    ELSE
      -- Record as damage without restocking to sellable inventory
      SELECT stock_qty INTO v_new_stock FROM products WHERE id = v_sale_item.product_id;

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
        v_sale_item.product_id,
        'damage',
        0,
        v_new_stock,
        'return_damaged',
        v_return_id,
        'Damaged Return ' || v_return_no || ' (no restock): ' || v_cleaned_reason,
        v_user_id,
        now()
      );
    END IF;
  END LOOP;

  -- 7. Validate that cumulative refund does not exceed what was paid on the sale
  SELECT COALESCE(sum(refund_cents), 0) INTO v_already_total_refunded
  FROM sale_returns
  WHERE sale_id = p_sale_id AND id != v_return_id;

  v_total_paid_cents := v_sale.paid_cents - v_sale.change_cents; -- net paid
  IF (v_already_total_refunded + v_total_refund_cents) > v_total_paid_cents THEN
    RAISE EXCEPTION 'REFUND_EXCEEDS_PAID: Cumulative refund exceeds net paid amount for this sale';
  END IF;

  -- Update return header total
  UPDATE sale_returns
  SET refund_cents = v_total_refund_cents
  WHERE id = v_return_id;

  -- 8. Customer Store Credit adjustment
  IF p_refund_method = 'store_credit' THEN
    UPDATE customers
    SET credit_balance_cents = credit_balance_cents + v_total_refund_cents
    WHERE id = v_sale.customer_id;
  END IF;

  -- 9. Check if all items in sale are now returned
  SELECT bool_and(total_returned >= quantity) INTO v_all_returned
  FROM (
    SELECT si.id, si.quantity, COALESCE(sum(sri.quantity), 0) as total_returned
    FROM sale_items si
    LEFT JOIN sale_return_items sri ON si.id = sri.sale_item_id
    WHERE si.sale_id = p_sale_id
    GROUP BY si.id, si.quantity
  ) lines_summary;

  IF v_all_returned THEN
    UPDATE sales SET status = 'returned' WHERE id = p_sale_id;
  ELSE
    UPDATE sales SET status = 'partially_returned' WHERE id = p_sale_id;
  END IF;

  -- 10. Audit Log
  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
  VALUES (
    v_user_id,
    'sale.return',
    'sale_returns',
    v_return_id::text,
    jsonb_build_object(
      'sale_id', p_sale_id,
      'bill_no', v_sale.bill_no,
      'return_no', v_return_no,
      'refund_cents', v_total_refund_cents,
      'refund_method', p_refund_method,
      'restock', p_restock,
      'reason', v_cleaned_reason,
      'items', v_return_lines
    )
  );

  RETURN jsonb_build_object(
    'return_id', v_return_id,
    'return_no', v_return_no,
    'sale_id', p_sale_id,
    'bill_no', v_sale.bill_no,
    'date_time', now(),
    'reason', v_cleaned_reason,
    'refund_method', p_refund_method,
    'refund_cents', v_total_refund_cents,
    'restock', p_restock,
    'lines', v_return_lines
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 12. FUNCTION get_return(p_return_id)
-- Returns structured return document snapshot for thermal printer / credit note.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_return(
  p_return_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ret record;
  v_sale record;
  v_shop record;
  v_cashier record;
  v_lines jsonb;
BEGIN
  SELECT * INTO v_ret FROM sale_returns WHERE id = p_return_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RETURN_NOT_FOUND';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = v_ret.sale_id;
  SELECT * INTO v_shop FROM shop_settings WHERE id = 1;
  SELECT id, full_name as name INTO v_cashier FROM profiles WHERE id = v_ret.created_by;

  SELECT jsonb_agg(
    jsonb_build_object(
      'sale_item_id', sri.sale_item_id,
      'name', si.product_name_snapshot,
      'sku', si.sku_snapshot,
      'unit', si.unit_snapshot,
      'quantity', sri.quantity,
      'unit_price_cents', si.unit_price_cents_snapshot,
      'refund_cents', sri.refund_cents
    )
  ) INTO v_lines
  FROM sale_return_items sri
  JOIN sale_items si ON sri.sale_item_id = si.id
  WHERE sri.return_id = p_return_id;

  RETURN jsonb_build_object(
    'id', v_ret.id,
    'return_no', v_ret.return_no,
    'sale_id', v_ret.sale_id,
    'bill_no', v_sale.bill_no,
    'date_time', v_ret.created_at,
    'refund_method', v_ret.refund_method,
    'refund_cents', v_ret.refund_cents,
    'reason', v_ret.reason,
    'restock', v_ret.restock,
    'shop', jsonb_build_object(
      'name', v_shop.shop_name,
      'address', v_shop.address,
      'phone', v_shop.phone
    ),
    'cashier', jsonb_build_object(
      'id', v_cashier.id,
      'name', v_cashier.name
    ),
    'customer', CASE WHEN v_sale.customer_id IS NOT NULL THEN
      jsonb_build_object(
        'id', v_sale.customer_id,
        'phone', v_sale.customer_phone
      )
      ELSE NULL END,
    'lines', COALESCE(v_lines, '[]'::jsonb)
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 13. GRANT EXECUTE ON ALL NEW FUNCTIONS
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION open_shift FROM public;
GRANT EXECUTE ON FUNCTION open_shift TO authenticated;

REVOKE ALL ON FUNCTION close_shift FROM public;
GRANT EXECUTE ON FUNCTION close_shift TO authenticated;

REVOKE ALL ON FUNCTION x_report FROM public;
GRANT EXECUTE ON FUNCTION x_report TO authenticated;

REVOKE ALL ON FUNCTION record_cash_movement FROM public;
GRANT EXECUTE ON FUNCTION record_cash_movement TO authenticated;

REVOKE ALL ON FUNCTION void_sale FROM public;
GRANT EXECUTE ON FUNCTION void_sale TO authenticated;

REVOKE ALL ON FUNCTION create_return FROM public;
GRANT EXECUTE ON FUNCTION create_return TO authenticated;

REVOKE ALL ON FUNCTION get_return FROM public;
GRANT EXECUTE ON FUNCTION get_return TO authenticated;

