import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import {
  DollarSign,
  Receipt,
  TrendingUp,
  Boxes,
  Clock,
  MessageSquare,
  AlertTriangle,
  ArrowRight,
  ShoppingCart,
  BarChart3,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Package,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { Button } from '../../../components/ui/Button';
import { Money } from '../../../components/ui/Money';
import { Skeleton } from '../../../components/ui/Skeleton';
import { formatLKR } from '../../../lib/money';
import { useShopSettings } from '../../settings/hooks/useShopSettings';
import { fetchDashboardSummary, fetchLatestBillAudit, DashboardSummary, LatestBillAuditStatus } from '../../reports/api/reports';

const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const revenueCents = Math.round(Number(payload[0].value) * 100);
    const bills = payload[0].payload.bills;
    return (
      <div className="bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md text-white p-3.5 rounded-xl shadow-overlay border border-slate-700/60 text-xs space-y-1.5 min-w-[160px]">
        <p className="font-semibold text-slate-300 border-b border-slate-800 pb-1">{label}</p>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Net Revenue:</span>
          <span className="font-bold text-white">
            <Money cents={revenueCents} size="sm" />
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Bills:</span>
          <span className="font-mono font-bold text-brand-300">{bills}</span>
        </div>
      </div>
    );
  }
  return null;
};

