import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserPlus,
  Shield,
  KeyRound,
  UserX,
  UserCheck,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';
import { RoleGate } from '../components/RoleGate';
import {
  listStaff,
  createStaffMember,
  updateStaffRole,
  deactivateStaffMember,
  reactivateStaffMember,
  resetStaffPassword,
} from '../api/auth';
import { StaffMember, UserRole, CreateStaffInput } from '../types';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { SearchInput } from '../../../components/ui/SearchInput';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Badge } from '../../../components/ui/Badge';
import { Avatar } from '../../../components/ui/Avatar';
import { DataTable, Column } from '../../../components/ui/DataTable';

export const StaffManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  // Search and filter state
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Dialog states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState<StaffMember | null>(null);
  const [targetRole, setTargetRole] = useState<UserRole>('cashier');
  const [passwordModalUser, setPasswordModalUser] = useState<StaffMember | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    user: StaffMember;
    action: 'deactivate' | 'reactivate';
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Form state for new staff
  const [formData, setFormData] = useState<CreateStaffInput>({
    email: '',
    password: '',
    full_name: '',
    role: 'cashier',
    phone: '',
  });

  // Query staff list
  const {
    data: staffList = [],
    isLoading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['staff-list'],
    queryFn: listStaff,
    staleTime: 1000 * 30,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createStaffMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-list'] });
      setIsAddOpen(false);
      setFormData({ email: '', password: '', full_name: '', role: 'cashier', phone: '' });
      setActionError(null);
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to create staff member');
    },
  });

  const roleMutation = useMutation({
    mutationFn: updateStaffRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-list'] });
      setRoleModalUser(null);
      setActionError(null);
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to change role');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateStaffMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-list'] });
      setConfirmModal(null);
      setActionError(null);
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to deactivate account');
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: reactivateStaffMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-list'] });
      setConfirmModal(null);
      setActionError(null);
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to reactivate account');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: ({ userId, pass }: { userId: string; pass: string }) =>
      resetStaffPassword(userId, pass),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-list'] });
      setPasswordModalUser(null);
      setNewPassword('');
      setActionError(null);
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to reset password');
    },
  });

  // Stats
  const activeCount = useMemo(() => staffList.filter((s) => s.is_active).length, [staffList]);
  const ownerCount = useMemo(() => staffList.filter((s) => s.role === 'owner').length, [staffList]);
  const managerCount = useMemo(() => staffList.filter((s) => s.role === 'manager').length, [staffList]);
  const cashierCount = useMemo(() => staffList.filter((s) => s.role === 'cashier').length, [staffList]);

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    return staffList.filter((staff) => {
      const matchesRole = roleFilter === 'all' || staff.role === roleFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        staff.full_name.toLowerCase().includes(q) ||
        (staff.email && staff.email.toLowerCase().includes(q)) ||
        (staff.phone && staff.phone.includes(q)) ||
        staff.role.toLowerCase().includes(q);
      return matchesRole && matchesSearch;
    });
  }, [staffList, search, roleFilter]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!formData.email || !formData.password || !formData.full_name) {
      setActionError('Please complete all required fields.');
      return;
    }
    if (formData.password.length < 10) {
      setActionError('Password must be at least 10 characters long.');
      return;
    }
    createMutation.mutate(formData);
  };

  const handleRoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleModalUser) return;
    setActionError(null);
    roleMutation.mutate({ user_id: roleModalUser.id, new_role: targetRole });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalUser) return;
    setActionError(null);
    if (newPassword.length < 10) {
      setActionError('New password must be at least 10 characters long.');
      return;
    }
    passwordMutation.mutate({ userId: passwordModalUser.id, pass: newPassword });
  };

  // Columns definition for DataTable
  const columns: Column<StaffMember>[] = [
    {
      id: 'staff',
      header: 'Staff Member',
      sortable: true,
      sortValue: (s) => s.full_name,
      accessor: (s) => {
        const isSelf = s.id === currentUser?.id;
        return (
          <div className="flex items-center space-x-3">
            <Avatar name={s.full_name} role={s.role} size="md" />
            <div>
              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{s.full_name}</span>
                {isSelf && (
                  <span className="text-[10px] font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/60 px-1.5 py-0.5 rounded border border-brand-200 dark:border-brand-800">
                    You
                  </span>
                )}
              </div>
              {s.email && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">{s.email}</div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      id: 'role',
      header: 'Role & Permissions',
      sortable: true,
      sortValue: (s) => s.role,
      accessor: (s) => (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
            s.role === 'owner'
              ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
              : s.role === 'manager'
              ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
              : 'bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
          }`}
        >
          <Shield className="w-3.5 h-3.5 mr-1" />
          {s.role}
        </span>
      ),
    },
    {
      id: 'phone',
      header: 'Phone',
      accessor: (s) => (
        <span className="text-slate-600 dark:text-slate-300 font-mono text-xs tabular-nums">
          {s.phone || <span className="text-slate-400 dark:text-slate-500 italic">None</span>}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Account Status',
      sortable: true,
      sortValue: (s) => (s.is_active ? 1 : 0),
      accessor: (s) => (
        <Badge variant={s.is_active ? 'success' : 'danger'} dot size="sm">
          {s.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      accessor: (s) => (
        <div className="flex items-center justify-end space-x-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setActionError(null);
              setRoleModalUser(s);
              setTargetRole(s.role);
            }}
          >
            Change Role
          </Button>

          <Button
            variant="outline"
            size="sm"
            leftIcon={<KeyRound className="w-3.5 h-3.5 text-amber-500" />}
            onClick={(e) => {
              e.stopPropagation();
              setActionError(null);
              setPasswordModalUser(s);
              setNewPassword('');
            }}
          >
            Reset Key
          </Button>

          {s.is_active ? (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<UserX className="w-3.5 h-3.5 text-rose-500" />}
              className="hover:border-rose-300 hover:text-rose-600 dark:hover:text-rose-400"
              onClick={(e) => {
                e.stopPropagation();
                setActionError(null);
                setConfirmModal({ user: s, action: 'deactivate' });
              }}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<UserCheck className="w-3.5 h-3.5 text-emerald-500" />}
              className="hover:border-emerald-300 hover:text-emerald-600 dark:hover:text-emerald-400"
              onClick={(e) => {
                e.stopPropagation();
                setActionError(null);
                setConfirmModal({ user: s, action: 'reactivate' });
              }}
            >
              Reactivate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <RoleGate allowedRoles={['owner']}>
      <div className="space-y-6">
        {/* Page Header */}
        <PageHeader
          title="Staff & User Management"
          subtitle="Manage store personnel accounts, assigned roles, security credentials, and access permissions"
          actions={
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
                onClick={() => refetch()}
                disabled={isLoading}
              >
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<UserPlus className="w-4 h-4" />}
                onClick={() => {
                  setActionError(null);
                  setIsAddOpen(true);
                }}
              >
                Add Staff Member
              </Button>
            </div>
          }
        />

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Accounts"
            value={staffList.length.toString()}
            subtitle="Registered store staff members"
            icon={<Users className="w-5 h-5" />}
            variant="default"
          />
          <StatCard
            title="Active Accounts"
            value={activeCount.toString()}
            subtitle="Personnel permitted to log in"
            icon={<UserCheck className="w-5 h-5" />}
            variant="emerald"
          />
          <StatCard
            title="Store Owners"
            value={ownerCount.toString()}
            subtitle="Full system administrative rights"
            icon={<Shield className="w-5 h-5" />}
            variant="purple"
          />
          <StatCard
            title="Floor Staff"
            value={`${cashierCount} Cashiers`}
            subtitle={`${managerCount} Manager${managerCount === 1 ? '' : 's'}`}
            icon={<KeyRound className="w-5 h-5" />}
            variant="blue"
          />
        </div>

        {/* Action Error Alert */}
        {actionError && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-2xl text-rose-800 dark:text-rose-200 text-xs font-medium flex items-start space-x-3 shadow-subtle">
            <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-sm">Action Failed</p>
              <p className="mt-0.5">{actionError}</p>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 font-bold text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Query Error Alert */}
        {queryError && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-2xl text-rose-800 dark:text-rose-200 text-xs font-medium flex items-center justify-between shadow-subtle">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
              <span>Error loading staff: {(queryError as Error).message}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {/* Search & Filter Toolbar */}
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="w-full sm:max-w-md">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by name, email, phone, or role..."
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Role:
            </span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="all">All Roles ({staffList.length})</option>
              <option value="owner">Owners ({ownerCount})</option>
              <option value="manager">Managers ({managerCount})</option>
              <option value="cashier">Cashiers ({cashierCount})</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <DataTable<StaffMember>
          data={filteredStaff}
          columns={columns}
          keyExtractor={(s) => s.id}
          isLoading={isLoading}
          emptyTitle="No staff members found"
          emptyDescription={
            search || roleFilter !== 'all'
              ? 'No staff members match the selected search filters.'
              : 'Add cashiers and managers to grant them access to this store terminal.'
          }
          emptyAction={
            search || roleFilter !== 'all' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setRoleFilter('all');
                }}
              >
                Clear Filters
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<UserPlus className="w-4 h-4" />}
                onClick={() => setIsAddOpen(true)}
              >
                Add Staff Member
              </Button>
            )
          }
        />

        {/* MODAL 1: ADD NEW STAFF MEMBER */}
        <Modal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          title="Create Staff Member"
          description="Add a new cashier, manager, or owner to this store."
          size="md"
        >
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <Input
              label="Full Name"
              required
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="e.g. Kasun Perera"
            />

            <Input
              label="Email Address"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="e.g. kasun@wewala.lk"
            />

            <Input
              label="Initial Password"
              type={showAddPassword ? 'text' : 'password'}
              required
              minLength={10}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••••"
              helperText="Must be at least 10 characters long"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowAddPassword(!showAddPassword)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  tabIndex={-1}
                >
                  {showAddPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Assigned Role"
                value={formData.role}
                onChange={(e) =>
                  setFormData({ ...formData, role: e.target.value as UserRole })
                }
                options={[
                  { value: 'cashier', label: 'Cashier (Register Only)' },
                  { value: 'manager', label: 'Manager (Inventory & Reports)' },
                  { value: 'owner', label: 'Owner (Full Access)' },
                ]}
              />

              <Input
                label="Phone Number"
                type="tel"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="e.g. +94771234567"
                helperText="Optional (SMS & alerts)"
              />
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => setIsAddOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                isLoading={createMutation.isPending}
              >
                Create Account
              </Button>
            </div>
          </form>
        </Modal>

        {/* MODAL 2: CHANGE ROLE */}
        <Modal
          isOpen={!!roleModalUser}
          onClose={() => setRoleModalUser(null)}
          title="Change Staff Role"
          description={
            roleModalUser
              ? `Update permissions and access tier for ${roleModalUser.full_name}`
              : undefined
          }
          size="sm"
        >
          {roleModalUser && (
            <form onSubmit={handleRoleSubmit} className="space-y-4">
              <Select
                label="Select New Role"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as UserRole)}
                options={[
                  { value: 'cashier', label: 'Cashier (POS register only)' },
                  { value: 'manager', label: 'Manager (Inventory, Purchases & Sales)' },
                  { value: 'owner', label: 'Owner (Full administrative rights)' },
                ]}
              />

              {roleModalUser.role === 'owner' && targetRole !== 'owner' && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-900 dark:text-amber-200 text-xs leading-relaxed">
                  <span className="font-bold">Warning:</span> Demoting an owner will revoke administrative access. The system will refuse this change if this is the last active store owner.
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setRoleModalUser(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  isLoading={roleMutation.isPending}
                >
                  Update Role
                </Button>
              </div>
            </form>
          )}
        </Modal>

        {/* MODAL 3: RESET PASSWORD */}
        <Modal
          isOpen={!!passwordModalUser}
          onClose={() => setPasswordModalUser(null)}
          title="Reset Staff Password"
          description={
            passwordModalUser
              ? `Generate a new access key for ${passwordModalUser.full_name}`
              : undefined
          }
          size="sm"
        >
          {passwordModalUser && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <Input
                label="New Password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={10}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••••"
                helperText="Must be at least 10 characters long"
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setPasswordModalUser(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  isLoading={passwordMutation.isPending}
                >
                  Save New Password
                </Button>
              </div>
            </form>
          )}
        </Modal>

        {/* MODAL 4: CONFIRM DEACTIVATE / REACTIVATE */}
        <Modal
          isOpen={!!confirmModal}
          onClose={() => setConfirmModal(null)}
          title={confirmModal?.action === 'deactivate' ? 'Deactivate Account' : 'Reactivate Account'}
          size="sm"
        >
          {confirmModal && (
            <div className="space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {confirmModal.action === 'deactivate' ? (
                  <>
                    Are you sure you want to deactivate{' '}
                    <span className="font-bold text-slate-900 dark:text-white">
                      {confirmModal.user.full_name}
                    </span>
                    ?
                  </>
                ) : (
                  <>
                    Reactivate access for{' '}
                    <span className="font-bold text-slate-900 dark:text-white">
                      {confirmModal.user.full_name}
                    </span>
                    ?
                  </>
                )}
              </p>

              {confirmModal.action === 'deactivate' && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-900 dark:text-amber-200 text-xs leading-relaxed">
                  They will be immediately logged out and unable to sign in to any POS terminal or management dashboard until reactivated.
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setConfirmModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant={confirmModal.action === 'deactivate' ? 'danger' : 'primary'}
                  isLoading={deactivateMutation.isPending || reactivateMutation.isPending}
                  onClick={() => {
                    if (confirmModal.action === 'deactivate') {
                      deactivateMutation.mutate(confirmModal.user.id);
                    } else {
                      reactivateMutation.mutate(confirmModal.user.id);
                    }
                  }}
                >
                  {confirmModal.action === 'deactivate' ? 'Deactivate Account' : 'Reactivate Account'}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </RoleGate>
  );
};

export default StaffManagementPage;
