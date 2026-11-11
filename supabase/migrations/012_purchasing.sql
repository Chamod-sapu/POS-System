-- Migration 012: Purchasing, Supplier Payments, and Cost History
-- Description: Creates supplier_payments, product_cost_history, and RPC functions:
--              receive_purchase, record_supplier_payment, and cancel_purchase.

-- ------------------------------------------------------------------------------
-- 1. EXTEND SUPPLIERS TABLE
-- ------------------------------------------------------------------------------
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms_days int DEFAULT 30;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ------------------------------------------------------------------------------
-- 2. CREATE SUPPLIER_PAYMENTS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  method payment_method NOT NULL,
  reference text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for supplier statements
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_date 
  ON supplier_payments(supplier_id, paid_at ASC);

-- ------------------------------------------------------------------------------
-- 3. CREATE PRODUCT_COST_HISTORY TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_cost_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  old_cost_cents bigint NOT NULL CHECK (old_cost_cents >= 0),
  new_cost_cents bigint NOT NULL CHECK (new_cost_cents >= 0),
  purchase_id uuid REFERENCES purchases(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_cost_history_product_date 
  ON product_cost_history(product_id, changed_at DESC);

-- ------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY ON NEW TABLES (APPEND-ONLY FOR MANAGERS & OWNERS)
-- ------------------------------------------------------------------------------
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_payments_select_policy ON supplier_payments;
CREATE POLICY supplier_payments_select_policy ON supplier_payments
  FOR SELECT TO authenticated
  USING (is_manager_or_owner());

DROP POLICY IF EXISTS supplier_payments_insert_policy ON supplier_payments;
CREATE POLICY supplier_payments_insert_policy ON supplier_payments
  FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_owner());

-- Revoke client direct UPDATE and DELETE (strictly append-only)
REVOKE ALL ON supplier_payments FROM anon;
REVOKE UPDATE, DELETE ON supplier_payments FROM authenticated;
GRANT SELECT, INSERT ON supplier_payments TO authenticated;

ALTER TABLE product_cost_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_cost_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_cost_history_select_policy ON product_cost_history;
CREATE POLICY product_cost_history_select_policy ON product_cost_history
  FOR SELECT TO authenticated
  USING (is_manager_or_owner());

DROP POLICY IF EXISTS product_cost_history_insert_policy ON product_cost_history;
CREATE POLICY product_cost_history_insert_policy ON product_cost_history
  FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_owner());

REVOKE ALL ON product_cost_history FROM anon;
REVOKE UPDATE, DELETE ON product_cost_history FROM authenticated;
GRANT SELECT, INSERT ON product_cost_history TO authenticated;

-- Ensure purchases & purchase_items allow manager and owner insert/select
DROP POLICY IF EXISTS purchases_select_policy ON purchases;
CREATE POLICY purchases_select_policy ON purchases
  FOR SELECT TO authenticated
  USING (is_manager_or_owner());

DROP POLICY IF EXISTS purchases_insert_policy ON purchases;
CREATE POLICY purchases_insert_policy ON purchases
  FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_owner());

DROP POLICY IF EXISTS purchases_update_policy ON purchases;
CREATE POLICY purchases_update_policy ON purchases
  FOR UPDATE TO authenticated
  USING (is_manager_or_owner())
  WITH CHECK (is_manager_or_owner());

DROP POLICY IF EXISTS purchase_items_select_policy ON purchase_items;
CREATE POLICY purchase_items_select_policy ON purchase_items
  FOR SELECT TO authenticated
  USING (is_manager_or_owner());

DROP POLICY IF EXISTS purchase_items_insert_policy ON purchase_items;
CREATE POLICY purchase_items_insert_policy ON purchase_items
  FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_owner());

