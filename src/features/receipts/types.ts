/**
 * Types and interfaces for Bill rendering, receipt formatting, and printing.
 * The receipt must be generated ONLY from the bill JSON returned by create_sale or get_bill.
 * All monetary amounts are in integer cents.
 */

export type PaperWidth = '80mm' | '58mm';

export type PrinterAdapterType = 'browser' | 'escpos';

export interface PrinterSettings {
  adapter: PrinterAdapterType;
  paperWidth: PaperWidth;
  copies: 1 | 2;
  autoPrint: boolean;
  drawerOnCash: boolean;
}

export interface BillShop {
  name: string;
  address: string;
  phone: string;
  vat_reg_no?: string | null;
  footer?: string | null;
}

export interface BillCashier {
  id: string;
  name: string;
}

export interface BillCustomer {
  id: string;
  name?: string | null;
  phone: string;
  points_earned?: number;
  points_balance?: number;
}

export interface BillLine {
  product_id: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  unit_price_cents: number;
  line_discount_cents: number;
  line_tax_cents: number;
  line_total_cents: number;
}

export interface BillTax {
  rate_percent: number;
  mode: 'inclusive' | 'exclusive';
  taxable_cents: number;
  tax_cents: number;
}

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'store_credit';

export interface BillPayment {
  method: PaymentMethod;
  amount_cents: number;
  reference?: string | null;
}

export interface Bill {
  id: string;
  bill_no: string;
  idempotency_key?: string;
  date_time: string; // ISO 8601 string in Asia/Colombo time
  status: 'completed' | 'voided' | 'partially_returned' | 'returned';
  print_count: number;
  is_duplicate?: boolean;
  shop: BillShop;
  cashier: BillCashier;
  customer?: BillCustomer | null;
  lines: BillLine[];
  subtotal_cents: number;
  line_discount_cents: number;
  bill_discount_cents: number;
  tax: BillTax;
  total_cents: number;
  payments: BillPayment[];
  paid_cents: number;
  change_cents: number;
}

export interface BillVerificationResult {
  valid: boolean;
  error?: string;
  diffCents?: number;
}

export interface PrintOptions {
  paperWidth?: PaperWidth;
  copies?: number;
  openDrawer?: boolean;
}

export interface PrinterAdapter {
  name: string;
  print(bill: Bill, options?: PrintOptions): Promise<void>;
  openCashDrawer?(): Promise<void>;
}

