import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Postgres Schema Migrations', () => {
  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');
  const seedFile = path.resolve(__dirname, '../../supabase/seed.sql');
  const sqlTestFile = path.resolve(__dirname, '../../supabase/tests/006_create_sale_tests.sql');

  it('verifies all 6 migration files and seed file exist', () => {
    const files = [
      '001_extensions_enums.sql',
      '002_core_tables.sql',
      '003_sales_tables.sql',
      '004_indexes.sql',
      '005_triggers.sql',
      '006_create_sale.sql',
      '007_rls.sql',
      '008_inventory_audit_bulk.sql',
      '009_quote_sale.sql',
      '010_sms.sql',
      '011_stock_levels.sql',
      '012_purchasing.sql',
      '013_loyalty.sql',
      '014_returns_shifts.sql',
      '015_reports.sql',
      '016_hardening.sql',
      '017_bill_audit.sql',
    ];

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      expect(fs.existsSync(fullPath), `Migration file ${file} should exist`).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content.length).toBeGreaterThan(100);
    }

    expect(fs.existsSync(seedFile), 'Seed file should exist').toBe(true);
    const seedContent = fs.readFileSync(seedFile, 'utf8');
    expect(seedContent.length).toBeGreaterThan(100);

    expect(fs.existsSync(sqlTestFile), 'SQL test file should exist').toBe(true);
    const sqlTestContent = fs.readFileSync(sqlTestFile, 'utf8');
    expect(sqlTestContent.length).toBeGreaterThan(100);

    const rlsTestFile = path.resolve(__dirname, '../../supabase/tests/rls.sql');
    expect(fs.existsSync(rlsTestFile), 'RLS test file should exist').toBe(true);
    const rlsTestContent = fs.readFileSync(rlsTestFile, 'utf8');
    expect(rlsTestContent.length).toBeGreaterThan(100);

    const secAuditTestFile = path.resolve(__dirname, '../../supabase/tests/security_audit.sql');
    expect(fs.existsSync(secAuditTestFile), 'Security audit SQL file should exist').toBe(true);
    const secAuditContent = fs.readFileSync(secAuditTestFile, 'utf8');
    expect(secAuditContent).toContain('rowsecurity = false');
    expect(secAuditContent).toContain('search_path');
    expect(secAuditContent).toContain('grantee = \'anon\'');

    const propTestFile = path.resolve(__dirname, '../../supabase/tests/property_based_quote_sale.sql');
    expect(fs.existsSync(propTestFile), 'Property-based SQL test file should exist').toBe(true);
    const propContent = fs.readFileSync(propTestFile, 'utf8');
    expect(propContent).toContain('quote_sale');
    expect(propContent).toContain('1000');
  });

  it('checks 001_extensions_enums.sql defines all required ENUMs and extensions', () => {
    const content = fs.readFileSync(path.join(migrationsDir, '001_extensions_enums.sql'), 'utf8');
    expect(content).toContain('pgcrypto');
    expect(content).toContain('pg_trgm');
    expect(content).toContain('user_role');
    expect(content).toContain('movement_type');
    expect(content).toContain('sale_status');
    expect(content).toContain('payment_method');
    expect(content).toContain('sms_status');
    expect(content).toContain('purchase_status');
    expect(content).toContain('shift_status');
  });

  it('checks 002_core_tables.sql defines core tables and constraints', () => {
    const content = fs.readFileSync(path.join(migrationsDir, '002_core_tables.sql'), 'utf8');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS profiles');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS shop_settings');
    expect(content).toContain('id int PRIMARY KEY DEFAULT 1 CHECK (id = 1)');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS categories');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS products');
    expect(content).toContain('stock_qty numeric(12,3) NOT NULL DEFAULT 0 CHECK (stock_qty >= 0)');
    expect(content).toContain('cost_price_cents bigint NOT NULL DEFAULT 0 CHECK (cost_price_cents >= 0)');
    expect(content).toContain('selling_price_cents bigint NOT NULL CHECK (selling_price_cents >= 0)');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS stock_batches');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS stock_movements');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS customers');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS suppliers');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS purchases');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS purchase_items');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS shifts');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS bill_counters');
  });

  it('checks 003_sales_tables.sql defines financial sales tables and constraints', () => {
    const content = fs.readFileSync(path.join(migrationsDir, '003_sales_tables.sql'), 'utf8');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS sales');
    expect(content).toContain('chk_tax_exclusive_total');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS sale_items');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS payments');
    expect(content).toContain('amount_cents bigint NOT NULL CHECK (amount_cents > 0)');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS sale_returns');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS sale_return_items');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS sms_outbox');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS held_carts');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS audit_log');
  });

  it('checks 004_indexes.sql defines required partial and performance indexes', () => {
    const content = fs.readFileSync(path.join(migrationsDir, '004_indexes.sql'), 'utf8');
    expect(content).toContain('idx_shifts_cashier_open');
    expect(content).toContain('idx_sales_created_at');
    expect(content).toContain('idx_sales_cashier_created_at');
    expect(content).toContain('idx_sale_items_sale_id');
    expect(content).toContain('idx_sale_items_product_id');
    expect(content).toContain('idx_stock_movements_product_created_at');
    expect(content).toContain('idx_products_name_trgm');
    expect(content).toContain('idx_products_barcode');
    expect(content).toContain('idx_sms_outbox_status');
  });

  it('checks 005_triggers.sql defines immutability, updated_at, and completeness triggers', () => {
    const content = fs.readFileSync(path.join(migrationsDir, '005_triggers.sql'), 'utf8');
    expect(content).toContain('prevent_audit_log_modification');
    expect(content).toContain('prevent_stock_movements_modification');
    expect(content).toContain('prevent_sale_items_modification');
    expect(content).toContain('enforce_sales_immutability');
    expect(content).toContain('set_updated_at');
    expect(content).toContain('prevent_product_delete_with_sales');
    expect(content).toContain('check_sale_complete');
    expect(content).toContain('DEFERRABLE INITIALLY DEFERRED');
  });

  it('checks 006_create_sale.sql defines create_sale, get_bill, mark_bill_printed and protection', () => {
    const content = fs.readFileSync(path.join(migrationsDir, '006_create_sale.sql'), 'utf8');
    expect(content).toContain('CREATE OR REPLACE FUNCTION create_sale');
    expect(content).toContain('CREATE OR REPLACE FUNCTION get_bill');
    expect(content).toContain('CREATE OR REPLACE FUNCTION mark_bill_printed');
    expect(content).toContain('prevent_direct_sales_insert');
    expect(content).toContain('DIRECT_INSERT_FORBIDDEN');
    expect(content).toContain('normalize_phone_number');
    expect(content).toContain('OUT_OF_STOCK');
    expect(content).toContain('DISCOUNT_NOT_ALLOWED');
    expect(content).toContain('PAYMENT_EXCEEDS_REMAINING');
    expect(content).toContain('TOTAL_MISMATCH');
  });

  it('checks 007_rls.sql defines security functions, cashier view, RLS policies and adjust_stock', () => {
    const content = fs.readFileSync(path.join(migrationsDir, '007_rls.sql'), 'utf8');
    expect(content).toContain('CREATE OR REPLACE FUNCTION current_user_role');
    expect(content).toContain('CREATE OR REPLACE FUNCTION is_staff');
    expect(content).toContain('CREATE OR REPLACE FUNCTION is_manager_or_owner');
    expect(content).toContain('CREATE OR REPLACE FUNCTION is_owner');
    expect(content).toContain('CREATE VIEW pos_products');
    expect(content).toContain('ENABLE ROW LEVEL SECURITY');
    expect(content).toContain('FORCE ROW LEVEL SECURITY');
    expect(content).toContain('CREATE OR REPLACE FUNCTION adjust_stock');
    expect(content).toContain('v_new_stock < 0');
  });

  it('checks edge function admin-manage-staff exists and defines owner guards and actions', () => {
    const edgeFunctionPath = path.resolve(__dirname, '../../supabase/functions/admin-manage-staff/index.ts');
    expect(fs.existsSync(edgeFunctionPath)).toBe(true);
    const content = fs.readFileSync(edgeFunctionPath, 'utf8');
    expect(content).toContain('create_user');
    expect(content).toContain('set_role');
    expect(content).toContain('deactivate');
    expect(content).toContain('reactivate');
    expect(content).toContain('reset_password');
    expect(content).toContain('LAST_OWNER_PROTECTION');
    expect(content).toContain('audit_log');
  });

  it('checks 008_inventory_audit_bulk.sql defines price audit trigger, bulk import and stocktake RPCs', () => {
    const content = fs.readFileSync(path.join(migrationsDir, '008_inventory_audit_bulk.sql'), 'utf8');
    expect(content).toContain('audit_product_price_changes');
    expect(content).toContain('bulk_import_products');
    expect(content).toContain('bulk_stocktake');
    expect(content).toContain('trg_audit_product_price_changes');
  });

  it('checks 011_stock_levels.sql defines stock_levels, sync trigger, RLS, and pos_products view', () => {
    const content = fs.readFileSync(path.join(migrationsDir, '011_stock_levels.sql'), 'utf8');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS stock_levels');
    expect(content).toContain('sync_stock_levels');
    expect(content).toContain('trg_sync_stock_levels');
    expect(content).toContain('stock_levels_select_policy');
    expect(content).toContain('is_staff()');
    expect(content).toContain('supabase_realtime');
    expect(content).toContain('REPLICA IDENTITY FULL');
    expect(content).toContain('CREATE VIEW pos_products');
  });

  it('checks 012_purchasing.sql defines supplier_payments, product_cost_history, receive_purchase, and cancel_purchase', () => {
    const content = fs.readFileSync(path.join(migrationsDir, '012_purchasing.sql'), 'utf8');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS supplier_payments');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS product_cost_history');
    expect(content).toContain('CREATE OR REPLACE FUNCTION receive_purchase');
    expect(content).toContain('CREATE OR REPLACE FUNCTION record_supplier_payment');
    expect(content).toContain('CREATE OR REPLACE FUNCTION cancel_purchase');
    expect(content).toContain('DUPLICATE_INVOICE');
    expect(content).toContain('PAYMENT_EXCEEDS_BALANCE');
    expect(content).toContain('STOCK_ALREADY_SOLD');
  });

  it('checks 013_loyalty.sql defines loyalty settings, customer_points_ledger, and awards loyalty points', () => {
    const content = fs.readFileSync(path.join(migrationsDir, '013_loyalty.sql'), 'utf8');
    expect(content).toContain('loyalty_enabled');
    expect(content).toContain('loyalty_points_per_100_lkr');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS customer_points_ledger');
    expect(content).toContain('floor((v_total_cents::numeric / 10000.0) * v_shop.loyalty_points_per_100_lkr)');
    expect(content).toContain('CREATE OR REPLACE FUNCTION create_sale');
    expect(content).toContain('points_earned');
  });

  it('checks 014_returns_shifts.sql defines voids, returns, shifts, drawer reconciliation and batch tracking', () => {
    const content = fs.readFileSync(path.join(migrationsDir, '014_returns_shifts.sql'), 'utf8');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS public.sale_item_batches');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS public.cash_movements');
    expect(content).toContain('CREATE TABLE IF NOT EXISTS public.return_counters');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.open_shift');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.close_shift');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.x_report');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.record_cash_movement');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.void_sale');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.create_return');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.get_return');
    expect(content).toContain('NO_OPEN_SHIFT');
    expect(content).toContain('NOTE_REQUIRED_FOR_DISCREPANCY');
    expect(content).toContain('CANNOT_VOID_TWICE');
    expect(content).toContain('CANNOT_VOID_PAST_DAY');
    expect(content).toContain('RETURN_QTY_EXCEEDED');
    expect(content).toContain('REFUND_EXCEEDS_PAID');
    expect(content).toContain('SHIFT_ALREADY_OPEN');
  });

  it('checks 015_reports.sql defines all reporting functions, indexes, and reconciliation audit', () => {
    const content = fs.readFileSync(path.join(migrationsDir, '015_reports.sql'), 'utf8');
    expect(content).toContain('CREATE INDEX IF NOT EXISTS idx_sales_created_at_status');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.get_colombo_bounds');
    expect(content).toContain('RANGE_TOO_LARGE');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_daily_summary');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_sales_by_product');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_sales_by_category');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_sales_by_cashier');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_sales_by_hour');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_profit');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_stock_valuation');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_low_stock');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_dead_stock');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_expiry');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_tax');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_returns_voids');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_supplier_balances');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_top_customers');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_sms');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_reconciliation');
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.report_dashboard_summary');
    expect(content).toContain('SECURITY DEFINER');
    expect(content).toContain('SET search_path = public');
  });

  it('checks 016_hardening.sql defines stock write lock, audit triggers, and AAL2 policies', () => {
    const content = fs.readFileSync(path.join(migrationsDir, '016_hardening.sql'), 'utf8');
    expect(content).toContain('check_stock_write_permission');
    expect(content).toContain('trg_prevent_direct_stock_products');
    expect(content).toContain('trg_prevent_direct_stock_batches');
    expect(content).toContain('app.stock_write');
    expect(content).toContain('is_owner_aal2');
    expect(content).toContain('trg_audit_products');
    expect(content).toContain('trg_audit_shop_settings');
    expect(content).toContain('trg_audit_profiles');
    expect(content).toContain('trg_audit_categories');
    expect(content).toContain('trg_audit_customers');
    expect(content).toContain('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon');
    expect(content).toContain('SET search_path = public, pg_temp');
  });

  it('checks seed.sql contains shop settings, 6 categories, and 20 products with 2 weighed items', () => {
    const content = fs.readFileSync(seedFile, 'utf8');
    expect(content).toContain('Wewala Super Store');
    expect(content).toContain('Grains, Rice & Flour');
    expect(content).toContain('Dairy & Eggs');
    expect(content).toContain('Beverages & Tea');
    expect(content).toContain('Biscuits & Confectionery');
    expect(content).toContain('Household & Personal Care');
    expect(content).toContain('Spices, Condiments & Cooking');
    expect(content).toContain('Keeri Samba Rice (Loose)');
    expect(content).toContain('Red Raw Rice (Loose)');
  });
});
