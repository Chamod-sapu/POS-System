import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ShoppingCart,
  Receipt,
  Users,
  Package,
  Boxes,
  Truck,
  ClipboardList,
  Clock,
  BarChart3,
  Settings,
  ShieldCheck,
  Lock,
  LogOut,
  Store,
  MessageSquare,
  Menu,
  X,
  WifiOff,
  RefreshCw,
  Search,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { useShopSettings } from '../../features/settings/hooks/useShopSettings';
import { useCurrentShift } from '../../features/shifts/hooks/useCurrentShift';
import { useOnlineStatus } from '../../lib/useOnlineStatus';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';
import { Kbd } from '../ui/Kbd';
import { useLiveStock, useLiveStockStore } from '../../features/inventory/useLiveStock';
import { OpenShiftModal } from '../../features/shifts/components/OpenShiftModal';
import { CloseShiftModal } from '../../features/shifts/components/CloseShiftModal';
import { CashMovementModal } from '../../features/shifts/components/CashMovementModal';
import { XReportModal } from '../../features/shifts/components/XReportModal';
import { MfaEnrollModal } from '../../features/auth/components/MfaEnrollModal';
import { MfaChallengeModal } from '../../features/auth/components/MfaChallengeModal';
import { CommandPalette } from './CommandPalette';
import { useTheme } from '../../lib/theme';
import { soundEffects } from '../../lib/audio';
import { useToast } from '../ui/Toast';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  allowedRoles: ('owner' | 'manager' | 'cashier')[];
  section: 'POS & Sales' | 'Inventory & Catalog' | 'Analytics & Ops' | 'Administration';
}

