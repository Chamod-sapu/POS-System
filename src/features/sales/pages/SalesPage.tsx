import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Search, Printer, Eye, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { Button } from '../../../components/ui/Button';
import { Money } from '../../../components/ui/Money';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { useAuth } from '../../auth/hooks/useAuth';
import { formatLKR } from '../../../lib/money';
import { maskPhoneNumber } from '../../receipts/lib/maskPhone';
import { formatReceiptDate } from '../../receipts/lib/formatPlainText';
import { fetchSales, fetchBill, recordBillPrinted, SaleSummaryRow } from '../api/sales';
import { ReceiptPreviewModal } from '../../receipts/components/ReceiptPreviewModal';
import { Bill } from '../../receipts/types';

export const SalesPage: React.FC = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const { data: salesData, isLoading, refetch } = useQuery({
    queryKey: ['sales', { search, role, page, userId: user?.id }],
    queryFn: () =>
      fetchSales({
        search,
        role: role ?? 'cashier',
        userId: user?.id,
        page,
        pageSize: 25,
      }),
  });

  const sales = salesData?.sales || [];
  const totalCount = salesData?.totalCount || 0;

  // Compute stat totals
  const totalRevenue = sales
    .filter((s) => s.status === 'completed')
    .reduce((sum, s) => sum + BigInt(s.total_cents), 0n);
  const totalBills = totalCount;
  const totalVoided = sales
    .filter((s) => s.status === 'voided')
    .reduce((sum, s) => sum + BigInt(s.total_cents), 0n);

  const handleOpenPrintPreview = async (saleId: string) => {
    try {
      const bill = await fetchBill(saleId);
      setSelectedBill(bill);
      setIsPreviewOpen(true);
    } catch (err) {
      alert('Could not fetch bill details: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleBillPrinted = async () => {
    if (selectedBill) {
      try {
        await recordBillPrinted(selectedBill.id);
        queryClient.invalidateQueries({ queryKey: ['sales'] });
      } catch (err) {
        console.warn('Could not record print event:', err);
      }
    }
  };

  const columns: Column<SaleSummaryRow>[] = [
    {
      id: 'bill_no',
      header: 'Bill Number',
      sortable: true,
      accessor: (row) => (
        <button
          onClick={() => navigate(`/sales/${row.id}`)}
          className="font-mono font-bold text-brand-600 dark:text-brand-400 hover:underline hover:text-brand-700 dark:hover:text-brand-300 text-left tabular-nums"
        >
          {row.bill_no}
        </button>
      ),
    },
    {
      id: 'created_at',
      header: 'Date & Time',
      sortable: true,
      accessor: (row) => (
        <span className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
          {formatReceiptDate(row.created_at)}
        </span>
      ),
    },
    {
      id: 'customer_phone',
      header: 'Customer',
      accessor: (row) => (
        <span className="text-slate-700 dark:text-slate-300 font-mono text-xs tabular-nums">
          {row.customer_phone ? maskPhoneNumber(row.customer_phone) : '-'}
        </span>
      ),
    },
    {
      id: 'total_cents',
      header: 'Grand Total',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.total_cents,
      accessor: (row) => (
        <div className="text-right">
          <Money cents={row.total_cents} size="sm" className="font-bold text-slate-900 dark:text-white" />
        </div>
      ),
    },
    {
      id: 'print_count',
      header: 'Prints',
      align: 'center',
      accessor: (row) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-bold tabular-nums ${
            row.print_count > 1
              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
              : row.print_count === 1
              ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
          }`}
        >
          {row.print_count > 1 ? `Dup (${row.print_count})` : `${row.print_count}`}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => (
        <Badge
          variant={
            row.status === 'completed'
              ? 'success'
              : row.status === 'voided'
              ? 'danger'
              : 'warning'
          }
          size="sm"
        >
          {row.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      accessor: (row) => (
        <div className="flex items-center justify-end space-x-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            title="View Details"
            onClick={() => navigate(`/sales/${row.id}`)}
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
            title="Reprint Bill"
            onClick={() => handleOpenPrintPreview(row.id)}
          >
            <Printer className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={role === 'cashier' ? 'My Sales Transactions (Last 24h)' : 'Sales & Receipts Ledger'}
        subtitle={
          role === 'cashier'
            ? 'View and reprint recent customer receipts created on your register'
            : 'Immutable ledger of completed bills, cash drawer takings, and thermal reprints'
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={() => refetch()}
          >
            Refresh
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Revenue (Current View)"
          value={<Money cents={totalRevenue} size="md" />}
          variant="brand"
          icon={<Receipt className="w-5 h-5" />}
          subtitle="All completed transactions"
        />
        <StatCard
          title="Bills Issued"
          value={<span className="font-mono tabular-nums">{totalBills}</span>}
          variant="blue"
          icon={<Receipt className="w-5 h-5" />}
          subtitle="Sequential WWL numbers"
        />
        <StatCard
          title="Voided Total"
          value={<Money cents={totalVoided} size="md" />}
          variant="amber"
          icon={<Receipt className="w-5 h-5" />}
          subtitle="Tamper-evident ledger"
        />
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by bill number (WWL-...) or customer phone..."
            className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all shadow-subtle"
          />
        </div>
      </div>

      {/* Sales Table */}
      <DataTable<SaleSummaryRow>
        data={sales}
        columns={columns}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        emptyTitle="No Sales Records Found"
        emptyDescription={
          role === 'cashier'
            ? 'No bills completed by your account in the past 24 hours.'
            : 'No customer checkout transactions found matching query filters.'
        }
      />

      {/* Receipt Preview & Print Modal */}
      <ReceiptPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        bill={selectedBill}
        onPrinted={handleBillPrinted}
      />
    </div>
  );
};

export default SalesPage;
