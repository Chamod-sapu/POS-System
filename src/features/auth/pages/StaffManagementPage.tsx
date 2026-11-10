import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserPlus,
  Shield,
  KeyRound,
  UserX,
  UserCheck,
  ArrowLeft,
  X,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Link } from 'react-router-dom';
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
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';

export const StaffManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  // Dialog states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState<StaffMember | null>(null);
  const [targetRole, setTargetRole] = useState<UserRole>('cashier');
  const [passwordModalUser, setPasswordModalUser] = useState<StaffMember | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  return (
    <RoleGate allowedRoles={['owner']}>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Navigation Bar */}
        <header className="bg-slate-900 text-white shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Link
                to="/"
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                aria-label="Back to POS Home"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center space-x-2">
                <Users className="w-6 h-6 text-emerald-400" />
                <h1 className="text-xl font-bold tracking-tight">Staff Management</h1>
              </div>
            </div>
            <button
              onClick={() => {
                setActionError(null);
                setIsAddOpen(true);
              }}
              className="inline-flex items-center px-4 py-2 min-h-[44px] bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-sm shadow-sm transition-colors focus:ring-2 focus:ring-emerald-500"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Add Staff Member
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {actionError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Action Failed</p>
                <p className="mt-0.5">{actionError}</p>
              </div>
            </div>
          )}

          {queryError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>Error loading staff: {(queryError as Error).message}</span>
              </div>
              <button
                onClick={() => refetch()}
                className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg font-medium text-xs"
              >
                Retry
              </button>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-slate-900">Store Personnel & Roles</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage accounts for cashiers, managers, and owners.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                {staffList.length} Accounts
              </span>
            </div>

            {isLoading ? (
              <div className="p-12 text-center text-slate-500">
                <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                Loading staff registry...
              </div>
            ) : staffList.length === 0 ? (
              <div className="p-12 text-center text-slate-500">No staff members found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                      <th className="py-3.5 px-6">Staff Member</th>
                      <th className="py-3.5 px-6">Role</th>
                      <th className="py-3.5 px-6">Phone</th>
                      <th className="py-3.5 px-6">Status</th>
                      <th className="py-3.5 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                    {staffList.map((staff) => {
                      const isSelf = staff.id === currentUser?.id;
                      return (
                        <tr key={staff.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-4 px-6">
                            <div className="flex items-center space-x-3">
                              <Avatar name={staff.full_name} role={staff.role} size="md" />
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                  <span>{staff.full_name}</span>
                                  {isSelf && (
                                    <span className="text-[10px] font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/60 px-1.5 py-0.5 rounded border border-brand-200 dark:border-brand-800">
                                      You
                                    </span>
                                  )}
                                </div>
                                {staff.email && (
                                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{staff.email}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                                staff.role === 'owner'
                                  ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                                  : staff.role === 'manager'
                                  ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                  : 'bg-teal-100 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                              }`}
                            >
                              <Shield className="w-3 h-3 mr-1" />
                              {staff.role}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-slate-600 dark:text-slate-300 font-mono text-xs tabular-nums">
                            {staff.phone || <span className="text-slate-400 dark:text-slate-500 italic">None</span>}
                          </td>
                          <td className="py-4 px-6">
                            {staff.is_active ? (
                              <Badge variant="success" size="sm">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="danger" size="sm">
                                Inactive
                              </Badge>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              {/* Change Role Button */}
                              <button
                                onClick={() => {
                                  setActionError(null);
                                  setRoleModalUser(staff);
                                  setTargetRole(staff.role);
                                }}
                                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                              >
                                Change Role
                              </button>

                              {/* Reset Password Button */}
                              <button
                                onClick={() => {
                                  setActionError(null);
                                  setPasswordModalUser(staff);
                                  setNewPassword('');
                                }}
                                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg transition-colors flex items-center"
                              >
                                <KeyRound className="w-3.5 h-3.5 mr-1" />
                                Reset Key
                              </button>

                              {/* Toggle Active / Inactive */}
                              {staff.is_active ? (
                                <button
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Are you sure you want to deactivate ${staff.full_name}? They will be immediately logged out.`
                                      )
                                    ) {
                                      deactivateMutation.mutate(staff.id);
                                    }
                                  }}
                                  disabled={deactivateMutation.isPending}
                                  className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-colors flex items-center disabled:opacity-50"
                                >
                                  <UserX className="w-3.5 h-3.5 mr-1" />
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Reactivate account for ${staff.full_name}?`
                                      )
                                    ) {
                                      reactivateMutation.mutate(staff.id);
                                    }
                                  }}
                                  disabled={reactivateMutation.isPending}
                                  className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors flex items-center disabled:opacity-50"
                                >
                                  <UserCheck className="w-3.5 h-3.5 mr-1" />
                                  Reactivate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>

        {/* MODAL 1: ADD NEW STAFF MEMBER */}
        {isAddOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900">Create Staff Member</h3>
                <button
                  onClick={() => setIsAddOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    placeholder="Kasun Perera"
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="kasun@wewala.lk"
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    Initial Password * (min 10 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={10}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••••"
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                      Assigned Role
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) =>
                        setFormData({ ...formData, role: e.target.value as UserRole })
                      }
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                    >
                      <option value="cashier">Cashier</option>
                      <option value="manager">Manager</option>
                      <option value="owner">Owner</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                      Phone Number (optional)
                    </label>
                    <input
                      type="tel"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+94771234567"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="px-4 py-2 min-h-[44px] border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="px-5 py-2 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {createMutation.isPending ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: CHANGE ROLE */}
        {roleModalUser && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900">Change Staff Role</h3>
                <button
                  onClick={() => setRoleModalUser(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRoleSubmit} className="p-6 space-y-4">
                <p className="text-sm text-slate-600">
                  Update role for <span className="font-bold text-slate-900">{roleModalUser.full_name}</span>:
                </p>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1.5">
                    Select New Role
                  </label>
                  <select
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value as UserRole)}
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                  >
                    <option value="cashier">Cashier (POS register only)</option>
                    <option value="manager">Manager (Inventory, Purchases & Sales)</option>
                    <option value="owner">Owner (Full administrative rights)</option>
                  </select>
                </div>

                {roleModalUser.role === 'owner' && targetRole !== 'owner' && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                    Warning: Demoting an owner will revoke administrative access. System will refuse if this is the last active owner.
                  </div>
                )}

                <div className="pt-4 border-t border-slate-200 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setRoleModalUser(null)}
                    className="px-4 py-2 min-h-[44px] border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={roleMutation.isPending}
                    className="px-5 py-2 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {roleMutation.isPending ? 'Updating...' : 'Update Role'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 3: RESET PASSWORD */}
        {passwordModalUser && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900">Reset Staff Password</h3>
                <button
                  onClick={() => setPasswordModalUser(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handlePasswordSubmit} className="p-6 space-y-4">
                <p className="text-sm text-slate-600">
                  Set a new password for{' '}
                  <span className="font-bold text-slate-900">{passwordModalUser.full_name}</span>:
                </p>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                    New Password (min 10 characters)
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={10}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••••"
                      className="w-full px-3.5 py-2.5 min-h-[44px] rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setPasswordModalUser(null)}
                    className="px-4 py-2 min-h-[44px] border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={passwordMutation.isPending}
                    className="px-5 py-2 min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {passwordMutation.isPending ? 'Resetting...' : 'Save New Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </RoleGate>
  );
};

