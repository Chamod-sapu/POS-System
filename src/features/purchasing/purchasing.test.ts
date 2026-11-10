import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Purchasing & Goods Receiving (GRN) Module', () => {
  const purchasingMigrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/012_purchasing.sql'
  );
  const loyaltyMigrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/013_loyalty.sql'
  );

  describe('Migration 012_purchasing.sql Contract Verification', () => {
    const sql = fs.readFileSync(purchasingMigrationPath, 'utf8');

    it('creates supplier_payments and product_cost_history tables with append-only RLS', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS supplier_payments');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS product_cost_history');
      expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('is_manager_or_owner()');
    });

    it('implements receive_purchase RPC function with atomic transaction and security definer', () => {
      expect(sql).toContain('FUNCTION receive_purchase');
      expect(sql).toContain('SECURITY DEFINER');
      expect(sql).toContain('SET search_path = public');
      // Validates manager or owner only
      expect(sql).toContain('NOT_AUTHORISED');
      // Duplicate invoice check
      expect(sql).toContain('DUPLICATE_INVOICE');
      // Product locking ordered by id
      expect(sql).toContain('FOR UPDATE');
      // Stock movement type purchase
      expect(sql).toContain("'purchase'");
      // Batch creation for track_expiry
      expect(sql).toContain('EXPIRY_REQUIRED');
      // Records cost history
      expect(sql).toContain('INSERT INTO product_cost_history');
      // Updates supplier balance
      expect(sql).toContain('balance_cents = balance_cents +');
    });

    it('implements record_supplier_payment preventing negative balances', () => {
      expect(sql).toContain('FUNCTION record_supplier_payment');
      expect(sql).toContain('PAYMENT_EXCEEDS_BALANCE');
      expect(sql).toContain('INSERT INTO supplier_payments');
    });

    it('implements cancel_purchase with stock availability protection', () => {
      expect(sql).toContain('FUNCTION cancel_purchase');
      // Owner only check
      expect(sql).toContain('is_owner()');
      // Stock sold check
      expect(sql).toContain('STOCK_ALREADY_SOLD');
    });
  });

  describe('Migration 013_loyalty.sql Contract Verification', () => {
    const sql = fs.readFileSync(loyaltyMigrationPath, 'utf8');

    it('adds loyalty configuration to shop_settings', () => {
      expect(sql).toContain('loyalty_enabled');
      expect(sql).toContain('loyalty_points_per_100_lkr');
    });

    it('creates customer_points_ledger table', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS customer_points_ledger');
    });

    it('integrates loyalty point awards atomically into create_sale', () => {
      expect(sql).toContain('points_balance = points_balance + v_points_earned');
      expect(sql).toContain('INSERT INTO customer_points_ledger');
    });

    it('returns customer points in get_bill', () => {
      expect(sql).toContain("'points_earned'");
      expect(sql).toContain("'points_balance'");
    });
  });

  describe('GRN Line Math & Cost Variance Invariant', () => {
    function checkCostVariance(currentCostCents: number, newCostCents: number): {
      isSignificant: boolean;
      percentChange: number;
    } {
      if (currentCostCents <= 0) {
        return { isSignificant: false, percentChange: 0 };
      }
      const pct = ((newCostCents - currentCostCents) / currentCostCents) * 100;
      return {
        isSignificant: Math.abs(pct) > 20,
        percentChange: pct,
      };
    }

    it('identifies price increase greater than 20%', () => {
      // Old: Rs. 100 (10,000 cents), New: Rs. 125 (12,500 cents) -> +25%
      const res = checkCostVariance(10000, 12500);
      expect(res.isSignificant).toBe(true);
      expect(res.percentChange).toBe(25);
    });

    it('identifies price decrease greater than 20%', () => {
      // Old: Rs. 100 (10,000 cents), New: Rs. 75 (7,500 cents) -> -25%
      const res = checkCostVariance(10000, 7500);
      expect(res.isSignificant).toBe(true);
      expect(res.percentChange).toBe(-25);
    });

    it('does not flag normal fluctuations within 20%', () => {
      // Old: Rs. 100 (10,000 cents), New: Rs. 110 (11,000 cents) -> +10%
      const res = checkCostVariance(10000, 11000);
      expect(res.isSignificant).toBe(false);
      expect(res.percentChange).toBe(10);
    });
  });
});
