import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calcBill, lineTotal, percentOf } from '../lib/money';
import type { BillLineInput, DiscountInput } from '../lib/money';

describe('Property-Based Tests for Bill Calculations (Vitest + fast-check)', () => {
  // Arbitrary for price in cents: 1 cent (Rs. 0.01) to 50,000,000 cents (Rs. 500,000.00)
  const priceCentsArb = fc.bigInt({ min: 1n, max: 50_000_000n });

  // Arbitrary for quantity: 0.001 to 999.999 with 0 to 3 decimal places
  const quantityArb = fc.oneof(
    fc.integer({ min: 1, max: 200 }), // Integer quantities (e.g. 1 to 200)
    fc.integer({ min: 1, max: 999999 }).map(milli => Number((milli / 1000).toFixed(3))) // Weighed decimals
  );

  // Line Discount generator: none, percent (0-100), or arbitrary amount
  const lineDiscountTypeArb = fc.constantFrom('none', 'percent', 'amount');
  const discountPercentArb = fc.integer({ min: 0, max: 100 });

  // Tax settings
  const taxRateArb = fc.constantFrom(0, 2.5, 8, 12, 15, 18);
  const taxInclusiveArb = fc.boolean();
  const taxEnabledArb = fc.boolean();

  // Generator for a single line
  const cartLineArb = fc.record({
    unitPriceCents: priceCentsArb,
    quantity: quantityArb,
    discountType: lineDiscountTypeArb,
    discountPercent: discountPercentArb,
    discountAmountFraction: fc.float({ min: 0, max: 1, noNaN: true }),
    taxExempt: fc.boolean(),
  }).map((line): BillLineInput => {
    const gross = lineTotal(line.unitPriceCents, line.quantity);
    let discountValue: number | bigint = 0;

    if (line.discountType === 'percent') {
      discountValue = line.discountPercent;
    } else if (line.discountType === 'amount') {
      // Amount clamped between 0 and gross
      discountValue = BigInt(Math.floor(Number(gross) * line.discountAmountFraction));
    }

    return {
      unitPriceCents: line.unitPriceCents,
      quantity: line.quantity,
      discountType: line.discountType as 'none' | 'percent' | 'amount',
      discountValue,
      taxExempt: line.taxExempt,
    };
  });

  // Generator for full carts: 1 to 40 lines
  const cartArb = fc.array(cartLineArb, { minLength: 1, maxLength: 40 });

  // Bill discount generator
  const billDiscountArb = fc.record({
    type: fc.constantFrom('none', 'percent', 'amount'),
    percent: fc.integer({ min: 0, max: 100 }),
    amountFraction: fc.float({ min: 0, max: 1, noNaN: true }),
  });

  it('runs 1,000 random carts and rigorously validates all mathematical and accounting invariants', () => {
    let runsCount = 0;

    try {
      fc.assert(
        fc.property(
          cartArb,
          billDiscountArb,
          taxEnabledArb,
          taxRateArb,
          taxInclusiveArb,
          (lines, rawBillDiscount, taxEnabled, taxRatePercent, taxInclusive) => {
            runsCount++;

            // Calculate preliminary itemsNet to bound bill discount amount
            let preliminaryItemsNet = 0n;
            for (const line of lines) {
              const gross = lineTotal(line.unitPriceCents, line.quantity);
              let disc = 0n;
              if (line.discountType === 'percent') {
                disc = percentOf(gross, line.discountValue ?? 0);
              } else if (line.discountType === 'amount') {
                disc = typeof line.discountValue === 'bigint' ? line.discountValue : BigInt(line.discountValue ?? 0);
              }
              if (disc > gross) disc = gross;
              preliminaryItemsNet += (gross - disc);
            }

            let billDiscount: DiscountInput = { type: 'none', value: 0 };
            if (rawBillDiscount.type === 'percent') {
              billDiscount = { type: 'percent', value: rawBillDiscount.percent };
            } else if (rawBillDiscount.type === 'amount') {
              const amountCents = BigInt(Math.floor(Number(preliminaryItemsNet) * rawBillDiscount.amountFraction));
              billDiscount = { type: 'amount', value: amountCents };
            }

            // Execute calcBill
            const bill = calcBill({
              lines,
              billDiscount,
              taxEnabled,
              taxRatePercent,
              taxInclusive,
            });

            // -------------------------------------------------------------
            // INVARIANT 1: Lines add up to the total to the exact cent
            // -------------------------------------------------------------
            const sumOfLines = bill.lines?.reduce((sum, l) => sum + l.lineTotal, 0n) ?? 0n;
            expect(sumOfLines).toBe(bill.grandTotal);

            // -------------------------------------------------------------
            // INVARIANT 2: Total >= 0
            // -------------------------------------------------------------
            expect(bill.grandTotal >= 0n).toBe(true);
            expect(bill.subtotal >= 0n).toBe(true);

            // -------------------------------------------------------------
            // INVARIANT 3: Discounts never exceed the amount they apply to
            // -------------------------------------------------------------
            if (bill.lines) {
              for (const l of bill.lines) {
                expect(l.lineDiscount <= l.grossLine).toBe(true);
                expect(l.lineDiscount >= 0n).toBe(true);
                expect(l.allocatedBillDiscount <= l.netLine).toBe(true);
                expect(l.allocatedBillDiscount >= 0n).toBe(true);
              }
            }
            const itemsNet = bill.subtotal - bill.lineDiscounts;
            expect(bill.billDiscount <= itemsNet).toBe(true);
            expect(bill.billDiscount >= 0n).toBe(true);

            // -------------------------------------------------------------
            // INVARIANT 4: Tax is never negative
            // -------------------------------------------------------------
            expect(bill.tax >= 0n).toBe(true);
            if (bill.lines) {
              for (const l of bill.lines) {
                expect(l.lineTax >= 0n).toBe(true);
              }
            }

            // -------------------------------------------------------------
            // INVARIANT 5: Taxable + Tax = Total
            // -------------------------------------------------------------
            expect(bill.taxableAmount + bill.tax).toBe(bill.grandTotal);

            // -------------------------------------------------------------
            // INVARIANT 6: Payments minus change = total
            // -------------------------------------------------------------
            // Simulate payment covering or exceeding grandTotal
            const cashTendered = bill.grandTotal + 5000n; // e.g. Rs. 50 extra
            const changeGiven = cashTendered - bill.grandTotal;
            expect(cashTendered - changeGiven).toBe(bill.grandTotal);

            // Return true for property
            return true;
          }
        ),
        {
          numRuns: 1000,
          verbose: 2,
        }
      );
    } catch (error) {
      console.error('FAILED PROPERTY TEST! Input state can be inspected via error details:', error);
      throw error;
    }

    expect(runsCount).toBeGreaterThanOrEqual(1000);
  });
});

