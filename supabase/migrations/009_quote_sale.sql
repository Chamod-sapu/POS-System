-- ==============================================================================
-- Migration: 009_quote_sale.sql
-- Description: Refactors sale calculation from create_sale into internal calc_bill(...)
--              shared by BOTH create_sale and new quote_sale(p_items, p_bill_discount).
--              Enables real-time authoritative preview quotes at the POS with zero
--              drift from checkout totals.
-- ==============================================================================

-- 1. INTERNAL CALC_BILL FUNCTION
-- Authoritative calculation engine reading product prices, tax, and limits from DB.
CREATE OR REPLACE FUNCTION calc_bill(
  p_items jsonb,
  p_bill_discount jsonb DEFAULT '{"type":"none","value":0}'::jsonb,
  p_lock_products boolean DEFAULT false
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Caller Identity
  v_user_id uuid;
  v_user_role user_role;
  v_user_active boolean;

  -- Settings
  v_shop shop_settings%ROWTYPE;

  -- Product collections
  v_product_ids uuid[] := ARRAY[]::uuid[];
  v_prod products%ROWTYPE;
  v_item_rec record;

  -- Calculation arrays and structures
  v_calc_lines sale_calc_line_t[] := ARRAY[]::sale_calc_line_t[];
  v_line sale_calc_line_t;
  v_lines_json jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;

  -- Subtotals & Discounts
  v_subtotal_cents bigint := 0;
  v_line_discounts_total bigint := 0;
  v_items_net bigint := 0;

  v_bill_disc_type text := 'none';
  v_bill_disc_val numeric := 0;
  v_bill_discount_cents bigint := 0;

  v_base_alloc_sum bigint := 0;
  v_rem_cents int := 0;

  -- Tax
  v_tax_rate numeric(5,2);
  v_tax_rate_bp bigint;
  v_tax_cents_total bigint := 0;
  v_taxable_cents bigint := 0;
  v_total_cents bigint := 0;
  v_sum_line_totals bigint := 0;

  -- Math helpers
  v_idx int;
  v_qty_milli bigint;
  v_disc_type text;
  v_disc_val numeric;
  v_line_disc bigint;
  v_gross bigint;
  v_net bigint;
BEGIN
  -- ----------------------------------------------------------------------------
  -- 1. CALLER PERMISSION CHECK
  -- ----------------------------------------------------------------------------
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

  -- ----------------------------------------------------------------------------
  -- 2. VALIDATE INPUT
  -- ----------------------------------------------------------------------------
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT:Cart is empty';
  END IF;

  SELECT * INTO v_shop FROM shop_settings WHERE id = 1;

  -- Merge duplicate product_ids
  FOR v_item_rec IN (
    WITH raw_items AS (
      SELECT 
        (elem->>'product_id')::uuid AS product_id,
        (elem->>'quantity')::numeric(12,3) AS quantity,
        COALESCE(elem->>'discount_type', 'none') AS discount_type,
        COALESCE((elem->>'discount_value')::numeric, 0) AS discount_value
      FROM jsonb_array_elements(p_items) AS elem
    )
    SELECT 
      product_id,
      SUM(quantity) AS quantity,
      CASE 
        WHEN bool_and(discount_type = 'none') THEN 'none'
        WHEN bool_and(discount_type = 'amount') THEN 'amount'
        WHEN bool_and(discount_type = 'percent') AND min(discount_value) = max(discount_value) THEN 'percent'
        ELSE 'amount'
      END AS discount_type,
      CASE 
        WHEN bool_and(discount_type = 'none') THEN 0
        WHEN bool_and(discount_type = 'amount') THEN SUM(discount_value)
        WHEN bool_and(discount_type = 'percent') AND min(discount_value) = max(discount_value) THEN min(discount_value)
        ELSE SUM(discount_value)
      END AS discount_value
    FROM raw_items
    GROUP BY product_id
  ) LOOP
    IF v_item_rec.quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_INPUT:Quantity must be greater than zero';
    END IF;

    IF v_item_rec.discount_value < 0 THEN
      RAISE EXCEPTION 'INVALID_INPUT:Discount cannot be negative';
    END IF;

    IF v_item_rec.discount_type NOT IN ('none', 'percent', 'amount') THEN
      RAISE EXCEPTION 'INVALID_INPUT:Invalid discount type';
    END IF;

    v_product_ids := array_append(v_product_ids, v_item_rec.product_id);
  END LOOP;

  -- ----------------------------------------------------------------------------
  -- 3. SELECT PRODUCTS (WITH OR WITHOUT LOCK) & LINE PROCESSING
  -- ----------------------------------------------------------------------------
  v_idx := 0;

  -- Loop through products in strict ascending ID order (prevents deadlocks during checkout)
  FOR v_prod IN 
    SELECT * 
    FROM products 
    WHERE id = ANY(v_product_ids) 
    ORDER BY id ASC 
  LOOP
    -- If locking requested (create_sale), lock row FOR UPDATE
    IF p_lock_products THEN
      PERFORM 1 FROM products WHERE id = v_prod.id FOR UPDATE;
    END IF;

    v_idx := v_idx + 1;

    -- Match with merged input
    SELECT * INTO v_item_rec FROM (
      WITH raw_items AS (
        SELECT 
          (elem->>'product_id')::uuid AS product_id,
          (elem->>'quantity')::numeric(12,3) AS quantity,
          COALESCE(elem->>'discount_type', 'none') AS discount_type,
          COALESCE((elem->>'discount_value')::numeric, 0) AS discount_value
        FROM jsonb_array_elements(p_items) AS elem
      )
      SELECT 
        product_id,
        SUM(quantity) AS quantity,
        CASE 
          WHEN bool_and(discount_type = 'none') THEN 'none'
          WHEN bool_and(discount_type = 'amount') THEN 'amount'
          WHEN bool_and(discount_type = 'percent') AND min(discount_value) = max(discount_value) THEN 'percent'
          ELSE 'amount'
        END AS discount_type,
        CASE 
          WHEN bool_and(discount_type = 'none') THEN 0
          WHEN bool_and(discount_type = 'amount') THEN SUM(discount_value)
          WHEN bool_and(discount_type = 'percent') AND min(discount_value) = max(discount_value) THEN min(discount_value)
          ELSE SUM(discount_value)
        END AS discount_value
      FROM raw_items
      WHERE product_id = v_prod.id
      GROUP BY product_id
    ) q;

    -- Active status
    IF NOT v_prod.is_active THEN
      RAISE EXCEPTION 'PRODUCT_INACTIVE:%', v_prod.sku;
    END IF;

    -- Decimal quantity validation
    IF NOT v_prod.allow_decimal_qty AND v_item_rec.quantity <> trunc(v_item_rec.quantity) THEN
      RAISE EXCEPTION 'INVALID_QUANTITY:%:Decimal quantity not allowed', v_prod.sku;
    END IF;

    -- Stock validation
    IF v_prod.stock_qty < v_item_rec.quantity THEN
      IF p_lock_products THEN
        RAISE EXCEPTION 'OUT_OF_STOCK:%:%', v_prod.sku, v_prod.stock_qty;
      ELSE
        v_warnings := v_warnings || jsonb_build_object(
          'type', 'OUT_OF_STOCK',
          'product_id', v_prod.id,
          'sku', v_prod.sku,
          'requested_qty', v_item_rec.quantity,
          'available_qty', v_prod.stock_qty,
          'message', 'Only ' || v_prod.stock_qty || ' ' || v_prod.unit || ' available for ' || v_prod.name
        );
      END IF;
    ELSIF v_prod.stock_qty <= v_prod.reorder_level THEN
      v_warnings := v_warnings || jsonb_build_object(
        'type', 'LOW_STOCK',
        'product_id', v_prod.id,
        'sku', v_prod.sku,
        'available_qty', v_prod.stock_qty,
        'reorder_level', v_prod.reorder_level,
        'message', 'Low stock alert for ' || v_prod.name || ' (' || v_prod.stock_qty || ' remaining)'
      );
    END IF;

    -- Line Gross: round_half_up(quantity * unit_price_cents)
    v_qty_milli := (v_item_rec.quantity * 1000)::bigint;
    v_gross := round_half_up(v_prod.selling_price_cents * v_qty_milli, 1000);

    -- Line Discount
    v_disc_type := v_item_rec.discount_type;
    v_disc_val := v_item_rec.discount_value;

    IF v_disc_type = 'percent' THEN
      IF v_user_role = 'cashier' AND v_disc_val > v_shop.max_cashier_discount_percent THEN
        RAISE EXCEPTION 'DISCOUNT_NOT_ALLOWED';
      END IF;
      v_line_disc := round_half_up(v_gross * (v_disc_val * 100)::bigint, 10000);
    ELSIF v_disc_type = 'amount' THEN
      v_line_disc := (v_disc_val)::bigint;
      IF v_user_role = 'cashier' AND v_gross > 0 THEN
        IF (v_line_disc * 10000) > (v_gross * (v_shop.max_cashier_discount_percent * 100)::bigint) THEN
          RAISE EXCEPTION 'DISCOUNT_NOT_ALLOWED';
        END IF;
      END IF;
    ELSE
      v_line_disc := 0;
    END IF;

    -- Clamp line discount
    IF v_line_disc > v_gross THEN
      v_line_disc := v_gross;
    END IF;
    IF v_line_disc < 0 THEN
      v_line_disc := 0;
    END IF;

    -- Line Net
    v_net := v_gross - v_line_disc;

    -- Accumulate
    v_subtotal_cents := v_subtotal_cents + v_gross;
    v_line_discounts_total := v_line_discounts_total + v_line_disc;
    v_items_net := v_items_net + v_net;

    -- Record into calculation array
    v_line.line_idx := v_idx;
    v_line.product_id := v_prod.id;
    v_line.product_name := v_prod.name;
    v_line.sku := v_prod.sku;
    v_line.unit := v_prod.unit;
    v_line.cost_price_cents := v_prod.cost_price_cents;
    v_line.selling_price_cents := v_prod.selling_price_cents;
    v_line.tax_exempt := v_prod.tax_exempt;
    v_line.quantity := v_item_rec.quantity;
    v_line.gross_line := v_gross;
    v_line.line_discount := v_line_disc;
    v_line.net_line := v_net;
    v_line.allocated_bill_discount := 0;
    v_line.line_after := v_net;
    v_line.line_tax := 0;
    v_line.line_total := v_net;

    v_calc_lines := array_append(v_calc_lines, v_line);
  END LOOP;

  -- ----------------------------------------------------------------------------
  -- 4. BILL-LEVEL DISCOUNT & CASHIER LIMIT
  -- ----------------------------------------------------------------------------
  IF p_bill_discount IS NOT NULL AND p_bill_discount <> 'null'::jsonb THEN
    v_bill_disc_type := COALESCE(p_bill_discount->>'type', 'none');
    v_bill_disc_val := COALESCE((p_bill_discount->>'value')::numeric, 0);

    IF v_bill_disc_val < 0 THEN
      RAISE EXCEPTION 'INVALID_INPUT:Negative bill discount';
    END IF;

    IF v_bill_disc_type = 'percent' THEN
      IF v_user_role = 'cashier' AND v_bill_disc_val > v_shop.max_cashier_discount_percent THEN
        RAISE EXCEPTION 'DISCOUNT_NOT_ALLOWED';
      END IF;
      v_bill_discount_cents := round_half_up(v_items_net * (v_bill_disc_val * 100)::bigint, 10000);
    ELSIF v_bill_disc_type = 'amount' THEN
      v_bill_discount_cents := (v_bill_disc_val)::bigint;
      IF v_user_role = 'cashier' AND v_items_net > 0 THEN
        IF (v_bill_discount_cents * 10000) > (v_items_net * (v_shop.max_cashier_discount_percent * 100)::bigint) THEN
          RAISE EXCEPTION 'DISCOUNT_NOT_ALLOWED';
        END IF;
      END IF;
    END IF;
  END IF;

  -- Clamp bill discount
  IF v_bill_discount_cents > v_items_net THEN
    v_bill_discount_cents := v_items_net;
  END IF;
  IF v_bill_discount_cents < 0 THEN
    v_bill_discount_cents := 0;
  END IF;

  -- ----------------------------------------------------------------------------
  -- 5. ALLOCATE BILL DISCOUNT PROPORTIONALLY (LARGEST-REMAINDER)
  -- ----------------------------------------------------------------------------
  IF v_items_net > 0 AND v_bill_discount_cents > 0 THEN
    v_base_alloc_sum := 0;
    FOR i IN 1..cardinality(v_calc_lines) LOOP
      v_calc_lines[i].allocated_bill_discount := (v_bill_discount_cents * v_calc_lines[i].net_line) / v_items_net;
      v_base_alloc_sum := v_base_alloc_sum + v_calc_lines[i].allocated_bill_discount;
    END LOOP;

    v_rem_cents := (v_bill_discount_cents - v_base_alloc_sum)::int;

    FOR v_item_rec IN (
      SELECT 
        l.line_idx,
        ROW_NUMBER() OVER (
          ORDER BY ((v_bill_discount_cents * l.net_line) % v_items_net) DESC, l.line_idx ASC
        ) AS rank
      FROM unnest(v_calc_lines) AS l
    ) LOOP
      IF v_item_rec.rank <= v_rem_cents THEN
        v_calc_lines[v_item_rec.line_idx].allocated_bill_discount := 
          v_calc_lines[v_item_rec.line_idx].allocated_bill_discount + 1;
      END IF;
      v_calc_lines[v_item_rec.line_idx].line_after := 
        v_calc_lines[v_item_rec.line_idx].net_line - v_calc_lines[v_item_rec.line_idx].allocated_bill_discount;
    END LOOP;
  ELSE
    FOR i IN 1..cardinality(v_calc_lines) LOOP
      v_calc_lines[i].allocated_bill_discount := 0;
      v_calc_lines[i].line_after := v_calc_lines[i].net_line;
    END LOOP;
  END IF;

  -- ----------------------------------------------------------------------------
  -- 6. TAX CALCULATION & LINE TOTALS
  -- ----------------------------------------------------------------------------
  v_tax_rate := CASE WHEN v_shop.tax_enabled THEN v_shop.tax_rate_percent ELSE 0.00 END;
  v_tax_rate_bp := (v_tax_rate * 100)::bigint;

  v_tax_cents_total := 0;
  v_sum_line_totals := 0;

  FOR i IN 1..cardinality(v_calc_lines) LOOP
    IF v_shop.tax_enabled AND NOT v_calc_lines[i].tax_exempt AND v_tax_rate_bp > 0 THEN
      IF v_shop.tax_inclusive THEN
        v_calc_lines[i].line_tax := round_half_up(
          v_calc_lines[i].line_after * v_tax_rate_bp, 
          10000 + v_tax_rate_bp
        );
      ELSE
        v_calc_lines[i].line_tax := round_half_up(
          v_calc_lines[i].line_after * v_tax_rate_bp, 
          10000
        );
      END IF;
    ELSE
      v_calc_lines[i].line_tax := 0;
    END IF;

    v_tax_cents_total := v_tax_cents_total + v_calc_lines[i].line_tax;

    IF NOT v_shop.tax_inclusive THEN
      v_calc_lines[i].line_total := v_calc_lines[i].line_after + v_calc_lines[i].line_tax;
    ELSE
      v_calc_lines[i].line_total := v_calc_lines[i].line_after;
    END IF;

    v_sum_line_totals := v_sum_line_totals + v_calc_lines[i].line_total;
  END LOOP;

  IF NOT v_shop.tax_inclusive THEN
    v_total_cents := (v_items_net - v_bill_discount_cents) + v_tax_cents_total;
  ELSE
    v_total_cents := (v_items_net - v_bill_discount_cents);
  END IF;

  v_taxable_cents := v_total_cents - v_tax_cents_total;

  IF v_sum_line_totals <> v_total_cents THEN
    RAISE EXCEPTION 'TOTAL_MISMATCH';
  END IF;

  -- ----------------------------------------------------------------------------
  -- 7. BUILD JSONB OUTPUT
  -- ----------------------------------------------------------------------------
  SELECT jsonb_agg(
    jsonb_build_object(
      'line_idx', l.line_idx,
      'product_id', l.product_id,
      'sku', l.sku,
      'name', l.product_name,
      'unit', l.unit,
      'quantity', l.quantity,
      'unit_price_cents', l.selling_price_cents,
      'cost_price_cents', l.cost_price_cents,
      'tax_exempt', l.tax_exempt,
      'gross_line_cents', l.gross_line,
      'line_discount_cents', l.line_discount,
      'net_line_cents', l.net_line,
      'allocated_bill_discount_cents', l.allocated_bill_discount,
      'line_after_cents', l.line_after,
      'line_tax_cents', l.line_tax,
      'line_total_cents', l.line_total
    ) ORDER BY l.line_idx ASC
  ) INTO v_lines_json
  FROM unnest(v_calc_lines) AS l;

  RETURN jsonb_build_object(
    'lines', COALESCE(v_lines_json, '[]'::jsonb),
    'subtotal_cents', v_subtotal_cents,
    'line_discount_cents', v_line_discounts_total,
    'bill_discount_cents', v_bill_discount_cents,
    'tax', jsonb_build_object(
      'rate_percent', v_tax_rate,
      'mode', CASE WHEN v_shop.tax_inclusive THEN 'inclusive' ELSE 'exclusive' END,
      'taxable_cents', v_taxable_cents,
      'tax_cents', v_tax_cents_total
    ),
    'total_cents', v_total_cents,
    'warnings', COALESCE(v_warnings, '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql;

-- 2. PUBLIC QUOTE_SALE FUNCTION
-- Real-time preview calculation without side effects.
CREATE OR REPLACE FUNCTION quote_sale(
  p_items jsonb,
  p_bill_discount jsonb DEFAULT '{"type":"none","value":0}'::jsonb
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN calc_bill(p_items, p_bill_discount, false);
END;
$$ LANGUAGE plpgsql;

-- 3. REFACTORED CREATE_SALE FUNCTION
-- Leverages calc_bill with row locking, then commits transaction, stock deduction and bill counters.
CREATE OR REPLACE FUNCTION create_sale(
  p_idempotency_key uuid,
  p_items jsonb,
  p_bill_discount jsonb,
  p_payments jsonb,
  p_customer_phone text DEFAULT NULL,
  p_customer_name text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Caller Identity
  v_user_id uuid;
  v_user_role user_role;
  v_user_active boolean;

  -- Existing sale check
  v_existing_sale_id uuid;

  -- Settings & Calculation
  v_shop shop_settings%ROWTYPE;
  v_calc jsonb;
  v_calc_lines jsonb;
  v_line_elem jsonb;

  -- Totals from calc_bill
  v_subtotal_cents bigint;
  v_line_discounts_total bigint;
  v_bill_discount_cents bigint;
  v_taxable_cents bigint;
  v_tax_cents_total bigint;
  v_total_cents bigint;
  v_tax_rate numeric(5,2);

  -- Payments
  v_paid_cents bigint := 0;
  v_cash_cents bigint := 0;
  v_non_cash_cents bigint := 0;
  v_remaining_after_cash bigint := 0;
  v_change_cents bigint := 0;
  v_pay_elem jsonb;
  v_pay_method payment_method;
  v_pay_amount bigint;

  -- Bill Number
  v_colombo_date date;
  v_bill_seq int;
  v_bill_no text;

  -- Customer & Shift & SMS
  v_norm_phone text := NULL;
  v_customer_id uuid := NULL;
  v_customer_sms_opt_out boolean := false;
  v_shift_id uuid := NULL;
  v_sale_id uuid;
  v_sms_body text;

  -- Stock batch tracking
  v_batch_needed numeric(12,3);
  v_batch record;
  v_prod_stock numeric(12,3);
  v_track_exp boolean;
BEGIN
  -- Mark execution context to permit inserts on sales and sale_items
  PERFORM set_config('app.in_create_sale', 'true', true);

  -- 1. Identity
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
      'items_count', jsonb_array_length(v_calc_lines)
    )
  );

  RETURN get_bill(v_sale_id);
END;
$$ LANGUAGE plpgsql;

-- 4. FUNCTION PRIVILEGES
GRANT EXECUTE ON FUNCTION calc_bill TO authenticated;
GRANT EXECUTE ON FUNCTION quote_sale TO authenticated;
REVOKE ALL ON FUNCTION calc_bill FROM anon;
REVOKE ALL ON FUNCTION quote_sale FROM anon;

