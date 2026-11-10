import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, RefreshCw, AlertTriangle, CheckCircle, Clock, RotateCcw } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Button } from '../../../components/ui/Button';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { SmsStatusBadge } from '../components/SmsStatusBadge';
import { fetchSmsOutbox, fetchSmsStats, retrySmsOutbox, SmsOutboxRow, SmsStats } from '../api/sms';
import { maskPhoneNumber } from '../../receipts/lib/maskPhone';
import { formatReceiptDate } from '../../receipts/lib/formatPlainText';
import { useAuth } from '../../auth/hooks/useAuth';

export const SmsLogPage: React.FC = () => {
  const { role } = useAuth();
  const isManagerOrOwner = role === 'manager' || role === 'owner';

  const [rows, setRows] = useState<SmsOutboxRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<SmsStats>({
    sentToday: 0,
    failedToday: 0,
    pendingCount: 0,
    totalDeliveryRate: 100,
  });
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [outboxData, statsData] = await Promise.all([
        fetchSmsOutbox({
          status: statusFilter,
          search,
          page,
          pageSize: 25,
        }),
        fetchSmsStats(),
      ]);
      setRows(outboxData.rows);
      setTotalCount(outboxData.totalCount);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load SMS log data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, search, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await retrySmsOutbox(id);
      if (!res.success) {
        alert(res.message || 'SMS retry failed at gateway');
      }
      await loadData();
    } catch (err) {
      alert('Retry error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRetryingId(null);
    }
  };

  const columns: Column<SmsOutboxRow>[] = [
    {
      id: 'created_at',
      header: 'Queued At',
      sortable: true,
      accessor: (row) => (
        <span className="text-xs font-mono text-slate-600">
          {formatReceiptDate(row.created_at)}
        </span>
      ),
    },
    {
      id: 'bill_no',
      header: 'Bill No',
      accessor: (row) => (
        <span className="font-mono font-bold text-xs text-emerald-800">
          {row.bill_no || '-'}
        </span>
      ),
    },
    {
      id: 'phone',
      header: 'Recipient Phone',
      accessor: (row) => (
        <span className="font-mono text-xs font-semibold text-slate-900">
          {maskPhoneNumber(row.phone)}
        </span>
      ),
    },
    {
      id: 'message',
      header: 'Message Content',
      accessor: (row) => (
        <div className="max-w-xs truncate text-xs text-slate-600" title={row.message}>
          {row.message}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => (
        <SmsStatusBadge status={row.status} attempts={row.attempts} />
      ),
    },
    {
      id: 'attempts',
      header: 'Attempts',
      align: 'center',
      accessor: (row) => (
        <span className="text-xs font-mono text-slate-500 font-bold">
          {row.attempts} / 5
        </span>
      ),
    },
    {
      id: 'last_error',
      header: 'Delivery Diagnostics',
      accessor: (row) => (
        <span className="text-[11px] text-rose-600 truncate block max-w-xs" title={row.last_error || ''}>
          {row.last_error || '-'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      accessor: (row) => (
        <div>
          {isManagerOrOwner && (row.status === 'failed' || row.status === 'pending') && (
            <Button
              variant="outline"
              size="sm"
              isLoading={retryingId === row.id}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={() => handleRetry(row.id)}
              className="text-xs py-1 px-2.5 h-7"
            >
              Retry
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="SMS Delivery & Gateway Outbox"
        subtitle={`Live delivery monitoring, retry management, and gateway dispatch logs (${totalCount} total records)`}
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={loadData}
          >
            Refresh Logs
          </Button>
        }
      />

      {/* Aggregate Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Sent Today"
          value={String(stats.sentToday)}
          variant="emerald"
          icon={<CheckCircle className="w-5 h-5" />}
          subtitle="Customer receipts delivered"
        />
        <StatCard
          title="Failed Messages Today"
          value={String(stats.failedToday)}
          variant={stats.failedToday > 0 ? 'amber' : 'blue'}
          icon={<AlertTriangle className="w-5 h-5" />}
          subtitle="Max retry exhaustion"
        />
        <StatCard
          title="Pending in Outbox"
          value={String(stats.pendingCount)}
          variant="amber"
          icon={<Clock className="w-5 h-5" />}
          subtitle="Awaiting gateway dispatch"
        />
        <StatCard
          title="Delivery Rate"
          value={`${stats.totalDeliveryRate}%`}
          variant="purple"
          icon={<MessageSquare className="w-5 h-5" />}
          subtitle="Today's success ratio"
        />
      </div>

      {/* Search and Status Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex-1 max-w-md">
          <SearchInput
            placeholder="Search by phone (077...) or message text..."
            value={search}
            onChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center space-x-1.5 bg-slate-200/60 p-1 rounded-xl self-start sm:self-auto">
          {['all', 'pending', 'sending', 'sent', 'failed'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition-colors ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Outbox Table */}
      <DataTable<SmsOutboxRow>
        data={rows}
        columns={columns}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        emptyTitle="No SMS Outbox Records"
        emptyDescription="Transactional customer receipt SMS records will appear here as sales complete."
      />
    </div>
  );
};

export default SmsLogPage;
