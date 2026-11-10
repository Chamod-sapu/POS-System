import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { formatReceiptPlainText } from './lib/formatPlainText';
import { Bill } from './types';

describe('Golden File Snapshot Tests for Receipts (10 Fixed Scenarios)', () => {
  const goldenDir = path.resolve(__dirname, '../../../test/golden/receipts');

  beforeAll(() => {
    if (!fs.existsSync(goldenDir)) {
      fs.mkdirSync(goldenDir, { recursive: true });
    }
  });

  const fixedShop = {
    name: 'Wewala Super Store',
    address: '123 Main Street, Wewala, Sri Lanka',
    phone: '0112345678',
    vat_reg_no: '123456789-7000',
    footer: 'Goods returnable within 7 days with original receipt.',
  };

  const fixedCashier = {
    id: 'c1111111-1111-1111-1111-111111111111',
    name: 'Kasun Perera',
  };

  const fixedCustomer = {
    id: 'cust-1111',
    name: 'Nimal Silva',
    phone: '0771234567',
  };

  const scenarios: Array<{ id: string; name: string; width: '80mm' | '58mm'; bill: Bill }> = [
    // Scenario 1: Simple single item cash sale
    {
      id: 'scenario_01_simple_cash',
      name: 'Single item discrete cash sale',
      width: '80mm',
      bill: {
        id: 'b001',
        bill_no: 'WWL-20261110-0001',
        idempotency_key: 'idem-001',
        date_time: '2026-11-10T14:35:22+05:30',
        status: 'completed',
        print_count: 0,
        is_duplicate: false,
        shop: fixedShop,
        cashier: fixedCashier,
        customer: fixedCustomer,
        lines: [
          {
            product_id: 'p001',
            name: 'Sunlight Soap Bar 100g',
            sku: 'SOAP-SUN-100',
            unit: 'pcs',
            quantity: 1,
            unit_price_cents: 15000,
            line_discount_cents: 0,
            line_tax_cents: 0,
            line_total_cents: 15000,
          },
        ],
        subtotal_cents: 15000,
        line_discount_cents: 0,
        bill_discount_cents: 0,
        tax: { rate_percent: 0, mode: 'inclusive', taxable_cents: 15000, tax_cents: 0 },
        total_cents: 15000,
        payments: [{ method: 'cash', amount_cents: 20000, reference: null }],
        paid_cents: 20000,
        change_cents: 5000,
      },
    },

    // Scenario 2: Weighed product with decimal quantity
    {
      id: 'scenario_02_weighed_product',
      name: 'Weighed item fractional kg quantity',
      width: '80mm',
      bill: {
        id: 'b002',
        bill_no: 'WWL-20261110-0002',
        idempotency_key: 'idem-002',
        date_time: '2026-11-10T14:40:00+05:30',
        status: 'completed',
        print_count: 0,
        is_duplicate: false,
        shop: fixedShop,
        cashier: fixedCashier,
        customer: fixedCustomer,
        lines: [
          {
            product_id: 'p002',
            name: 'Red Raw Nadu Rice',
            sku: 'RICE-NADU-KG',
            unit: 'kg',
            quantity: 1.750,
            unit_price_cents: 26000,
            line_discount_cents: 0,
            line_tax_cents: 0,
            line_total_cents: 45500,
          },
        ],
        subtotal_cents: 45500,
        line_discount_cents: 0,
        bill_discount_cents: 0,
        tax: { rate_percent: 0, mode: 'inclusive', taxable_cents: 45500, tax_cents: 0 },
        total_cents: 45500,
        payments: [{ method: 'cash', amount_cents: 50000, reference: null }],
        paid_cents: 50000,
        change_cents: 4500,
      },
    },

    // Scenario 3: Line percentage discount
    {
      id: 'scenario_03_line_percentage_discount',
      name: 'Item with 10% line discount',
      width: '80mm',
      bill: {
        id: 'b003',
        bill_no: 'WWL-20261110-0003',
        idempotency_key: 'idem-003',
        date_time: '2026-11-10T14:45:10+05:30',
        status: 'completed',
        print_count: 0,
        is_duplicate: false,
        shop: fixedShop,
        cashier: fixedCashier,
        customer: fixedCustomer,
        lines: [
          {
            product_id: 'p003',
            name: 'Anchor Salted Butter 200g',
            sku: 'BUTTER-ANC-200',
            unit: 'pack',
            quantity: 2,
            unit_price_cents: 85000,
            line_discount_cents: 17000,
            line_tax_cents: 0,
            line_total_cents: 153000,
          },
        ],
        subtotal_cents: 170000,
        line_discount_cents: 17000,
        bill_discount_cents: 0,
        tax: { rate_percent: 0, mode: 'inclusive', taxable_cents: 153000, tax_cents: 0 },
        total_cents: 153000,
        payments: [{ method: 'card', amount_cents: 153000, reference: 'AUTH-9988' }],
        paid_cents: 153000,
        change_cents: 0,
      },
    },

    // Scenario 4: Bill-level discount
    {
      id: 'scenario_04_bill_discount',
      name: 'Cart with 5% bill-level discount',
      width: '80mm',
      bill: {
        id: 'b004',
        bill_no: 'WWL-20261110-0004',
        idempotency_key: 'idem-004',
        date_time: '2026-11-10T14:50:00+05:30',
        status: 'completed',
        print_count: 0,
        is_duplicate: false,
        shop: fixedShop,
        cashier: fixedCashier,
        customer: fixedCustomer,
        lines: [
          {
            product_id: 'p004a',
            name: 'Dilmah Ceylon Tea 400g',
            sku: 'TEA-DIL-400',
            unit: 'box',
            quantity: 1,
            unit_price_cents: 120000,
            line_discount_cents: 0,
            line_tax_cents: 0,
            line_total_cents: 114000,
          },
          {
            product_id: 'p004b',
            name: 'White Sugar 1kg',
            sku: 'SUGAR-WHT-1K',
            unit: 'kg',
            quantity: 6,
            unit_price_cents: 30000,
            line_discount_cents: 0,
            line_tax_cents: 0,
            line_total_cents: 171000,
          },
        ],
        subtotal_cents: 300000,
        line_discount_cents: 0,
        bill_discount_cents: 15000,
        tax: { rate_percent: 0, mode: 'inclusive', taxable_cents: 285000, tax_cents: 0 },
        total_cents: 285000,
        payments: [{ method: 'cash', amount_cents: 300000, reference: null }],
        paid_cents: 300000,
        change_cents: 15000,
      },
    },

    // Scenario 5: Tax-inclusive VAT (18%)
    {
      id: 'scenario_05_tax_inclusive',
      name: 'Tax inclusive 18% VAT bill',
      width: '80mm',
      bill: {
        id: 'b005',
        bill_no: 'WWL-20261110-0005',
        idempotency_key: 'idem-005',
        date_time: '2026-11-10T15:00:00+05:30',
        status: 'completed',
        print_count: 0,
        is_duplicate: false,
        shop: fixedShop,
        cashier: fixedCashier,
        customer: fixedCustomer,
        lines: [
          {
            product_id: 'p005',
            name: 'Stainless Steel Electric Kettle 1.8L',
            sku: 'APPL-KET-18L',
            unit: 'pcs',
            quantity: 1,
            unit_price_cents: 590000,
            line_discount_cents: 0,
            line_tax_cents: 90000,
            line_total_cents: 590000,
          },
        ],
        subtotal_cents: 590000,
        line_discount_cents: 0,
        bill_discount_cents: 0,
        tax: { rate_percent: 18, mode: 'inclusive', taxable_cents: 500000, tax_cents: 90000 },
        total_cents: 590000,
        payments: [{ method: 'card', amount_cents: 590000, reference: 'VISA-4421' }],
        paid_cents: 590000,
        change_cents: 0,
      },
    },

    // Scenario 6: Tax-exclusive VAT (18%)
    {
      id: 'scenario_06_tax_exclusive',
      name: 'Tax exclusive 18% VAT bill',
      width: '80mm',
      bill: {
        id: 'b006',
        bill_no: 'WWL-20261110-0006',
        idempotency_key: 'idem-006',
        date_time: '2026-11-10T15:15:00+05:30',
        status: 'completed',
        print_count: 0,
        is_duplicate: false,
        shop: fixedShop,
        cashier: fixedCashier,
        customer: fixedCustomer,
        lines: [
          {
            product_id: 'p006',
            name: 'Rotary Hammer Drill Kit 800W',
            sku: 'TOOL-DRL-800',
            unit: 'pcs',
            quantity: 1,
            unit_price_cents: 1000000,
            line_discount_cents: 0,
            line_tax_cents: 180000,
            line_total_cents: 1180000,
          },
        ],
        subtotal_cents: 1000000,
        line_discount_cents: 0,
        bill_discount_cents: 0,
        tax: { rate_percent: 18, mode: 'exclusive', taxable_cents: 1000000, tax_cents: 180000 },
        total_cents: 1180000,
        payments: [{ method: 'bank_transfer', amount_cents: 1180000, reference: 'HNB-TRF-0912' }],
        paid_cents: 1180000,
        change_cents: 0,
      },
    },

    // Scenario 7: Mixed tax-exempt lines and taxable goods
    {
      id: 'scenario_07_mixed_tax_exempt',
      name: 'Mixed tax-exempt food and taxable item',
      width: '80mm',
      bill: {
        id: 'b007',
        bill_no: 'WWL-20261110-0007',
        idempotency_key: 'idem-007',
        date_time: '2026-11-10T15:30:00+05:30',
        status: 'completed',
        print_count: 0,
        is_duplicate: false,
        shop: fixedShop,
        cashier: fixedCashier,
        customer: fixedCustomer,
        lines: [
          {
            product_id: 'p007a',
            name: 'Fresh Farm Eggs 10pk (Tax Exempt)',
            sku: 'FOOD-EGG-10',
            unit: 'pack',
            quantity: 1,
            unit_price_cents: 50000,
            line_discount_cents: 0,
            line_tax_cents: 0,
            line_total_cents: 50000,
          },
          {
            product_id: 'p007b',
            name: 'Herbal Shampoo Bottle 200ml',
            sku: 'CARE-SHP-200',
            unit: 'pcs',
            quantity: 1,
            unit_price_cents: 100000,
            line_discount_cents: 0,
            line_tax_cents: 18000,
            line_total_cents: 118000,
          },
        ],
        subtotal_cents: 150000,
        line_discount_cents: 0,
        bill_discount_cents: 0,
        tax: { rate_percent: 18, mode: 'exclusive', taxable_cents: 100000, tax_cents: 18000 },
        total_cents: 168000,
        payments: [{ method: 'cash', amount_cents: 200000, reference: null }],
        paid_cents: 200000,
        change_cents: 32000,
      },
    },

    // Scenario 8: Split payment (cash + card) with change
    {
      id: 'scenario_08_split_payment_change',
      name: 'Split payment cash and credit card',
      width: '80mm',
      bill: {
        id: 'b008',
        bill_no: 'WWL-20261110-0008',
        idempotency_key: 'idem-008',
        date_time: '2026-11-10T15:45:00+05:30',
        status: 'completed',
        print_count: 0,
        is_duplicate: false,
        shop: fixedShop,
        cashier: fixedCashier,
        customer: fixedCustomer,
        lines: [
          {
            product_id: 'p008',
            name: 'Ceylon Cinnamon Powder 100g',
            sku: 'SPICE-CIN-100',
            unit: 'pack',
            quantity: 5,
            unit_price_cents: 85000,
            line_discount_cents: 0,
            line_tax_cents: 0,
            line_total_cents: 425000,
          },
        ],
        subtotal_cents: 425000,
        line_discount_cents: 0,
        bill_discount_cents: 0,
        tax: { rate_percent: 0, mode: 'inclusive', taxable_cents: 425000, tax_cents: 0 },
        total_cents: 425000,
        payments: [
          { method: 'cash', amount_cents: 200000, reference: null },
          { method: 'card', amount_cents: 250000, reference: 'MC-7788' },
        ],
        paid_cents: 450000,
        change_cents: 25000,
      },
    },

    // Scenario 9: Duplicate reprint (print_count = 1)
    {
      id: 'scenario_09_duplicate_reprint',
      name: 'Duplicate reprint with copy markers',
      width: '80mm',
      bill: {
        id: 'b009',
        bill_no: 'WWL-20261110-0009',
        idempotency_key: 'idem-009',
        date_time: '2026-11-10T16:00:00+05:30',
        status: 'completed',
        print_count: 1,
        is_duplicate: true,
        shop: fixedShop,
        cashier: fixedCashier,
        customer: fixedCustomer,
        lines: [
          {
            product_id: 'p009',
            name: 'Sunlight Soap Bar 100g',
            sku: 'SOAP-SUN-100',
            unit: 'pcs',
            quantity: 2,
            unit_price_cents: 15000,
            line_discount_cents: 0,
            line_tax_cents: 0,
            line_total_cents: 30000,
          },
        ],
        subtotal_cents: 30000,
        line_discount_cents: 0,
        bill_discount_cents: 0,
        tax: { rate_percent: 0, mode: 'inclusive', taxable_cents: 30000, tax_cents: 0 },
        total_cents: 30000,
        payments: [{ method: 'cash', amount_cents: 30000, reference: null }],
        paid_cents: 30000,
        change_cents: 0,
      },
    },

    // Scenario 10: Narrow 58mm paper format (32 columns)
    {
      id: 'scenario_10_narrow_58mm',
      name: 'Narrow 58mm thermal slip',
      width: '58mm',
      bill: {
        id: 'b010',
        bill_no: 'WWL-20261110-0010',
        idempotency_key: 'idem-010',
        date_time: '2026-11-10T16:15:00+05:30',
        status: 'completed',
        print_count: 0,
        is_duplicate: false,
        shop: fixedShop,
        cashier: fixedCashier,
        customer: fixedCustomer,
        lines: [
          {
            product_id: 'p010',
            name: 'Anchor Milk Powder 400g Box',
            sku: 'MILK-ANC-400',
            unit: 'pack',
            quantity: 1,
            unit_price_cents: 48000,
            line_discount_cents: 0,
            line_tax_cents: 0,
            line_total_cents: 48000,
          },
        ],
        subtotal_cents: 48000,
        line_discount_cents: 0,
        bill_discount_cents: 0,
        tax: { rate_percent: 0, mode: 'inclusive', taxable_cents: 48000, tax_cents: 0 },
        total_cents: 48000,
        payments: [{ method: 'cash', amount_cents: 50000, reference: null }],
        paid_cents: 50000,
        change_cents: 2000,
      },
    },
  ];

  for (const s of scenarios) {
    it(`renders and verifies golden file snapshot for ${s.name} (${s.id})`, () => {
      const formatted = formatReceiptPlainText(s.bill, s.width);
      const filePath = path.join(goldenDir, `${s.id}.txt`);

      // If golden file does not exist yet, write it
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, formatted, 'utf8');
      }

      const expected = fs.readFileSync(filePath, 'utf8');
      expect(formatted).toBe(expected);

      // Verify line width constraint
      const maxCol = s.width === '58mm' ? 32 : 42;
      const lines = formatted.split('\n');
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(maxCol);
      }
    });
  }
});

