import { describe, it, expect } from 'vitest';
import { Bill } from './types';
import { formatReceiptPlainText } from './lib/formatPlainText';
import { verifyBill } from './lib/verifyBill';
import { maskPhoneNumber } from './lib/maskPhone';
import { encodeCode128BModules, generateCode128Svg } from './lib/barcode';
import { BrowserPrintAdapter } from './lib/printerAdapter';

// ---------------------------------------------------------------------------
// 6 Fixed Bills Test Fixtures
// ---------------------------------------------------------------------------

// 1. Single Item Bill
const bill1_singleItem: Bill = {
  id: 'b1111111-0000-0000-0000-000000000001',
  bill_no: 'WWL-20261110-0001',
  date_time: '2026-11-10T10:00:00+05:30',
  status: 'completed',
  print_count: 0,
  is_duplicate: false,
  shop: {
    name: 'Wewala Super Store',
    address: '123 Galle Road, Wewala',
    phone: '0112345678',
    vat_reg_no: '123456789-7000',
    footer: 'Goods returnable in 7 days.',
  },
  cashier: {
    id: 'u-1',
    name: 'Kasun Perera',
  },
  customer: {
    id: 'c-1',
    name: 'Sunil',
    phone: '0771234567',
  },
  lines: [
    {
      product_id: 'p-1',
      name: 'Sunlight Soap 100g',
      sku: 'SOAP-SUN-100',
      unit: 'pcs',
      quantity: 1,
      unit_price_cents: 12000,
      line_discount_cents: 0,
      line_tax_cents: 0,
      line_total_cents: 12000,
    },
  ],
  subtotal_cents: 12000,
  line_discount_cents: 0,
  bill_discount_cents: 0,
  tax: {
    rate_percent: 0,
    mode: 'inclusive',
    taxable_cents: 12000,
    tax_cents: 0,
  },
  total_cents: 12000,
  payments: [
    {
      method: 'cash',
      amount_cents: 15000,
      reference: null,
    },
  ],
  paid_cents: 15000,
  change_cents: 3000,
};

// 2. 40 Items Bill
const bill2_40items: Bill = {
  id: 'b2222222-0000-0000-0000-000000000002',
  bill_no: 'WWL-20261110-0002',
  date_time: '2026-11-10T11:15:00+05:30',
  status: 'completed',
  print_count: 0,
  is_duplicate: false,
  shop: {
    name: 'Wewala Super Store',
    address: '123 Galle Road, Wewala',
    phone: '0112345678',
    vat_reg_no: null,
    footer: null,
  },
  cashier: {
    id: 'u-1',
    name: 'Kasun Perera',
  },
  customer: null,
  lines: Array.from({ length: 40 }, (_, i) => ({
    product_id: `p-${i + 1}`,
    name: `Retail Grocery Item #${i + 1}`,
    sku: `SKU-${100 + i}`,
    unit: 'pcs',
    quantity: 1,
    unit_price_cents: 10000,
    line_discount_cents: 0,
    line_tax_cents: 0,
    line_total_cents: 10000,
  })),
  subtotal_cents: 400000,
  line_discount_cents: 0,
  bill_discount_cents: 0,
  tax: {
    rate_percent: 0,
    mode: 'inclusive',
    taxable_cents: 400000,
    tax_cents: 0,
  },
  total_cents: 400000,
  payments: [
    {
      method: 'cash',
      amount_cents: 400000,
      reference: null,
    },
  ],
  paid_cents: 400000,
  change_cents: 0,
};

