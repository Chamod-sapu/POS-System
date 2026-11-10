import { supabase } from '../../../lib/supabase';

export interface DailySummaryRow {
  report_date: string;
  bill_count: number;
  gross_sales_cents: number;
  item_discounts_cents: number;
  bill_discounts_cents: number;
  tax_cents: number;
  net_sales_cents: number;
  returns_cents: number;
  final_net_cents: number;
  cash_cents: number;
  card_cents: number;
  bank_transfer_cents: number;
  store_credit_cents: number;
}

export interface ProductSalesRow {
  product_id: string;
  product_name: string;
  sku: string;
  category_name: string;
  quantity_sold: number;
  revenue_cents: number;
  cost_cents: number;
  profit_cents: number;
  margin_percent: number;
}

export interface CategorySalesRow {
  category_id: string;
  category_name: string;
  quantity_sold: number;
  revenue_cents: number;
  cost_cents: number;
  profit_cents: number;
  margin_percent: number;
}

export interface CashierSalesRow {
  cashier_id: string;
  cashier_name: string;
  bill_count: number;
  revenue_cents: number;
  discounts_cents: number;
  returns_cents: number;
}

export interface HourlySalesRow {
  hour_of_day: number;
  bill_count: number;
  revenue_cents: number;
}

export interface ProfitReportRow {
  revenue_cents: number;
  cost_of_goods_cents: number;
  gross_profit_cents: number;
  margin_percent: number;
  discounts_total_cents: number;
  returns_total_cents: number;
  net_profit_cents: number;
}

export interface StockValuationRow {
  product_id: string;
  product_name: string;
  sku: string;
  category_name: string;
  stock_qty: number;
  cost_price_cents: number;
  selling_price_cents: number;
  valuation_at_cost_cents: number;
  valuation_at_selling_cents: number;
  potential_profit_cents: number;
  potential_margin_percent: number;
}

export interface LowStockRow {
  product_id: string;
  product_name: string;
  sku: string;
  category_name: string;
  stock_qty: number;
  reorder_level: number;
  cost_price_cents: number;
  selling_price_cents: number;
  shortfall_qty: number;
}

export interface DeadStockRow {
  product_id: string;
  product_name: string;
  sku: string;
  category_name: string;
  stock_qty: number;
  valuation_at_cost_cents: number;
  last_sold_at: string | null;
  days_since_last_sale: number;
}

export interface ExpiryRow {
  batch_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  batch_no: string;
  expiry_date: string;
  qty_remaining: number;
  days_until_expiry: number;
  cost_price_cents: number;
  valuation_at_cost_cents: number;
}

export interface TaxReportRow {
  report_date: string;
  taxable_sales_cents: number;
  tax_exempt_sales_cents: number;
  tax_collected_cents: number;
  effective_tax_rate: number;
}

export interface ReturnVoidRow {
  id: string;
  event_type: 'void' | 'return';
  event_no: string;
  sale_id: string;
  bill_no: string;
  amount_cents: number;
  reason: string;
  created_at: string;
  created_by_name: string;
}

export interface SupplierBalanceRow {
  supplier_id: string;
  supplier_name: string;
  contact_person: string | null;
  phone: string | null;
  balance_cents: number;
  last_purchase_date: string | null;
  last_payment_date: string | null;
}

export interface TopCustomerRow {
  customer_id: string;
  name: string;
  phone: string;
  bill_count: number;
  total_spent_cents: number;
  points_balance: number;
}

export interface SmsReportRow {
  report_date: string;
  total_sms: number;
  sent_count: number;
  failed_count: number;
  pending_count: number;
}

export interface ReconciliationReport {
  all_passed: boolean;
  payments_balance_check: {
    passed: boolean;
    sum_sales_cents: number;
    sum_payments_minus_change_cents: number;
    diff_cents: number;
  };
  items_balance_check: {
    passed: boolean;
    sum_line_totals_cents: number;
    sum_sales_cents: number;
    diff_cents: number;
  };
  stock_movements_check: {
    passed: boolean;
    mismatched_products_count: number;
    details: Array<{
      product_id: string;
      product_name: string;
      sku: string;
      current_stock: number;
      calculated_stock: number;
      diff_qty: number;
    }>;
  };
  bill_sequence_check: {
    passed: boolean;
    missing_bills_count: number;
    gaps: Array<{
      date: string;
      min_seq: number;
      max_seq: number;
      missing_count: number;
    }>;
  };
}

export interface DashboardSummary {
  today_sales_cents: number;
  today_bill_count: number;
  today_avg_bill_cents: number;
  today_gross_profit_cents: number;
  today_margin_percent: number;
  top_5_products_today: Array<{
    product_id: string;
    product_name: string;
    sku: string;
    quantity_sold: number;
    revenue_cents: number;
  }>;
  last_7_days_sales: Array<{
    date: string;
    revenue_cents: number;
    bill_count: number;
  }>;
  low_stock_count: number;
  open_shifts_count: number;
  failed_sms_count: number;
}

