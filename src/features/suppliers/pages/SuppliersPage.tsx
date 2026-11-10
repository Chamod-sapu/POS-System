import React, { useState, useEffect, useCallback } from 'react';
import {
  Truck,
  Plus,
  Building,
  RefreshCw,
  CreditCard,
  FileText,
  Printer,
  Download,
  Edit2,
  Trash2,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Button } from '../../../components/ui/Button';
import { Money } from '../../../components/ui/Money';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { formatLKR } from '../../../lib/money';
import { useAuth } from '../../auth/hooks/useAuth';
import { PaymentMethod } from '../../../types/database';
import {
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  recordSupplierPayment,
  fetchSupplierStatement,
  downloadStatementCSV,
  Supplier,
  SupplierStatementEntry,
} from '../api/suppliers';

export const SuppliersPage: React.FC = () => {
  const { role } = useAuth();
  const isOwner = role === 'owner';
  const isManagerOrOwner = role === 'manager' || role === 'owner';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Add/Edit modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formName, setFormName] = useState('');
  const [formContactPerson, setFormContactPerson] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTermsDays, setFormTermsDays] = useState('30');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Record Payment modal state
  const [paymentSupplier, setPaymentSupplier] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('bank_transfer');
  const [payReference, setPayReference] = useState('');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Statement modal state
  const [statementSupplier, setStatementSupplier] = useState<Supplier | null>(null);
  const [statementEntries, setStatementEntries] = useState<SupplierStatementEntry[]>([]);
  const [isStatementLoading, setIsStatementLoading] = useState(false);

  // Delete modal state
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadSuppliers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchSuppliers();
      setSuppliers(data);
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  // Load statement when selected
  useEffect(() => {
    if (!statementSupplier) {
      setStatementEntries([]);
      return;
    }

    let isMounted = true;
    setIsStatementLoading(true);

    fetchSupplierStatement(statementSupplier.id)
      .then((entries) => {
        if (isMounted) setStatementEntries(entries);
      })
      .catch((err) => {
        console.error('Failed to load statement:', err);
      })
      .finally(() => {
        if (isMounted) setIsStatementLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [statementSupplier]);

  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setFormName('');
    setFormContactPerson('');
    setFormPhone('');
    setFormEmail('');
    setFormTermsDays('30');
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setFormName(s.name);
    setFormContactPerson(s.contact_person || '');
    setFormPhone(s.phone || '');
    setFormEmail(s.email || '');
    setFormTermsDays(String(s.payment_terms_days ?? 30));
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Supplier name is required.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const terms = parseInt(formTermsDays, 10);
      if (editingSupplier) {
        const updated = await updateSupplier(editingSupplier.id, {
          name: formName,
          contact_person: formContactPerson || null,
          phone: formPhone || null,
          email: formEmail || null,
          payment_terms_days: isNaN(terms) ? 30 : terms,
        });
        setSuppliers((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
      } else {
        await createSupplier({
          name: formName,
          contact_person: formContactPerson || null,
          phone: formPhone || null,
          email: formEmail || null,
          payment_terms_days: isNaN(terms) ? 30 : terms,
        });
        await loadSuppliers();
      }

      setIsFormModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenPayment = (s: Supplier) => {
    setPaymentSupplier(s);
    setPayAmount((Number(s.balance_cents) / 100).toFixed(2));
    setPayMethod('bank_transfer');
    setPayReference('');
    setPaymentError(null);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentSupplier) return;

    const amountFloat = parseFloat(payAmount);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      setPaymentError('Please enter a valid positive payment amount.');
      return;
    }

    const amountCents = Math.round(amountFloat * 100);
    if (BigInt(amountCents) > BigInt(paymentSupplier.balance_cents)) {
      setPaymentError(
        `Payment amount cannot exceed current balance of ${formatLKR(paymentSupplier.balance_cents)}`
      );
      return;
    }

    setIsRecordingPayment(true);
    setPaymentError(null);

    try {
      const res = await recordSupplierPayment({
        supplierId: paymentSupplier.id,
        amountCents,
        method: payMethod,
        reference: payReference || null,
      });

      // Update local supplier state
      setSuppliers((prev) =>
        prev.map((item) =>
          item.id === paymentSupplier.id
            ? { ...item, balance_cents: res.new_balance_cents }
            : item
        )
      );

      setPaymentSupplier(null);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!supplierToDelete) return;
    setIsDeleting(true);

    try {
      await deleteSupplier(supplierToDelete.id);
      setSuppliers((prev) => prev.filter((s) => s.id !== supplierToDelete.id));
      setSupplierToDelete(null);
    } catch (err) {
      alert('Failed to delete supplier: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(term) ||
      (s.contact_person && s.contact_person.toLowerCase().includes(term)) ||
      (s.phone && s.phone.includes(term))
    );
  });

  const totalOutstandingCents = suppliers.reduce(
    (sum, s) => sum + BigInt(s.balance_cents || 0),
    0n
  );

  const columns: Column<Supplier>[] = [
    {
      id: 'name',
      header: 'Supplier / Distributor',
      sortable: true,
      accessor: (row) => (
        <div>
          <span className="font-semibold text-slate-900 block">{row.name}</span>
          {row.contact_person && (
            <span className="text-[11px] text-slate-500">Attn: {row.contact_person}</span>
          )}
        </div>
      ),
    },
    {
      id: 'contact',
      header: 'Contact Info',
      accessor: (row) => (
        <div className="text-xs">
          {row.phone && <div className="font-mono text-slate-700">{row.phone}</div>}
          {row.email && <div className="text-slate-400">{row.email}</div>}
          {!row.phone && !row.email && <span className="text-slate-400 italic">No details</span>}
        </div>
      ),
    },
    {
      id: 'payment_terms_days',
      header: 'Credit Terms',
      accessor: (row) => (
        <span className="text-xs text-slate-600 font-medium">
          {row.payment_terms_days ? `${row.payment_terms_days} days` : 'Immediate'}
        </span>
      ),
    },
    {
      id: 'balance_cents',
      header: 'Balance Owed',
      align: 'right',
      sortable: true,
      sortValue: (row) => Number(row.balance_cents),
      accessor: (row) => {
        const bal = BigInt(row.balance_cents || 0);
        return (
          <div className="text-right">
            <Money
              cents={bal}
              size="sm"
              className={bal > 0n ? 'font-bold text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}
            />
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      accessor: (row) => (
        <div className="flex items-center justify-end space-x-1">
          {isManagerOrOwner && BigInt(row.balance_cents || 0) > 0n && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenPayment(row)}
              className="text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 py-0.5 px-2"
            >
              Pay
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStatementSupplier(row)}
            title="View statement of account"
            className="p-1 text-slate-600 hover:text-slate-900"
          >
            <FileText className="w-4 h-4" />
          </Button>
          {isManagerOrOwner && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenEdit(row)}
              title="Edit supplier"
              className="p-1 text-slate-600 hover:text-slate-900"
            >
              <Edit2 className="w-4 h-4" />
            </Button>
          )}
          {isOwner && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSupplierToDelete(row)}
              title="Delete supplier (Owner only)"
              className="p-1 text-rose-600 hover:text-rose-800"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers & Accounts Payable"
        subtitle="Manage wholesale vendors, purchase accounts and payments"
        actions={
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
              onClick={loadSuppliers}
            >
              Refresh
            </Button>
            {isManagerOrOwner && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={handleOpenAdd}
              >
                New Supplier
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          title="Active Suppliers"
          value={<span className="tabular-nums font-mono">{suppliers.length}</span>}
          variant="brand"
          icon={<Truck className="w-5 h-5" />}
          subtitle="Registered vendor accounts"
        />
        <StatCard
          title="Total Balance Owed"
          value={<Money cents={totalOutstandingCents} size="md" />}
          variant={totalOutstandingCents > 0n ? 'amber' : 'brand'}
          icon={<CreditCard className="w-5 h-5" />}
          subtitle="Accounts payable liability"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1 max-w-md">
          <SearchInput
            placeholder="Search suppliers by business name, representative or phone..."
            value={search}
            onChange={setSearch}
          />
        </div>
      </div>

      <DataTable<Supplier>
        data={filteredSuppliers}
        columns={columns}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        emptyTitle="No Suppliers Registered"
        emptyDescription="Add wholesale vendors and suppliers to begin logging purchase orders."
      />

      {/* Add / Edit Supplier Modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={editingSupplier ? 'Edit Supplier' : 'Register New Supplier'}
        size="md"
      >
        <form onSubmit={handleSaveSupplier} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs">
              {formError}
            </div>
          )}

          <Input
            label="Supplier / Business Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Ceylon Agro Distributors Ltd"
            required
          />

          <Input
            label="Contact Person (Optional)"
            value={formContactPerson}
            onChange={(e) => setFormContactPerson(e.target.value)}
            placeholder="e.g. Mahinda Silva"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Phone Number (Optional)"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              placeholder="e.g. 0112345678"
            />
            <Input
              label="Email Address (Optional)"
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="e.g. sales@ceylonagro.lk"
            />
          </div>

          <Input
            label="Payment Credit Terms (Days)"
            type="number"
            min="0"
            value={formTermsDays}
            onChange={(e) => setFormTermsDays(e.target.value)}
            placeholder="30"
          />

          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsFormModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSaving}>
              {editingSupplier ? 'Update Supplier' : 'Save Supplier'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        isOpen={Boolean(paymentSupplier)}
        onClose={() => setPaymentSupplier(null)}
        title={`Record Payment - ${paymentSupplier?.name}`}
        size="md"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          {paymentError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center space-x-1.5">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{paymentError}</span>
            </div>
          )}

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
            <span className="text-slate-600">Current Balance Owed:</span>
            <span className="font-mono font-bold text-rose-700 text-sm">
              {paymentSupplier ? formatLKR(paymentSupplier.balance_cents) : 'Rs. 0.00'}
            </span>
          </div>

          <Input
            label="Payment Amount (Rs.)"
            type="number"
            step="0.01"
            min="0.01"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            placeholder="0.00"
            required
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Payment Method
            </label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="card">Company Card</option>
            </select>
          </div>

          <Input
            label="Payment Reference / Cheque No. (Optional)"
            value={payReference}
            onChange={(e) => setPayReference(e.target.value)}
            placeholder="e.g. CHQ-98124 / BTTXN-4019"
          />

          <div className="flex justify-end space-x-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setPaymentSupplier(null)}
              disabled={isRecordingPayment}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isRecordingPayment}>
              Record Payment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Statement of Account Modal */}
      <Modal
        isOpen={Boolean(statementSupplier)}
        onClose={() => setStatementSupplier(null)}
        title={`Statement of Account - ${statementSupplier?.name}`}
        size="xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-600">
              <span className="font-semibold text-slate-900">{statementSupplier?.name}</span>
              {statementSupplier?.phone && <span> &bull; Tel: {statementSupplier.phone}</span>}
              <div className="text-[11px] text-slate-500 mt-0.5">
                Current Outstanding: <strong className="text-slate-900">{formatLKR(statementSupplier?.balance_cents || 0)}</strong>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Printer className="w-3.5 h-3.5" />}
                onClick={() => window.print()}
                className="print:hidden text-xs"
              >
                Print
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Download className="w-3.5 h-3.5" />}
                onClick={() => {
                  if (statementSupplier) {
                    downloadStatementCSV(statementSupplier.name, statementEntries);
                  }
                }}
                disabled={statementEntries.length === 0}
                className="print:hidden text-xs"
              >
                Export CSV
              </Button>
            </div>
          </div>

          {isStatementLoading ? (
            <div className="p-8 text-center text-slate-500 text-xs">Loading ledger entries...</div>
          ) : statementEntries.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl">
              No purchases or payments logged for this supplier yet.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-96">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200 text-[10px]">
                  <tr>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Reference</th>
                    <th className="py-2 px-3">Description</th>
                    <th className="py-2 px-3 text-right">Debit (Rs)</th>
                    <th className="py-2 px-3 text-right">Credit (Rs)</th>
                    <th className="py-2 px-3 text-right">Balance (Rs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {statementEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 whitespace-nowrap text-slate-600">
                        {new Date(entry.date).toLocaleDateString()}
                      </td>
                      <td className="py-2 px-3">
                        <Badge
                          variant={entry.type === 'purchase' ? 'info' : 'success'}
                          size="sm"
                        >
                          {entry.type}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-900">{entry.reference}</td>
                      <td className="py-2 px-3 text-slate-600 font-sans text-xs">{entry.description}</td>
                      <td className="py-2 px-3 text-right text-rose-700">
                        {entry.debitCents > 0n ? formatLKR(entry.debitCents) : '-'}
                      </td>
                      <td className="py-2 px-3 text-right text-emerald-700">
                        {entry.creditCents > 0n ? formatLKR(entry.creditCents) : '-'}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                        {formatLKR(entry.balanceCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-200 print:hidden">
            <Button variant="primary" size="sm" onClick={() => setStatementSupplier(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(supplierToDelete)}
        onClose={() => setSupplierToDelete(null)}
        title="Delete Supplier Account"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Are you sure you want to delete supplier{' '}
            <strong className="text-slate-900">{supplierToDelete?.name}</strong>?
          </p>

          <div className="flex justify-end space-x-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSupplierToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDeleteConfirm}
              isLoading={isDeleting}
            >
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SuppliersPage;
