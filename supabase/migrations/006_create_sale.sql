-- ==============================================================================
-- Migration: 006_create_sale.sql
-- Description: Authoritative create_sale function, get_bill, and mark_bill_printed.
--              Implements strict 14-step financial transaction logic, FEFO stock
--              deduction, largest-remainder discount allocation, phone normalization,
--              gapless bill numbering, and direct insert protection.
-- ==============================================================================

-- 1. SCHEMA ADJUSTMENTS
-- Allow shift_id to be nullable until mandatory shifts in Prompt 12
ALTER TABLE sales ALTER COLUMN shift_id DROP NOT NULL;

-- Allow bill sequence to expand past 4 digits if daily volume exceeds 9,999
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_bill_no_check;
ALTER TABLE sales ADD CONSTRAINT sales_bill_no_check CHECK (bill_no ~ '^WWL-\d{8}-\d{4,}$');

-- 2. CALCULATION COMPOSITE TYPE FOR RAM-ONLY LINE PROCESSING
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sale_calc_line_t') THEN
    CREATE TYPE sale_calc_line_t AS (
      line_idx int,
      product_id uuid,
      product_name text,
      sku text,
      unit text,
      cost_price_cents bigint,
      selling_price_cents bigint,
      tax_exempt boolean,
      quantity numeric(12,3),
      gross_line bigint,
      line_discount bigint,
      net_line bigint,
      allocated_bill_discount bigint,
      line_after bigint,
      line_tax bigint,
      line_total bigint
    );
  END IF;
END $$;

