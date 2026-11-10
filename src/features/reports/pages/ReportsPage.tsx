import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  Download,
  Printer,
  Receipt,
  FileSpreadsheet,
  BarChart3,
  TrendingUp,
  Boxes,
  AlertTriangle,
  RotateCcw,
  Users,
  MessageSquare,
  Truck,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Money } from '../../../components/ui/Money';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { formatLKR } from '../../../lib/money';
import { useAuth } from '../../auth/hooks/useAuth';
import { useShopSettings } from '../../settings/hooks/useShopSettings';
import {
  fetchDailySummary,
  fetchSalesByProduct,
  fetchSalesByCategory,
  fetchSalesByCashier,
  fetchSalesByHour,
  fetchProfitReport,
  fetchStockValuation,
  fetchLowStock,
  fetchDeadStock,
  fetchExpiryReport,
  fetchTaxReport,
  fetchReturnsVoids,
  fetchSupplierBalances,
  fetchTopCustomers,
  fetchSmsReport,
  fetchReconciliation,
  runBillAudit,
  fetchLatestBillAudit,
  BillAuditResult,
  LatestBillAuditStatus,
  DailySummaryRow,
  ProductSalesRow,
  CategorySalesRow,
  CashierSalesRow,
  HourlySalesRow,
  ProfitReportRow,
  StockValuationRow,
  LowStockRow,
  DeadStockRow,
  ExpiryRow,
  TaxReportRow,
  ReturnVoidRow,
  SupplierBalanceRow,
  TopCustomerRow,
  SmsReportRow,
} from '../api/reports';
import { downloadCsv, CsvColumn } from '../lib/exportCsv';
import { ReconciliationPanel } from '../components/ReconciliationPanel';
import { DailySummarySlip } from '../components/DailySummarySlip';

export type ReportType =
  | 'daily_summary'
  | 'sales_by_product'
  | 'sales_by_category'
  | 'sales_by_cashier'
  | 'sales_by_hour'
  | 'profit_report'
  | 'stock_valuation'
  | 'low_stock'
  | 'dead_stock'
  | 'expiry_watch'
  | 'tax_report'
  | 'returns_voids'
  | 'supplier_balances'
  | 'top_customers'
  | 'sms_report'
  | 'accuracy_audit';

export type PresetKey = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'custom';