// 3. Long Names Bill (Wrapping logic)
const bill3_longNames: Bill = {
  id: 'b3333333-0000-0000-0000-000000000003',
  bill_no: 'WWL-20261110-0003',
  date_time: '2026-11-10T12:30:00+05:30',
  status: 'completed',
  print_count: 0,
  is_duplicate: false,
  shop: {
    name: 'Wewala Super Mega Hyper Store & Wholesale Distribution Centre',
    address: 'No. 456/B, Upper Baseline Road, Colombo North Commercial Zone',
    phone: '0112345678',
    vat_reg_no: '987654321-7000',
    footer: 'All electrical products come with a 1-year manufacturer warranty.',
  },
  cashier: {
    id: 'u-2',
    name: 'Chandrasena Jayasuriya',
  },
  customer: {
    id: 'c-2',
    name: 'Don Carolis Wickramasinghe Ranatunga',
    phone: '0779988776',
  },
  lines: [
    {
      product_id: 'p-long-1',
      name: 'Munchee Super Lemon Puff Biscuits Value Pack 200g Promo Edition',
      sku: 'BIS-MUN-LEMPUF-200G',
      unit: 'pack',
      quantity: 2,
      unit_price_cents: 35000,
      line_discount_cents: 0,
      line_tax_cents: 0,
      line_total_cents: 70000,
    },
    {
      product_id: 'p-long-2',
      name: 'Highland Pure Fresh Pasturised Pasteurized Full Cream Cow Milk 1L Bottle',
      sku: 'MILK-HIGHLAND-1L',
      unit: 'bottle',
      quantity: 1,
      unit_price_cents: 45000,
      line_discount_cents: 0,
      line_tax_cents: 0,
      line_total_cents: 45000,
    },
  ],
  subtotal_cents: 115000,
  line_discount_cents: 0,
  bill_discount_cents: 0,
  tax: {
    rate_percent: 0,
    mode: 'inclusive',
    taxable_cents: 115000,
    tax_cents: 0,
  },
  total_cents: 115000,
  payments: [
    {
      method: 'cash',
      amount_cents: 120000,
      reference: null,
    },
  ],
  paid_cents: 120000,
  change_cents: 5000,
};

// 4. Decimals Bill (Weighed items with fractional quantities)
const bill4_decimals: Bill = {
  id: 'b4444444-0000-0000-0000-000000000004',
  bill_no: 'WWL-20261110-0004',
  date_time: '2026-11-10T13:45:00+05:30',
  status: 'completed',
  print_count: 0,
  is_duplicate: false,
  shop: {
    name: 'Wewala Store',
    address: 'Wewala Market',
    phone: '0112345678',
    vat_reg_no: null,
    footer: null,
  },
  cashier: {
    id: 'u-1',
    name: 'Kasun Perera',
  },
  customer: null,
  lines: [
    {
      product_id: 'p-dhal',
      name: 'Red Dhal (Mysore)',
      sku: 'DHAL-MYS-KG',
      unit: 'kg',
      quantity: 0.75, // 0.750 kg
      unit_price_cents: 32000, // Rs. 320.00/kg
      line_discount_cents: 0,
      line_tax_cents: 0,
      line_total_cents: 24000, // 0.75 * 32000 = 24000
    },
    {
      product_id: 'p-potato',
      name: 'Potatoes (Nuwara Eliya)',
      sku: 'POTATO-NE-KG',
      unit: 'kg',
      quantity: 1.25, // 1.250 kg
      unit_price_cents: 44000, // Rs. 440.00/kg
      line_discount_cents: 0,
      line_tax_cents: 0,
      line_total_cents: 55000, // 1.25 * 44000 = 55000
    },
  ],
  subtotal_cents: 79000,
  line_discount_cents: 0,
  bill_discount_cents: 0,
  tax: {
    rate_percent: 0,
    mode: 'inclusive',
    taxable_cents: 79000,
    tax_cents: 0,
  },
  total_cents: 79000,
  payments: [
    {
      method: 'cash',
      amount_cents: 100000,
      reference: null,
    },
  ],
  paid_cents: 100000,
  change_cents: 21000,
};

