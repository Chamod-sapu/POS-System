-- ==============================================================================
-- Migration: 008_inventory_audit_bulk.sql
-- Description: Automatic product price change audit logging, atomic bulk CSV import,
--              and bulk stocktake reconciliation RPCs
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TRIGGER: Automatic Audit Logging for Product Price and Cost Changes
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_product_price_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid);
BEGIN
  -- Detect if selling price or cost price has changed
  IF (OLD.selling_price_cents IS DISTINCT FROM NEW.selling_price_cents) OR
     (OLD.cost_price_cents IS DISTINCT FROM NEW.cost_price_cents) THEN
    INSERT INTO audit_log (
      user_id,
      action,
      table_name,
      record_id,
      old_data,
      new_data,
      created_at
    ) VALUES (
      v_user_id,
      'product.price_change',
      'products',
      NEW.id::text,
      jsonb_build_object(
        'sku', OLD.sku,
        'name', OLD.name,
        'selling_price_cents', OLD.selling_price_cents,
        'cost_price_cents', OLD.cost_price_cents
      ),
      jsonb_build_object(
        'sku', NEW.sku,
        'name', NEW.name,
        'selling_price_cents', NEW.selling_price_cents,
        'cost_price_cents', NEW.cost_price_cents
      ),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_product_price_changes ON products;
CREATE TRIGGER trg_audit_product_price_changes
AFTER UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION audit_product_price_changes();

-- ------------------------------------------------------------------------------
-- 2. FUNCTION: Atomic Bulk Product Import
-- Imports an array of products in a single database transaction.
-- If any product row fails validation, constraint or opening stock, the entire
-- batch rolls back and nothing is half-imported.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bulk_import_products(p_products jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid);
  v_item jsonb;
  v_sku text;
  v_barcode text;
  v_name text;
  v_category_id uuid;
  v_unit text;
  v_allow_decimal boolean;
  v_cost_cents bigint;
  v_selling_cents bigint;
  v_tax_exempt boolean;
  v_reorder_level numeric(12,3);
  v_track_expiry boolean;
  v_opening_stock numeric(12,3);
  v_new_id uuid;
  v_imported_count int := 0;
  v_row_idx int := 0;
BEGIN
  -- 1. Authorization: Only manager or owner can bulk import products
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  IF jsonb_array_length(p_products) = 0 THEN
    RAISE EXCEPTION 'NO_ITEMS:Import payload contains no products';
  END IF;

  -- 2. Iterate through each product in the JSON array
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_products) LOOP
    v_row_idx := v_row_idx + 1;

    v_sku := trim(COALESCE(v_item->>'sku', ''));
    v_barcode := NULLIF(trim(COALESCE(v_item->>'barcode', '')), '');
    v_name := trim(COALESCE(v_item->>'name', ''));
    v_category_id := (v_item->>'category_id')::uuid;
    v_unit := trim(COALESCE(v_item->>'unit', 'pcs'));
    v_allow_decimal := COALESCE((v_item->>'allow_decimal_qty')::boolean, v_unit IN ('kg', 'g', 'l', 'ml'));
    v_cost_cents := COALESCE((v_item->>'cost_price_cents')::bigint, 0);
    v_selling_cents := (v_item->>'selling_price_cents')::bigint;
    v_tax_exempt := COALESCE((v_item->>'tax_exempt')::boolean, false);
    v_reorder_level := COALESCE((v_item->>'reorder_level')::numeric, 0);
    v_track_expiry := COALESCE((v_item->>'track_expiry')::boolean, false);
    v_opening_stock := COALESCE((v_item->>'opening_stock_qty')::numeric, 0);

    -- Validation
    IF v_sku = '' THEN
      RAISE EXCEPTION 'Row %: SKU is required', v_row_idx;
    END IF;

    IF v_name = '' THEN
      RAISE EXCEPTION 'Row % (SKU: %): Product name is required', v_row_idx, v_sku;
    END IF;

    IF v_category_id IS NULL THEN
      RAISE EXCEPTION 'Row % (SKU: %): Valid category is required', v_row_idx, v_sku;
    END IF;

    IF v_unit NOT IN ('pcs', 'kg', 'g', 'l', 'ml', 'pack', 'box') THEN
      RAISE EXCEPTION 'Row % (SKU: %): Invalid unit "%"', v_row_idx, v_sku, v_unit;
    END IF;

    IF v_selling_cents IS NULL OR v_selling_cents < 0 THEN
      RAISE EXCEPTION 'Row % (SKU: %): Selling price must be a non-negative amount', v_row_idx, v_sku;
    END IF;

    IF v_cost_cents < 0 THEN
      RAISE EXCEPTION 'Row % (SKU: %): Cost price cannot be negative', v_row_idx, v_sku;
    END IF;

    IF v_opening_stock < 0 THEN
      RAISE EXCEPTION 'Row % (SKU: %): Opening stock cannot be negative', v_row_idx, v_sku;
    END IF;

    IF NOT v_allow_decimal AND v_opening_stock <> floor(v_opening_stock) THEN
      RAISE EXCEPTION 'Row % (SKU: %): Decimal opening quantity not allowed for unit "%"', v_row_idx, v_sku, v_unit;
    END IF;

    -- Check for SKU duplication
    IF EXISTS (SELECT 1 FROM products WHERE sku = v_sku) THEN
      RAISE EXCEPTION 'Row %: Product SKU "%" already exists in database', v_row_idx, v_sku;
    END IF;

    -- Check for barcode duplication
    IF v_barcode IS NOT NULL AND EXISTS (SELECT 1 FROM products WHERE barcode = v_barcode) THEN
      RAISE EXCEPTION 'Row %: Barcode "%" already assigned to another product', v_row_idx, v_barcode;
    END IF;

    -- Insert new product
    INSERT INTO products (
      sku,
      barcode,
      name,
      category_id,
      unit,
      allow_decimal_qty,
      cost_price_cents,
      selling_price_cents,
      tax_exempt,
      stock_qty,
      reorder_level,
      track_expiry,
      is_active
    ) VALUES (
      v_sku,
      v_barcode,
      v_name,
      v_category_id,
      v_unit,
      v_allow_decimal,
      v_cost_cents,
      v_selling_cents,
      v_tax_exempt,
      0, -- Always initialize at 0, opening stock applied via adjust_stock below
      v_reorder_level,
      v_track_expiry,
      true
    ) RETURNING id INTO v_new_id;

    -- Record opening stock via adjust_stock so stock_movements ledger is 100% complete
    IF v_opening_stock > 0 THEN
      PERFORM adjust_stock(
        v_new_id,
        v_opening_stock,
        'Opening Stock Import',
        'opening'
      );
    END IF;

    v_imported_count := v_imported_count + 1;
  END LOOP;

  -- Audit log for bulk import
  INSERT INTO audit_log (
    user_id,
    action,
    table_name,
    record_id,
    new_data,
    created_at
  ) VALUES (
    v_user_id,
    'product.bulk_import',
    'products',
    NULL,
    jsonb_build_object('count', v_imported_count),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'imported_count', v_imported_count
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. FUNCTION: Atomic Bulk Stocktake Reconciliation
-- Iterates through counted quantities and generates 'stocktake' adjustments
-- only for items where counted differs from recorded stock.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bulk_stocktake(p_adjustments jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := COALESCE(auth.uid(), NULLIF(current_setting('app.current_user_id', true), '')::uuid);
  v_item jsonb;
  v_prod_id uuid;
  v_counted numeric(12,3);
  v_note text;
  v_current_stock numeric(12,3);
  v_sku text;
  v_diff numeric(12,3);
  v_adjusted_count int := 0;
BEGIN
  -- 1. Authorization: Only manager or owner can perform stocktake
  IF NOT is_manager_or_owner() THEN
    RAISE EXCEPTION 'NOT_AUTHORISED';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_adjustments) LOOP
    v_prod_id := (v_item->>'product_id')::uuid;
    v_counted := (v_item->>'counted_qty')::numeric;
    v_note := COALESCE(trim(v_item->>'note'), 'Physical Stocktake Count');

    IF v_counted < 0 THEN
      RAISE EXCEPTION 'Counted quantity cannot be negative';
    END IF;

    SELECT stock_qty, sku INTO v_current_stock, v_sku
    FROM products
    WHERE id = v_prod_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found', v_prod_id;
    END IF;

    v_diff := v_counted - v_current_stock;

    -- Only create movement if there is a discrepancy
    IF v_diff <> 0 THEN
      PERFORM adjust_stock(
        v_prod_id,
        v_diff,
        v_note,
        'stocktake'
      );
      v_adjusted_count := v_adjusted_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'adjusted_items_count', v_adjusted_count
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. PERMISSIONS
-- ------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION bulk_import_products(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_stocktake(jsonb) TO authenticated;

