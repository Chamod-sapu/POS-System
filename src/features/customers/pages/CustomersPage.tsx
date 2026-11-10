import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  CreditCard,
  MessageSquare,
  MessageSquareOff,
  RefreshCw,
  Eye,
  Edit2,
  Trash2,
  Award,
  Receipt as ReceiptIcon,
  ShoppingBag,
  Calendar,
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
import { maskPhoneNumber } from '../../receipts/lib/maskPhone';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  fetchCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  fetchCustomerDetail,
  Customer,
  CustomerDetail,
} from '../api/customers';

export const CustomersPage: React.FC = () => {
  const { role } = useAuth();
  const isOwner = role === 'owner';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Add/Edit modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formOptOut, setFormOptOut] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Detail modal state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Delete modal state
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchCustomers(search);
      setCustomers(data);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Load customer detail when selected
  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerDetail(null);
      return;
    }

    let isMounted = true;
    setIsDetailLoading(true);

    fetchCustomerDetail(selectedCustomerId)
      .then((detail) => {
        if (isMounted) setCustomerDetail(detail);
      })
      .catch((err) => {
        console.error('Failed to load customer detail:', err);
      })
      .finally(() => {
        if (isMounted) setIsDetailLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCustomerId]);

  const handleOpenAddModal = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormOptOut(false);
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setFormName(c.name);
    setFormPhone(c.phone);
    setFormEmail(c.email || '');
    setFormOptOut(Boolean(c.sms_opt_out));
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleToggleOptOut = async (c: Customer) => {
    const newVal = !c.sms_opt_out;
    try {
      await updateCustomer(c.id, { sms_opt_out: newVal });
      setCustomers((prev) =>
        prev.map((item) => (item.id === c.id ? { ...item, sms_opt_out: newVal } : item))
      );
      if (customerDetail && customerDetail.customer.id === c.id) {
        setCustomerDetail({
          ...customerDetail,
          customer: { ...customerDetail.customer, sms_opt_out: newVal },
        });
      }
    } catch (err) {
      alert('Failed to update SMS preference: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) {
      setFormError('Name and phone number are required.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      if (editingCustomer) {
        const updated = await updateCustomer(editingCustomer.id, {
          name: formName,
          phone: formPhone,
          email: formEmail || null,
          sms_opt_out: formOptOut,
        });
        setCustomers((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
        if (customerDetail && customerDetail.customer.id === updated.id) {
          setCustomerDetail({ ...customerDetail, customer: updated });
        }
      } else {
        await createCustomer({
          name: formName,
          phone: formPhone,
          email: formEmail || null,
          smsOptOut: formOptOut,
        });
        await loadCustomers();
      }

      setIsFormModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!customerToDelete) return;
    setIsDeleting(true);

    try {
      await deleteCustomer(customerToDelete.id);
      setCustomers((prev) => prev.filter((c) => c.id !== customerToDelete.id));
      if (selectedCustomerId === customerToDelete.id) {
        setSelectedCustomerId(null);
      }
      setCustomerToDelete(null);
    } catch (err) {
      alert('Failed to delete customer: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsDeleting(false);
    }
  };

  const totalRegistered = customers.length;
  const optedOutCount = customers.filter((c) => c.sms_opt_out).length;
  const totalCreditCents = customers.reduce(
    (sum, c) => sum + BigInt(c.credit_balance_cents || 0),
    0n
  );

  const columns: Column<Customer>[] = [
    {
      id: 'name',
      header: 'Customer Name',
      sortable: true,
      accessor: (row) => (
        <div>
          <span className="font-semibold text-slate-900 block">{row.name}</span>
          {row.email && <span className="text-[11px] text-slate-400">{row.email}</span>}
        </div>
      ),
    },
    {
      id: 'phone',
      header: 'Phone Number',
      accessor: (row) => (
        <span className="font-mono text-xs text-slate-700">
          {role === 'cashier' ? maskPhoneNumber(row.phone) : row.phone}
        </span>
      ),
    },
    {
      id: 'sms_opt_out',
      header: 'SMS Preference',
      accessor: (row) => (
        <button
          type="button"
          onClick={() => handleToggleOptOut(row)}
          className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
            row.sms_opt_out
              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
              : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
          }`}
          title="Click to toggle SMS preference"
        >
          {row.sms_opt_out ? (
            <>
              <MessageSquareOff className="w-3.5 h-3.5 text-amber-600" />
              <span>Opted Out</span>
            </>
          ) : (
            <>
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>Subscribed</span>
            </>
          )}
        </button>
      ),
    },
    {
      id: 'credit_balance_cents',
      header: 'Credit Balance',
      align: 'right',
      sortable: true,
      sortValue: (row) => Number(row.credit_balance_cents),
      accessor: (row) => (
        <div className="text-right">
          <Money cents={row.credit_balance_cents} size="sm" className="font-bold text-slate-900 dark:text-white" />
        </div>
      ),
    },
    {
      id: 'points_balance',
      header: 'Loyalty Points',
      align: 'right',
      sortable: true,
      sortValue: (row) => row.points_balance,
      accessor: (row) => (
        <span className="font-mono text-brand-600 dark:text-brand-400 font-bold tabular-nums">{row.points_balance} pts</span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      accessor: (row) => (
        <div className="flex items-center justify-end space-x-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedCustomerId(row.id)}
            title="View customer profile & orders"
            className="p-1 text-slate-600 hover:text-slate-900"
          >
            <Eye className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenEditModal(row)}
            title="Edit customer details"
            className="p-1 text-slate-600 hover:text-slate-900"
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          {isOwner && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCustomerToDelete(row)}
              title="Delete customer (Owner only)"
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
        title="Customers & SMS Consent Registry"
        subtitle="Manage customer profiles, store credit limits, and loyalty point balances"
        actions={
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
              onClick={loadCustomers}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<UserPlus className="w-4 h-4" />}
              onClick={handleOpenAddModal}
            >
              New Customer
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Registered Customers"
          value={<span className="tabular-nums font-mono">{totalRegistered}</span>}
          variant="brand"
          icon={<Users className="w-5 h-5" />}
          subtitle="Profiles in database"
        />
        <StatCard
          title="SMS Opted-Out Accounts"
          value={<span className="tabular-nums font-mono">{optedOutCount}</span>}
          variant={optedOutCount > 0 ? 'amber' : 'blue'}
          icon={<MessageSquareOff className="w-5 h-5" />}
          subtitle="Do not send receipt SMS"
        />
        <StatCard
          title="Outstanding Credit"
          value={<Money cents={totalCreditCents} size="md" />}
          variant="purple"
          icon={<CreditCard className="w-5 h-5" />}
          subtitle="Total store credit balance"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1 max-w-md">
          <SearchInput
            placeholder="Search customers by name or phone..."
            value={search}
            onChange={setSearch}
          />
        </div>
      </div>

      <DataTable<Customer>
        data={customers}
        columns={columns}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        emptyTitle="No Customers Found"
        emptyDescription="Add customers during POS checkout or register new accounts above."
      />

      {/* Add / Edit Customer Modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={editingCustomer ? 'Edit Customer' : 'Register New Customer'}
        size="md"
      >
        <form onSubmit={handleSaveCustomer} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs">
              {formError}
            </div>
          )}

          <Input
            label="Customer Full Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Sunil Perera"
            required
          />

          <Input
            label="Mobile Phone Number"
            value={formPhone}
            onChange={(e) => setFormPhone(e.target.value)}
            placeholder="e.g. 0771234567 or +94771234567"
            required
          />

          <Input
            label="Email Address (Optional)"
            type="email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            placeholder="e.g. sunil@example.com"
          />

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <label className="flex items-start space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formOptOut}
                onChange={(e) => setFormOptOut(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  Opt-out from Transactional SMS
                </span>
                <span className="text-[11px] text-slate-500">
                  Check this box if the customer does NOT wish to receive receipt SMS notifications.
                </span>
              </div>
            </label>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsFormModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isSaving}>
              {editingCustomer ? 'Update Customer' : 'Save Customer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Customer Detail Modal */}
      <Modal
        isOpen={Boolean(selectedCustomerId)}
        onClose={() => setSelectedCustomerId(null)}
        title={customerDetail?.customer.name || 'Customer Profile'}
        size="lg"
      >
        {isDetailLoading ? (
          <div className="p-8 text-center text-slate-500 text-xs">Loading customer profile...</div>
        ) : customerDetail ? (
          <div className="space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                <span className="text-[10px] text-emerald-700 font-bold uppercase block">Total Spent</span>
                <span className="text-base font-extrabold text-emerald-950 font-mono">
                  {formatLKR(customerDetail.totalSpentCents)}
                </span>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                <span className="text-[10px] text-blue-700 font-bold uppercase block">Completed Bills</span>
                <span className="text-base font-extrabold text-blue-950 font-mono">
                  {customerDetail.billCount}
                </span>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                <span className="text-[10px] text-amber-700 font-bold uppercase block">Points Balance</span>
                <span className="text-base font-extrabold text-amber-950 font-mono">
                  {customerDetail.customer.points_balance} pts
                </span>
              </div>
              <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl">
                <span className="text-[10px] text-slate-600 font-bold uppercase block">Last Visit</span>
                <span className="text-xs font-semibold text-slate-800">
                  {customerDetail.lastVisit
                    ? new Date(customerDetail.lastVisit).toLocaleDateString()
                    : 'Never'}
                </span>
              </div>
            </div>

            {/* Customer Details Box */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Phone:</span>
                <span className="font-mono font-semibold text-slate-800">
                  {role === 'cashier' ? maskPhoneNumber(customerDetail.customer.phone) : customerDetail.customer.phone}
                </span>
              </div>
              {customerDetail.customer.email && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Email:</span>
                  <span className="text-slate-800">{customerDetail.customer.email}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-slate-500">SMS Notification:</span>
                <span>
                  {customerDetail.customer.sms_opt_out ? (
                    <Badge variant="warning" size="sm">Opted Out</Badge>
                  ) : (
                    <Badge variant="success" size="sm">Subscribed</Badge>
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Store Credit Balance:</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatLKR(customerDetail.customer.credit_balance_cents)}
                </span>
              </div>
            </div>

            {/* Purchase History */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                <ReceiptIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Recent Transactions</span>
              </h4>

              {customerDetail.sales.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs bg-slate-50 rounded-xl">
                  No purchases recorded yet for this customer.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {customerDetail.sales.map((sale) => (
                    <div
                      key={sale.id}
                      className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <a
                          href={`/sales/${sale.id}`}
                          className="font-mono font-bold text-emerald-700 hover:underline block"
                        >
                          {sale.bill_no}
                        </a>
                        <span className="text-[10px] text-slate-400">
                          {new Date(sale.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-slate-900 block">
                          {formatLKR(sale.total_cents)}
                        </span>
                        <Badge
                          variant={sale.status === 'completed' ? 'success' : 'danger'}
                          size="sm"
                        >
                          {sale.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Loyalty Points Ledger */}
            {customerDetail.pointsLedger.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                  <span>Points History</span>
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-36 overflow-y-auto">
                  {customerDetail.pointsLedger.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-2 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <span className="font-semibold text-slate-800 capitalize block">
                          {entry.reason}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-emerald-700">
                        +{entry.points} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              {isOwner ? (
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<Trash2 className="w-4 h-4" />}
                  onClick={() => {
                    setCustomerToDelete(customerDetail.customer);
                  }}
                >
                  Delete Profile
                </Button>
              ) : (
                <div />
              )}
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenEditModal(customerDetail.customer)}
                  leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                >
                  Edit Profile
                </Button>
                <Button variant="primary" size="sm" onClick={() => setSelectedCustomerId(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(customerToDelete)}
        onClose={() => setCustomerToDelete(null)}
        title="Delete Customer Profile"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Are you sure you want to permanently delete customer{' '}
            <strong className="text-slate-900">{customerToDelete?.name}</strong>? This action cannot
            be undone.
          </p>

          <div className="flex justify-end space-x-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCustomerToDelete(null)}
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

export default CustomersPage;