// 5. Discount + Tax Inclusive Bill
const bill5_discountAndTax: Bill = {
  id: 'b5555555-0000-0000-0000-000000000005',
  bill_no: 'WWL-20261110-0005',
  date_time: '2026-11-10T14:50:00+05:30',
  status: 'completed',
  print_count: 0,
  is_duplicate: false,
  shop: {
    name: 'Wewala Store',
    address: 'Wewala',
    phone: '0112345678',
    vat_reg_no: '123456789-7000',
    footer: 'Thank you for shopping local.',
  },
  cashier: {
    id: 'u-1',
    name: 'Kasun Perera',
  },
  customer: {
    id: 'c-3',
    name: 'Nalaka Bandara',
    phone: '0714455667',
  },
  lines: [
    {
      product_id: 'p-butter',
      name: 'Anchor Butter Salted 227g',
      sku: 'BUT-ANC-227',
      unit: 'pack',
      quantity: 1,
      unit_price_cents: 200000, // Rs. 2,000.00
      line_discount_cents: 20000, // -Rs. 200.00
      line_tax_cents: 13333,
      line_total_cents: 180000, // Rs. 1,800.00
    },
    {
      product_id: 'p-cheese',
      name: 'Happy Cow Cheese 8 Portions',
      sku: 'CHE-HC-8P',
      unit: 'box',
      quantity: 1,
      unit_price_cents: 100000, // Rs. 1,000.00
      line_discount_cents: 0,
      line_tax_cents: 7407,
      line_total_cents: 100000, // Rs. 1,000.00
    },
  ],
  subtotal_cents: 300000, // 200000 + 100000
  line_discount_cents: 20000,
  bill_discount_cents: 0,
  tax: {
    rate_percent: 8,
    mode: 'inclusive',
    taxable_cents: 259259,
    tax_cents: 20741,
  },
  total_cents: 280000, // 300000 - 20000 = 280000
  payments: [
    {
      method: 'card',
      amount_cents: 280000,
      reference: 'VISA-4321',
    },
  ],
  paid_cents: 280000,
  change_cents: 0,
};

// 6. Duplicate Copy Bill
const bill6_duplicateCopy: Bill = {
  ...bill1_singleItem,
  id: 'b6666666-0000-0000-0000-000000000006',
  bill_no: 'WWL-20261110-0006',
  print_count: 2,
  is_duplicate: true,
};

const allFixedBills = [
  { name: 'Bill 1 (Single Item)', bill: bill1_singleItem },
  { name: 'Bill 2 (40 Items)', bill: bill2_40items },
  { name: 'Bill 3 (Long Names)', bill: bill3_longNames },
  { name: 'Bill 4 (Decimals)', bill: bill4_decimals },
  { name: 'Bill 5 (Discount + Tax Inclusive)', bill: bill5_discountAndTax },
  { name: 'Bill 6 (Duplicate Copy)', bill: bill6_duplicateCopy },
];

describe('Plain-Text Formatted Receipt Width & Structure Tests', () => {
  it('strictly adheres to <= 42 characters per line for 80mm paper across all 6 test bills', () => {
    for (const { name, bill } of allFixedBills) {
      const output = formatReceiptPlainText(bill, '80mm');
      const lines = output.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        expect(
          line.length,
          `${name} at 80mm line ${i + 1} "${line}" exceeds 42 characters (got ${line.length})`
        ).toBeLessThanOrEqual(42);
      }
    }
  });

  it('strictly adheres to <= 32 characters per line for 58mm paper across all 6 test bills', () => {
    for (const { name, bill } of allFixedBills) {
      const output = formatReceiptPlainText(bill, '58mm');
      const lines = output.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        expect(
          line.length,
          `${name} at 58mm line ${i + 1} "${line}" exceeds 32 characters (got ${line.length})`
        ).toBeLessThanOrEqual(32);
      }
    }
  });

  it('renders DUPLICATE COPY banner at both top and bottom when print_count >= 1', () => {
    const text80 = formatReceiptPlainText(bill6_duplicateCopy, '80mm');
    const lines = text80.split('\n');

    const duplicateLines = lines.filter((l) => l.includes('*** DUPLICATE COPY ***'));
    expect(duplicateLines.length).toBe(2);

    // One at top, one at bottom
    expect(lines[0]).toContain('*** DUPLICATE COPY ***');
    expect(lines[lines.length - 1]).toContain('*** DUPLICATE COPY ***');
  });

  it('masks customer phone number on receipt as 077****123', () => {
    const text = formatReceiptPlainText(bill1_singleItem, '80mm');
    expect(text).toContain('077****567');
    expect(text).not.toContain('0771234567');
  });

  it('generates consistent snapshot for single item bill', () => {
    const text = formatReceiptPlainText(bill1_singleItem, '80mm');
    expect(text).toContain('Sunlight Soap 100g');
    expect(text).toContain('Rs. 120.00');
    expect(text).toContain('TOTAL');
    expect(text).toContain('Change');
    expect(text).toContain('Thank you, please come again');
  });
});

