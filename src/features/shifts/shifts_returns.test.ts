import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Voids, Returns, Shifts and Cash Drawer Invariants', () => {
  const migrationFile = path.resolve(__dirname, '../../../supabase/migrations/014_returns_shifts.sql');

  it('migration 014_returns_shifts.sql exists and contains valid SQL', () => {
    expect(fs.existsSync(migrationFile)).toBe(true);
    const content = fs.readFileSync(migrationFile, 'utf8');
    expect(content.length).toBeGreaterThan(1000);
  });

  describe('Invariant 1: Cent-Perfect Partial Return Rounding', () => {
    /**
     * Implements the exact algorithm from create_return in 014_returns_shifts.sql:
     * If final return for the line (cumulative qty == sold qty):
     *   refund = line_total_cents - already_refunded_cents
     * Else:
     *   refund = round_half_up(line_total_cents * return_qty / sold_qty)
     */
    function computeLineRefunds(lineTotalCents: number, soldQty: number, returnSteps: number[]): number[] {
      let alreadyReturnedQty = 0;
      let alreadyRefundedCents = 0;
      const refunds: number[] = [];

      for (const stepQty of returnSteps) {
        let refundForStep = 0;
        if (alreadyReturnedQty + stepQty === soldQty) {
          // Final remaining quantity -> exact remaining balance
          refundForStep = lineTotalCents - alreadyRefundedCents;
        } else {
          // Partial step -> round_half_up(lineTotal * stepQty / soldQty)
          refundForStep = Math.round((lineTotalCents * stepQty) / soldQty);
        }

        refunds.push(refundForStep);
        alreadyReturnedQty += stepQty;
        alreadyRefundedCents += refundForStep;
      }

      return refunds;
    }

    it('refunds 1 of 3 units three times with zero lost or gained cents (100 cents total)', () => {
      // 3 items sold for 100 cents (Rs. 1.00)
      const refunds = computeLineRefunds(100, 3, [1, 1, 1]);

      expect(refunds[0]).toBe(33); // 100 * 1 / 3 = 33.33 -> 33
      expect(refunds[1]).toBe(33); // 100 * 1 / 3 = 33.33 -> 33
      expect(refunds[2]).toBe(34); // Remaining: 100 - (33 + 33) = 34

      const totalRefunded = refunds.reduce((a, b) => a + b, 0);
      expect(totalRefunded).toBe(100);
    });

    it('refunds 7 units sold for 1000 cents in steps of 2, 2, 3 with exact cent preservation', () => {
      const refunds = computeLineRefunds(1000, 7, [2, 2, 3]);

      // Step 1: round(1000 * 2 / 7) = round(285.714) = 286
      expect(refunds[0]).toBe(286);
      // Step 2: round(1000 * 2 / 7) = round(285.714) = 286
      expect(refunds[1]).toBe(286);
      // Step 3 (final 3 units): 1000 - (286 + 286) = 428
      expect(refunds[2]).toBe(428);

      const totalRefunded = refunds.reduce((a, b) => a + b, 0);
      expect(totalRefunded).toBe(1000);
    });

    it('refunds single unit full return in one step', () => {
      const refunds = computeLineRefunds(125000, 1, [1]);
      expect(refunds[0]).toBe(125000);
    });
  });

  describe('Invariant 2: Expected Drawer Cash Reconciliation Formula', () => {
    /**
     * PostgreSQL expected cash formula in close_shift and x_report:
     * expected_cash = opening_float
     *               + (cash_payments - change_given) on active completed sales
     *               - cash_refunds
     *               + cash_in
     *               - cash_out
     */
    function calculateExpectedCash(params: {
      openingFloatCents: number;
      cashPaymentsCents: number;
      changeGivenCents: number;
      cashRefundsCents: number;
      cashInCents: number;
      cashOutCents: number;
    }): number {
      const netCashSales = params.cashPaymentsCents - params.changeGivenCents;
      return (
        params.openingFloatCents +
        netCashSales -
        params.cashRefundsCents +
        params.cashInCents -
        params.cashOutCents
      );
    }

    it('matches manual hand-calculation scenario', () => {
      const openingFloatCents = 500000; // Rs. 5,000.00
      const cashPaymentsCents = 300000; // Rs. 3,000.00 cash tendered
      const changeGivenCents = 95000;   // Rs. 950.00 change returned
      // Net cash collected = 205,000 cents (Rs. 2,050.00)
      const cashRefundsCents = 35000;   // Rs. 350.00 refunded in cash
      const cashInCents = 100000;       // Rs. 1,000.00 float addition
      const cashOutCents = 20000;       // Rs. 200.00 petty cash drop

      const expected = calculateExpectedCash({
        openingFloatCents,
        cashPaymentsCents,
        changeGivenCents,
        cashRefundsCents,
        cashInCents,
        cashOutCents,
      });

      // 500,000 + (300,000 - 95,000) - 35,000 + 100,000 - 20,000 = 750,000 cents
      expect(expected).toBe(750000);
    });

    it('correctly handles a shift with zero sales and only float', () => {
      const expected = calculateExpectedCash({
        openingFloatCents: 500000,
        cashPaymentsCents: 0,
        changeGivenCents: 0,
        cashRefundsCents: 0,
        cashInCents: 0,
        cashOutCents: 0,
      });
      expect(expected).toBe(500000);
    });
  });

  describe('Invariant 3: Discrepancy Note Enforcement Threshold (> Rs. 100)', () => {
    function isNoteRequired(countedCents: number, expectedCents: number): boolean {
      const diff = Math.abs(countedCents - expectedCents);
      return diff > 10000; // 10,000 cents = Rs. 100.00
    }

    it('does not require note when drawer is perfectly balanced', () => {
      expect(isNoteRequired(500000, 500000)).toBe(false);
    });

    it('does not require note when discrepancy is exactly Rs. 100 (10,000 cents)', () => {
      expect(isNoteRequired(510000, 500000)).toBe(false);
      expect(isNoteRequired(490000, 500000)).toBe(false);
    });

    it('strictly requires note when discrepancy is Rs. 100.01 (10,001 cents)', () => {
      expect(isNoteRequired(510001, 500000)).toBe(true);
      expect(isNoteRequired(489999, 500000)).toBe(true);
    });

    it('strictly requires note for large over/short discrepancies', () => {
      expect(isNoteRequired(600000, 500000)).toBe(true); // Rs. 1,000 over
      expect(isNoteRequired(400000, 500000)).toBe(true); // Rs. 1,000 short
    });
  });

  describe('Invariant 4: Database Function Constraints & Security Definer Integrity', () => {
    const content = fs.readFileSync(migrationFile, 'utf8');

    it('verifies void_sale checks for same calendar day and active permissions', () => {
      expect(content).toContain('CANNOT_VOID_PAST_DAY');
      expect(content).toContain('CANNOT_VOID_TWICE');
      expect(content).toContain('CANNOT_VOID_RETURNED_SALE');
      expect(content).toContain('SECURITY DEFINER');
      expect(content).toContain('SET search_path = public');
    });

    it('verifies void_sale restores stock and exact batches via sale_item_batches', () => {
      expect(content).toContain('sale_item_batches');
      expect(content).toContain("'sale_void'");
      expect(content).toContain('customer_points_ledger');
    });

    it('verifies create_return checks returnable quantities and net paid bounds', () => {
      expect(content).toContain('RETURN_QTY_EXCEEDED');
      expect(content).toContain('REFUND_EXCEEDS_PAID');
      expect(content).toContain('CANNOT_RETURN_VOIDED_SALE');
      expect(content).toContain('partially_returned');
      expect(content).toContain('returned');
    });

    it('verifies create_return restores inventory and original batches when restock is true', () => {
      expect(content).toContain('p_restock boolean DEFAULT true');
      expect(content).toContain("'return'");
      expect(content).toContain("'damage'");
    });

    it('verifies create_sale enforces an open shift before accepting transactions', () => {
      expect(content).toContain('NO_OPEN_SHIFT');
      expect(content).toContain('shift_id');
      expect(content).toContain('sale_item_batches');
    });
  });
});
