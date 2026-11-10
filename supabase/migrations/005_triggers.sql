-- ==============================================================================
-- Migration: 005_triggers.sql
-- Description: Financial immutability, data protection triggers, and audit guards
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. IMMUTABILITY TRIGGER FOR APPEND-ONLY TABLES: audit_log
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table "audit_log" is strictly append-only. Modifying or deleting records is prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_log;
CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

-- ------------------------------------------------------------------------------
-- 2. IMMUTABILITY TRIGGER FOR APPEND-ONLY TABLES: stock_movements
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_stock_movements_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table "stock_movements" is strictly append-only. Modifying or deleting stock ledger entries is prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_movements_immutable ON stock_movements;
CREATE TRIGGER trg_stock_movements_immutable
BEFORE UPDATE OR DELETE ON stock_movements
FOR EACH ROW EXECUTE FUNCTION prevent_stock_movements_modification();

-- ------------------------------------------------------------------------------
-- 3. IMMUTABILITY TRIGGER FOR HISTORICAL TRANSACTION ITEMS: sale_items
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_sale_items_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table "sale_items" stores immutable transaction snapshots. Modifying or deleting sale items is prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sale_items_immutable ON sale_items;
CREATE TRIGGER trg_sale_items_immutable
BEFORE UPDATE OR DELETE ON sale_items
FOR EACH ROW EXECUTE FUNCTION prevent_sale_items_modification();

-- ------------------------------------------------------------------------------
-- 4. SALES INTEGRITY TRIGGER: Block DELETE; Block money column UPDATEs
-- Only status/void metadata and print_count may change
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_sales_immutability()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Hard DELETE on table "sales" is strictly forbidden. Transactions must be voided or returned.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Check that core transaction IDs and timestamps never change
    IF OLD.id <> NEW.id OR
       OLD.bill_no <> NEW.bill_no OR
       OLD.idempotency_key <> NEW.idempotency_key OR
       OLD.shift_id <> NEW.shift_id OR
       OLD.cashier_id <> NEW.cashier_id OR
       OLD.created_at <> NEW.created_at
    THEN
      RAISE EXCEPTION 'Immutable transaction identifiers on table "sales" cannot be altered.';
    END IF;

    -- Check that money and tax calculations never change after sale finalization
    IF OLD.subtotal_cents <> NEW.subtotal_cents OR
       OLD.line_discount_cents <> NEW.line_discount_cents OR
       OLD.bill_discount_cents <> NEW.bill_discount_cents OR
       OLD.taxable_cents <> NEW.taxable_cents OR
       OLD.tax_cents <> NEW.tax_cents OR
       OLD.total_cents <> NEW.total_cents OR
       OLD.paid_cents <> NEW.paid_cents OR
       OLD.change_cents <> NEW.change_cents OR
       OLD.tax_rate_percent_snapshot <> NEW.tax_rate_percent_snapshot OR
       OLD.tax_inclusive_snapshot <> NEW.tax_inclusive_snapshot
    THEN
      RAISE EXCEPTION 'Money, discount, and tax values on table "sales" are permanent and cannot be modified. Void the sale instead.';
    END IF;

    -- Customer association cannot be altered retrospectively
    IF (OLD.customer_id IS DISTINCT FROM NEW.customer_id) OR
       (OLD.customer_phone IS DISTINCT FROM NEW.customer_phone)
    THEN
      RAISE EXCEPTION 'Customer details attached to finalized sale cannot be altered.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sales_immutability ON sales;
CREATE TRIGGER trg_sales_immutability
BEFORE UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION enforce_sales_immutability();

-- ------------------------------------------------------------------------------
-- 5. AUTOMATIC updated_at TIMESTAMP MANAGEMENT
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_shop_settings_updated_at ON shop_settings;
CREATE TRIGGER trg_shop_settings_updated_at
BEFORE UPDATE ON shop_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------------
-- 6. RESTRICT HARD DELETE ON PRODUCTS WITH HISTORICAL SALES
-- Products with historical sales can only be marked inactive (is_active = false)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_product_delete_with_sales()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM sale_items WHERE product_id = OLD.id) THEN
    RAISE EXCEPTION 'Product "%" (SKU: %) has recorded sales and cannot be deleted. Deactivate it instead by setting is_active = false.', OLD.name, OLD.sku;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_product_delete_with_sales ON products;
CREATE TRIGGER trg_prevent_product_delete_with_sales
BEFORE DELETE ON products
FOR EACH ROW EXECUTE FUNCTION prevent_product_delete_with_sales();

-- ------------------------------------------------------------------------------
-- 7. DEFERRED CONSTRAINT TRIGGER: Ensure sale has at least 1 item and full payment
-- Evaluated at COMMIT time so atomic multi-statement checkout transactions succeed
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_sale_complete()
RETURNS trigger AS $$
DECLARE
  v_item_count int;
  v_paid_sum bigint;
BEGIN
  -- 1. Ensure at least one line item exists for this sale
  SELECT COUNT(*) INTO v_item_count 
  FROM sale_items 
  WHERE sale_id = NEW.id;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Financial Violation: Sale "%" has no line items recorded.', NEW.bill_no;
  END IF;

  -- 2. Ensure recorded payment records sum up to at least total_cents
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_paid_sum 
  FROM payments 
  WHERE sale_id = NEW.id;

  IF v_paid_sum < NEW.total_cents THEN
    RAISE EXCEPTION 'Financial Violation: Sale "%" total is % cents, but received payments sum to % cents.', 
      NEW.bill_no, NEW.total_cents, v_paid_sum;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_sale_complete ON sales;
CREATE CONSTRAINT TRIGGER trg_check_sale_complete
AFTER INSERT OR UPDATE ON sales
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_sale_complete();