describe('Bill Integrity Verification (verifyBill)', () => {
  it('passes all 6 valid test bills with valid: true', () => {
    for (const { name, bill } of allFixedBills) {
      const res = verifyBill(bill);
      expect(res.valid, `${name} failed verification: ${res.error}`).toBe(true);
    }
  });

  it('halts printing and rejects a bill when grand total is corrupted by 1 cent', () => {
    const corruptedBill: Bill = {
      ...bill1_singleItem,
      total_cents: bill1_singleItem.total_cents + 1, // 1 cent extra corruption
    };

    const res = verifyBill(corruptedBill);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Bill totals mismatch, do not hand to customer');
  });

  it('detects line item gross mismatch when line price differs from subtotal', () => {
    const corruptedBill: Bill = {
      ...bill1_singleItem,
      subtotal_cents: bill1_singleItem.subtotal_cents + 100,
    };

    const res = verifyBill(corruptedBill);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Subtotal mismatch');
  });

  it('detects payments sum mismatch', () => {
    const corruptedBill: Bill = {
      ...bill1_singleItem,
      paid_cents: bill1_singleItem.paid_cents + 500,
    };

    const res = verifyBill(corruptedBill);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Payments sum mismatch');
  });

  it('detects change calculation mismatch', () => {
    const corruptedBill: Bill = {
      ...bill1_singleItem,
      change_cents: bill1_singleItem.change_cents - 10,
    };

    const res = verifyBill(corruptedBill);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Change calculation mismatch');
  });

  it('aborts BrowserPrintAdapter when bill is corrupted', async () => {
    const adapter = new BrowserPrintAdapter();
    const corruptedBill: Bill = {
      ...bill1_singleItem,
      total_cents: bill1_singleItem.total_cents + 1,
    };

    await expect(adapter.print(corruptedBill)).rejects.toThrow(
      /Bill totals mismatch, do not hand to customer/
    );
  });
});

describe('Phone Number Masking Utility', () => {
  it('masks Sri Lankan mobile numbers properly', () => {
    expect(maskPhoneNumber('0771234567')).toBe('077****567');
    expect(maskPhoneNumber('+94771234567')).toBe('077****567');
    expect(maskPhoneNumber('0714455667')).toBe('071****667');
  });

  it('handles empty or missing phone numbers gracefully', () => {
    expect(maskPhoneNumber(null)).toBe('');
    expect(maskPhoneNumber(undefined)).toBe('');
    expect(maskPhoneNumber('')).toBe('');
  });
});

describe('Code128 Barcode Generation', () => {
  it('encodes ASCII text into Code 128B boolean modules starting and ending properly', () => {
    const modules = encodeCode128BModules('WWL-20261110-0001');
    expect(modules.length).toBeGreaterThan(50);
    // First module is always a bar (start code 104 starts with 2 bars)
    expect(modules[0]).toBe(true);
    // Last module is always a bar (stop code ends with 2-width bar)
    expect(modules[modules.length - 1]).toBe(true);
  });

  it('generates valid SVG markup string', () => {
    const svg = generateCode128Svg('WWL-20261110-0001', { height: 35, barWidth: 1.2 });
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0');
    expect(svg).toContain('<rect');
    expect(svg).toContain('WWL-20261110-0001');
    expect(svg).toContain('</svg>');
  });
});
