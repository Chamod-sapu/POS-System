import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import { AppLayout } from './AppLayout';
import * as authHook from '../../features/auth/hooks/useAuth';
import * as settingsHook from '../../features/settings/hooks/useShopSettings';
import * as shiftHook from '../../features/shifts/hooks/useCurrentShift';
import * as onlineHook from '../../lib/useOnlineStatus';
import { RoleGate } from '../../features/auth/components/RoleGate';

describe('AppLayout & Role-Based Navigation Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(settingsHook, 'useShopSettings').mockReturnValue({
      settings: null,
      shopName: 'Wewala Super Store',
      isLoading: false,
      error: null,
    });

    vi.spyOn(shiftHook, 'useCurrentShift').mockReturnValue({
      shift: null,
      isOpen: true,
      isLoading: false,
      refetch: vi.fn(),
    });

    vi.spyOn(onlineHook, 'useOnlineStatus').mockReturnValue({
      isOnline: true,
      isChecking: false,
      lastChecked: new Date(),
      checkConnection: vi.fn().mockResolvedValue(true),
    });
  });

  it('renders minimal navigation items for cashier role (POS, My Sales, Customers)', () => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: { id: 'u-cashier', email: 'cashier@wewala.lk' },
      profile: {
        id: 'u-cashier',
        full_name: 'Nuwan Cashier',
        role: 'cashier',
        phone: '+94771234567',
        is_active: true,
        created_at: '',
        updated_at: '',
      },
      role: 'cashier',
      isLoading: false,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      isLocked: false,
      lockApp: vi.fn(),
      unlockApp: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/pos']}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route path="pos" element={<div>POS Terminal</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    // Cashier allowed items exist
    expect(screen.getAllByText('POS Register')[0]).toBeInTheDocument();
    expect(screen.getAllByText('My Sales')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Customers')[0]).toBeInTheDocument();

    // Restricted items must NOT be in cashier navigation
    expect(screen.queryByText('Reports & Z-Reports')).not.toBeInTheDocument();
    expect(screen.queryByText('Staff Management')).not.toBeInTheDocument();
    expect(screen.queryByText('Security Audit Log')).not.toBeInTheDocument();
    expect(screen.queryByText('Products & Catalog')).not.toBeInTheDocument();
    expect(screen.queryByText('Stock & Batches')).not.toBeInTheDocument();
  });

  it('blocks cashier from opening /reports by URL and displays "Not Authorised"', () => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: { id: 'u-cashier', email: 'cashier@wewala.lk' },
      profile: {
        id: 'u-cashier',
        full_name: 'Nuwan Cashier',
        role: 'cashier',
        phone: null,
        is_active: true,
        created_at: '',
        updated_at: '',
      },
      role: 'cashier',
      isLoading: false,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      isLocked: false,
      lockApp: vi.fn(),
      unlockApp: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/reports']}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route
              path="reports"
              element={
                <RoleGate allowedRoles={['manager', 'owner']}>
                  <div>Secret Z-Report Financials</div>
                </RoleGate>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Secret Z-Report Financials')).not.toBeInTheDocument();
    expect(screen.getByText('Not Authorised')).toBeInTheDocument();
    expect(screen.getByText(/manager or owner/i)).toBeInTheDocument();
  });

  it('renders all administrative navigation items for owner role', () => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      user: { id: 'u-owner', email: 'owner@wewala.lk' },
      profile: {
        id: 'u-owner',
        full_name: 'Store Owner',
        role: 'owner',
        phone: '+94770000000',
        is_active: true,
        created_at: '',
        updated_at: '',
      },
      role: 'owner',
      isLoading: false,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
      isLocked: false,
      lockApp: vi.fn(),
      unlockApp: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/pos']}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route path="pos" element={<div>POS Terminal</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    // Owner sees full management menu
    expect(screen.getAllByText('POS Register')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Sales & Bills')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Customers')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Products')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Stock & Batches')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Suppliers')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Purchasing')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Reports & Z-Reports')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Settings')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Staff Management')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Audit Log')[0]).toBeInTheDocument();
  });
});
