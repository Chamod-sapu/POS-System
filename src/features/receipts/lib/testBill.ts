import { Bill } from '../types';

/**
 * Creates a valid mock Bill strictly adhering to arithmetic rules
 * for use in printer diagnostics, test prints, and unit tests.
 */
export function createTestBill(overrides?: Partial<Bill>): Bill {
  const baseBill: Bill = {
    id: '11111111-1111-1111-1111-111111111111',
    bill_no: 'WWL-20261110-0001',
    idempotency_key: '22222222-2222-2222-2222-222222222222',
    date_time: '2026-11-10T14:35:22+05:30',
    status: 'completed',
    print_count: 0,
    is_duplicate: false,
    shop: {
      name: 'Wewala Super Store',
      address: '123 Main Street, Wewala, Sri Lanka',
      phone: '0112345678',
      vat_reg_no: '123456789-7000',
      footer: 'Goods returnable within 7 days with original receipt.',
    },
    cashier: {
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Kasun Perera',
    },
    customer: {
      id: '44444444-4444-4444-4444-444444444444',
      name: 'Nimal Silva',
      phone: '0771234567',
    },
    lines: [
      {
        product_id: 'prod-001',
        name: 'Keells Samba Rice 5kg',
        sku: 'RICE-SAM-5K',
        unit: 'bag',
        quantity: 1,
        unit_price_cents: 125000,
        line_discount_cents: 0,
        line_tax_cents: 0,
        line_total_cents: 125000,
      },
      {
        product_id: 'prod-002',
        name: 'Anchor Milk Powder 400g',
        sku: 'MILK-ANC-400',
        unit: 'pack',
        quantity: 2,
        unit_price_cents: 48000,
        line_discount_cents: 0,
        line_tax_cents: 0,
        line_total_cents: 96000,
      },
    ],
    subtotal_cents: 221000,
    line_discount_cents: 0,
    bill_discount_cents: 0,
    tax: {
      rate_percent: 0,
      mode: 'inclusive',
      taxable_cents: 221000,
      tax_cents: 0,
    },
    total_cents: 221000,
    payments: [
      {
        method: 'cash',
        amount_cents: 250000,
        reference: null,
      },
    ],
    paid_cents: 250000,
    change_cents: 29000,
  };

  return {
    ...baseBill,
    ...overrides,
  };
}

