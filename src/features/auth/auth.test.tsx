import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoleGate } from './components/RoleGate';
import { ProtectedRoute } from './components/ProtectedRoute';
import { IdleLock } from './components/IdleLock';
import { LoginPage } from './pages/LoginPage';
import * as authHook from './hooks/useAuth';
import * as authApi from './api/auth';

describe('Auth Feature Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('RoleGate Component', () => {
    it('renders children when user role is in allowedRoles', () => {
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: { id: 'user-1', email: 'owner@wewala.lk' },
        profile: {
          id: 'user-1',
          full_name: 'Store Owner',
          role: 'owner',
          phone: null,
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
        <RoleGate allowedRoles={['owner']}>
          <div data-testid="protected-content">Owner Secret Settings</div>
        </RoleGate>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.getByText('Owner Secret Settings')).toBeInTheDocument();
    });

    it('blocks access and displays "Not Authorised" when role is not allowed', () => {
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: { id: 'user-2', email: 'cashier@wewala.lk' },
        profile: {
          id: 'user-2',
          full_name: 'Cashier One',
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
        <RoleGate allowedRoles={['owner', 'manager']}>
          <div data-testid="protected-content">Restricted Area</div>
        </RoleGate>
      );

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(screen.getByText('Not Authorised')).toBeInTheDocument();
      expect(screen.getByText(/owner or manager/i)).toBeInTheDocument();
    });

    it('renders custom fallback when provided and role is not allowed', () => {
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: { id: 'user-2', email: 'cashier@wewala.lk' },
        profile: null,
        role: 'cashier',
        isLoading: false,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        isLocked: false,
        lockApp: vi.fn(),
        unlockApp: vi.fn(),
      });

      render(
        <RoleGate allowedRoles={['owner']} fallback={<p>Custom Access Denied</p>}>
          <div>Top Secret</div>
        </RoleGate>
      );

      expect(screen.queryByText('Top Secret')).not.toBeInTheDocument();
      expect(screen.getByText('Custom Access Denied')).toBeInTheDocument();
    });
  });

  describe('ProtectedRoute Component', () => {
    it('shows loading indicator while verifying security session', () => {
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: null,
        profile: null,
        role: null,
        isLoading: true,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        isLocked: false,
        lockApp: vi.fn(),
        unlockApp: vi.fn(),
      });

      render(
        <MemoryRouter>
          <ProtectedRoute>
            <div>Dashboard Content</div>
          </ProtectedRoute>
        </MemoryRouter>
      );

      expect(screen.getByText('Verifying security session...')).toBeInTheDocument();
      expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
    });

    it('renders children when user is authenticated', () => {
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: { id: 'user-1' },
        profile: null,
        role: 'cashier',
        isLoading: false,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        isLocked: false,
        lockApp: vi.fn(),
        unlockApp: vi.fn(),
      });

      render(
        <MemoryRouter>
          <ProtectedRoute>
            <div data-testid="dashboard">POS Cashier Workspace</div>
          </ProtectedRoute>
        </MemoryRouter>
      );

      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    });
  });

  describe('IdleLock Component', () => {
    it('does not render when isLocked is false', () => {
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: { id: 'user-1', email: 'cashier@wewala.lk' },
        profile: null,
        role: 'cashier',
        isLoading: false,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        isLocked: false,
        lockApp: vi.fn(),
        unlockApp: vi.fn(),
      });

      const { container } = render(<IdleLock />);
      expect(container.firstChild).toBeNull();
    });

    it('renders full-screen overlay when terminal is locked and preserves cart', async () => {
      const mockUnlock = vi.fn().mockResolvedValue({ success: true });
      const mockSignOut = vi.fn();

      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: { id: 'user-1', email: 'cashier@wewala.lk' },
        profile: {
          id: 'user-1',
          full_name: 'Nuwan Perera',
          role: 'cashier',
          phone: null,
          is_active: true,
          created_at: '',
          updated_at: '',
        },
        role: 'cashier',
        isLoading: false,
        signOut: mockSignOut,
        refreshProfile: vi.fn(),
        isLocked: true,
        lockApp: vi.fn(),
        unlockApp: mockUnlock,
      });

      render(<IdleLock />);

      expect(screen.getByText('Terminal Locked')).toBeInTheDocument();
      expect(screen.getByText('Nuwan Perera')).toBeInTheDocument();
      expect(screen.getByText('Cart Preserved')).toBeInTheDocument();

      const input = screen.getByLabelText(/Enter Password to Resume/i);
      const submitBtn = screen.getByRole('button', { name: /Unlock Terminal/i });

      fireEvent.change(input, { target: { value: 'password123' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockUnlock).toHaveBeenCalledWith('password123');
      });

      const signOutBtn = screen.getByRole('button', { name: /Switch User or Sign Out/i });
      fireEvent.click(signOutBtn);
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe('LoginPage Component', () => {
    it('renders email, password and large touch targets', () => {
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: null,
        profile: null,
        role: null,
        isLoading: false,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        isLocked: false,
        lockApp: vi.fn(),
        unlockApp: vi.fn(),
      });

      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      );

      expect(screen.getByLabelText(/Staff Email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sign In to Terminal/i })).toBeInTheDocument();
    });

    it('toggles password visibility when eye button is clicked', () => {
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: null,
        profile: null,
        role: null,
        isLoading: false,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        isLocked: false,
        lockApp: vi.fn(),
        unlockApp: vi.fn(),
      });

      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      );

      const passwordInput = screen.getByLabelText(/^Password$/i);
      expect(passwordInput).toHaveAttribute('type', 'password');

      const toggleBtn = screen.getByRole('button', { name: /Show password/i });
      fireEvent.click(toggleBtn);
      expect(passwordInput).toHaveAttribute('type', 'text');

      fireEvent.click(toggleBtn);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('displays generic error on invalid login and locks out after 5 attempts', async () => {
      vi.spyOn(authHook, 'useAuth').mockReturnValue({
        user: null,
        profile: null,
        role: null,
        isLoading: false,
        signOut: vi.fn(),
        refreshProfile: vi.fn(),
        isLocked: false,
        lockApp: vi.fn(),
        unlockApp: vi.fn(),
      });

      vi.spyOn(authApi, 'signInWithEmail').mockRejectedValue(new Error('Invalid login credentials'));

      render(
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      );

      const emailInput = screen.getByLabelText(/Staff Email/i);
      const passwordInput = screen.getByLabelText(/^Password$/i);
      const submitBtn = screen.getByRole('button', { name: /Sign In to Terminal/i });

      fireEvent.change(emailInput, { target: { value: 'cashier@wewala.lk' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpass1' } });

      // Attempt 1
      fireEvent.click(submitBtn);
      await waitFor(() => {
        expect(screen.getByText(/Incorrect email or password/i)).toBeInTheDocument();
      });

      // Rapidly fail up to 5 attempts
      for (let i = 2; i <= 5; i++) {
        fireEvent.click(submitBtn);
        await waitFor(() => {
          if (i < 5) {
            expect(screen.getByText(/Incorrect email or password/i)).toBeInTheDocument();
          } else {
            expect(screen.getByText(/Rate Limit Exceeded/i)).toBeInTheDocument();
          }
        });
      }

      // Check lockout state
      expect(screen.getByText(/Rate Limit Exceeded/i)).toBeInTheDocument();
      expect(screen.getByText(/Security lockout active/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Locked/i })).toBeDisabled();
    });
  });
});
