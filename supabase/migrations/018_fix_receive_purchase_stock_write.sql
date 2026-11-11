-- ==============================================================================
-- Migration: 018_fix_receive_purchase_stock_write.sql
-- Description: Authorize stock & batch writes within receive_purchase and cancel_purchase.
--              Sets app.stock_write = 'on' for transaction scope so security triggers
--              (trg_prevent_direct_stock_products & trg_prevent_direct_stock_batches)
--              allow updating products.stock_qty and inserting/updating stock_batches.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FUNCTION: receive_purchase
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
-- 2. FUNCTION: cancel_purchase (Owner Only)
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

-- ------------------------------------------------------------------------------
-- 3. PERMISSIONS GRANTS
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION receive_purchase FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION receive_purchase TO authenticated;

REVOKE ALL ON FUNCTION cancel_purchase FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_purchase TO authenticated;
