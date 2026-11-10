-- ==============================================================================
-- Migration: 004_indexes.sql
-- Description: Performance and uniqueness indexes for high-throughput POS queries
-- ==============================================================================

-- 1. SHIFTS: Enforce at most ONE open shift per cashier at any given time
CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_cashier_open 
  ON shifts (cashier_id) 
  WHERE status = 'open';

-- 2. SALES: Fast lookup by timeline, cashier shifts, and bill status
CREATE INDEX IF NOT EXISTS idx_sales_created_at 
  ON sales (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_cashier_created_at 
  ON sales (cashier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_shift_id 
  ON sales (shift_id);

CREATE INDEX IF NOT EXISTS idx_sales_status 
  ON sales (status);

-- 3. SALE ITEMS: High-speed relational joins for receipt rendering and returns
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id 
  ON sale_items (sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_product_id 
  ON sale_items (product_id);

-- 4. STOCK MOVEMENTS: Inventory ledger audit timeline per product
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created_at 
  ON stock_movements (product_id, created_at DESC);

-- 5. PRODUCTS: Fast fuzzy name search (pg_trgm) and instant barcode lookup
CREATE INDEX IF NOT EXISTS idx_products_name_trgm 
  ON products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_barcode 
  ON products (barcode) 
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_sku 
  ON products (sku);

CREATE INDEX IF NOT EXISTS idx_products_category_id 
  ON products (category_id);

-- 6. STOCK BATCHES: Expiry FEFO tracking
CREATE INDEX IF NOT EXISTS idx_stock_batches_product_expiry 
  ON stock_batches (product_id, expiry_date ASC);

-- 7. PAYMENTS: Fast aggregation of sales receipts
CREATE INDEX IF NOT EXISTS idx_payments_sale_id 
  ON payments (sale_id);

-- 8. SMS OUTBOX: Queue polling index for background processing worker
CREATE INDEX IF NOT EXISTS idx_sms_outbox_status 
  ON sms_outbox (status) 
  WHERE status IN ('pending', 'sending');

-- 9. CUSTOMERS: Lookup index
CREATE INDEX IF NOT EXISTS idx_customers_phone 
  ON customers (phone);

-- 10. PURCHASING: Vendor invoice lookups
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id 
  ON purchases (supplier_id);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id 
  ON purchase_items (purchase_id);

-- 11. AUDIT LOG: Historical analysis queries
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at 
  ON audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record 
  ON audit_log (table_name, record_id);

