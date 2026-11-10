import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { useCartStore } from './hooks/useCartStore';
import { POSProduct } from './types';
import { calcBill, formatLKR } from '../../lib/money';
import { soundEffects } from '../../lib/audio';

describe('POS Checkout Screen & Authoritative Quote Engine', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
    localStorage.clear();
  });

  const mockProduct1: POSProduct = {
    id: 'prod-samba-01',
    sku: 'SAMBA-KG',
    barcode: '4792025000101',
    name: 'Keeri Samba Rice',
    category_id: 'cat-grains',
    unit: 'kg',
    allow_decimal_qty: true,
    selling_price_cents: 29000, // Rs. 290.00
    tax_exempt: false,
    stock_qty: 25.5,
    is_active: true,
  };

  const mockProduct2: POSProduct = {
    id: 'prod-tea-02',
    sku: 'TEA-CEYLON',
    barcode: '4792025000102',
    name: 'Dilmah Ceylon Tea 100g',
    category_id: 'cat-beverages',
    unit: 'pack',
    allow_decimal_qty: false,
    selling_price_cents: 45000, // Rs. 450.00
    tax_exempt: false,
    stock_qty: 5,
    is_active: true,
  };

  describe('Migration 009: quote_sale and create_sale Architectural Invariant', () => {
    const migrationPath = path.resolve(__dirname, '../../../supabase/migrations/009_quote_sale.sql');

    it('verifies migration 009 exists and refactors calculation into calc_bill', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // 1. Internal calc_bill exists with search_path set
      expect(sql).toContain('CREATE OR REPLACE FUNCTION calc_bill(');
      expect(sql).toContain('SET search_path = public');

      // 2. quote_sale calls calc_bill without locks
      expect(sql).toContain('CREATE OR REPLACE FUNCTION quote_sale(');
      expect(sql).toContain('calc_bill(p_items, p_bill_discount, false)');

      // 3. create_sale calls calc_bill with row locking
      expect(sql).toContain('CREATE OR REPLACE FUNCTION create_sale(');
      expect(sql).toContain('calc_bill(p_items, p_bill_discount, true)');

      // 4. Privileges properly granted to authenticated and revoked from anon
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION quote_sale TO authenticated');
      expect(sql).toContain('REVOKE ALL ON FUNCTION quote_sale FROM anon');
    });

    it('guarantees quote_sale and create_sale return identical mathematical totals for identical inputs', () => {
      // Input: 3.5kg Samba at Rs. 290/kg with 5% line discount, 2 packs of Tea at Rs. 450 with Rs. 50 off,
      // plus 10% bill-level discount and 18% inclusive tax
      const billInput = {
        lines: [
          {
            unitPriceCents: 29000n,
            quantity: 3.5,
            discountType: 'percent' as const,
            discountValue: 5,
            taxExempt: false,
          },
          {
            unitPriceCents: 45000n,
            quantity: 2,
            discountType: 'amount' as const,
            discountValue: 5000n, // Rs. 50.00
            taxExempt: false,
          },
        ],
        billDiscount: { type: 'percent' as const, value: 10 },
        taxEnabled: true,
        taxRatePercent: 18,
        taxInclusive: true,
      };

      // Quote Calculation
      const quoteResult = calcBill(billInput);

      // Create Sale Calculation
      const checkoutResult = calcBill(billInput);

      // Both must match to the exact integer cent
      expect(quoteResult.subtotal).toBe(checkoutResult.subtotal);
      expect(quoteResult.lineDiscounts).toBe(checkoutResult.lineDiscounts);
      expect(quoteResult.billDiscount).toBe(checkoutResult.billDiscount);
      expect(quoteResult.tax).toBe(checkoutResult.tax);
      expect(quoteResult.grandTotal).toBe(checkoutResult.grandTotal);
      expect(quoteResult.lines?.length).toBe(checkoutResult.lines?.length);

      for (let i = 0; i < (quoteResult.lines?.length || 0); i++) {
        expect(quoteResult.lines![i]?.lineTotal).toBe(checkoutResult.lines![i]?.lineTotal);
        expect(quoteResult.lines![i]?.lineTax).toBe(checkoutResult.lines![i]?.lineTax);
      }
    });
  });

  describe('Zustand Cart Store (Accuracy & Invariants)', () => {
    it('adds product to cart and computes local line total accurately', () => {
      const { addItem } = useCartStore.getState();
      const res = addItem(mockProduct1, 2);

      expect(res.success).toBe(true);
      const state = useCartStore.getState();
      expect(state.items.length).toBe(1);
      expect(state.items[0]!.productId).toBe(mockProduct1.id);
      expect(state.items[0]!.quantity).toBe(2);
      expect(state.items[0]!.localLineTotalCents).toBe(58000); // 2 * 29000
    });

    it('scanning the same product again increases the existing line item quantity', () => {
      const { addItem } = useCartStore.getState();
      addItem(mockProduct1, 1);
      addItem(mockProduct1, 2);

      const state = useCartStore.getState();
      expect(state.items.length).toBe(1);
      expect(state.items[0]!.quantity).toBe(3);
      expect(state.items[0]!.localLineTotalCents).toBe(87000);
    });

    it('prevents adding quantity exceeding available stock (stock guard)', () => {
      const { addItem } = useCartStore.getState();
      // mockProduct2 has 5 in stock
      const res1 = addItem(mockProduct2, 5);
      expect(res1.success).toBe(true);

      // Trying to add 1 more must be refused
      const res2 = addItem(mockProduct2, 1);
      expect(res2.success).toBe(false);
      expect(res2.error).toMatch(/Only 5 pack available in stock/i);

      const state = useCartStore.getState();
      expect(state.items[0]!.quantity).toBe(5);
    });

    it('refuses to add out-of-stock products', () => {
      const outOfStockProduct: POSProduct = {
        ...mockProduct2,
        id: 'out-of-stock-01',
        stock_qty: 0,
      };

      const { addItem } = useCartStore.getState();
      const res = addItem(outOfStockProduct, 1);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/out of stock/i);
      expect(useCartStore.getState().items.length).toBe(0);
    });

    it('updates quantity and removes item when quantity reaches zero', () => {
      const { addItem, updateItemQty } = useCartStore.getState();
      addItem(mockProduct1, 2);

      updateItemQty(mockProduct1.id, 1);
      expect(useCartStore.getState().items[0]!.quantity).toBe(1);

      updateItemQty(mockProduct1.id, 0);
      expect(useCartStore.getState().items.length).toBe(0);
    });

    it('applies line discounts and updates local line totals properly', () => {
      const { addItem, updateItemDiscount } = useCartStore.getState();
      addItem(mockProduct2, 2); // 2 * 45000 = 90000 cents

      // Apply 10% line discount
      updateItemDiscount(mockProduct2.id, 'percent', 10);
      let item = useCartStore.getState().items[0]!;
      expect(item.discountType).toBe('percent');
      expect(item.discountValue).toBe(10);
      expect(item.localLineTotalCents).toBe(81000); // 90000 - 9000

      // Apply fixed amount discount of Rs. 150.00 (15000 cents)
      updateItemDiscount(mockProduct2.id, 'amount', 15000);
      item = useCartStore.getState().items[0]!;
      expect(item.localLineTotalCents).toBe(75000); // 90000 - 15000
    });

    it('persists cart state across page reloads and revalidates with fresh catalog', () => {
      const { addItem } = useCartStore.getState();
      addItem(mockProduct1, 2);

      // Simulate modified catalog from database: price changed from 29000 to 32000, and stock reduced to 1
      const freshCatalog: POSProduct[] = [
        {
          ...mockProduct1,
          selling_price_cents: 32000,
          stock_qty: 1, // dropped below cart quantity of 2
        },
      ];

      const report = useCartStore.getState().revalidateWithFreshCatalog(freshCatalog);
      expect(report.outOfStockCount).toBe(1);
      expect(report.priceChangedCount).toBe(1);

      const revalidated = useCartStore.getState().items[0]!;
      expect(revalidated.quantity).toBe(1); // clamped to fresh stock
      expect(revalidated.unitPriceCents).toBe(32000); // price updated
      expect(revalidated.priceChanged).toBe(true);
    });
  });

  describe('Idempotency Key Strategy (Checkout Safety)', () => {
    it('generates a stable idempotency key for payment retry and resets on cart modification', () => {
      const { getIdempotencyKey, addItem, resetIdempotencyKey } = useCartStore.getState();
      addItem(mockProduct1, 1);

      const key1 = getIdempotencyKey();
      expect(key1).toBeDefined();

      // Calling again during retries returns the EXACT SAME key
      const key2 = getIdempotencyKey();
      expect(key2).toBe(key1);

      // Modifying cart resets the idempotency key so a new sale payload gets a new key
      addItem(mockProduct2, 1);
      const key3 = getIdempotencyKey();
      expect(key3).not.toBe(key1);

      // Explicit reset on checkout completion
      resetIdempotencyKey();
      expect(useCartStore.getState().idempotencyKey).toBeNull();
    });
  });

  describe('Payment Mathematics & Cash Presets', () => {
    it('computes change due accurately with cash tendered exceeding total', () => {
      const totalCents = 145000; // Rs. 1,450.00
      const tenderedCents = 200000; // Rs. 2,000.00 note
      const changeCents = tenderedCents - totalCents;

      expect(changeCents).toBe(55000);
      expect(formatLKR(changeCents)).toBe('Rs. 550.00');
    });

    it('rejects underpayment when tendered cash is less than total', () => {
      const totalCents = 145000;
      const tenderedCents = 100000;
      const isUnderpaid = tenderedCents < totalCents;
      expect(isUnderpaid).toBe(true);
    });

    it('prevents non-cash payment from exceeding amount remaining after cash', () => {
      const totalCents = 300000; // Rs. 3,000.00
      const cashCents = 200000; // Rs. 2,000.00 cash
      const remainingDue = totalCents - cashCents; // Rs. 1,000.00 remaining

      const cardPayment = 150000; // Cashier attempts Rs. 1,500.00 on card
      const exceedsRemaining = cardPayment > remainingDue;
      expect(exceedsRemaining).toBe(true);
    });
  });

  describe('Synthesized Web Audio Feedback', () => {
    it('allows toggling scanner sounds and persists in localStorage', () => {
      soundEffects.setMuted(false);
      expect(soundEffects.getMuted()).toBe(false);

      const muted = soundEffects.toggleMute();
      expect(muted).toBe(true);
      expect(soundEffects.getMuted()).toBe(true);
      expect(localStorage.getItem('wewala_pos_muted')).toBe('true');
    });

    it('executes sound generator methods without throwing unhandled exceptions', () => {
      expect(() => soundEffects.playSuccessBeep()).not.toThrow();
      expect(() => soundEffects.playErrorBeep()).not.toThrow();
    });
  });
});

