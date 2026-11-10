import { describe, it, expect } from 'vitest';
import {
  toCents,
  formatLKR,
  roundHalfUp,
  lineTotal,
  percentOf,
  calcBill,
  allocateBillDiscount,
  normalizePhone,
  parseQuantityToThousandths,
  parsePercentToBasisPoints,
} from './money';

describe('money library - Wewala POS', () => {
  describe('toCents', () => {
    it('1. converts standard rupee string "1250.50" to 125050n', () => {
      expect(toCents('1250.50')).toBe(125050n);
    });

    it('2. converts whole rupees "1250" to 125000n', () => {
      expect(toCents('1250')).toBe(125000n);
    });

    it('3. converts single decimal "1250.5" to 125050n', () => {
      expect(toCents('1250.5')).toBe(125050n);
    });

    it('4. converts zero "0" and "0.00" to 0n', () => {
      expect(toCents('0')).toBe(0n);
      expect(toCents('0.00')).toBe(0n);
    });

    it('5. converts small cents "0.05" to 5n', () => {
      expect(toCents('0.05')).toBe(5n);
    });

    it('6. handles 0.005 boundary: "0.005" rounds half up to 1 cent', () => {
      expect(toCents('0.005')).toBe(1n);
      expect(toCents('0.004')).toBe(0n);
      expect(toCents('0.006')).toBe(1n);
    });

    it('7. parses formatted strings with currency symbols and commas', () => {
      expect(toCents('Rs. 1,250.50')).toBe(125050n);
      expect(toCents('Rs 1,250.50')).toBe(125050n);
      expect(toCents('LKR 10,000,000.00')).toBe(1000000000n);
    });

    it('8. parses negative rupee strings', () => {
      expect(toCents('-1250.50')).toBe(-125050n);
    });

    it('9. throws error on invalid inputs', () => {
      expect(() => toCents('')).toThrow('Invalid rupees string');
      expect(() => toCents('abc')).toThrow('Invalid rupees string');
    });
  });

  describe('formatLKR', () => {
    it('10. formats 125050n as "Rs. 1,250.50"', () => {
      expect(formatLKR(125050n)).toBe('Rs. 1,250.50');
    });

    it('11. formats whole rupees with two decimals "Rs. 1,250.00"', () => {
      expect(formatLKR(125000n)).toBe('Rs. 1,250.00');
    });

    it('12. formats zero cents as "Rs. 0.00"', () => {
      expect(formatLKR(0n)).toBe('Rs. 0.00');
    });

    it('13. formats single-digit cents as "Rs. 0.05"', () => {
      expect(formatLKR(5n)).toBe('Rs. 0.05');
    });

    it('14. formats large totals above Rs. 10,000,000 with correct thousands separators', () => {
      expect(formatLKR(1000000000n)).toBe('Rs. 10,000,000.00');
      expect(formatLKR(2548793275n)).toBe('Rs. 25,487,932.75');
    });

    it('15. formats negative amounts', () => {
      expect(formatLKR(-125050n)).toBe('-Rs. 1,250.50');
    });
  });

  describe('roundHalfUp', () => {
    it('16. performs exact integer division', () => {
      expect(roundHalfUp(10n, 2n)).toBe(5n);
      expect(roundHalfUp(0n, 10n)).toBe(0n);
    });

    it('17. rounds half up on exactly 0.5 (15 / 10 -> 2)', () => {
      expect(roundHalfUp(15n, 10n)).toBe(2n);
    });

    it('18. rounds down when remainder is strictly less than half (14 / 10 -> 1)', () => {
      expect(roundHalfUp(14n, 10n)).toBe(1n);
    });

    it('19. rounds up when remainder is strictly greater than half (16 / 10 -> 2)', () => {
      expect(roundHalfUp(16n, 10n)).toBe(2n);
    });

    it('20. 0.005 boundary in thousandths: 500/1000 -> 1, 499/1000 -> 0, 501/1000 -> 1', () => {
      expect(roundHalfUp(500n, 1000n)).toBe(1n);
      expect(roundHalfUp(499n, 1000n)).toBe(0n);
      expect(roundHalfUp(501n, 1000n)).toBe(1n);
    });

    it('21. handles negative values symmetrically away from zero', () => {
      expect(roundHalfUp(-15n, 10n)).toBe(-2n);
      expect(roundHalfUp(-14n, 10n)).toBe(-1n);
    });

    it('22. throws error on division by zero', () => {
      expect(() => roundHalfUp(100n, 0n)).toThrow('Division by zero');
    });
  });

  describe('lineTotal', () => {
    it('23. calculates 1 unit item at Rs. 1,250.50', () => {
      expect(lineTotal(125050n, 1)).toBe(125050n);
      expect(lineTotal(125050n, '1')).toBe(125050n);
    });

    it('24. calculates 3 unit items at Rs. 200.00', () => {
      expect(lineTotal(20000n, 3)).toBe(60000n);
    });

    it('25. calculates 3-decimal weighed goods: 0.250 kg at Rs. 1,299.99', () => {
      expect(lineTotal(129999n, '0.250')).toBe(32500n);
      expect(lineTotal(129999n, 0.25)).toBe(32500n);
    });

    it('26. calculates weighed goods with 0.005 boundary: 0.005 kg at Rs. 100.00', () => {
      expect(lineTotal(10000n, '0.005')).toBe(50n);
    });

    it('27. handles zero quantity and zero unit price', () => {
      expect(lineTotal(129999n, 0)).toBe(0n);
      expect(lineTotal(0n, '1.500')).toBe(0n);
    });

    it('28. calculates 1.345 kg at Rs. 450.50', () => {
      expect(lineTotal(45050n, '1.345')).toBe(60592n);
    });
  });

  describe('percentOf', () => {
    it('29. calculates 15% tax on Rs. 100.00 (10000 cents -> 1500 cents)', () => {
      expect(percentOf(10000n, 15)).toBe(1500n);
    });

    it('30. calculates 2.50% discount on Rs. 1,250.50 (125050 cents -> 3126 cents)', () => {
      expect(percentOf(125050n, '2.50')).toBe(3126n);
    });

    it('31. rounds half up on 1 cent at 50% (0.5 cent -> 1 cent)', () => {
      expect(percentOf(1n, 50)).toBe(1n);
    });

    it('32. rounds down on 1 cent at 49% (0.49 cent -> 0 cent)', () => {
      expect(percentOf(1n, 49)).toBe(0n);
    });

    it('33. returns 0 for 0%', () => {
      expect(percentOf(100000n, 0)).toBe(0n);
    });
  });

  describe('calcBill', () => {
    it('34. returns all zeros for empty lines', () => {
      const result = calcBill({ lines: [] });
      expect(result).toEqual({
        subtotal: 0n,
        lineDiscounts: 0n,
        billDiscount: 0n,
        taxableAmount: 0n,
        tax: 0n,
        grandTotal: 0n,
        lines: [],
      });
    });

    it('35. calculates simple bill without discount and tax', () => {
      const result = calcBill({
        lines: [
          { unitPriceCents: 50000n, quantity: 2 },
          { unitPriceCents: 25000n, quantity: 1 },
        ],
      });
      expect(result.subtotal).toBe(125000n);
      expect(result.lineDiscounts).toBe(0n);
      expect(result.billDiscount).toBe(0n);
      expect(result.taxableAmount).toBe(125000n);
      expect(result.tax).toBe(0n);
      expect(result.grandTotal).toBe(125000n);
    });

    it('36. calculates multi-line bill with individual line discounts', () => {
      const result = calcBill({
        lines: [
          { unitPriceCents: 10000n, quantity: 2, lineDiscountCents: 2000n },
          { unitPriceCents: 5000n, quantity: 1, lineDiscountCents: 500n },
        ],
      });
      expect(result.subtotal).toBe(25000n);
      expect(result.lineDiscounts).toBe(2500n);
      expect(result.taxableAmount).toBe(22500n);
      expect(result.grandTotal).toBe(22500n);
    });

    it('37. clamps line discount that exceeds gross line total', () => {
      const result = calcBill({
        lines: [
          { unitPriceCents: 1000n, quantity: 1, lineDiscountCents: 5000n },
        ],
      });
      expect(result.subtotal).toBe(1000n);
      expect(result.lineDiscounts).toBe(1000n);
      expect(result.taxableAmount).toBe(0n);
      expect(result.grandTotal).toBe(0n);
    });

    it('38. clamps bill discount larger than subtotal (must clamp to subtotal)', () => {
      const result = calcBill({
        lines: [
          { unitPriceCents: 10000n, quantity: 1 },
        ],
        billDiscount: 15000n,
      });
      expect(result.subtotal).toBe(10000n);
      expect(result.billDiscount).toBe(10000n);
      expect(result.taxableAmount).toBe(0n);
      expect(result.grandTotal).toBe(0n);
    });

    it('39. clamps negative bill discount to 0', () => {
      const result = calcBill({
        lines: [{ unitPriceCents: 10000n, quantity: 1 }],
        billDiscount: -500n,
      });
      expect(result.billDiscount).toBe(0n);
      expect(result.grandTotal).toBe(10000n);
    });

    it('40. calculates tax-exclusive bill (tax added on top)', () => {
      const result = calcBill({
        lines: [{ unitPriceCents: 100000n, quantity: 1 }],
        taxRatePercent: 15,
        taxInclusive: false,
      });
      expect(result.subtotal).toBe(100000n);
      expect(result.taxableAmount).toBe(100000n);
      expect(result.tax).toBe(15000n);
      expect(result.grandTotal).toBe(115000n);
    });

    it('41. calculates tax-inclusive bill (tax extracted from gross)', () => {
      const result = calcBill({
        lines: [{ unitPriceCents: 115000n, quantity: 1 }],
        taxRatePercent: 15,
        taxInclusive: true,
      });
      expect(result.subtotal).toBe(115000n);
      expect(result.taxableAmount).toBe(100000n);
      expect(result.tax).toBe(15000n);
      expect(result.grandTotal).toBe(115000n);
      expect(result.taxableAmount + result.tax).toBe(result.grandTotal);
    });

    it('42. calculates tax-inclusive bill with discounts', () => {
      const result = calcBill({
        lines: [{ unitPriceCents: 100000n, quantity: 1 }],
        billDiscount: 10000n,
        taxRatePercent: 15,
        taxInclusive: true,
      });
      expect(result.subtotal).toBe(100000n);
      expect(result.billDiscount).toBe(10000n);
      expect(result.taxableAmount).toBe(78261n);
      expect(result.tax).toBe(11739n);
      expect(result.grandTotal).toBe(90000n);
      expect(result.taxableAmount + result.tax).toBe(result.grandTotal);
    });

    it('43. calculates weighed goods bill: 0.250 kg at Rs. 1,299.99 with tax', () => {
      const result = calcBill({
        lines: [{ unitPriceCents: 129999n, quantity: '0.250' }],
        taxRatePercent: 10,
        taxInclusive: false,
      });
      expect(result.subtotal).toBe(32500n);
      expect(result.tax).toBe(3250n);
      expect(result.grandTotal).toBe(35750n);
    });

    it('44. handles large totals above Rs. 10,000,000 without overflow', () => {
      const result = calcBill({
        lines: [{ unitPriceCents: 50000n, quantity: 50000 }],
        taxRatePercent: 15,
        taxInclusive: false,
      });
      expect(result.subtotal).toBe(2500000000n);
      expect(result.taxableAmount).toBe(2500000000n);
      expect(result.tax).toBe(375000000n);
      expect(result.grandTotal).toBe(2875000000n);
      expect(formatLKR(result.grandTotal)).toBe('Rs. 28,750,000.00');
    });

    it('45. parseQuantityToThousandths handles integer, decimal strings, and numbers', () => {
      expect(parseQuantityToThousandths('1')).toBe(1000n);
      expect(parseQuantityToThousandths(1)).toBe(1000n);
      expect(parseQuantityToThousandths('0.250')).toBe(250n);
      expect(parseQuantityToThousandths('0.005')).toBe(5n);
      expect(parseQuantityToThousandths('0.001')).toBe(1n);
    });

    it('46. parsePercentToBasisPoints handles standard percents and decimals', () => {
      expect(parsePercentToBasisPoints(15)).toBe(1500n);
      expect(parsePercentToBasisPoints('15.00')).toBe(1500n);
      expect(parsePercentToBasisPoints('2.50')).toBe(250n);
      expect(parsePercentToBasisPoints('0.05')).toBe(5n);
    });
  });

  // ----------------------------------------------------------------------------
  // 30 COMPREHENSIVE NUMERIC TEST CASES MATCHING 006_create_sale.sql
  // ----------------------------------------------------------------------------
  describe('Prompt 6 Numeric Test Cases & Edge Cases', () => {
    // 1. Rs. 0.01 items
    it('Case 1: Rs. 0.01 (1 cent) single item', () => {
      const res = calcBill({ lines: [{ unitPriceCents: 1n, quantity: 1 }] });
      expect(res.subtotal).toBe(1n);
      expect(res.grandTotal).toBe(1n);
    });

    it('Case 2: Rs. 0.01 items with 50% discount rounds to 1 cent discount', () => {
      const res = calcBill({
        lines: [{ unitPriceCents: 1n, quantity: 1, discountType: 'percent', discountValue: 50 }],
      });
      expect(res.lineDiscounts).toBe(1n);
      expect(res.grandTotal).toBe(0n);
    });

    it('Case 3: Rs. 0.01 items with 49% discount rounds to 0 cent discount', () => {
      const res = calcBill({
        lines: [{ unitPriceCents: 1n, quantity: 1, discountType: 'percent', discountValue: 49 }],
      });
      expect(res.lineDiscounts).toBe(0n);
      expect(res.grandTotal).toBe(1n);
    });

    // 2. 0.333 kg quantities
    it('Case 4: 0.333 kg at Rs. 1,000.00 (100,000 cents) = 33,300 cents', () => {
      expect(lineTotal(100000n, '0.333')).toBe(33300n);
    });

    it('Case 5: 0.333 kg at Rs. 1,299.99 (129,999 cents) = 43,290 cents', () => {
      // 129,999 * 333 / 1000 = 43289.667 -> rounds half up to 43290
      expect(lineTotal(129999n, '0.333')).toBe(43290n);
    });

    // 3. Largest-Remainder Method Bill Discount Allocation
    it('Case 6: Bill discount allocated across 3 equal lines with remainder cent', () => {
      // 3 lines of 100 cents each (total 300 cents), bill discount 10 cents
      // 10 * 100 / 300 = 3 with remainder 100. Remainder sum = 1 cent.
      // Line 0 gets 3 + 1 = 4 cents. Lines 1 and 2 get 3 cents each.
      const allocated = allocateBillDiscount([100n, 100n, 100n], 10n);
      expect(allocated).toEqual([4n, 3n, 3n]);
      expect(allocated.reduce((a, b) => a + b, 0n)).toBe(10n);
    });

    it('Case 7: Bill discount allocated across 2 equal lines with 1 odd cent', () => {
      // 2 lines of 5,000 cents (total 10,000), bill discount 501 cents
      const allocated = allocateBillDiscount([5000n, 5000n], 501n);
      expect(allocated).toEqual([251n, 250n]);
      expect(allocated.reduce((a, b) => a + b, 0n)).toBe(501n);
    });

    it('Case 8: Bill discount allocated proportionally across unequal lines', () => {
      // Lines: 2,000 cents and 1,000 cents (ratio 2:1, total 3,000). Discount: 500 cents
      // Line 1: 500 * 2000 / 3000 = 333.333 -> 333, rem 1000
      // Line 2: 500 * 1000 / 3000 = 166.666 -> 166, rem 2000 (largest remainder!)
      // Line 2 gets +1 -> 167. Line 1 gets 333. Total = 500
      const allocated = allocateBillDiscount([2000n, 1000n], 500n);
      expect(allocated).toEqual([333n, 167n]);
      expect(allocated[0]! + allocated[1]!).toBe(500n);
    });

    it('Case 9: calcBill full bill with 3 lines and allocated bill discount remainder', () => {
      const res = calcBill({
        lines: [
          { unitPriceCents: 100n, quantity: 1 },
          { unitPriceCents: 100n, quantity: 1 },
          { unitPriceCents: 100n, quantity: 1 },
        ],
        billDiscount: { type: 'amount', value: 10n },
      });
      expect(res.subtotal).toBe(300n);
      expect(res.billDiscount).toBe(10n);
      expect(res.grandTotal).toBe(290n);
      expect(res.lines?.[0]?.allocatedBillDiscount).toBe(4n);
      expect(res.lines?.[1]?.allocatedBillDiscount).toBe(3n);
      expect(res.lines?.[2]?.allocatedBillDiscount).toBe(3n);
      expect(res.lines?.[0]?.lineTotal).toBe(96n);
      expect(res.lines?.[1]?.lineTotal).toBe(97n);
      expect(res.lines?.[2]?.lineTotal).toBe(97n);
      expect(res.lines?.reduce((a, b) => a + b.lineTotal, 0n)).toBe(290n);
    });

    // 4. Tax-Exempt mixed with Taxable Lines
    it('Case 10: Tax-exempt product mixed with taxable product (tax exclusive 15%)', () => {
      // Line 1 (Rice): 1,000 cents, tax exempt -> tax 0
      // Line 2 (Soap): 2,000 cents, taxable -> 15% of 2000 = 300 cents
      // Total = 1000 + 2000 + 300 = 3300 cents
      const res = calcBill({
        lines: [
          { unitPriceCents: 1000n, quantity: 1, taxExempt: true },
          { unitPriceCents: 2000n, quantity: 1, taxExempt: false },
        ],
        taxRatePercent: 15,
        taxInclusive: false,
      });
      expect(res.subtotal).toBe(3000n);
      expect(res.tax).toBe(300n);
      expect(res.grandTotal).toBe(3300n);
      expect(res.taxableAmount).toBe(3000n);
      expect(res.lines?.[0]?.lineTax).toBe(0n);
      expect(res.lines?.[1]?.lineTax).toBe(300n);
    });

    it('Case 11: Tax-exempt product mixed with taxable product (tax inclusive 15%)', () => {
      // Line 1 (Rice): 1,000 cents, tax exempt -> tax 0, lineTotal 1000
      // Line 2 (Soap): 1,150 cents, taxable inclusive -> tax = 1150 * 1500 / 11500 = 150 cents
      // Total = 1000 + 1150 = 2150 cents
      const res = calcBill({
        lines: [
          { unitPriceCents: 1000n, quantity: 1, taxExempt: true },
          { unitPriceCents: 1150n, quantity: 1, taxExempt: false },
        ],
        taxRatePercent: 15,
        taxInclusive: true,
      });
      expect(res.subtotal).toBe(2150n);
      expect(res.tax).toBe(150n);
      expect(res.grandTotal).toBe(2150n);
      expect(res.taxableAmount).toBe(2000n); // 2150 - 150
      expect(res.taxableAmount + res.tax).toBe(res.grandTotal);
    });

    // 5. 100% Discount cases
    it('Case 12: 100% discount on single line makes line total 0', () => {
      const res = calcBill({
        lines: [{ unitPriceCents: 5000n, quantity: 1, discountType: 'percent', discountValue: 100 }],
      });
      expect(res.subtotal).toBe(5000n);
      expect(res.lineDiscounts).toBe(5000n);
      expect(res.grandTotal).toBe(0n);
    });

    it('Case 13: 100% bill discount makes grand total 0', () => {
      const res = calcBill({
        lines: [
          { unitPriceCents: 2000n, quantity: 1 },
          { unitPriceCents: 3000n, quantity: 1 },
        ],
        billDiscount: { type: 'percent', value: 100 },
      });
      expect(res.subtotal).toBe(5000n);
      expect(res.billDiscount).toBe(5000n);
      expect(res.grandTotal).toBe(0n);
      expect(res.tax).toBe(0n);
    });

    // 6. Discount greater than amount (Clamping)
    it('Case 14: Line discount amount greater than line total is clamped to line total', () => {
      const res = calcBill({
        lines: [{ unitPriceCents: 1000n, quantity: 1, discountType: 'amount', discountValue: 2500n }],
      });
      expect(res.subtotal).toBe(1000n);
      expect(res.lineDiscounts).toBe(1000n);
      expect(res.grandTotal).toBe(0n);
    });

    it('Case 15: Bill discount amount greater than net subtotal is clamped to net subtotal', () => {
      const res = calcBill({
        lines: [{ unitPriceCents: 1000n, quantity: 1 }],
        billDiscount: { type: 'amount', value: 5000n },
      });
      expect(res.subtotal).toBe(1000n);
      expect(res.billDiscount).toBe(1000n);
      expect(res.grandTotal).toBe(0n);
    });

    it('Case 16: Percentage discount above 100% clamps to 100%', () => {
      const res = calcBill({
        lines: [{ unitPriceCents: 1000n, quantity: 1, discountType: 'percent', discountValue: 150 }],
      });
      expect(res.lineDiscounts).toBe(1000n);
      expect(res.grandTotal).toBe(0n);
    });

    // 7. Phone Normalization
    it('Case 17: Normalizes 07XXXXXXXX to +947XXXXXXXX', () => {
      expect(normalizePhone('0771234567')).toBe('+94771234567');
      expect(normalizePhone('0719876543')).toBe('+94719876543');
    });

    it('Case 18: Normalizes 7XXXXXXXX to +947XXXXXXXX', () => {
      expect(normalizePhone('771234567')).toBe('+94771234567');
    });

    it('Case 19: Keeps +947XXXXXXXX intact', () => {
      expect(normalizePhone('+94771234567')).toBe('+94771234567');
    });

    it('Case 20: Normalizes 947XXXXXXXX to +947XXXXXXXX', () => {
      expect(normalizePhone('94771234567')).toBe('+94771234567');
    });

    it('Case 21: Cleans formatted phone numbers with spaces and dashes', () => {
      expect(normalizePhone('077-123 4567')).toBe('+94771234567');
      expect(normalizePhone('+94 77 123 4567')).toBe('+94771234567');
    });

    it('Case 22: Rejects invalid non-mobile or landline Sri Lankan numbers', () => {
      expect(() => normalizePhone('0112345678')).toThrow('INVALID_PHONE');
      expect(() => normalizePhone('+94112345678')).toThrow('INVALID_PHONE');
      expect(() => normalizePhone('12345')).toThrow('INVALID_PHONE');
      expect(() => normalizePhone('07712345')).toThrow('INVALID_PHONE');
    });

    // 8. Tax Modes comparison
    it('Case 23: Tax exclusive vs inclusive on exact same base amount', () => {
      // Base: Rs. 1,000.00, Tax Rate: 10%
      const excl = calcBill({
        lines: [{ unitPriceCents: 100000n, quantity: 1 }],
        taxRatePercent: 10,
        taxInclusive: false,
      });
      expect(excl.grandTotal).toBe(110000n);
      expect(excl.tax).toBe(10000n);

      const incl = calcBill({
        lines: [{ unitPriceCents: 110000n, quantity: 1 }],
        taxRatePercent: 10,
        taxInclusive: true,
      });
      expect(incl.grandTotal).toBe(110000n);
      expect(incl.tax).toBe(10000n);
      expect(incl.taxableAmount).toBe(100000n);
    });

    // 9. Weighed goods with odd thousandths
    it('Case 24: 0.125 kg at Rs. 990.00 = 12,375 cents', () => {
      expect(lineTotal(99000n, '0.125')).toBe(12375n);
    });

    it('Case 25: 0.777 kg at Rs. 350.00 = 27,195 cents', () => {
      expect(lineTotal(35000n, '0.777')).toBe(27195n);
    });

    // 10. Large multi-line high-value transaction
    it('Case 26: High-value transaction Rs. 50,000,000 with 15% exclusive tax', () => {
      const res = calcBill({
        lines: [
          { unitPriceCents: 100000n, quantity: 25000 }, // 2,500,000,000 cents
          { unitPriceCents: 500000n, quantity: 5000 },  // 2,500,000,000 cents
        ],
        taxRatePercent: 15,
        taxInclusive: false,
      });
      expect(res.subtotal).toBe(5000000000n);
      expect(res.tax).toBe(750000000n); // 15% of 50M = 7.5M
      expect(res.grandTotal).toBe(5750000000n); // 57.5M
      expect(formatLKR(res.grandTotal)).toBe('Rs. 57,500,000.00');
    });

    // 11. Zero discount and zero tax edge cases
    it('Case 27: taxEnabled = false ignores tax rate', () => {
      const res = calcBill({
        lines: [{ unitPriceCents: 10000n, quantity: 1 }],
        taxRatePercent: 15,
        taxEnabled: false,
      });
      expect(res.tax).toBe(0n);
      expect(res.grandTotal).toBe(10000n);
    });

    it('Case 28: taxRate = 0 with taxEnabled = true produces 0 tax', () => {
      const res = calcBill({
        lines: [{ unitPriceCents: 10000n, quantity: 1 }],
        taxRatePercent: 0,
        taxEnabled: true,
      });
      expect(res.tax).toBe(0n);
      expect(res.grandTotal).toBe(10000n);
    });

    // 12. Total mismatch assertion safety check
    it('Case 29: Line totals sum strictly equals grandTotal in all scenarios', () => {
      const res = calcBill({
        lines: [
          { unitPriceCents: 32000n, quantity: '0.333', taxExempt: true },
          { unitPriceCents: 15000n, quantity: 2, discountType: 'percent', discountValue: '5.00' },
          { unitPriceCents: 45000n, quantity: '1.250' },
        ],
        billDiscount: { type: 'percent', value: '3.00' },
        taxRatePercent: '12.50',
        taxInclusive: false,
      });
      const linesSum = res.lines?.reduce((acc, l) => acc + l.lineTotal, 0n);
      expect(linesSum).toBe(res.grandTotal);
      expect(res.grandTotal).toBe(res.taxableAmount + res.tax);
    });

    it('Case 30: Line totals sum equals grandTotal for tax inclusive with discount', () => {
      const res = calcBill({
        lines: [
          { unitPriceCents: 22000n, quantity: '0.750', taxExempt: true },
          { unitPriceCents: 108000n, quantity: 1 },
          { unitPriceCents: 52000n, quantity: 3, lineDiscountCents: 6000n },
        ],
        billDiscount: { type: 'amount', value: 1500n },
        taxRatePercent: '15.00',
        taxInclusive: true,
      });
      const linesSum = res.lines?.reduce((acc, l) => acc + l.lineTotal, 0n);
      expect(linesSum).toBe(res.grandTotal);
      expect(res.grandTotal).toBe(res.taxableAmount + res.tax);
    });
  });
});
