import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  Download,
  Calendar,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  User,
  Clock,
  Layers,
  FileCode,
  Lock,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { useAuth } from '../../auth/hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { exportToCsv } from '../../reports/lib/exportCsv';
import { MfaChallengeModal } from '../../auth/components/MfaChallengeModal';

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: unknown;
  new_data: unknown;
  ip_address: string | null;
  created_at: string;
  user_email?: string;
  user_name?: string;
}

const HIGH_RISK_ACTIONS = new Set([
  'PRICE_CHANGE',
  'COST_CHANGE',
  'PRICE_AND_COST_CHANGE',
  'SETTINGS_UPDATE',
  'ROLE_CHANGE',
  'ROLE_AND_STATUS_CHANGE',
  'STATUS_CHANGE',
  'VOID_SALE',
  'RETURN',
  'STOCK_ADJUSTMENT',
  'STAFF_DEACTIVATE',
  'STAFF_SET_ROLE',
  'STAFF_RESET_PASSWORD',
  'BILL_INTEGRITY_FAILED',
]);

export const AuditLogPage: React.FC = () => {
  const { role, aal, refreshMfaState } = useAuth();
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isMfaModalOpen, setIsMfaModalOpen] = useState<boolean>(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedTable, setSelectedTable] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Expanded rows state
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  const isOwner = role === 'owner';
  const hasAal2 = aal === 'aal2';

  const loadAuditLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Query audit_log (owner with AAL2)
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (selectedTable !== 'ALL') {
        query = query.eq('table_name', selectedTable);
      }

      const { data, error: fetchErr } = await query;
      if (fetchErr) {
        throw new Error(fetchErr.message);
      }

      // Fetch profiles to map staff names
      const { data: profiles } = await supabase.from('profiles').select('id, full_name');
      const profileMap = new Map((profiles || []).map((p) => [p.id, p.full_name]));

      const enriched: AuditLogRow[] = (data || []).map((row) => ({
        ...row,
        user_name: row.user_id ? profileMap.get(row.user_id) || 'Staff User' : 'System Trigger',
      }));

      setLogs(enriched);
    } catch (err) {
      console.error('Audit fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load audit logs.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedTable]);

  useEffect(() => {
    if (isOwner) {
      loadAuditLogs();
    }
  }, [isOwner, loadAuditLogs]);

  const toggleRow = (id: string) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedAction !== 'ALL' && log.action !== selectedAction) return false;
      if (selectedTable !== 'ALL' && log.table_name !== selectedTable) return false;

      if (startDate) {
        const logDate = log.created_at.slice(0, 10);
        if (logDate < startDate) return false;
      }
      if (endDate) {
        const logDate = log.created_at.slice(0, 10);
        if (logDate > endDate) return false;
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesAction = log.action.toLowerCase().includes(term);
        const matchesTable = log.table_name.toLowerCase().includes(term);
        const matchesUser = (log.user_name || '').toLowerCase().includes(term);
        const matchesRecord = (log.record_id || '').toLowerCase().includes(term);
        const matchesIp = (log.ip_address || '').toLowerCase().includes(term);
        return matchesAction || matchesTable || matchesUser || matchesRecord || matchesIp;
      }

      return true;
    });
  }, [logs, selectedAction, selectedTable, startDate, endDate, searchTerm]);

  // Statistics
  const highRiskCount = useMemo(() => {
    return filteredLogs.filter((l) => HIGH_RISK_ACTIONS.has(l.action)).length;
  }, [filteredLogs]);

  const handleExportCsv = () => {
    const headers = [
      { key: 'created_at', label: 'Timestamp (UTC)' },
      { key: 'action', label: 'Action Event' },
      { key: 'table_name', label: 'Target Table' },
      { key: 'record_id', label: 'Record ID' },
      { key: 'user_name', label: 'Operator' },
      { key: 'ip_address', label: 'IP Address' },
      { key: 'old_data', label: 'Old State (JSON)' },
      { key: 'new_data', label: 'New State (JSON)' },
    ];

    const rows = filteredLogs.map((l) => ({
      created_at: l.created_at,
      action: l.action,
      table_name: l.table_name,
      record_id: l.record_id || '',
      user_name: l.user_name || 'System',
      ip_address: l.ip_address || '',
      old_data: l.old_data ? JSON.stringify(l.old_data) : '',
      new_data: l.new_data ? JSON.stringify(l.new_data) : '',
    }));

    exportToCsv(`audit_log_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  if (!isOwner) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-sm max-w-md mx-auto my-12">
        <ShieldAlert className="w-12 h-12 text-rose-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-600 mt-1">
          The Immutable System Audit Log is restricted strictly to verified Store Owners.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security & System Audit Log"
        subtitle="Tamper-evident append-only ledger for price updates, voids, stock adjustments and role alterations"
        actions={
          <div className="flex items-center gap-2">
            {!hasAal2 && (
              <Button
                variant="primary"
                size="sm"
                className="bg-purple-700 hover:bg-purple-800"
                leftIcon={<Lock className="w-4 h-4" />}
                onClick={() => setIsMfaModalOpen(true)}
              >
                Authenticate with MFA (AAL2)
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-4 h-4" />}
              onClick={handleExportCsv}
              disabled={filteredLogs.length === 0}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      {/* MFA Elevation Warning Banner */}
      {!hasAal2 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-purple-50 border border-purple-200 text-purple-900">
          <ShieldAlert className="w-5 h-5 text-purple-700 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs space-y-1">
            <span className="font-bold text-sm block">Elevated Privilege Mode Required</span>
            <p className="text-purple-700">
              Your current session is at basic authentication level (AAL1). Complete a TOTP MFA challenge to view unmasked audit records and sensitive security history.
            </p>
          </div>
          <Button
            size="sm"
            variant="primary"
            className="bg-purple-700 hover:bg-purple-800 shrink-0 text-xs"
            onClick={() => setIsMfaModalOpen(true)}
          >
            Verify TOTP
          </Button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Events Recorded"
          value={String(filteredLogs.length)}
          variant="purple"
          icon={<ShieldCheck className="w-5 h-5" />}
          subtitle="Immutable database triggers"
        />
        <StatCard
          title="High-Risk Actions"
          value={String(highRiskCount)}
          variant={highRiskCount > 0 ? 'amber' : 'emerald'}
          icon={<AlertTriangle className="w-5 h-5" />}
          subtitle="Prices, Voids, Roles, Settings"
        />
        <StatCard
          title="Monitored Resources"
          value="5 Tables"
          variant="blue"
          icon={<Layers className="w-5 h-5" />}
          subtitle="products, settings, profiles, etc."
        />
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-subtle space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2">
            <SearchInput
              value={searchTerm}
              onChange={(val) => setSearchTerm(typeof val === 'string' ? val : (val as unknown as { target: { value: string } }).target.value)}
              placeholder="Filter by action, user name, IP or record key..."
            />
          </div>

          <div>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="w-full text-xs font-semibold border border-slate-300 dark:border-slate-700 rounded-xl py-2.5 px-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="ALL">All Event Actions</option>
              <option value="PRICE_CHANGE">PRICE_CHANGE</option>
              <option value="COST_CHANGE">COST_CHANGE</option>
              <option value="SETTINGS_UPDATE">SETTINGS_UPDATE</option>
              <option value="ROLE_CHANGE">ROLE_CHANGE</option>
              <option value="STATUS_CHANGE">STATUS_CHANGE</option>
              <option value="VOID_SALE">VOID_SALE</option>
              <option value="RETURN">RETURN</option>
              <option value="STOCK_ADJUSTMENT">STOCK_ADJUSTMENT</option>
              <option value="STAFF_DEACTIVATE">STAFF_DEACTIVATE</option>
              <option value="STAFF_SET_ROLE">STAFF_SET_ROLE</option>
              <option value="BILL_INTEGRITY_FAILED">BILL_INTEGRITY_FAILED</option>
            </select>
          </div>

          <div>
            <select
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              className="w-full text-xs font-semibold border border-slate-300 dark:border-slate-700 rounded-xl py-2.5 px-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="ALL">All Monitored Tables</option>
              <option value="products">products</option>
              <option value="shop_settings">shop_settings</option>
              <option value="profiles">profiles</option>
              <option value="categories">categories</option>
              <option value="customers">customers</option>
              <option value="sales">sales</option>
            </select>
          </div>

          <div className="flex gap-1.5 items-center">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs border border-slate-300 dark:border-slate-700 rounded-xl py-2 px-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              title="Start Date"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs border border-slate-300 dark:border-slate-700 rounded-xl py-2 px-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              title="End Date"
            />
          </div>
        </div>
      </div>

      {/* Log Feed Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-subtle overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-slate-500 dark:text-slate-400 text-xs">
            <div className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading system audit ledger...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 dark:text-rose-400 text-xs">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
            {error}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-xs">
            No audit events matched your filter criteria.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredLogs.map((log) => {
              const isHighRisk = HIGH_RISK_ACTIONS.has(log.action);
              const isExpanded = expandedRowIds.has(log.id);

              return (
                <div
                  key={log.id}
                  className={`transition-colors ${
                    isHighRisk
                      ? 'bg-rose-50/50 dark:bg-rose-950/30 hover:bg-rose-50/80 dark:hover:bg-rose-950/50'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div
                    className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer select-none"
                    onClick={() => toggleRow(log.id)}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>

                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase ${
                              isHighRisk
                                ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {isHighRisk && <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400" />}
                            {log.action}
                          </span>

                          <span className="font-mono text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                            {log.table_name}
                          </span>

                          {log.record_id && (
                            <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                              #{log.record_id.slice(0, 8)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                          <span className="flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            {log.user_name}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            IP: {log.ip_address || 'internal'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 tabular-nums">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(log.created_at).toLocaleString('en-GB', {
                          timeZone: 'Asia/Colombo',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Expandable Before/After Diff View */}
                  {isExpanded && (
                    <div className="px-6 pb-4 pt-1 bg-white/80 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 animate-in fade-in duration-150">
                      <div className="p-3 bg-slate-950 rounded-xl text-slate-100 font-mono text-xs space-y-2 border border-slate-800">
                        <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1.5">
                          <span className="flex items-center gap-1 font-bold uppercase tracking-wider text-brand-400">
                            <FileCode className="w-3.5 h-3.5" /> State Mutation Diff
                          </span>
                          <span className="tabular-nums">Record ID: {log.record_id || 'N/A'}</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                          {/* Before State */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block">
                              [-] Previous State (OLD)
                            </span>
                            <pre className="p-2.5 bg-slate-900/90 rounded border border-rose-950 text-rose-300 overflow-x-auto text-[11px]">
                              {log.old_data
                                ? JSON.stringify(log.old_data, null, 2)
                                : 'null (Record Created)'}
                            </pre>
                          </div>

                          {/* After State */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                              [+] Applied State (NEW)
                            </span>
                            <pre className="p-2.5 bg-slate-900/90 rounded border border-emerald-950 text-emerald-300 overflow-x-auto text-[11px]">
                              {log.new_data
                                ? JSON.stringify(log.new_data, null, 2)
                                : 'null (Record Deleted)'}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MFA Challenge Modal */}
      <MfaChallengeModal
        isOpen={isMfaModalOpen}
        onSuccess={() => {
          setIsMfaModalOpen(false);
          refreshMfaState?.();
          loadAuditLogs();
        }}
        onCancel={() => setIsMfaModalOpen(false)}
      />
    </div>
  );
};

export default AuditLogPage;