// Format YYYY-MM-DD in local time
function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const ReportsPage: React.FC = () => {
  const { profile } = useAuth();
  const { shopName } = useShopSettings();

  const [activeReport, setActiveReport] = useState<ReportType>('daily_summary');
  const [preset, setPreset] = useState<PresetKey>('today');
  const [customFrom, setCustomFrom] = useState<string>(() => toLocalDateString(new Date()));
  const [customTo, setCustomTo] = useState<string>(() => toLocalDateString(new Date()));
  const [thermalSlipOpen, setThermalSlipOpen] = useState(false);

  // Compute effective date range based on preset
  const { fromDate, toDate, rangeLabel } = useMemo(() => {
    const now = new Date();
    let from = new Date(now);
    let to = new Date(now);
    let label = 'Today';

    switch (preset) {
      case 'today':
        label = `Today (${toLocalDateString(now)})`;
        break;
      case 'yesterday': {
        from.setDate(now.getDate() - 1);
        to.setDate(now.getDate() - 1);
        label = `Yesterday (${toLocalDateString(from)})`;
        break;
      }
      case 'this_week': {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
        from.setDate(diff);
        label = `This Week (${toLocalDateString(from)} to ${toLocalDateString(to)})`;
        break;
      }
      case 'this_month': {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        label = `This Month (${toLocalDateString(from)} to ${toLocalDateString(to)})`;
        break;
      }
      case 'last_month': {
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        to = new Date(now.getFullYear(), now.getMonth(), 0);
        label = `Last Month (${toLocalDateString(from)} to ${toLocalDateString(to)})`;
        break;
      }
      case 'custom':
        return {
          fromDate: customFrom,
          toDate: customTo,
          rangeLabel: `${customFrom} to ${customTo}`,
        };
    }

    return {
      fromDate: toLocalDateString(from),
      toDate: toLocalDateString(to),
      rangeLabel: label,
    };
  }, [preset, customFrom, customTo]);

  // Main Report Query based on activeReport
  const { data: reportData, isLoading, error } = useQuery({
    queryKey: ['report-data', activeReport, fromDate, toDate],
    queryFn: async () => {
      switch (activeReport) {
        case 'daily_summary':
          return fetchDailySummary(fromDate, toDate);
        case 'sales_by_product':
          return fetchSalesByProduct(fromDate, toDate);
        case 'sales_by_category':
          return fetchSalesByCategory(fromDate, toDate);
        case 'sales_by_cashier':
          return fetchSalesByCashier(fromDate, toDate);
        case 'sales_by_hour':
          return fetchSalesByHour(fromDate, toDate);
        case 'profit_report':
          return fetchProfitReport(fromDate, toDate);
        case 'stock_valuation':
          return fetchStockValuation();
        case 'low_stock':
          return fetchLowStock();
        case 'dead_stock':
          return fetchDeadStock(30);
        case 'expiry_watch':
          return fetchExpiryReport(30);
        case 'tax_report':
          return fetchTaxReport(fromDate, toDate);
        case 'returns_voids':
          return fetchReturnsVoids(fromDate, toDate);
        case 'supplier_balances':
          return fetchSupplierBalances();
        case 'top_customers':
          return fetchTopCustomers(fromDate, toDate, 20);
        case 'sms_report':
          return fetchSmsReport(fromDate, toDate);
        case 'accuracy_audit':
          return runBillAudit(fromDate, toDate);
      }
    },
    staleTime: 1000 * 30, // 30 seconds
  });

  // Reconciliation query (runs for daily summary and profit reports)
  const shouldFetchReconciliation =
    activeReport === 'daily_summary' || activeReport === 'profit_report';

  const { data: reconciliationData, isLoading: isReconLoading } = useQuery({
    queryKey: ['reconciliation-report', fromDate, toDate],
    queryFn: () => fetchReconciliation(fromDate, toDate),
    enabled: shouldFetchReconciliation,
    staleTime: 1000 * 30,
  });

  // Export PDF / Print
  const handlePrintPdf = () => {
    window.print();
  };

  // CSV Exporter for each report type
  const handleExportCsv = () => {
    if (!reportData) return;

    switch (activeReport) {
      case 'daily_summary': {
        const rows = reportData as DailySummaryRow[];
        const cols: CsvColumn<DailySummaryRow>[] = [
          { header: 'Date', accessor: (r) => r.report_date },
          { header: 'Bill Count', accessor: (r) => r.bill_count },
          { header: 'Gross Sales (LKR)', accessor: (r) => r.gross_sales_cents, isMoneyCents: true },
          { header: 'Line Discounts (LKR)', accessor: (r) => r.item_discounts_cents, isMoneyCents: true },
          { header: 'Bill Discounts (LKR)', accessor: (r) => r.bill_discounts_cents, isMoneyCents: true },
          { header: 'VAT Tax (LKR)', accessor: (r) => r.tax_cents, isMoneyCents: true },
          { header: 'Net Sales (LKR)', accessor: (r) => r.net_sales_cents, isMoneyCents: true },
          { header: 'Returns (LKR)', accessor: (r) => r.returns_cents, isMoneyCents: true },
          { header: 'Final Net (LKR)', accessor: (r) => r.final_net_cents, isMoneyCents: true },
          { header: 'Cash (LKR)', accessor: (r) => r.cash_cents, isMoneyCents: true },
          { header: 'Card (LKR)', accessor: (r) => r.card_cents, isMoneyCents: true },
          { header: 'Bank Transfer (LKR)', accessor: (r) => r.bank_transfer_cents, isMoneyCents: true },
          { header: 'Store Credit (LKR)', accessor: (r) => r.store_credit_cents, isMoneyCents: true },
        ];
        downloadCsv(`daily_summary_${fromDate}_${toDate}`, rows, cols);
        break;
      }
      case 'sales_by_product': {
        const rows = reportData as ProductSalesRow[];
        const cols: CsvColumn<ProductSalesRow>[] = [
          { header: 'Product Name', accessor: (r) => r.product_name },
          { header: 'SKU', accessor: (r) => r.sku },
          { header: 'Category', accessor: (r) => r.category_name },
          { header: 'Qty Sold', accessor: (r) => r.quantity_sold },
          { header: 'Revenue (LKR)', accessor: (r) => r.revenue_cents, isMoneyCents: true },
          { header: 'COGS Cost (LKR)', accessor: (r) => r.cost_cents, isMoneyCents: true },
          { header: 'Gross Profit (LKR)', accessor: (r) => r.profit_cents, isMoneyCents: true },
          { header: 'Margin %', accessor: (r) => r.margin_percent },
        ];
        downloadCsv(`sales_by_product_${fromDate}_${toDate}`, rows, cols);
        break;
      }
      case 'sales_by_category': {
        const rows = reportData as CategorySalesRow[];
        const cols: CsvColumn<CategorySalesRow>[] = [
          { header: 'Category Name', accessor: (r) => r.category_name },
          { header: 'Qty Sold', accessor: (r) => r.quantity_sold },
          { header: 'Revenue (LKR)', accessor: (r) => r.revenue_cents, isMoneyCents: true },
          { header: 'COGS Cost (LKR)', accessor: (r) => r.cost_cents, isMoneyCents: true },
          { header: 'Profit (LKR)', accessor: (r) => r.profit_cents, isMoneyCents: true },
          { header: 'Margin %', accessor: (r) => r.margin_percent },
        ];
        downloadCsv(`sales_by_category_${fromDate}_${toDate}`, rows, cols);
        break;
      }
      case 'sales_by_cashier': {
        const rows = reportData as CashierSalesRow[];
        const cols: CsvColumn<CashierSalesRow>[] = [
          { header: 'Cashier Name', accessor: (r) => r.cashier_name },
          { header: 'Bill Count', accessor: (r) => r.bill_count },
          { header: 'Revenue (LKR)', accessor: (r) => r.revenue_cents, isMoneyCents: true },
          { header: 'Discounts Granted (LKR)', accessor: (r) => r.discounts_cents, isMoneyCents: true },
          { header: 'Returns Handled (LKR)', accessor: (r) => r.returns_cents, isMoneyCents: true },
        ];
        downloadCsv(`sales_by_cashier_${fromDate}_${toDate}`, rows, cols);
        break;
      }
      case 'sales_by_hour': {
        const rows = reportData as HourlySalesRow[];
        const cols: CsvColumn<HourlySalesRow>[] = [
          { header: 'Hour of Day (Colombo)', accessor: (r) => `${r.hour_of_day}:00` },
          { header: 'Bill Count', accessor: (r) => r.bill_count },
          { header: 'Revenue (LKR)', accessor: (r) => r.revenue_cents, isMoneyCents: true },
        ];
        downloadCsv(`sales_by_hour_${fromDate}_${toDate}`, rows, cols);
        break;
      }
      case 'stock_valuation': {
        const rows = reportData as StockValuationRow[];
        const cols: CsvColumn<StockValuationRow>[] = [
          { header: 'Product Name', accessor: (r) => r.product_name },
          { header: 'SKU', accessor: (r) => r.sku },
          { header: 'Category', accessor: (r) => r.category_name },
          { header: 'Stock Qty', accessor: (r) => r.stock_qty },
          { header: 'Cost Price (LKR)', accessor: (r) => r.cost_price_cents, isMoneyCents: true },
          { header: 'Selling Price (LKR)', accessor: (r) => r.selling_price_cents, isMoneyCents: true },
          { header: 'Valuation at Cost (LKR)', accessor: (r) => r.valuation_at_cost_cents, isMoneyCents: true },
          { header: 'Valuation at Retail (LKR)', accessor: (r) => r.valuation_at_selling_cents, isMoneyCents: true },
          { header: 'Potential Profit (LKR)', accessor: (r) => r.potential_profit_cents, isMoneyCents: true },
        ];
        downloadCsv('stock_valuation', rows, cols);
        break;
      }
      case 'low_stock': {
        const rows = reportData as LowStockRow[];
        const cols: CsvColumn<LowStockRow>[] = [
          { header: 'Product Name', accessor: (r) => r.product_name },
          { header: 'SKU', accessor: (r) => r.sku },
          { header: 'Category', accessor: (r) => r.category_name },
          { header: 'Stock Qty', accessor: (r) => r.stock_qty },
          { header: 'Reorder Level', accessor: (r) => r.reorder_level },
          { header: 'Shortfall Qty', accessor: (r) => r.shortfall_qty },
          { header: 'Cost Price (LKR)', accessor: (r) => r.cost_price_cents, isMoneyCents: true },
        ];
        downloadCsv('low_stock_reorder', rows, cols);
        break;
      }
      case 'tax_report': {
        const rows = reportData as TaxReportRow[];
        const cols: CsvColumn<TaxReportRow>[] = [
          { header: 'Date', accessor: (r) => r.report_date },
          { header: 'Taxable Sales (LKR)', accessor: (r) => r.taxable_sales_cents, isMoneyCents: true },
          { header: 'Tax Exempt Sales (LKR)', accessor: (r) => r.tax_exempt_sales_cents, isMoneyCents: true },
          { header: 'Tax Collected (LKR)', accessor: (r) => r.tax_collected_cents, isMoneyCents: true },
          { header: 'Effective Tax Rate %', accessor: (r) => r.effective_tax_rate },
        ];
        downloadCsv(`tax_filing_${fromDate}_${toDate}`, rows, cols);
        break;
      }
      case 'returns_voids': {
        const rows = reportData as ReturnVoidRow[];
        const cols: CsvColumn<ReturnVoidRow>[] = [
          { header: 'Event', accessor: (r) => r.event_type.toUpperCase() },
          { header: 'Ref No', accessor: (r) => r.event_no },
          { header: 'Bill No', accessor: (r) => r.bill_no },
          { header: 'Amount (LKR)', accessor: (r) => r.amount_cents, isMoneyCents: true },
          { header: 'Reason', accessor: (r) => r.reason },
          { header: 'Date/Time', accessor: (r) => r.created_at },
          { header: 'Authorized By', accessor: (r) => r.created_by_name },
        ];
        downloadCsv(`returns_and_voids_${fromDate}_${toDate}`, rows, cols);
        break;
      }
      default:
        alert('CSV Export prepared for this report table.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Printable Header (Visible only on Window Print) */}
      <div className="hidden print:block p-4 border-b-2 border-black space-y-1">
        <h1 className="text-xl font-black uppercase text-black">{shopName}</h1>
        <h2 className="text-sm font-bold uppercase tracking-wider text-black">
          {activeReport.replace(/_/g, ' ')}
        </h2>
        <div className="text-xs text-black flex justify-between pt-1 font-mono">
          <span>Date Range: {rangeLabel}</span>
          <span>Generated: {new Date().toLocaleString()} by {profile?.full_name || 'Manager'}</span>
        </div>
      </div>

      {/* Screen Page Header */}
      <div className="print:hidden">
        <PageHeader
          title="Management & Owner Reports"
          subtitle="Financial performance, inventory valuation, tax filing, and mathematical ledger reconciliation"
          actions={
            <div className="flex items-center space-x-2">
              {activeReport === 'daily_summary' && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Receipt className="w-4 h-4 text-purple-600" />}
                  onClick={() => setThermalSlipOpen(true)}
                  disabled={isLoading || !reportData}
                >
                  Thermal Slip
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                leftIcon={<Printer className="w-4 h-4 text-slate-600" />}
                onClick={handlePrintPdf}
                disabled={isLoading}
              >
                Print PDF / A4
              </Button>

              <Button
                variant="primary"
                size="sm"
                leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-200" />}
                onClick={handleExportCsv}
                disabled={isLoading || !reportData}
              >
                Export CSV (Excel)
              </Button>
            </div>
          }
        />
      </div>

      {/* Report Selector Pills */}
      <div className="print:hidden bg-white dark:bg-slate-900 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-subtle overflow-x-auto flex items-center space-x-1.5 scrollbar-thin">
        {[
          { id: 'daily_summary', label: 'Daily Summary', icon: <Receipt className="w-4 h-4" /> },
          { id: 'profit_report', label: 'Profit & Margins', icon: <TrendingUp className="w-4 h-4" /> },
          { id: 'sales_by_product', label: 'Sales by Product', icon: <Boxes className="w-4 h-4" /> },
          { id: 'sales_by_category', label: 'Category Share', icon: <Layers className="w-4 h-4" /> },
          { id: 'sales_by_hour', label: 'Hourly Peaks', icon: <Clock className="w-4 h-4" /> },
          { id: 'sales_by_cashier', label: 'Cashier Staff', icon: <Users className="w-4 h-4" /> },
          { id: 'stock_valuation', label: 'Stock Valuation', icon: <BarChart3 className="w-4 h-4" /> },
          { id: 'low_stock', label: 'Low Stock Alert', icon: <AlertTriangle className="w-4 h-4" /> },
          { id: 'dead_stock', label: 'Dead Stock (30d)', icon: <Boxes className="w-4 h-4" /> },
          { id: 'expiry_watch', label: 'Expiry Watch', icon: <Calendar className="w-4 h-4" /> },
          { id: 'tax_report', label: 'VAT Tax Filing', icon: <FileSpreadsheet className="w-4 h-4" /> },
          { id: 'returns_voids', label: 'Returns & Voids', icon: <RotateCcw className="w-4 h-4" /> },
          { id: 'supplier_balances', label: 'Supplier Payables', icon: <Truck className="w-4 h-4" /> },
          { id: 'top_customers', label: 'Top Customers', icon: <Users className="w-4 h-4" /> },
          { id: 'sms_report', label: 'SMS Outbox', icon: <MessageSquare className="w-4 h-4" /> },
          { id: 'accuracy_audit', label: 'Accuracy Check', icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" /> },
        ].map((rep) => {
          const isActive = activeReport === rep.id;
          return (
            <button
              key={rep.id}
              type="button"
              onClick={() => setActiveReport(rep.id as ReportType)}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-brand-600 text-white shadow-2xs'
                  : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>{rep.icon}</span>
              <span>{rep.label}</span>
            </button>
          );
        })}
      </div>

      {/* Shared Filter Bar (Date range presets) */}
      {activeReport !== 'stock_valuation' &&
        activeReport !== 'low_stock' &&
        activeReport !== 'dead_stock' &&
        activeReport !== 'expiry_watch' &&
        activeReport !== 'supplier_balances' && (
          <div className="print:hidden bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-subtle flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-2">
                Date Range:
              </span>
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'this_week', label: 'This Week' },
                { id: 'this_month', label: 'This Month' },
                { id: 'last_month', label: 'Last Month' },
                { id: 'custom', label: 'Custom' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id as PresetKey)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    preset === p.id
                      ? 'bg-slate-900 dark:bg-brand-600 text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Range Picker Inputs */}
            {preset === 'custom' && (
              <div className="flex items-center space-x-2 text-xs font-medium">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-mono font-bold"
                />
                <span className="text-slate-400 font-bold">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-mono font-bold"
                />
              </div>
            )}

            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono">
              Period: <span className="text-slate-900 dark:text-white font-bold">{rangeLabel}</span>
            </div>
          </div>
        )}

      {/* Four-Way Mathematical Reconciliation Panel (Visible on Daily Summary & Profit) */}
      {shouldFetchReconciliation && (
        <ReconciliationPanel
          reconciliation={reconciliationData || null}
          isLoading={isReconLoading}
        />
      )}

      {/* Main Report View Area */}
      {isLoading ? (
        <div className="p-16 text-center text-slate-500 font-mono text-sm bg-white rounded-2xl border border-slate-200">
          Aggregating SQL analytical data across Colombo timezone bounds...
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-medium">
          Report Error: {error instanceof Error ? error.message : String(error)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. DAILY SUMMARY REPORT */}
          {activeReport === 'daily_summary' && (
            <div className="space-y-6">
              {/* Daily Trend Chart */}
              {Array.isArray(reportData) && reportData.length > 1 && (
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Daily Revenue Trend (LKR)
                  </h4>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={(reportData as DailySummaryRow[]).map((r) => ({
                          date: r.report_date,
                          revenue: Number(r.final_net_cents) / 100,
                          bills: r.bill_count,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} />
                        <Tooltip
                          formatter={(val: number) => [`Rs. ${val.toLocaleString()}`, 'Net Revenue']}
                        />
                        <Line
                          type="monotone"
                          dataKey="revenue"
                          stroke="#059669"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Daily Summary Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="py-3 px-3.5">Date</th>
                        <th className="py-3 px-3 text-right">Bills</th>
                        <th className="py-3 px-3 text-right">Gross Sales</th>
                        <th className="py-3 px-3 text-right">Discounts</th>
                        <th className="py-3 px-3 text-right">VAT Tax</th>
                        <th className="py-3 px-3 text-right">Net Sales</th>
                        <th className="py-3 px-3 text-right">Returns</th>
                        <th className="py-3 px-3 text-right font-black">Final Net</th>
                        <th className="py-3 px-3 text-right">Cash</th>
                        <th className="py-3 px-3 text-right">Card</th>
                        <th className="py-3 px-3.5 text-right">Other</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {(reportData as DailySummaryRow[]).map((row) => (
                        <tr key={row.report_date} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-3.5 font-bold font-mono text-slate-900">
                            {row.report_date}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                            {row.bill_count}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                            {formatLKR(row.gross_sales_cents)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-amber-600">
                            {formatLKR(row.item_discounts_cents + row.bill_discounts_cents)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                            {formatLKR(row.tax_cents)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                            {formatLKR(row.net_sales_cents)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-600">
                            {formatLKR(row.returns_cents)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700">
                            {formatLKR(row.final_net_cents)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                            {formatLKR(row.cash_cents)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                            {formatLKR(row.card_cents)}
                          </td>
                          <td className="py-2.5 px-3.5 text-right font-mono text-slate-600">
                            {formatLKR(row.bank_transfer_cents + row.store_credit_cents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Totals Row */}
                    <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-xs">
                      <tr>
                        <td className="py-3 px-3.5 uppercase tracking-wider text-slate-800">
                          Totals
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {(reportData as DailySummaryRow[]).reduce((s, r) => s + r.bill_count, 0)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {formatLKR(
                            (reportData as DailySummaryRow[]).reduce(
                              (s, r) => s + BigInt(r.gross_sales_cents),
                              0n
                            )
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-amber-700">
                          {formatLKR(
                            (reportData as DailySummaryRow[]).reduce(
                              (s, r) =>
                                s +
                                BigInt(r.item_discounts_cents) +
                                BigInt(r.bill_discounts_cents),
                              0n
                            )
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {formatLKR(
                            (reportData as DailySummaryRow[]).reduce(
                              (s, r) => s + BigInt(r.tax_cents),
                              0n
                            )
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {formatLKR(
                            (reportData as DailySummaryRow[]).reduce(
                              (s, r) => s + BigInt(r.net_sales_cents),
                              0n
                            )
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-rose-700">
                          {formatLKR(
                            (reportData as DailySummaryRow[]).reduce(
                              (s, r) => s + BigInt(r.returns_cents),
                              0n
                            )
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-emerald-800">
                          {formatLKR(
                            (reportData as DailySummaryRow[]).reduce(
                              (s, r) => s + BigInt(r.final_net_cents),
                              0n
                            )
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {formatLKR(
                            (reportData as DailySummaryRow[]).reduce(
                              (s, r) => s + BigInt(r.cash_cents),
                              0n
                            )
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {formatLKR(
                            (reportData as DailySummaryRow[]).reduce(
                              (s, r) => s + BigInt(r.card_cents),
                              0n
                            )
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono">
                          {formatLKR(
                            (reportData as DailySummaryRow[]).reduce(
                              (s, r) =>
                                s +
                                BigInt(r.bank_transfer_cents) +
                                BigInt(r.store_credit_cents),
                              0n
                            )
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 2. PROFIT & MARGINS REPORT */}
          {activeReport === 'profit_report' && (
            <div className="space-y-6">
              {(() => {
                const p = reportData as ProfitReportRow;
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Net Revenue
                      </div>
                      <div className="text-xl font-black text-slate-900 font-mono">
                        {formatLKR(p.revenue_cents)}
                      </div>
                      <p className="text-[11px] text-slate-400">Total bill items value</p>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Cost of Goods (COGS)
                      </div>
                      <div className="text-xl font-black text-slate-700 font-mono">
                        {formatLKR(p.cost_of_goods_cents)}
                      </div>
                      <p className="text-[11px] text-slate-400">Historical line snapshot cost</p>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Gross Profit
                      </div>
                      <div className="text-xl font-black text-emerald-600 font-mono">
                        {formatLKR(p.gross_profit_cents)}
                      </div>
                      <p className="text-[11px] text-emerald-700 font-semibold">
                        Margin: {p.margin_percent}%
                      </p>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Net Profit (After Returns)
                      </div>
                      <div className="text-xl font-black text-purple-700 font-mono">
                        {formatLKR(p.net_profit_cents)}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Returns: -{formatLKR(p.returns_total_cents)}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 3. PRODUCT SALES REPORT */}
          {activeReport === 'sales_by_product' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-3 px-3.5">Product</th>
                      <th className="py-3 px-3">SKU</th>
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3 text-right">Quantity Sold</th>
                      <th className="py-3 px-3 text-right">Revenue</th>
                      <th className="py-3 px-3 text-right">Snapshot Cost</th>
                      <th className="py-3 px-3 text-right font-bold">Gross Profit</th>
                      <th className="py-3 px-3.5 text-right font-black">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {(reportData as ProductSalesRow[]).map((row) => (
                      <tr key={row.product_id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3.5 font-bold text-slate-900">
                          {row.product_name}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                          {row.sku}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{row.category_name}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold">
                          {row.quantity_sold}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                          {formatLKR(row.revenue_cents)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                          {formatLKR(row.cost_cents)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                          {formatLKR(row.profit_cents)}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-black text-slate-900">
                          {row.margin_percent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. CATEGORY SHARE REPORT */}
          {activeReport === 'sales_by_category' && (
            <div className="space-y-6">
              {Array.isArray(reportData) && reportData.length > 0 && (
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Category Revenue Distribution
                  </h4>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={(reportData as CategorySalesRow[]).map((r) => ({
                          name: r.category_name,
                          revenue: Number(r.revenue_cents) / 100,
                          profit: Number(r.profit_cents) / 100,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                        <YAxis stroke="#94a3b8" fontSize={11} />
                        <Tooltip formatter={(val: number) => [`Rs. ${val.toLocaleString()}`]} />
                        <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} name="Revenue" />
                        <Bar dataKey="profit" fill="#6366f1" radius={[4, 4, 0, 0]} name="Profit" />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-3 px-3.5">Category</th>
                      <th className="py-3 px-3 text-right">Units Sold</th>
                      <th className="py-3 px-3 text-right">Revenue</th>
                      <th className="py-3 px-3 text-right">COGS Cost</th>
                      <th className="py-3 px-3 text-right font-bold">Gross Profit</th>
                      <th className="py-3 px-3.5 text-right font-black">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {(reportData as CategorySalesRow[]).map((row) => (
                      <tr key={row.category_id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3.5 font-bold text-slate-900">
                          {row.category_name}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold">
                          {row.quantity_sold}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                          {formatLKR(row.revenue_cents)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                          {formatLKR(row.cost_cents)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                          {formatLKR(row.profit_cents)}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-black text-slate-900">
                          {row.margin_percent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. HOURLY PEAK SALES REPORT */}
          {activeReport === 'sales_by_hour' && (
            <div className="space-y-6">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Peak Transaction Hours (Asia/Colombo Local Time)
                </h4>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(reportData as HourlySalesRow[]).map((r) => ({
                        hour: `${r.hour_of_day}:00`,
                        revenue: Number(r.revenue_cents) / 100,
                        bills: r.bill_count,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip formatter={(val: number) => [`Rs. ${val.toLocaleString()}`]} />
                      <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Sales (LKR)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-3 px-3.5">Hour of Day</th>
                      <th className="py-3 px-3 text-right">Bills Ringed</th>
                      <th className="py-3 px-3.5 text-right font-bold">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {(reportData as HourlySalesRow[]).map((row) => (
                      <tr key={row.hour_of_day} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3.5 font-bold font-mono text-slate-900">
                          {String(row.hour_of_day).padStart(2, '0')}:00 -{' '}
                          {String(row.hour_of_day).padStart(2, '0')}:59
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                          {row.bill_count}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-900">
                          {formatLKR(row.revenue_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. STOCK VALUATION REPORT */}
          {activeReport === 'stock_valuation' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-3 px-3.5">Product</th>
                      <th className="py-3 px-3">SKU</th>
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3 text-right">Stock Qty</th>
                      <th className="py-3 px-3 text-right">Cost Price</th>
                      <th className="py-3 px-3 text-right">Selling Price</th>
                      <th className="py-3 px-3 text-right font-semibold">Value at Cost</th>
                      <th className="py-3 px-3 text-right font-semibold">Value at Retail</th>
                      <th className="py-3 px-3.5 text-right font-black">Potential Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {(reportData as StockValuationRow[]).map((row) => (
                      <tr key={row.product_id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3.5 font-bold text-slate-900">
                          {row.product_name}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                          {row.sku}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{row.category_name}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          {row.stock_qty}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {formatLKR(row.cost_price_cents)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {formatLKR(row.selling_price_cents)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                          {formatLKR(row.valuation_at_cost_cents)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-blue-700">
                          {formatLKR(row.valuation_at_selling_cents)}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-black text-emerald-700">
                          {formatLKR(row.potential_profit_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals Row */}
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-xs">
                    <tr>
                      <td colSpan={6} className="py-3 px-3.5 uppercase tracking-wider text-slate-800">
                        Total Stock Holding Valuation
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-slate-900">
                        {formatLKR(
                          (reportData as StockValuationRow[]).reduce(
                            (s, r) => s + BigInt(r.valuation_at_cost_cents),
                            0n
                          )
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-blue-800">
                        {formatLKR(
                          (reportData as StockValuationRow[]).reduce(
                            (s, r) => s + BigInt(r.valuation_at_selling_cents),
                            0n
                          )
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono font-black text-emerald-800">
                        {formatLKR(
                          (reportData as StockValuationRow[]).reduce(
                            (s, r) => s + BigInt(r.potential_profit_cents),
                            0n
                          )
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* 7. LOW STOCK REORDER REPORT */}
          {activeReport === 'low_stock' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-3.5">Product</th>
                    <th className="py-3 px-3">SKU</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3 text-right">Current Stock</th>
                    <th className="py-3 px-3 text-right">Reorder Level</th>
                    <th className="py-3 px-3 text-right font-bold text-rose-700">Shortfall</th>
                    <th className="py-3 px-3.5 text-right">Unit Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {(reportData as LowStockRow[]).map((row) => (
                    <tr key={row.product_id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3.5 font-bold text-slate-900">{row.product_name}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">{row.sku}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.category_name}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600">
                        {row.stock_qty}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {row.reorder_level}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-rose-700">
                        {row.shortfall_qty}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono text-slate-600">
                        {formatLKR(row.cost_price_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 8. TAX REPORT */}
          {activeReport === 'tax_report' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-3.5">Date</th>
                    <th className="py-3 px-3 text-right">Taxable Sales</th>
                    <th className="py-3 px-3 text-right">Tax Exempt Sales</th>
                    <th className="py-3 px-3 text-right font-bold">VAT Collected</th>
                    <th className="py-3 px-3.5 text-right">Effective Rate %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {(reportData as TaxReportRow[]).map((row) => (
                    <tr key={row.report_date} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900">
                        {row.report_date}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                        {formatLKR(row.taxable_sales_cents)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {formatLKR(row.tax_exempt_sales_cents)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                        {formatLKR(row.tax_collected_cents)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-slate-700">
                        {row.effective_tax_rate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 9. RETURNS & VOIDS AUDIT REPORT */}
          {activeReport === 'returns_voids' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-3.5">Event</th>
                    <th className="py-3 px-3">Reference No</th>
                    <th className="py-3 px-3">Orig. Bill</th>
                    <th className="py-3 px-3 text-right font-bold">Amount</th>
                    <th className="py-3 px-3">Reason</th>
                    <th className="py-3 px-3">Authorized By</th>
                    <th className="py-3 px-3.5 text-right">Date/Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {(reportData as ReturnVoidRow[]).map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3.5 font-bold">
                        <Badge
                          variant={row.event_type === 'void' ? 'danger' : 'purple'}
                          size="sm"
                        >
                          {row.event_type.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {row.event_no}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">#{row.bill_no}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700">
                        {formatLKR(row.amount_cents)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate">{row.reason}</td>
                      <td className="py-2.5 px-3 text-slate-900 font-medium">
                        {row.created_by_name}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono text-slate-500 text-[11px]">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 10. SUPPLIER BALANCES REPORT */}
          {activeReport === 'supplier_balances' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-3.5">Supplier Name</th>
                    <th className="py-3 px-3">Contact</th>
                    <th className="py-3 px-3">Phone</th>
                    <th className="py-3 px-3 text-right font-bold text-rose-700">Outstanding Balance</th>
                    <th className="py-3 px-3.5 text-right">Last Purchase</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {(reportData as SupplierBalanceRow[]).map((row) => (
                    <tr key={row.supplier_id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3.5 font-bold text-slate-900">
                        {row.supplier_name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{row.contact_person || '—'}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{row.phone || '—'}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-rose-700">
                        {formatLKR(row.balance_cents)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono text-slate-500">
                        {row.last_purchase_date
                          ? new Date(row.last_purchase_date).toLocaleDateString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 11. TOP CUSTOMERS LEADERBOARD */}
          {activeReport === 'top_customers' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-3.5">Customer Name</th>
                    <th className="py-3 px-3">Phone</th>
                    <th className="py-3 px-3 text-right">Bill Count</th>
                    <th className="py-3 px-3 text-right font-bold text-emerald-700">Total Spend</th>
                    <th className="py-3 px-3.5 text-right font-bold text-purple-700">Loyalty Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {(reportData as TopCustomerRow[]).map((row) => (
                    <tr key={row.customer_id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3.5 font-bold text-slate-900">{row.name}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{row.phone}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {row.bill_count}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                        {formatLKR(row.total_spent_cents)}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold text-purple-700">
                        {row.points_balance} pts
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 12. AUTOMATED BILL ACCURACY AUDIT PANEL */}
          {activeReport === 'accuracy_audit' && reportData && (
            <div className="space-y-6">
              {/* Status Header Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Audit Status</span>
                  <div className="mt-2 flex items-center space-x-2">
                    <Badge variant={(reportData as BillAuditResult).status === 'passed' ? 'success' : 'danger'}>
                      {(reportData as BillAuditResult).status === 'passed' ? '100% ACCURATE' : 'DISCREPANCY DETECTED'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Range: {(reportData as BillAuditResult).from_date} to {(reportData as BillAuditResult).to_date}
                  </p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Bills Verified</span>
                  <div className="mt-2 text-2xl font-black text-slate-900">
                    {(reportData as BillAuditResult).total_bills_audited}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Recomputed from immutable line snapshots
                  </p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Discrepancies</span>
                  <div className={`mt-2 text-2xl font-black ${
                    (reportData as BillAuditResult).discrepancy_count === 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {(reportData as BillAuditResult).discrepancy_count}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {(reportData as BillAuditResult).discrepancy_count === 0 ? 'Zero mathematical drift detected' : 'Requires review'}
                  </p>
                </div>
              </div>

              {/* Zero-discrepancy celebration or Discrepancy Table */}
              {(reportData as BillAuditResult).discrepancy_count === 0 ? (
                <div className="p-8 bg-emerald-50/60 border border-emerald-200 rounded-2xl text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h4 className="text-base font-bold text-emerald-950">
                    All {(reportData as BillAuditResult).total_bills_audited} Bills Verified with 100% Mathematical Accuracy
                  </h4>
                  <p className="text-xs text-emerald-800 max-w-xl mx-auto">
                    Every bill in this period was completely recomputed from individual line items, quantities,
                    tax rates, and proportional bill discount allocations. Every line total matches the bill total to the cent,
                    and all payment amounts match net bill totals.
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-rose-200 shadow-2xs overflow-hidden">
                  <div className="p-4 bg-rose-50/80 border-b border-rose-100 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-rose-950">
                      Discrepant Bills List
                    </h4>
                    <span className="text-xs text-rose-700">
                      {(reportData as BillAuditResult).discrepancy_count} items
                    </span>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="py-3 px-3.5">Bill Number</th>
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-3 text-right">Stored Total</th>
                        <th className="py-3 px-3 text-right">Computed Total</th>
                        <th className="py-3 px-3.5">Audit Issues</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {(reportData as BillAuditResult).discrepancies.map((disc) => (
                        <tr key={disc.bill_id} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-3.5 font-bold font-mono text-slate-900">{disc.bill_no}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {new Date(disc.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-700">
                            {formatLKR(disc.stored_total_cents)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-900">
                            {formatLKR(disc.calculated_total_cents)}
                          </td>
                          <td className="py-2.5 px-3.5 text-xs text-rose-600 font-mono">
                            {disc.issues.join('; ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Daily Summary Thermal Slip Modal */}
      {thermalSlipOpen && activeReport === 'daily_summary' && Array.isArray(reportData) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-900">Thermal Daily Summary Slip</h3>
              <div className="flex items-center space-x-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => window.print()}
                  leftIcon={<Printer className="w-4 h-4" />}
                >
                  Print Slip
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setThermalSlipOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>

            <div className="p-6 bg-slate-50 flex justify-center">
              <DailySummarySlip
                rows={reportData as DailySummaryRow[]}
                dateRangeLabel={rangeLabel}
                shopName={shopName}
                userName={profile?.full_name || 'Manager'}
                paperWidth="80mm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
