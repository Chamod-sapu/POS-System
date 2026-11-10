import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../features/auth/components/ProtectedRoute';
import { RoleGate } from '../features/auth/components/RoleGate';
import { useAuth } from '../features/auth/hooks/useAuth';
import { AppLayout } from '../components/layout/AppLayout';
import { Spinner } from '../components/ui/Spinner';

// Lazy-loaded pages
const LoginPage = lazy(() => import('../features/auth/pages/LoginPage').then(m => ({ default: m.LoginPage })));
const CustomerDisplayPage = lazy(() => import('../features/pos/pages/CustomerDisplayPage').then(m => ({ default: m.CustomerDisplayPage })));
const StaffManagementPage = lazy(() => import('../features/auth/pages/StaffManagementPage').then(m => ({ default: m.StaffManagementPage })));
const POSPage = lazy(() => import('../features/pos/pages/POSPage'));
const SalesPage = lazy(() => import('../features/sales/pages/SalesPage'));
const SaleDetailPage = lazy(() => import('../features/sales/pages/SaleDetailPage'));
const ProductsPage = lazy(() => import('../features/products/pages/ProductsPage'));
const InventoryPage = lazy(() => import('../features/inventory/pages/InventoryPage'));
const CustomersPage = lazy(() => import('../features/customers/pages/CustomersPage'));
const SuppliersPage = lazy(() => import('../features/suppliers/pages/SuppliersPage'));
const PurchasingPage = lazy(() => import('../features/purchasing/pages/PurchasingPage'));
const ShiftsPage = lazy(() => import('../features/shifts/pages/ShiftsPage'));
const ReportsPage = lazy(() => import('../features/reports/pages/ReportsPage'));
const SettingsPage = lazy(() => import('../features/settings/pages/SettingsPage'));
const SmsLogPage = lazy(() => import('../features/sms/pages/SmsLogPage'));
const AuditLogPage = lazy(() => import('../features/audit/pages/AuditLogPage'));
const DashboardPage = lazy(() => import('../features/dashboard/pages/DashboardPage'));
const NotFoundPage = lazy(() => import('./NotFoundPage'));

// Role-aware index route: managers & owners see executive dashboard; cashiers route directly to POS register
const IndexRoute: React.FC = () => {
  const { role } = useAuth();
  if (role === 'cashier') {
    return <Navigate to="/pos" replace />;
  }
  return <DashboardPage />;
};

// Accessible Suspense loading fallback
const PageFallback: React.FC = () => (
  <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
    <Spinner size="lg" />
    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
      Loading workspace...
    </span>
  </div>
);

const withSuspense = (Component: React.ReactNode) => (
  <Suspense fallback={<PageFallback />}>{Component}</Suspense>
);

export const router = createBrowserRouter([
  // Public Login Route
  {
    path: '/login',
    element: withSuspense(<LoginPage />),
  },

  // Public Customer Facing Display Route (Runs unauthenticated on secondary monitors)
  {
    path: '/customer-display',
    element: withSuspense(<CustomerDisplayPage />),
  },

  // Protected Routes within App Shell
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: withSuspense(<IndexRoute />),
      },
      {
        path: 'pos',
        element: withSuspense(
          <RoleGate allowedRoles={['cashier', 'manager', 'owner']}>
            <POSPage />
          </RoleGate>
        ),
      },
      {
        path: 'sales',
        element: withSuspense(
          <RoleGate allowedRoles={['cashier', 'manager', 'owner']}>
            <SalesPage />
          </RoleGate>
        ),
      },
      {
        path: 'sales/:id',
        element: withSuspense(
          <RoleGate allowedRoles={['cashier', 'manager', 'owner']}>
            <SaleDetailPage />
          </RoleGate>
        ),
      },
      {
        path: 'customers',
        element: withSuspense(
          <RoleGate allowedRoles={['cashier', 'manager', 'owner']}>
            <CustomersPage />
          </RoleGate>
        ),
      },
      {
        path: 'products',
        element: withSuspense(
          <RoleGate allowedRoles={['manager', 'owner']}>
            <ProductsPage />
          </RoleGate>
        ),
      },
      {
        path: 'inventory',
        element: withSuspense(
          <RoleGate allowedRoles={['manager', 'owner']}>
            <InventoryPage />
          </RoleGate>
        ),
      },
      {
        path: 'suppliers',
        element: withSuspense(
          <RoleGate allowedRoles={['manager', 'owner']}>
            <SuppliersPage />
          </RoleGate>
        ),
      },
      {
        path: 'purchasing',
        element: withSuspense(
          <RoleGate allowedRoles={['manager', 'owner']}>
            <PurchasingPage />
          </RoleGate>
        ),
      },
      {
        path: 'shifts',
        element: withSuspense(
          <RoleGate allowedRoles={['cashier', 'manager', 'owner']}>
            <ShiftsPage />
          </RoleGate>
        ),
      },
      {
        path: 'reports',
        element: withSuspense(
          <RoleGate allowedRoles={['manager', 'owner']}>
            <ReportsPage />
          </RoleGate>
        ),
      },
      {
        path: 'settings',
        element: withSuspense(
          <RoleGate allowedRoles={['manager', 'owner']}>
            <SettingsPage />
          </RoleGate>
        ),
      },
      {
        path: 'sms',
        element: withSuspense(
          <RoleGate allowedRoles={['manager', 'owner']}>
            <SmsLogPage />
          </RoleGate>
        ),
      },
      {
        path: 'staff',
        element: withSuspense(
          <RoleGate allowedRoles={['owner']}>
            <StaffManagementPage />
          </RoleGate>
        ),
      },
      {
        path: 'audit',
        element: withSuspense(
          <RoleGate allowedRoles={['owner']}>
            <AuditLogPage />
          </RoleGate>
        ),
      },
    ],
  },

  // 404 Catch-All Route
  {
    path: '*',
    element: withSuspense(<NotFoundPage />),
  },
]);

export const AppRouter: React.FC = () => {
  return <RouterProvider router={router} />;
};