-- ------------------------------------------------------------------------------
-- 5. FUNCTION: receive_purchase
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION receive_purchase(
  p_supplier_id uuid,
  p_invoice_no text,
  p_items jsonb,
  p_paid_cents bigint DEFAULT 0,
  p_pay_method payment_method DEFAULT 'cash'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_trimmed_invoice text;
  v_purchase_id uuid;
  v_item jsonb;
  v_prod_id uuid;
  v_qty numeric(12,3);
  v_unit_cost bigint;
  v_batch_no text;
  v_expiry_date date;
  v_line_total bigint;
  v_total_cost bigint := 0;
  v_unpaid_balance bigint := 0;
  v_prod record;
  v_new_stock numeric(12,3);
  v_batch_id uuid;
  v_supplier_balance bigint;
BEGIN
  -- 1. Authorization: Manager and Owner only
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can receive purchases';
  END IF;

  v_user_id := auth.uid();

  -- Enable stock write permission for this transaction
  PERFORM set_config('app.stock_write', 'on', true);

  -- 2. Validate Supplier
  SELECT balance_cents INTO v_supplier_balance
  FROM suppliers
  WHERE id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPLIER_NOT_FOUND';
  END IF;

  -- 3. Validate Invoice Number & Duplicate Check
  v_trimmed_invoice := trim(p_invoice_no);
  IF v_trimmed_invoice IS NULL OR v_trimmed_invoice = '' THEN
    RAISE EXCEPTION 'INVALID_INPUT: Invoice number is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM purchases 
    WHERE supplier_id = p_supplier_id 
      AND invoice_no = v_trimmed_invoice 
      AND status != 'cancelled'
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_INVOICE';
  END IF;

  -- 4. Validate Items
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Purchase items cannot be empty';
  END IF;

  IF p_paid_cents < 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Paid amount cannot be negative';
  END IF;

  -- 5. Calculate Total & Validate Lines with round-half-up
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::numeric;
    v_unit_cost := (v_item->>'unit_cost_cents')::bigint;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'INVALID_INPUT: Quantity must be greater than zero';
    END IF;

    IF v_unit_cost IS NULL OR v_unit_cost < 0 THEN
      RAISE EXCEPTION 'INVALID_INPUT: Unit cost cannot be negative';
    END IF;

    -- Round half up for line total
    v_line_total := round(v_qty * v_unit_cost)::bigint;
    v_total_cost := v_total_cost + v_line_total;
  END LOOP;

  IF p_paid_cents > v_total_cost THEN
    RAISE EXCEPTION 'INVALID_INPUT: Paid amount cannot exceed total purchase cost';
  END IF;

  -- 6. Insert purchases record
  INSERT INTO purchases (
    supplier_id,
    invoice_no,
    status,
    total_cents,
    received_at,
    created_by,
    created_at
  ) VALUES (
    p_supplier_id,
    v_trimmed_invoice,
    'received',
    v_total_cost,
    now(),
    v_user_id,
    now()
  ) RETURNING id INTO v_purchase_id;

  -- 7. Lock products in ID order to prevent deadlock
  PERFORM id
  FROM products
  WHERE id IN (
    SELECT DISTINCT (elem->>'product_id')::uuid 
    FROM jsonb_array_elements(p_items) elem
  )
  ORDER BY id
  FOR UPDATE;

  -- 8. Process each item: insert purchase_items, update products stock & cost, record cost history & batches
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_prod_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_unit_cost := (v_item->>'unit_cost_cents')::bigint;
    v_batch_no := NULLIF(trim(v_item->>'batch_no'), '');
    v_expiry_date := NULLIF(trim(v_item->>'expiry_date'), '')::date;

    SELECT id, sku, name, cost_price_cents, stock_qty, track_expiry
    INTO v_prod
    FROM products
    WHERE id = v_prod_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND:%', v_prod_id;
    END IF;

    -- Require expiry date if product tracks expiry
    IF v_prod.track_expiry AND v_expiry_date IS NULL THEN
      RAISE EXCEPTION 'EXPIRY_REQUIRED:%', v_prod.sku;
    END IF;

    -- Line total
    v_line_total := round(v_qty * v_unit_cost)::bigint;

    -- A. Insert purchase_items
    INSERT INTO purchase_items (
      purchase_id,
      product_id,
      quantity,
      unit_cost_cents,
      batch_no,
      expiry_date,
      created_at
    ) VALUES (
      v_purchase_id,
      v_prod_id,
      v_qty,
      v_unit_cost,
      v_batch_no,
      v_expiry_date,
      now()
    );

    -- B. Update product stock and cost price
    PERFORM set_config('app.stock_write', 'on', true);
    UPDATE products
    SET 
      stock_qty = stock_qty + v_qty,
      cost_price_cents = v_unit_cost,
      updated_at = now()
    WHERE id = v_prod_id
    RETURNING stock_qty INTO v_new_stock;

    -- C. Record stock movement
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
      v_prod_id,
      'purchase',
      v_qty,
      v_new_stock,
      'purchase',
      v_purchase_id,
      'Purchase invoice ' || v_trimmed_invoice,
      v_user_id,
      now()
    );

    -- D. Record product cost history if cost changed or initial
    IF v_prod.cost_price_cents IS DISTINCT FROM v_unit_cost THEN
      INSERT INTO product_cost_history (
        product_id,
        old_cost_cents,
        new_cost_cents,
        purchase_id,
        changed_at
      ) VALUES (
        v_prod_id,
        v_prod.cost_price_cents,
        v_unit_cost,
        v_purchase_id,
        now()
      );
    END IF;

    -- E. Create or increase stock_batches if track_expiry is true
    IF v_prod.track_expiry AND v_expiry_date IS NOT NULL THEN
      SELECT id INTO v_batch_id
      FROM stock_batches
      WHERE product_id = v_prod_id
        AND (batch_no = v_batch_no OR (batch_no IS NULL AND v_batch_no IS NULL))
        AND expiry_date = v_expiry_date;

      IF FOUND THEN
        UPDATE stock_batches
        SET qty_remaining = qty_remaining + v_qty
        WHERE id = v_batch_id;
      ELSE
        INSERT INTO stock_batches (
          product_id,
          batch_no,
          expiry_date,
          qty_remaining,
          created_at
        ) VALUES (
          v_prod_id,
          COALESCE(v_batch_no, 'BATCH-' || to_char(now(), 'YYYYMMDD')),
          v_expiry_date,
          v_qty,
          now()
        );
      END IF;
    END IF;
  END LOOP;

  -- 9. Add unpaid amount (total - paid) to supplier balance
  v_unpaid_balance := v_total_cost - p_paid_cents;
  IF v_unpaid_balance > 0 THEN
    UPDATE suppliers
    SET 
      balance_cents = balance_cents + v_unpaid_balance,
      updated_at = now()
    WHERE id = p_supplier_id
    RETURNING balance_cents INTO v_supplier_balance;
  END IF;

  -- 10. Record supplier payment if paid > 0
  IF p_paid_cents > 0 THEN
    INSERT INTO supplier_payments (
      supplier_id,
      amount_cents,
      method,
      reference,
      paid_at,
      created_by,
      created_at
    ) VALUES (
      p_supplier_id,
      p_paid_cents,
      p_pay_method,
      'Invoice ' || v_trimmed_invoice,
      now(),
      v_user_id,
      now()
    );
  END IF;

  -- 11. Write audit log
  INSERT INTO audit_log (
    user_id,
    action,
    table_name,
    record_id,
    new_data
  ) VALUES (
    v_user_id,
    'purchase.receive',
    'purchases',
    v_purchase_id::text,
    jsonb_build_object(
      'invoice_no', v_trimmed_invoice,
      'total_cost_cents', v_total_cost,
      'paid_cents', p_paid_cents,
      'unpaid_cents', v_unpaid_balance,
      'items_count', jsonb_array_length(p_items)
    )
  );

  RETURN jsonb_build_object(
    'purchase_id', v_purchase_id,
    'invoice_no', v_trimmed_invoice,
    'total_cents', v_total_cost,
    'paid_cents', p_paid_cents,
    'balance_cents', v_unpaid_balance,
    'supplier_balance_cents', v_supplier_balance
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. FUNCTION: record_supplier_payment
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_supplier_payment(
  p_supplier_id uuid,
  p_amount_cents bigint,
  p_method payment_method,
  p_reference text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_current_balance bigint;
  v_new_balance bigint;
  v_payment_id uuid;
BEGIN
  -- Authorization check: Manager and Owner only
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only managers and owners can record supplier payments';
  END IF;

  v_user_id := auth.uid();

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: Payment amount must be greater than zero';
  END IF;

  -- Lock supplier row
  SELECT balance_cents INTO v_current_balance
  FROM suppliers
  WHERE id = p_supplier_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPLIER_NOT_FOUND';
  END IF;

  -- Never let balance go below zero
  IF p_amount_cents > v_current_balance THEN
    RAISE EXCEPTION 'PAYMENT_EXCEEDS_BALANCE: Supplier balance is % but payment is %', 
      v_current_balance, p_amount_cents;
  END IF;

  -- Reduce supplier balance
  UPDATE suppliers
  SET 
    balance_cents = balance_cents - p_amount_cents,
    updated_at = now()
  WHERE id = p_supplier_id
  RETURNING balance_cents INTO v_new_balance;

  -- Insert payment record
  INSERT INTO supplier_payments (
    supplier_id,
    amount_cents,
    method,
    reference,
    paid_at,
    created_by,
    created_at
  ) VALUES (
    p_supplier_id,
    p_amount_cents,
    p_method,
    trim(p_reference),
    now(),
    v_user_id,
    now()
  ) RETURNING id INTO v_payment_id;

  -- Audit log
  INSERT INTO audit_log (
    user_id,
    action,
    table_name,
    record_id,
    new_data
  ) VALUES (
    v_user_id,
    'supplier_payment.create',
    'supplier_payments',
    v_payment_id::text,
    jsonb_build_object(
      'supplier_id', p_supplier_id,
      'amount_cents', p_amount_cents,
      'new_balance_cents', v_new_balance,
      'method', p_method,
      'reference', p_reference
    )
  );

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'supplier_id', p_supplier_id,
    'amount_cents', p_amount_cents,
    'previous_balance_cents', v_current_balance,
    'new_balance_cents', v_new_balance
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. FUNCTION: cancel_purchase (Owner Only)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_purchase(
  p_purchase_id uuid,
  p_reason text DEFAULT 'Purchase cancelled by owner'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_purchase record;
  v_item record;
  v_prod record;
  v_new_stock numeric(12,3);
  v_total_paid bigint := 0;
  v_unpaid_reversal bigint := 0;
  v_supplier_balance bigint;
BEGIN
  -- Authorization check: Owner only
  IF NOT is_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED: Only owners can cancel purchases';
  END IF;

  v_user_id := auth.uid();

  -- Enable stock write permission for this transaction
  PERFORM set_config('app.stock_write', 'on', true);

  -- Lock purchase
  SELECT * INTO v_purchase
  FROM purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PURCHASE_NOT_FOUND';
  END IF;

  IF v_purchase.status != 'received' THEN
    RAISE EXCEPTION 'CANNOT_CANCEL: Purchase status is %', v_purchase.status;
  END IF;

  -- Check all items first: does enough stock remain?
  FOR v_item IN SELECT * FROM purchase_items WHERE purchase_id = p_purchase_id LOOP
    SELECT stock_qty, track_expiry INTO v_prod
    FROM products
    WHERE id = v_item.product_id
    FOR UPDATE;

    IF v_prod.stock_qty < v_item.quantity THEN
      RAISE EXCEPTION 'STOCK_ALREADY_SOLD';
    END IF;
  END LOOP;

  -- Reverse stock and batches
  PERFORM set_config('app.stock_write', 'on', true);
  FOR v_item IN SELECT * FROM purchase_items WHERE purchase_id = p_purchase_id LOOP
    UPDATE products
    SET 
      stock_qty = stock_qty - v_item.quantity,
      updated_at = now()
    WHERE id = v_item.product_id
    RETURNING stock_qty INTO v_new_stock;

    -- Record reversal stock movement
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
      'adjustment',
      -v_item.quantity,
      v_new_stock,
      'purchase_cancellation',
      p_purchase_id,
      'Cancelled purchase invoice ' || v_purchase.invoice_no || ': ' || COALESCE(p_reason, ''),
      v_user_id,
      now()
    );

    -- Reduce batch quantity if applicable
    IF v_item.batch_no IS NOT NULL THEN
      UPDATE stock_batches
      SET qty_remaining = GREATEST(0, qty_remaining - v_item.quantity)
      WHERE product_id = v_item.product_id
        AND batch_no = v_item.batch_no;
    END IF;
  END LOOP;

  -- Reverse unpaid supplier balance
  SELECT COALESCE(sum(amount_cents), 0) INTO v_total_paid
  FROM supplier_payments
  WHERE supplier_id = v_purchase.supplier_id
    AND reference = 'Invoice ' || v_purchase.invoice_no;

  v_unpaid_reversal := GREATEST(0, v_purchase.total_cents - v_total_paid);

  IF v_unpaid_reversal > 0 THEN
    UPDATE suppliers
    SET 
      balance_cents = GREATEST(0, balance_cents - v_unpaid_reversal),
      updated_at = now()
    WHERE id = v_purchase.supplier_id
    RETURNING balance_cents INTO v_supplier_balance;
  END IF;

  -- Mark purchase cancelled
  UPDATE purchases
  SET 
    status = 'cancelled',
    received_at = NULL
  WHERE id = p_purchase_id;

  -- Audit log
  INSERT INTO audit_log (
    user_id,
    action,
    table_name,
    record_id,
    new_data
  ) VALUES (
    v_user_id,
    'purchase.cancel',
    'purchases',
    p_purchase_id::text,
    jsonb_build_object(
      'invoice_no', v_purchase.invoice_no,
      'total_cents', v_purchase.total_cents,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'purchase_id', p_purchase_id,
    'status', 'cancelled',
    'invoice_no', v_purchase.invoice_no,
    'reversed_unpaid_balance_cents', v_unpaid_reversal
  );
END;
$$;

-- Grant execution permissions
REVOKE ALL ON FUNCTION receive_purchase FROM public;
GRANT EXECUTE ON FUNCTION receive_purchase TO authenticated;

REVOKE ALL ON FUNCTION record_supplier_payment FROM public;
GRANT EXECUTE ON FUNCTION record_supplier_payment TO authenticated;

REVOKE ALL ON FUNCTION cancel_purchase FROM public;
GRANT EXECUTE ON FUNCTION cancel_purchase TO authenticated;