export const AppLayout: React.FC = () => {
  const { user, profile, role, lockApp, signOut, needsMfaEnrollment, needsMfaChallenge } = useAuth();
  const { shopName, settings } = useShopSettings();
  const { shift, isOpen: isShiftOpen, refetch: refetchShift } = useCurrentShift();
  const { isOnline } = useOnlineStatus();
  const { toggleTheme, effectiveTheme, toggleDensity, density } = useTheme();
  const toast = useToast();

  useLiveStock();
  const liveStatus = useLiveStockStore((s) => s.status);
  const effectiveStatus = !isOnline ? 'offline' : liveStatus;

  // Sidebar collapsed state stored per workstation
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('wewala-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [openShiftModalOpen, setOpenShiftModalOpen] = useState(false);
  const [closeShiftModalOpen, setCloseShiftModalOpen] = useState(false);
  const [cashMovementModalOpen, setCashMovementModalOpen] = useState(false);
  const [xReportModalOpen, setXReportModalOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(() => soundEffects.getMuted());
  const location = useLocation();

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('wewala-sidebar-collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleToggleMute = () => {
    const nextMuted = soundEffects.toggleMute();
    setIsMuted(nextMuted);
    toast.info(nextMuted ? 'Audio feedback muted' : 'Audio feedback enabled');
  };

  // Navigation Items with grouped sections and strict role filtering
  const navItems: NavItem[] = [
    // POS & Sales
    {
      to: '/pos',
      label: 'POS Register',
      icon: <ShoppingCart className="w-5 h-5 flex-shrink-0" />,
      allowedRoles: ['cashier', 'manager', 'owner'],
      section: 'POS & Sales',
    },
    {
      to: '/sales',
      label: role === 'cashier' ? 'My Sales' : 'Sales & Bills',
      icon: <Receipt className="w-5 h-5 flex-shrink-0" />,
      allowedRoles: ['cashier', 'manager', 'owner'],
      section: 'POS & Sales',
    },
    {
      to: '/customers',
      label: 'Customers',
      icon: <Users className="w-5 h-5 flex-shrink-0" />,
      allowedRoles: ['cashier', 'manager', 'owner'],
      section: 'POS & Sales',
    },

    // Inventory & Catalog
    {
      to: '/products',
      label: 'Products',
      icon: <Package className="w-5 h-5 flex-shrink-0" />,
      allowedRoles: ['manager', 'owner'],
      section: 'Inventory & Catalog',
    },
    {
      to: '/inventory',
      label: 'Stock & Batches',
      icon: <Boxes className="w-5 h-5 flex-shrink-0" />,
      allowedRoles: ['manager', 'owner'],
      section: 'Inventory & Catalog',
    },
    {
      to: '/suppliers',
      label: 'Suppliers',
      icon: <Truck className="w-5 h-5 flex-shrink-0" />,
      allowedRoles: ['manager', 'owner'],
      section: 'Inventory & Catalog',
    },
    {
      to: '/purchasing',
      label: 'Purchasing',
      icon: <ClipboardList className="w-5 h-5 flex-shrink-0" />,
      allowedRoles: ['manager', 'owner'],
      section: 'Inventory & Catalog',
    },

    // Analytics & Operations
    {
      to: '/',
      label: 'Dashboard',
      icon: <BarChart3 className="w-5 h-5 flex-shrink-0" />,
      allowedRoles: ['manager', 'owner'],
      section: 'Analytics & Ops',
    },
    {
      to: '/shifts',
      label: 'Cashier Shifts',
      icon: <Clock className="w-5 h-5 flex-shrink-0" />,
      allowedRoles: ['cashier', 'manager', 'owner'],
      section: 'Analytics & Ops',
    },
    {
      to: '/reports',
      label: 'Reports & Z-Reports',
      icon: <BarChart3 className="w-5 h-5 flex-shrink-0" />,
      allowedRoles: ['manager', 'owner'],
      section: 'Analytics & Ops',
    },
    {
      to: '/sms',
      label: 'SMS Outbox',
      icon: <MessageSquare className="w-5 h-5 flex-shrink-0" />,
      allowedRoles: ['manager', 'owner'],
      section: 'Analytics & Ops',
    },

    // Administration
    {
      to: '/settings',
      label: 'Settings',
      icon: <Settings className="w-5 h-5 flex-shrink-0" />,
      allowedRoles: ['manager', 'owner'],
      section: 'Administration',
    },
    {
      to: '/staff',
      label: 'Staff Management',
      icon: <Users className="w-5 h-5 flex-shrink-0" />,
      allowedRoles: ['owner'],
      section: 'Administration',
    },
    {
      to: '/audit',
      label: 'Audit Log',
      icon: <ShieldCheck className="w-5 h-5 flex-shrink-0" />,
      allowedRoles: ['owner'],
      section: 'Administration',
    },
  ];

  const allowedNavItems = navItems.filter(
    (item) => role && item.allowedRoles.includes(role)
  );

  // Group sections
  const sections = Array.from(new Set(allowedNavItems.map((i) => i.section)));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased">
      {/* -------------------------------------------------------------------- */}
      {/* 1. SLIM PREMIUM TOP BAR                                             */}
      {/* -------------------------------------------------------------------- */}
      <header
        data-app-chrome="true"
        className="sticky top-0 z-30 h-14 sm:h-16 bg-slate-900 text-white border-b border-slate-800 shadow-subtle flex items-center justify-between px-3 sm:px-6"
      >
        {/* Left: Mobile Drawer Trigger & Store Branding */}
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Open navigation menu"
            className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="flex items-center space-x-2.5">
            {typeof window !== 'undefined' && localStorage.getItem('wewala_shop_logo') ? (
              <img
                src={localStorage.getItem('wewala_shop_logo')!}
                alt="Store Logo"
                className="w-9 h-9 rounded-xl object-contain bg-white p-0.5 shadow-subtle shrink-0 border border-slate-700"
              />
            ) : (
              <div className="p-2 bg-brand-600 rounded-xl text-white shadow-subtle flex-shrink-0 flex items-center justify-center">
                <Store className="w-5 h-5" aria-hidden="true" />
              </div>
            )}
            <div>
              <h1 className="text-sm sm:text-base font-bold tracking-tight leading-none text-white truncate max-w-[150px] sm:max-w-xs md:max-w-md">
                {shopName}
              </h1>
              <p className="text-[10px] sm:text-xs text-slate-400 font-medium">Wewala, Sri Lanka</p>
            </div>
          </div>
        </div>

        {/* Center: Global Search & Command Palette Trigger */}
        <div className="hidden md:flex flex-1 max-w-xs lg:max-w-sm mx-4">
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="w-full flex items-center justify-between px-3 py-1.5 bg-slate-800/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/80 rounded-xl text-xs font-medium transition-subtle cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-subtle"
          >
            <div className="flex items-center space-x-2">
              <Search className="w-4 h-4 text-slate-400" />
              <span>Search or jump to...</span>
            </div>
            <div className="flex items-center space-x-1">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </div>
          </button>
        </div>

        {/* Right: Status Indicators & Quick Actions */}
        <div className="flex items-center space-x-1.5 sm:space-x-3">
          {/* Realtime Live Connection Dot */}
          <div className="hidden sm:flex items-center">
            {effectiveStatus === 'live' ? (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 shadow-subtle">
                <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                Live
              </span>
            ) : effectiveStatus === 'reconnecting' ? (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-400 border border-amber-800/80 shadow-subtle">
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-amber-400 animate-spin" />
                Reconnecting
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-400 border border-rose-800/80 shadow-subtle">
                <WifiOff className="w-3.5 h-3.5 mr-1.5 text-rose-400 animate-pulse" />
                Offline
              </span>
            )}
          </div>

          {/* Current Cashier Shift Chip */}
          <div className="hidden lg:flex items-center space-x-1.5 bg-slate-800/90 border border-slate-700/80 rounded-xl p-1">
            {isShiftOpen && shift ? (
              <>
                <div className="flex items-center space-x-1.5 px-2 text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono font-bold text-slate-200">
                    Shift #{shift.id.slice(0, 6)}
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    {new Date(shift.opened_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className="h-4 w-px bg-slate-700 mx-0.5" />

                <button
                  type="button"
                  onClick={() => setCashMovementModalOpen(true)}
                  className="px-2 py-1 text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-subtle cursor-pointer"
                  title="Cash In / Cash Out (Float additions, safe drops, petty cash)"
                >
                  Cash In/Out
                </button>

                <button
                  type="button"
                  onClick={() => setXReportModalOpen(true)}
                  className="px-2 py-1 text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-subtle cursor-pointer"
                  title="Generate mid-shift X-Report without closing drawer"
                >
                  X-Report
                </button>

                <button
                  type="button"
                  onClick={() => setCloseShiftModalOpen(true)}
                  className="px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:text-white hover:bg-rose-600/70 rounded-lg transition-subtle cursor-pointer"
                  title="Balance cash drawer and close shift with Z-Report"
                >
                  Close Shift
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setOpenShiftModalOpen(true)}
                className="flex items-center space-x-1.5 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:text-white hover:bg-amber-600/30 rounded-lg transition-subtle cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Open Shift</span>
              </button>
            )}
          </div>

          {/* Theme Switcher Button (Sun / Moon) */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Toggle theme (currently ${effectiveTheme})`}
            title={`Toggle theme (currently ${effectiveTheme})`}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center transition-subtle cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {effectiveTheme === 'dark' ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5 text-slate-300" />
            )}
          </button>

          {/* Audio Feedback Mute / Unmute */}
          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={isMuted ? 'Unmute sounds' : 'Mute sounds'}
            title={isMuted ? 'Unmute sounds' : 'Mute sounds'}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center transition-subtle cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5 text-rose-400" />
            ) : (
              <Volume2 className="w-5 h-5 text-slate-300" />
            )}
          </button>

          {/* Density Toggle Button */}
          <button
            type="button"
            onClick={toggleDensity}
            aria-label={`Toggle density (currently ${density})`}
            title={`Toggle density (${density === 'comfortable' ? 'Switch to Compact' : 'Switch to Comfortable'})`}
            className="hidden sm:flex p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg min-h-[44px] min-w-[44px] items-center justify-center transition-subtle cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          {/* User Profile Avatar & Role */}
          <div className="flex items-center space-x-2 bg-slate-800/90 border border-slate-700/80 py-1 px-2.5 rounded-xl">
            <Avatar
              name={profile?.full_name || user?.email?.split('@')[0] || 'Staff'}
              role={role || 'cashier'}
              size="sm"
            />
            <div className="hidden sm:block text-right">
              <div className="text-xs font-semibold text-slate-200 truncate max-w-[100px]">
                {profile?.full_name || user?.email?.split('@')[0] || 'Staff'}
              </div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {role || 'Cashier'}
              </div>
            </div>
          </div>

          {/* Lock Terminal Button */}
          <button
            type="button"
            onClick={lockApp}
            title="Lock POS Terminal (Idle Lock)"
            aria-label="Lock terminal"
            className="p-2 text-slate-300 hover:text-amber-400 hover:bg-slate-800 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center transition-subtle cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <Lock className="w-5 h-5" />
          </button>

          {/* Sign Out Button */}
          <button
            type="button"
            onClick={signOut}
            title="Sign Out"
            aria-label="Sign out"
            className="p-2 text-slate-300 hover:text-rose-400 hover:bg-slate-800 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center transition-subtle cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* -------------------------------------------------------------------- */}
      {/* 2. BODY: COLLAPSIBLE SIDEBAR + MAIN CONTENT                          */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Collapsible Sidebar */}
        <aside
          data-app-chrome="true"
          className={`hidden lg:flex lg:flex-col ${
            isSidebarCollapsed ? 'w-20' : 'w-64'
          } bg-slate-900 border-r border-slate-800 flex-shrink-0 transition-subtle duration-200`}
        >
          {/* Grouped Navigation Links */}
          <div className="flex-1 py-4 px-3 space-y-6 overflow-y-auto">
            {sections.map((secName) => {
              const secItems = allowedNavItems.filter((i) => i.section === secName);
              if (secItems.length === 0) return null;

              return (
                <div key={secName} className="space-y-1">
                  {!isSidebarCollapsed && (
                    <div className="px-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      {secName}
                    </div>
                  )}

                  {secItems.map((item) => {
                    const isActive = location.pathname === item.to;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        title={isSidebarCollapsed ? item.label : undefined}
                        className={`flex items-center ${
                          isSidebarCollapsed ? 'justify-center px-0' : 'px-3.5 space-x-3'
                        } py-2.5 rounded-xl text-sm font-semibold transition-subtle min-h-[44px] cursor-pointer ${
                          isActive
                            ? 'bg-brand-600 text-white shadow-raised'
                            : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                        }`}
                      >
                        <span className={isActive ? 'text-white' : 'text-slate-400'}>
                          {item.icon}
                        </span>
                        {!isSidebarCollapsed && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Sidebar Footer with Collapse Toggle & Staff Card */}
          <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
            {!isSidebarCollapsed ? (
              <div className="flex items-center space-x-2.5 min-w-0">
                <Avatar
                  name={profile?.full_name || 'Staff'}
                  role={role || 'cashier'}
                  size="sm"
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-200 truncate">
                    {profile?.full_name || 'Staff User'}
                  </div>
                  <div className="text-[10px] font-mono text-brand-400 font-bold uppercase">
                    {role || 'Cashier'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mx-auto">
                <Avatar
                  name={profile?.full_name || 'Staff'}
                  role={role || 'cashier'}
                  size="sm"
                />
              </div>
            )}

            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-subtle cursor-pointer focus:outline-none"
            >
              {isSidebarCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6 mb-16 lg:mb-0 transition-subtle">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 3. MOBILE & TABLET BOTTOM DOCK (< 1024px)                            */}
      {/* -------------------------------------------------------------------- */}
      <nav
        data-app-chrome="true"
        aria-label="Bottom Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-slate-900 border-t border-slate-800 flex items-center justify-around h-16 px-2 shadow-overlay"
      >
        <NavLink
          to="/pos"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 h-full min-h-[44px] text-xs font-semibold transition-subtle ${
              isActive ? 'text-brand-400' : 'text-slate-400 hover:text-slate-200'
            }`
          }
        >
          <ShoppingCart className="w-5 h-5 mb-0.5" />
          <span>POS</span>
        </NavLink>

        <NavLink
          to="/sales"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 h-full min-h-[44px] text-xs font-semibold transition-subtle ${
              isActive ? 'text-brand-400' : 'text-slate-400 hover:text-slate-200'
            }`
          }
        >
          <Receipt className="w-5 h-5 mb-0.5" />
          <span>Sales</span>
        </NavLink>

        <NavLink
          to="/customers"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 h-full min-h-[44px] text-xs font-semibold transition-subtle ${
              isActive ? 'text-brand-400' : 'text-slate-400 hover:text-slate-200'
            }`
          }
        >
          <Users className="w-5 h-5 mb-0.5" />
          <span>Customers</span>
        </NavLink>

        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="flex flex-col items-center justify-center flex-1 h-full min-h-[44px] text-xs font-semibold text-slate-400 hover:text-slate-200 focus:outline-none cursor-pointer"
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span>Menu</span>
        </button>
      </nav>

      {/* -------------------------------------------------------------------- */}
      {/* 4. MOBILE SLIDE-OUT DRAWER                                           */}
      {/* -------------------------------------------------------------------- */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            onClick={() => setMobileDrawerOpen(false)}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm"
          />

          <div className="relative w-72 max-w-[80vw] bg-slate-900 text-white h-full flex flex-col shadow-overlay z-10 transition-subtle">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Store className="w-5 h-5 text-brand-400" />
                <span className="font-bold text-base truncate">{shopName}</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Close menu"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Shift & User status in Drawer */}
            <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-200">{profile?.full_name}</div>
                <div className="text-[10px] text-slate-400 uppercase font-mono">{role}</div>
              </div>
              {isShiftOpen ? (
                <Badge variant="success" size="sm" dot>
                  Shift Open
                </Badge>
              ) : (
                <Badge variant="warning" size="sm" dot>
                  No Shift
                </Badge>
              )}
            </div>

            {/* Drawer Links */}
            <div className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
              {allowedNavItems.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileDrawerOpen(false)}
                    className={`flex items-center space-x-3 px-3 py-3 rounded-xl text-sm font-semibold min-h-[44px] transition-subtle ${
                      isActive
                        ? 'bg-brand-600 text-white shadow-subtle'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>

            {/* Drawer Actions */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  lockApp();
                }}
                className="flex-1 flex items-center justify-center py-2.5 px-3 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer shadow-subtle"
              >
                <Lock className="w-4 h-4 mr-1.5" />
                Lock
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  signOut();
                }}
                className="flex-1 flex items-center justify-center py-2.5 px-3 min-h-[44px] rounded-xl bg-rose-900/40 hover:bg-rose-900/60 text-xs font-semibold text-rose-300 border border-rose-800/40 cursor-pointer shadow-subtle"
              >
                <LogOut className="w-4 h-4 mr-1.5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenShift={() => setOpenShiftModalOpen(true)}
        onCloseShift={isShiftOpen ? () => setCloseShiftModalOpen(true) : undefined}
      />

      {/* Cashier Shift Management Modals */}
      <OpenShiftModal
        isOpen={openShiftModalOpen}
        onClose={() => setOpenShiftModalOpen(false)}
        onSuccess={() => {
          setOpenShiftModalOpen(false);
          refetchShift();
        }}
      />

      <CloseShiftModal
        isOpen={closeShiftModalOpen}
        shift={shift || null}
        onClose={() => setCloseShiftModalOpen(false)}
        onSuccess={() => {
          refetchShift();
        }}
      />

      <CashMovementModal
        isOpen={cashMovementModalOpen}
        shift={shift || null}
        onClose={() => setCashMovementModalOpen(false)}
        onSuccess={() => {
          setCashMovementModalOpen(false);
          refetchShift();
        }}
      />

      <XReportModal
        isOpen={xReportModalOpen}
        shift={shift || null}
        onClose={() => setXReportModalOpen(false)}
      />

      {/* Multi-Factor Authentication Modals */}
      <MfaEnrollModal
        isOpen={!!needsMfaEnrollment}
        isMandatory={role === 'owner'}
      />
      <MfaChallengeModal
        isOpen={!!needsMfaChallenge}
      />
    </div>
  );
};