export const DashboardPage: React.FC = () => {
  const { shopName } = useShopSettings();

  const { data: summary, isLoading, error, refetch } = useQuery<DashboardSummary>({
    queryKey: ['executive-dashboard-summary'],
    queryFn: fetchDashboardSummary,
    staleTime: 1000 * 15, // 15 seconds
    refetchInterval: 1000 * 30, // live poll every 30 seconds
  });

  const { data: auditStatus } = useQuery<LatestBillAuditStatus>({
    queryKey: ['latest-bill-audit-status'],
    queryFn: fetchLatestBillAudit,
    staleTime: 1000 * 60,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 w-64">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-4 w-96 mt-2 rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-36" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 h-80">
            <Skeleton className="h-full w-full rounded-xl" />
          </div>
          <div className="lg:col-span-2 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 h-80">
            <Skeleton className="h-full w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-raised">
        <div className="w-12 h-12 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Dashboard Temporarily Unavailable</h3>
        <p className="text-xs text-rose-600 dark:text-rose-400 font-mono">{error instanceof Error ? error.message : String(error)}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry Connection
        </Button>
      </div>
    );
  }

  const revenueSparkline = summary.last_7_days_sales.map((d) => Number(d.revenue_cents) / 100);
  const billsSparkline = summary.last_7_days_sales.map((d) => d.bill_count);
  const maxProductRevenue = Math.max(...summary.top_5_products_today.map((p) => Number(p.revenue_cents)), 1);

  return (
    <div className="space-y-6">
      {/* Page Header with Live Indicator */}
      <PageHeader
        title="Store Executive Dashboard"
        subtitle={`Real-time sales intelligence and operational health for ${shopName}`}
        actions={
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
              Live Stream
            </span>
            <NavLink to="/pos">
              <Button variant="primary" size="sm" leftIcon={<ShoppingCart className="w-4 h-4" />}>
                Open Register (POS)
              </Button>
            </NavLink>
          </div>
        }
      />

      {/* Automated Bill Audit Alert (if failure/discrepancies detected) */}
      {auditStatus && auditStatus.has_run && (auditStatus.status === 'failed' || auditStatus.discrepancy_count > 0) && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-rose-950 dark:text-rose-100">Automated Bill Accuracy Audit Alert</p>
              <p className="text-xs text-rose-700 dark:text-rose-300">
                Nightly audit detected {auditStatus.discrepancy_count} discrepancy between stored snapshot totals and computed accounting math.
              </p>
            </div>
          </div>
          <NavLink to="/reports" className="shrink-0">
            <Button variant="danger" size="sm" rightIcon={<ArrowRight className="w-4 h-4" />}>
              Inspect Accuracy Audit
            </Button>
          </NavLink>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Net Sales"
          value={<Money cents={summary.today_sales_cents} size="hero" />}
          variant="brand"
          icon={<DollarSign className="w-5 h-5" />}
          subtitle={`${summary.today_bill_count} bills completed today`}
          sparkline={revenueSparkline}
        />
        <StatCard
          title="Transactions Today"
          value={<span className="tabular-nums font-mono">{summary.today_bill_count}</span>}
          variant="blue"
          icon={<Receipt className="w-5 h-5" />}
          subtitle={
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span>Avg:</span>
              <Money cents={summary.today_avg_bill_cents} size="sm" />
              <span>/ basket</span>
            </div>
          }
          sparkline={billsSparkline}
        />
        <StatCard
          title="Today's Gross Profit"
          value={<Money cents={summary.today_gross_profit_cents} size="hero" />}
          variant="emerald"
          icon={<TrendingUp className="w-5 h-5" />}
          subtitle={
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span>Margin:</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{summary.today_margin_percent}%</span>
            </div>
          }
        />
        <StatCard
          title="Active Cashier Shifts"
          value={<span className="tabular-nums font-mono">{summary.open_shifts_count}</span>}
          variant={summary.open_shifts_count > 0 ? 'emerald' : 'amber'}
          icon={<Clock className="w-5 h-5" />}
          subtitle={
            summary.open_shifts_count > 0
              ? 'Registers currently open'
              : 'All shifts currently closed'
          }
        />
      </div>

      {/* Operational Attention Alerts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NavLink
          to="/inventory"
          className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-subtle hover:border-brand-500/50 hover:shadow-raised transition-all flex items-center justify-between group"
        >
          <div className="flex items-center space-x-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 ${
                summary.low_stock_count > 0
                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60'
                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60'
              }`}
            >
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Low Stock Thresholds
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                {summary.low_stock_count > 0
                  ? `${summary.low_stock_count} Products At or Below Reorder Level`
                  : 'Inventory Healthy — No Shortfalls'}
              </div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-500 group-hover:translate-x-1 transition-all" />
        </NavLink>

        <NavLink
          to="/sms"
          className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-subtle hover:border-brand-500/50 hover:shadow-raised transition-all flex items-center justify-between group"
        >
          <div className="flex items-center space-x-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 ${
                summary.failed_sms_count > 0
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60'
                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60'
              }`}
            >
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Customer SMS Gateway
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                {summary.failed_sms_count > 0
                  ? `${summary.failed_sms_count} Failed Dispatches In Queue`
                  : 'SMS Gateway Operating Normally'}
              </div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-500 group-hover:translate-x-1 transition-all" />
        </NavLink>
      </div>

      {/* Charts Section: 7-Day Trend (60%) & Top 5 Products Today (40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 7-Day Sales Trend */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-subtle space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                7-Day Sales Performance
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Daily revenue trend in Asia/Colombo time</p>
            </div>
            <NavLink
              to="/reports"
              className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 flex items-center gap-1 group"
            >
              <span>View Full Report</span>
              <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </NavLink>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={summary.last_7_days_sales.map((d) => ({
                  date: d.date,
                  revenue: Number(d.revenue_cents) / 100,
                  bills: d.bill_count,
                }))}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="revenueTealGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0F766E" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0F766E" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
                <XAxis
                  dataKey="date"
                  stroke="currentColor"
                  className="text-slate-400 dark:text-slate-500"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="currentColor"
                  className="text-slate-400 dark:text-slate-500"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `Rs. ${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#0D9488"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#revenueTealGrad)"
                  activeDot={{ r: 5, fill: '#0F766E', stroke: '#ffffff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 5 Best-Selling Products Today */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-subtle space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Top 5 Products Today
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Ranked by revenue contribution</p>
            </div>
            <NavLink
              to="/reports"
              className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 flex items-center gap-1 group"
            >
              <span>Catalog</span>
              <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </NavLink>
          </div>

          {summary.top_5_products_today.length === 0 ? (
            <div className="py-20 text-center space-y-2">
              <Package className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-xs text-slate-400 dark:text-slate-500">No product sales recorded yet today.</p>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {summary.top_5_products_today.map((prod, idx) => {
                const percent = Math.min(100, Math.max(10, Math.round((Number(prod.revenue_cents) / maxProductRevenue) * 100)));
                return (
                  <div
                    key={prod.product_id}
                    className="relative overflow-hidden p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 transition-all hover:border-brand-500/30"
                  >
                    {/* Background Progress Bar */}
                    <div
                      className="absolute inset-y-0 left-0 bg-brand-500/10 dark:bg-brand-500/20 transition-all duration-500 pointer-events-none"
                      style={{ width: `${percent}%` }}
                    />
                    <div className="relative flex items-center justify-between z-10">
                      <div className="flex items-center space-x-3 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[11px] font-black text-slate-700 dark:text-slate-200 flex items-center justify-center flex-shrink-0 shadow-2xs">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {prod.product_name}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-400 font-mono">
                            {prod.sku} • <span className="font-semibold text-slate-600 dark:text-slate-300">{prod.quantity_sold} sold</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 pl-2">
                        <Money cents={prod.revenue_cents} size="sm" className="font-bold text-slate-900 dark:text-white" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