/**
 * Daily summary report with payment breakdown.
 */
export async function fetchDailySummary(
  from: string,
  to: string
): Promise<DailySummaryRow[]> {
  const { data, error } = await supabase.rpc('report_daily_summary', {
    p_from: from,
    p_to: to,
  });

  if (error) {
    console.error('Failed to fetch daily summary:', error);
    throw new Error(error.message);
  }

  return (data || []) as unknown as DailySummaryRow[];
}

/**
 * Product-level sales, revenue, cost and margin report.
 */
export async function fetchSalesByProduct(
  from: string,
  to: string,
  categoryId?: string | null
): Promise<ProductSalesRow[]> {
  const { data, error } = await supabase.rpc('report_sales_by_product', {
    p_from: from,
    p_to: to,
    p_category_id: categoryId || null,
  });

  if (error) {
    console.error('Failed to fetch product sales report:', error);
    throw new Error(error.message);
  }

  return (data || []) as unknown as ProductSalesRow[];
}

/**
 * Category-level revenue and margin breakdown.
 */
export async function fetchSalesByCategory(
  from: string,
  to: string
): Promise<CategorySalesRow[]> {
  const { data, error } = await supabase.rpc('report_sales_by_category', {
    p_from: from,
    p_to: to,
  });

  if (error) {
    console.error('Failed to fetch category sales report:', error);
    throw new Error(error.message);
  }

  return (data || []) as unknown as CategorySalesRow[];
}

/**
 * Cashier throughput and revenue report.
 */
export async function fetchSalesByCashier(
  from: string,
  to: string
): Promise<CashierSalesRow[]> {
  const { data, error } = await supabase.rpc('report_sales_by_cashier', {
    p_from: from,
    p_to: to,
  });

  if (error) {
    console.error('Failed to fetch cashier sales report:', error);
    throw new Error(error.message);
  }

  return (data || []) as unknown as CashierSalesRow[];
}

/**
 * Peak hourly sales distribution.
 */
export async function fetchSalesByHour(
  from: string,
  to: string
): Promise<HourlySalesRow[]> {
  const { data, error } = await supabase.rpc('report_sales_by_hour', {
    p_from: from,
    p_to: to,
  });

  if (error) {
    console.error('Failed to fetch hourly sales report:', error);
    throw new Error(error.message);
  }

  return (data || []) as unknown as HourlySalesRow[];
}

/**
 * Comprehensive profit and margin report.
 */
export async function fetchProfitReport(
  from: string,
  to: string
): Promise<ProfitReportRow> {
  const { data, error } = await supabase.rpc('report_profit', {
    p_from: from,
    p_to: to,
  });

  if (error) {
    console.error('Failed to fetch profit report:', error);
    throw new Error(error.message);
  }

  const rows = (data || []) as unknown as ProfitReportRow[];
  return rows[0] || {
    revenue_cents: 0,
    cost_of_goods_cents: 0,
    gross_profit_cents: 0,
    margin_percent: 0,
    discounts_total_cents: 0,
    returns_total_cents: 0,
    net_profit_cents: 0,
  };
}

/**
 * Real-time stock holding valuation report.
 */
export async function fetchStockValuation(): Promise<StockValuationRow[]> {
  const { data, error } = await supabase.rpc('report_stock_valuation');

  if (error) {
    console.error('Failed to fetch stock valuation:', error);
    throw new Error(error.message);
  }

  return (data || []) as unknown as StockValuationRow[];
}

/**
 * Low stock reorder alert report.
 */
export async function fetchLowStock(): Promise<LowStockRow[]> {
  const { data, error } = await supabase.rpc('report_low_stock');

  if (error) {
    console.error('Failed to fetch low stock report:', error);
    throw new Error(error.message);
  }

  return (data || []) as unknown as LowStockRow[];
}

/**
 * Dead stock items report.
 */
export async function fetchDeadStock(days: number = 30): Promise<DeadStockRow[]> {
  const { data, error } = await supabase.rpc('report_dead_stock', {
    p_days: days,
  });

  if (error) {
    console.error('Failed to fetch dead stock report:', error);
    throw new Error(error.message);
  }

  return (data || []) as unknown as DeadStockRow[];
}

/**
 * Batch expiry watch report.
 */
export async function fetchExpiryReport(days: number = 30): Promise<ExpiryRow[]> {
  const { data, error } = await supabase.rpc('report_expiry', {
    p_days: days,
  });

  if (error) {
    console.error('Failed to fetch expiry report:', error);
    throw new Error(error.message);
  }

  return (data || []) as unknown as ExpiryRow[];
}

