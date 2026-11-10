import { Database } from '../../types/database';

export type POSProduct = Database['public']['Views']['pos_products']['Row'];
export type PaymentMethod = Database['public']['Enums']['payment_method'];

export interface CartItem {
  id: string; // product_id or unique line uuid
  productId: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit: string;
  unitPriceCents: number;
  costPriceCents?: number;
  quantity: number;
  allowDecimalQty: boolean;
  maxStockQty: number;
  taxExempt: boolean;
  discountType: 'none' | 'percent' | 'amount';
  discountValue: number;
  // Calculated locally & validated by server quote
  localLineTotalCents: number;
  // Server-quoted preview properties
  serverGrossCents?: number;
  serverDiscountCents?: number;
  serverTaxCents?: number;
  serverTotalCents?: number;
  priceChanged?: boolean;
}

export interface BillDiscount {
  type: 'none' | 'percent' | 'amount';
  value: number; // percentage (e.g. 5 for 5%) or cents (e.g. 50000 for Rs. 500)
}

export interface CustomerLookupResult {
  exists: boolean;
  id?: string;
  name?: string;
  phone?: string;
  smsOptOut?: boolean;
  pointsBalance?: number;
}

export interface ServerQuoteWarning {
  type: string;
  product_id?: string;
  sku?: string;
  message: string;
  requested_qty?: number;
  available_qty?: number;
}

export interface ServerQuoteLine {
  line_idx: number;
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unit_price_cents: number;
  cost_price_cents?: number;
  tax_exempt?: boolean;
  gross_line_cents: number;
  line_discount_cents: number;
  net_line_cents: number;
  allocated_bill_discount_cents: number;
  line_after_cents: number;
  line_tax_cents: number;
  line_total_cents: number;
}

export interface ServerQuote {
  lines: ServerQuoteLine[];
  subtotal_cents: number;
  line_discount_cents: number;
  bill_discount_cents: number;
  tax: {
    rate_percent: number;
    mode: 'inclusive' | 'exclusive';
    taxable_cents: number;
    tax_cents: number;
  };
  total_cents: number;
  warnings: ServerQuoteWarning[];
}

export interface PaymentEntry {
  method: PaymentMethod;
  amountCents: number;
  reference?: string;
}

import { Bill } from '../receipts/types';

export interface HeldCartRow {
  id: string;
  cashier_id: string;
  label: string;
  cart_json: {
    items: CartItem[];
    billDiscount: BillDiscount;
    customerPhone: string;
    customerName: string;
    sendSms: boolean;
  };
  created_at: string;
}

export type SaleCheckoutResult = Bill;

