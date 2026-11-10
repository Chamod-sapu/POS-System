import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  Play,
  CheckCircle2,
  DollarSign,
  ArrowDownRight,
  BarChart3,
  FileText,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { Button } from '../../../components/ui/Button';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { Badge } from '../../../components/ui/Badge';
import { useCurrentShift } from '../hooks/useCurrentShift';
import {
  fetchShifts,
  ShiftWithCashier,
  ZReportData,
  XReportData,
  fetchXReport,
} from '../api/shifts';
import { formatLKR } from '../../../lib/money';
import { OpenShiftModal } from '../components/OpenShiftModal';
import { CloseShiftModal } from '../components/CloseShiftModal';
import { CashMovementModal } from '../components/CashMovementModal';
import { XReportModal } from '../components/XReportModal';
import { ShiftReportReceipt } from '../../receipts/components/ShiftReportReceipt';

export const ShiftsPage: React.FC = () => {
  const { shift: activeShift, isOpen, refetch: refetchActiveShift } = useCurrentShift();

  // Modals state
  const [openModalOpen, setOpenModalOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [cashMovementOpen, setCashMovementOpen] = useState(false);
  const [xReportOpen, setXReportOpen] = useState(false);
  const [viewReportModalData, setViewReportModalData] = useState<
    XReportData | ZReportData | null
  >(null);
  const [isLoadingReportForShift, setIsLoadingReportForShift] = useState(false);

  // Fetch shifts ledger
  const {
    data: shifts = [],
    isLoading,
    refetch: refetchShiftsList,
  } = useQuery({
    queryKey: ['shifts-ledger'],
    queryFn: fetchShifts,
    staleTime: 1000 * 30, // 30 seconds
  });

  const handleViewReport = async (row: ShiftWithCashier) => {
    setIsLoadingReportForShift(true);
    try {
      if (row.status === 'open') {
        const xData = await fetchXReport(row.id);
        setViewReportModalData(xData);
      } else {
        // Construct Z-Report snapshot from the closed shift row
        const zData: ZReportData = {
          report_type: 'Z_REPORT',
          shift_id: row.id,
          cashier_id: row.cashier_id,
          cashier_name: row.profiles?.full_name || 'Staff Member',
          terminal_name: row.terminal_name || 'Main Terminal',
          opened_at: row.opened_at,
          closed_at: row.closed_at || row.opened_at,
          opening_float_cents: Number(row.opening_float_cents),
          cash_sales_cents: Number(row.cash_sales_cents || 0),
          change_given_cents: 0,
          net_cash_sales_cents: Number(row.cash_sales_cents || 0),
          cash_refunds_cents: Number(row.cash_refunds_cents || 0),
          cash_in_cents: Number(row.cash_in_cents || 0),
          cash_out_cents: Number(row.cash_out_cents || 0),
          expected_cash_cents: Number(row.expected_cash_cents || 0),
          counted_cash_cents: Number(row.counted_cash_cents || 0),
          difference_cents: Number(row.difference_cents || 0),
          note: row.note,
        };
        setViewReportModalData(zData);
      }
    } catch (err) {
      alert('Failed to load shift report: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoadingReportForShift(false);
    }
  };

  const columns: Column<ShiftWithCashier>[] = [
    {
      id: 'cashier',
      header: 'Cashier & Terminal',
      sortable: true,
      accessor: (row) => (
        <div>
          <div className="font-bold text-slate-900">
            {row.profiles?.full_name || 'Staff Member'}
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {row.terminal_name || 'Main Terminal'} • Shift #{row.id.slice(0, 8)}
          </div>
        </div>
      ),
    },
    {
      id: 'opened_at',
      header: 'Opened At',
      sortable: true,
      accessor: (row) => (
        <span className="text-xs text-slate-700">
          {new Date(row.opened_at).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      id: 'closed_at',
      header: 'Closed At',
      accessor: (row) => (
        <span className="text-xs text-slate-500">
          {row.closed_at
            ? new Date(row.closed_at).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'In progress'}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => (
        <Badge variant={row.status === 'open' ? 'success' : 'neutral'} dot size="sm">
          {row.status === 'open' ? 'Active' : 'Closed'}
        </Badge>
      ),
    },
    {
      id: 'opening_float',
      header: 'Float',
      align: 'right',
      accessor: (row) => (
        <span className="font-mono text-xs font-semibold text-slate-800">
          {formatLKR(Number(row.opening_float_cents))}
        </span>
      ),
    },
    {
      id: 'expected_cash',
      header: 'Expected',
      align: 'right',
      accessor: (row) => (
        <span className="font-mono text-xs font-semibold text-slate-800">
          {row.expected_cash_cents !== null ? formatLKR(Number(row.expected_cash_cents)) : '—'}
        </span>
      ),
    },
    {
      id: 'counted_cash',
      header: 'Counted',
      align: 'right',
      accessor: (row) => (
        <span className="font-mono text-xs font-semibold text-slate-800">
          {row.counted_cash_cents !== null ? formatLKR(Number(row.counted_cash_cents)) : '—'}
        </span>
      ),
    },
    {
      id: 'difference',
      header: 'Difference',
      align: 'right',
      accessor: (row) => {
        if (row.status === 'open' || row.difference_cents === null) {
          return <span className="text-xs text-slate-400 font-mono">—</span>;
        }
        const diff = Number(row.difference_cents);
        if (diff === 0) {
          return (
            <span className="font-mono text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
              Balanced
            </span>
          );
        }
        return (
          <span
            className={`font-mono text-xs font-black px-2 py-0.5 rounded-md ${
              diff < 0
                ? 'text-rose-700 bg-rose-50 border border-rose-200'
                : 'text-blue-700 bg-blue-50 border border-blue-200'
            }`}
          >
            {diff > 0 ? '+' : ''}
            {formatLKR(diff)}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      accessor: (row) => (
        <Button
          variant="outline"
          size="sm"
          className="text-xs py-1 px-2.5"
          leftIcon={<FileText className="w-3.5 h-3.5 text-slate-500" />}
          onClick={() => handleViewReport(row)}
        >
          {row.status === 'open' ? 'X-Report' : 'Z-Report'}
        </Button>
      ),
    },
  ];

  // Discrepancy count & active float
  const discrepancyCount = shifts.filter(
    (s) => s.status === 'closed' && Number(s.difference_cents || 0) !== 0
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cashier Shifts & Cash Drawer Reconciliation"
        subtitle="Manage opening floats, drawer drops, mid-shift X-reports and end-of-shift Z-reports"
        actions={
          <div className="flex items-center space-x-2">
            {isOpen && activeShift ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<ArrowDownRight className="w-4 h-4 text-emerald-600" />}
                  onClick={() => setCashMovementOpen(true)}
                >
                  Cash In / Out
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<BarChart3 className="w-4 h-4 text-blue-600" />}
                  onClick={() => setXReportOpen(true)}
                >
                  X-Report
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<CheckCircle2 className="w-4 h-4" />}
                  onClick={() => setCloseModalOpen(true)}
                >
                  Close Shift
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Play className="w-4 h-4" />}
                onClick={() => setOpenModalOpen(true)}
              >
                Open New Shift
              </Button>
            )}
          </div>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Current Register Shift"
          value={isOpen ? 'Shift Active' : 'No Active Shift'}
          variant={isOpen ? 'emerald' : 'amber'}
          icon={<Clock className="w-5 h-5" />}
          subtitle={
            isOpen && activeShift
              ? `Terminal: ${activeShift.terminal_name || 'Main'}`
              : 'Click "Open New Shift" to begin'
          }
        />
        <StatCard
          title="Active Drawer Float"
          value={formatLKR(Number(activeShift?.opening_float_cents ?? 0))}
          variant="blue"
          icon={<DollarSign className="w-5 h-5" />}
          subtitle="Declared cash float in active drawer"
        />
        <StatCard
          title="Drawer Discrepancies"
          value={discrepancyCount.toString()}
          variant={discrepancyCount > 0 ? 'amber' : 'emerald'}
          icon={<AlertTriangle className="w-5 h-5" />}
          subtitle="Closed shifts with cash variance"
        />
      </div>

      {/* Shifts History Table */}
      <DataTable<ShiftWithCashier>
        data={shifts}
        columns={columns}
        isLoading={isLoading}
        keyExtractor={(row) => row.id}
        emptyTitle="No Shift History Found"
        emptyDescription="Cash drawer reconciliation records will appear here as cashier shifts are opened and balanced."
      />

      {/* Open Shift Modal */}
      <OpenShiftModal
        isOpen={openModalOpen}
        onClose={() => setOpenModalOpen(false)}
        onSuccess={() => {
          setOpenModalOpen(false);
          refetchActiveShift();
          refetchShiftsList();
        }}
      />

      {/* Close Shift Modal */}
      <CloseShiftModal
        isOpen={closeModalOpen}
        shift={activeShift || null}
        onClose={() => setCloseModalOpen(false)}
        onSuccess={() => {
          refetchActiveShift();
          refetchShiftsList();
        }}
      />

      {/* Cash Movement Modal */}
      <CashMovementModal
        isOpen={cashMovementOpen}
        shift={activeShift || null}
        onClose={() => setCashMovementOpen(false)}
        onSuccess={() => {
          setCashMovementOpen(false);
          refetchActiveShift();
          refetchShiftsList();
        }}
      />

      {/* Live X-Report Modal */}
      <XReportModal
        isOpen={xReportOpen}
        shift={activeShift || null}
        onClose={() => setXReportOpen(false)}
      />

      {/* Historical Report View / Print Modal */}
      {viewReportModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-900">
                {viewReportModalData.report_type === 'Z_REPORT'
                  ? 'Z-Report Summary'
                  : 'X-Report Snapshot'}
              </h3>
              <div className="flex items-center space-x-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => window.print()}
                  leftIcon={<BarChart3 className="w-4 h-4" />}
                >
                  Print Report
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewReportModalData(null)}
                >
                  Close
                </Button>
              </div>
            </div>

            <div className="p-6 bg-slate-50 flex justify-center">
              <ShiftReportReceipt data={viewReportModalData} paperWidth="80mm" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftsPage;