/**
 * VAT tax filing report.
 */
export async function fetchTaxReport(
  from: string,
  to: string
): Promise<TaxReportRow[]> {
  const { data, error } = await supabase.rpc('report_tax', {
    p_from: from,
    p_to: to,
  });

  if (error) {
    console.error('Failed to fetch tax report:', error);
    throw new Error(error.message);
  }

  return (data || []) as unknown as TaxReportRow[];
}

/**
 * Returns & Voids ledger report.
 */
export async function fetchReturnsVoids(
  from: string,
  to: string
): Promise<ReturnVoidRow[]> {
  const { data, error } = await supabase.rpc('report_returns_voids', {
    p_from: from,
    p_to: to,
  });

  if (error) {
    console.error('Failed to fetch returns and voids report:', error);
    throw new Error(error.message);
  }

  return (data || []) as unknown as ReturnVoidRow[];
}

/**
 * Outstanding supplier balances report.
 */
export async function fetchSupplierBalances(): Promise<SupplierBalanceRow[]> {
  const { data, error } = await supabase.rpc('report_supplier_balances');

  if (error) {
    console.error('Failed to fetch supplier balances:', error);
    throw new Error(error.message);
  }

  return (data || []) as unknown as SupplierBalanceRow[];
}

/**
 * Top customer leaderboard report.
 */
export async function fetchTopCustomers(
  from: string,
  to: string,
  limit: number = 20
): Promise<TopCustomerRow[]> {
  const { data, error } = await supabase.rpc('report_top_customers', {
    p_from: from,
    p_to: to,
    p_limit: limit,
  });

  if (error) {
    console.error('Failed to fetch top customers report:', error);
    throw new Error(error.message);
  }

  return (data || []) as unknown as TopCustomerRow[];
}

/**
 * SMS notifications summary report.
 */
export async function fetchSmsReport(
  from: string,
  to: string
): Promise<SmsReportRow[]> {
  const { data, error } = await supabase.rpc('report_sms', {
    p_from: from,
    p_to: to,
  });

  if (error) {
    console.error('Failed to fetch SMS report:', error);
    throw new Error(error.message);
  }

  return (data || []) as unknown as SmsReportRow[];
}

/**
 * Four-way audit reconciliation report.
 */
export async function fetchReconciliation(
  from: string,
  to: string
): Promise<ReconciliationReport> {
  const { data, error } = await supabase.rpc('report_reconciliation', {
    p_from: from,
    p_to: to,
  });

  if (error) {
    console.error('Failed to fetch reconciliation report:', error);
    throw new Error(error.message);
  }

  return data as unknown as ReconciliationReport;
}

/**
 * Live dashboard summary for managers and owners.
 */
export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const { data, error } = await supabase.rpc('report_dashboard_summary');

  if (error) {
    console.error('Failed to fetch dashboard summary:', error);
    throw new Error(error.message);
  }

  return data as unknown as DashboardSummary;
}

export interface BillAuditResult {
  from_date: string;
  to_date: string;
  total_bills_audited: number;
  discrepancy_count: number;
  status: 'passed' | 'failed';
  discrepancies: Array<{
    bill_id: string;
    bill_no: string;
    created_at: string;
    stored_total_cents: number;
    calculated_total_cents: number;
    issues: string[];
  }>;
}

export interface LatestBillAuditStatus {
  has_run: boolean;
  status: 'passed' | 'failed';
  discrepancy_count: number;
  total_bills_audited: number;
  last_run_at: string | null;
  from_date?: string;
  to_date?: string;
  discrepancies: Array<{
    bill_id: string;
    bill_no: string;
    created_at: string;
    stored_total_cents: number;
    calculated_total_cents: number;
    issues: string[];
  }>;
}

/**
 * Executes a full audit recomputing all bills across a date range.
 */
export async function runBillAudit(from: string, to: string): Promise<BillAuditResult> {
  const { data, error } = await (supabase.rpc as any)('audit_all_bills', {
    p_from: from,
    p_to: to,
  });

  if (error) {
    console.error('Failed to run bill audit:', error);
    throw new Error(error.message);
  }

  return data as unknown as BillAuditResult;
}

/**
 * Retrieves the status of the latest bill audit (scheduled or manual).
 */
export async function fetchLatestBillAudit(): Promise<LatestBillAuditStatus> {
  const { data, error } = await (supabase.rpc as any)('get_latest_bill_audit');

  if (error) {
    console.error('Failed to fetch latest bill audit:', error);
    return {
      has_run: false,
      status: 'passed',
      discrepancy_count: 0,
      total_bills_audited: 0,
      last_run_at: null,
      discrepancies: [],
    };
  }

  return data as unknown as LatestBillAuditStatus;
}