-- 3. DIRECT INSERT PROTECTION TRIGGER
-- Ensure sales and sale_items can ONLY be inserted via create_sale()
CREATE OR REPLACE FUNCTION prevent_direct_sales_insert()
RETURNS trigger AS $$
BEGIN
  IF current_setting('app.in_create_sale', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'DIRECT_INSERT_FORBIDDEN: Sales and sale_items can only be created via public.create_sale()';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_direct_sales_insert ON sales;
CREATE TRIGGER trg_prevent_direct_sales_insert
BEFORE INSERT ON sales
FOR EACH ROW EXECUTE FUNCTION prevent_direct_sales_insert();

DROP TRIGGER IF EXISTS trg_prevent_direct_sale_items_insert ON sale_items;
CREATE TRIGGER trg_prevent_direct_sale_items_insert
BEFORE INSERT ON sale_items
FOR EACH ROW EXECUTE FUNCTION prevent_direct_sales_insert();

-- 4. ROUND HALF UP INTEGER HELPER (Symmetric away from zero)
CREATE OR REPLACE FUNCTION round_half_up(numerator bigint, denominator bigint)
RETURNS bigint AS $$
DECLARE
  v_num bigint := numerator;
  v_den bigint := denominator;
  v_abs_num bigint;
  v_quotient bigint;
  v_remainder bigint;
  v_rounded bigint;
  v_is_neg boolean;
BEGIN
  IF v_den = 0 THEN
    RAISE EXCEPTION 'Division by zero in round_half_up';
  END IF;

  IF v_den < 0 THEN
    v_num := -v_num;
    v_den := -v_den;
  END IF;

  v_is_neg := (v_num < 0);
  v_abs_num := abs(v_num);
  v_quotient := v_abs_num / v_den;
  v_remainder := v_abs_num % v_den;

  IF v_remainder * 2 >= v_den THEN
    v_rounded := v_quotient + 1;
  ELSE
    v_rounded := v_quotient;
  END IF;

  IF v_is_neg THEN
    RETURN -v_rounded;
  ELSE
    RETURN v_rounded;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5. SRI LANKAN PHONE NORMALIZER
-- Normalizes: 07XXXXXXXX, 7XXXXXXXX, +947XXXXXXXX, 947XXXXXXXX -> +947XXXXXXXX
CREATE OR REPLACE FUNCTION normalize_phone_number(p_phone text)
RETURNS text AS $$
DECLARE
  v_cleaned text;
BEGIN
  IF p_phone IS NULL OR trim(p_phone) = '' THEN
    RETURN NULL;
  END IF;

  -- Remove all spaces, hyphens and parentheses
  v_cleaned := regexp_replace(trim(p_phone), '[\s\-\(\)]', '', 'g');

  IF v_cleaned ~ '^07[0-9]{8}$' THEN
    RETURN '+94' || substring(v_cleaned from 2);
  ELSIF v_cleaned ~ '^7[0-9]{8}$' THEN
    RETURN '+94' || v_cleaned;
  ELSIF v_cleaned ~ '^\+947[0-9]{8}$' THEN
    RETURN v_cleaned;
  ELSIF v_cleaned ~ '^947[0-9]{8}$' THEN
    RETURN '+' || v_cleaned;
  ELSE
    RAISE EXCEPTION 'INVALID_PHONE';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 6. GET_BILL FUNCTION
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
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_NOT_FOUND';
  END IF;

  SELECT shop_name, address, phone, vat_reg_no, receipt_footer 
  INTO v_shop 
  FROM shop_settings 
  WHERE id = 1;

  SELECT full_name INTO v_cashier_name 
  FROM profiles 
  WHERE id = v_sale.cashier_id;

  SELECT id, name, phone INTO v_customer 
  FROM customers 
  WHERE id = v_sale.customer_id;

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
        'phone', v_customer.phone
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

-- 7. MARK_BILL_PRINTED FUNCTION
CREATE OR REPLACE FUNCTION mark_bill_printed(p_sale_id uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_print_count int;
  v_user_id uuid := COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid);
BEGIN
  UPDATE sales
  SET print_count = print_count + 1
  WHERE id = p_sale_id
  RETURNING print_count INTO v_new_print_count;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SALE_NOT_FOUND';
  END IF;

  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
  VALUES (
    v_user_id,
    'bill.print',
    'sales',
    p_sale_id::text,
    jsonb_build_object('print_count', v_new_print_count)
  );

  RETURN get_bill(p_sale_id);
END;
$$ LANGUAGE plpgsql;

-- 8. THE SOLE CREATE_SALE FUNCTION
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
  -- Identity
  v_user_id uuid;
  v_user_role user_role;
  v_user_active boolean;

  -- Existing sale check
  v_existing_sale_id uuid;

  -- Settings
  v_shop shop_settings%ROWTYPE;

  -- Calculation arrays and variables
  v_calc_lines sale_calc_line_t[] := ARRAY[]::sale_calc_line_t[];
  v_line sale_calc_line_t;
  v_product_ids uuid[];
  v_prod products%ROWTYPE;

  v_subtotal_cents bigint := 0;
  v_line_discounts_total bigint := 0;
  v_items_net bigint := 0;

  v_bill_disc_type text := 'none';
  v_bill_disc_val numeric := 0;
  v_bill_discount_cents bigint := 0;

  v_base_alloc_sum bigint := 0;
  v_rem_cents int := 0;

  v_tax_rate numeric(5,2);
  v_tax_rate_bp bigint;
  v_tax_cents_total bigint := 0;
  v_taxable_cents bigint := 0;
  v_total_cents bigint := 0;
  v_sum_line_totals bigint := 0;

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

  -- Input item record
  v_item_rec record;
  v_idx int;
  v_qty_milli bigint;
  v_disc_type text;
  v_disc_val numeric;
  v_line_disc bigint;
  v_gross bigint;
  v_net bigint;
  v_rank int;
  v_allocated bigint;
BEGIN
  -- Mark execution context to permit inserts on sales and sale_items
  PERFORM set_config('app.in_create_sale', 'true', true);

  -- ----------------------------------------------------------------------------
  -- STEP 1. IDENTITY
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
  -- STEP 2. IDEMPOTENCY
  -- ----------------------------------------------------------------------------
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT:idempotency_key is required';
  END IF;

  SELECT id INTO v_existing_sale_id
  FROM sales
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN get_bill(v_existing_sale_id);
  END IF;

  -- ----------------------------------------------------------------------------
  -- STEP 3. VALIDATE INPUT & MERGE DUPLICATE PRODUCT_IDs
  -- ----------------------------------------------------------------------------
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT:Cart is empty';
  END IF;

  SELECT * INTO v_shop FROM shop_settings WHERE id = 1;

  -- Parse, validate and aggregate duplicates before locking
  -- For duplicate lines of same product, quantities are summed.
  -- Discounts: if all same percent, keep percent; if amount, sum amount; if none, none;
  -- otherwise evaluate percent as amount based on base line.
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
      -- Discount strategy for merged products:
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

    -- Append to array of distinct product_ids
    v_product_ids := array_append(v_product_ids, v_item_rec.product_id);
  END LOOP;

  -- ----------------------------------------------------------------------------
  -- STEP 4. LOCK PRODUCTS IN CONSISTENT ORDER (DEADLOCK-FREE) & CHECK STOCK
  -- ----------------------------------------------------------------------------
  v_idx := 0;
  FOR v_prod IN 
    SELECT * 
    FROM products 
    WHERE id = ANY(v_product_ids) 
    ORDER BY id ASC 
    FOR UPDATE 
  LOOP
    v_idx := v_idx + 1;

    -- Find matching merged input item
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

    -- Validate active status
    IF NOT v_prod.is_active THEN
      RAISE EXCEPTION 'PRODUCT_INACTIVE:%', v_prod.sku;
    END IF;

    -- Validate integer quantity requirement
    IF NOT v_prod.allow_decimal_qty AND v_item_rec.quantity <> trunc(v_item_rec.quantity) THEN
      RAISE EXCEPTION 'INVALID_QUANTITY:%:Decimal quantity not allowed', v_prod.sku;
    END IF;

    -- Validate stock level
    IF v_prod.stock_qty < v_item_rec.quantity THEN
      RAISE EXCEPTION 'OUT_OF_STOCK:%:%', v_prod.sku, v_prod.stock_qty;
    END IF;

    -- --------------------------------------------------------------------------
    -- STEP 5 & 6a, 6b, 6c: LINE CALCULATIONS & CASHIER PERMISSION CHECK
    -- --------------------------------------------------------------------------
    -- 6a. gross_line = round_half_up(quantity * unit_price_cents)
    v_qty_milli := (v_item_rec.quantity * 1000)::bigint;
    v_gross := round_half_up(v_prod.selling_price_cents * v_qty_milli, 1000);

    -- 5 & 6b. line_discount
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

    -- Clamp to gross_line
    IF v_line_disc > v_gross THEN
      v_line_disc := v_gross;
    END IF;
    IF v_line_disc < 0 THEN
      v_line_disc := 0;
    END IF;

    -- 6c. net_line = gross_line - line_discount
    v_net := v_gross - v_line_disc;

    -- Accumulate subtotal and net
    v_subtotal_cents := v_subtotal_cents + v_gross;
    v_line_discounts_total := v_line_discounts_total + v_line_disc;
    v_items_net := v_items_net + v_net;

    -- Record line into ram array
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
  -- STEP 6d, 6e: BILL-LEVEL DISCOUNT & CASHIER PERMISSION
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

  -- Clamp to items_net
  IF v_bill_discount_cents > v_items_net THEN
    v_bill_discount_cents := v_items_net;
  END IF;
  IF v_bill_discount_cents < 0 THEN
    v_bill_discount_cents := 0;
  END IF;

  -- ----------------------------------------------------------------------------
  -- STEP 6f: ALLOCATE BILL DISCOUNT PROPORTIONALLY (LARGEST-REMAINDER METHOD)
  -- ----------------------------------------------------------------------------
  IF v_items_net > 0 AND v_bill_discount_cents > 0 THEN
    -- First compute base allocations
    v_base_alloc_sum := 0;
    FOR i IN 1..cardinality(v_calc_lines) LOOP
      v_calc_lines[i].allocated_bill_discount := (v_bill_discount_cents * v_calc_lines[i].net_line) / v_items_net;
      v_base_alloc_sum := v_base_alloc_sum + v_calc_lines[i].allocated_bill_discount;
    END LOOP;

    v_rem_cents := (v_bill_discount_cents - v_base_alloc_sum)::int;

    -- Distribute remainder cents to lines with largest remainders
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
  -- STEP 6g, 6h, 6i: TAX CALCULATION AND LINE TOTALS
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

  -- 6i. Total mismatch internal assert
  IF v_sum_line_totals <> v_total_cents THEN
    RAISE EXCEPTION 'TOTAL_MISMATCH';
  END IF;

  -- ----------------------------------------------------------------------------
  -- STEP 7. VALIDATE PAYMENTS
  -- ----------------------------------------------------------------------------
  v_paid_cents := 0;
  v_cash_cents := 0;
  v_non_cash_cents := 0;

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

  -- Non-cash payments may not exceed what remains after cash
  v_remaining_after_cash := GREATEST(0, v_total_cents - v_cash_cents);
  IF v_non_cash_cents > v_remaining_after_cash THEN
    RAISE EXCEPTION 'PAYMENT_EXCEEDS_REMAINING:%:%', v_remaining_after_cash, v_non_cash_cents;
  END IF;

  v_change_cents := v_paid_cents - v_total_cents;

  -- ----------------------------------------------------------------------------
  -- STEP 8. GAPLESS BILL NUMBER (Asia/Colombo)
  -- ----------------------------------------------------------------------------
  v_colombo_date := (now() AT TIME ZONE 'Asia/Colombo')::date;

  INSERT INTO bill_counters (bill_date, last_number)
  VALUES (v_colombo_date, 1)
  ON CONFLICT (bill_date)
  DO UPDATE SET last_number = bill_counters.last_number + 1
  RETURNING last_number INTO v_bill_seq;

  v_bill_no := 'WWL-' || to_char(v_colombo_date, 'YYYYMMDD') || '-' || lpad(v_bill_seq::text, 4, '0');

  -- ----------------------------------------------------------------------------
  -- STEP 11. CUSTOMER UPSERT & NORMALISATION
  -- ----------------------------------------------------------------------------
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

  -- ----------------------------------------------------------------------------
  -- STEP 14. CASHIER OPEN SHIFT (IF ONE EXISTS)
  -- ----------------------------------------------------------------------------
  SELECT id INTO v_shift_id
  FROM shifts
  WHERE cashier_id = v_user_id AND status = 'open'
  LIMIT 1;

  -- ----------------------------------------------------------------------------
  -- STEP 9. INSERT SALE, SALE ITEMS, AND PAYMENTS
  -- ----------------------------------------------------------------------------
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

  -- Insert sale items
  FOR i IN 1..cardinality(v_calc_lines) LOOP
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
      v_calc_lines[i].product_id,
      v_calc_lines[i].product_name,
      v_calc_lines[i].sku,
      v_calc_lines[i].unit,
      v_calc_lines[i].quantity,
      v_calc_lines[i].selling_price_cents,
      v_calc_lines[i].cost_price_cents,
      v_calc_lines[i].line_discount + v_calc_lines[i].allocated_bill_discount,
      v_calc_lines[i].line_tax,
      v_calc_lines[i].line_total,
      now()
    );
  END LOOP;

  -- Insert payments
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

  -- ----------------------------------------------------------------------------
  -- STEP 10. DEDUCT STOCK & FEFO BATCHES
  -- ----------------------------------------------------------------------------
  FOR i IN 1..cardinality(v_calc_lines) LOOP
    UPDATE products
    SET stock_qty = stock_qty - v_calc_lines[i].quantity
    WHERE id = v_calc_lines[i].product_id
    RETURNING stock_qty INTO v_prod.stock_qty;

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
      v_calc_lines[i].product_id,
      'sale',
      -v_calc_lines[i].quantity,
      v_prod.stock_qty,
      'sale',
      v_sale_id,
      'Sale ' || v_bill_no,
      v_user_id,
      now()
    );

    -- FEFO batch deduction if track_expiry is true
    SELECT track_expiry INTO v_prod.track_expiry 
    FROM products 
    WHERE id = v_calc_lines[i].product_id;

    IF v_prod.track_expiry THEN
      v_batch_needed := v_calc_lines[i].quantity;

      FOR v_batch IN 
        SELECT id, qty_remaining 
        FROM stock_batches 
        WHERE product_id = v_calc_lines[i].product_id AND qty_remaining > 0 
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
        RAISE EXCEPTION 'BATCH_MISMATCH:%', v_calc_lines[i].sku;
      END IF;
    END IF;
  END LOOP;

  -- ----------------------------------------------------------------------------
  -- STEP 12. SMS OUTBOX
  -- ----------------------------------------------------------------------------
  IF v_shop.sms_enabled AND v_norm_phone IS NOT NULL AND NOT v_customer_sms_opt_out THEN
    v_sms_body := replace(
      replace(
        replace(
          replace(
            replace(
              COALESCE(v_shop.sms_template, 'Thank you for shopping at {shop}. Bill {bill_no}, total {total}, {date}. Enquiries: {phone}'),
              '{shop_name}', v_shop.shop_name
            ),
            '{shop}', v_shop.shop_name
          ),
          '{bill_no}', v_bill_no
        ),
        '{total}', 'Rs. ' || to_char(v_total_cents / 100.0, 'FM999,999,990.00')
      ),
      '{date}', to_char(now() AT TIME ZONE 'Asia/Colombo', 'YYYY-MM-DD HH24:MI')
    );
    v_sms_body := replace(v_sms_body, '{phone}', COALESCE(v_shop.phone, ''));

    INSERT INTO sms_outbox (sale_id, phone, message, status)
    VALUES (v_sale_id, v_norm_phone, v_sms_body, 'pending');
  END IF;

  -- ----------------------------------------------------------------------------
  -- STEP 13. AUDIT LOG
  -- ----------------------------------------------------------------------------
  INSERT INTO audit_log (user_id, action, table_name, record_id, new_data)
  VALUES (
    v_user_id,
    'sale.create',
    'sales',
    v_sale_id::text,
    jsonb_build_object(
      'bill_no', v_bill_no,
      'total_cents', v_total_cents,
      'item_count', cardinality(v_calc_lines)
    )
  );

  -- Return complete receipt representation
  RETURN get_bill(v_sale_id);
END;
$$ LANGUAGE plpgsql;

-- 9. PERMISSIONS
REVOKE ALL ON FUNCTION create_sale FROM public;
GRANT EXECUTE ON FUNCTION create_sale TO authenticated, anon;

REVOKE ALL ON FUNCTION get_bill FROM public;
GRANT EXECUTE ON FUNCTION get_bill TO authenticated, anon;

REVOKE ALL ON FUNCTION mark_bill_printed FROM public;
GRANT EXECUTE ON FUNCTION mark_bill_printed TO authenticated, anon;

