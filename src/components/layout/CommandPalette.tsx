import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ShoppingCart,
  Receipt,
  Users,
  Package,
  Boxes,
  Truck,
  ClipboardList,
  BarChart3,
  Settings,
  ShieldCheck,
  Lock,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  Clock,
  LayoutGrid,
} from 'lucide-react';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { useTheme } from '../../lib/theme';
import { soundEffects } from '../../lib/audio';
import { Kbd } from '../ui/Kbd';

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Navigation' | 'Actions';
  icon: React.ReactNode;
  action: () => void;
  allowedRoles?: ('owner' | 'manager' | 'cashier')[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenShift?: () => void;
  onCloseShift?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onOpenShift,
  onCloseShift,
}) => {
  const navigate = useNavigate();
  const { role, lockApp } = useAuth();
  const { toggleTheme, effectiveTheme, toggleDensity, density } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Define commands
  const allCommands: CommandItem[] = [
    // Navigation
    {
      id: 'nav-pos',
      title: 'POS Register',
      subtitle: 'Open point-of-sale checkout register',
      category: 'Navigation',
      icon: <ShoppingCart className="w-4 h-4 text-brand-600" />,
      action: () => navigate('/pos'),
      allowedRoles: ['cashier', 'manager', 'owner'],
    },
    {
      id: 'nav-dashboard',
      title: 'Dashboard Overview',
      subtitle: 'Store performance metrics, sales chart and alerts',
      category: 'Navigation',
      icon: <BarChart3 className="w-4 h-4 text-brand-600" />,
      action: () => navigate('/'),
      allowedRoles: ['manager', 'owner'],
    },
    {
      id: 'nav-sales',
      title: role === 'cashier' ? 'My Sales' : 'Sales & Bills',
      subtitle: 'Browse bills, reprints, returns and customer receipts',
      category: 'Navigation',
      icon: <Receipt className="w-4 h-4 text-brand-600" />,
      action: () => navigate('/sales'),
      allowedRoles: ['cashier', 'manager', 'owner'],
    },
    {
      id: 'nav-customers',
      title: 'Customer Directory',
      subtitle: 'Lookup customer store credits and loyalty points',
      category: 'Navigation',
      icon: <Users className="w-4 h-4 text-brand-600" />,
      action: () => navigate('/customers'),
      allowedRoles: ['cashier', 'manager', 'owner'],
    },
    {
      id: 'nav-products',
      title: 'Products & Catalog',
      subtitle: 'Manage items, barcodes, pricing, and VAT flags',
      category: 'Navigation',
      icon: <Package className="w-4 h-4 text-brand-600" />,
      action: () => navigate('/products'),
      allowedRoles: ['manager', 'owner'],
    },
    {
      id: 'nav-inventory',
      title: 'Stock & Batches',
      subtitle: 'FIFO batches, expiries, and stock ledger adjustments',
      category: 'Navigation',
      icon: <Boxes className="w-4 h-4 text-brand-600" />,
      action: () => navigate('/inventory'),
      allowedRoles: ['manager', 'owner'],
    },
    {
      id: 'nav-suppliers',
      title: 'Suppliers Directory',
      subtitle: 'Supplier ledger, payment history, and contact details',
      category: 'Navigation',
      icon: <Truck className="w-4 h-4 text-brand-600" />,
      action: () => navigate('/suppliers'),
      allowedRoles: ['manager', 'owner'],
    },
    {
      id: 'nav-purchasing',
      title: 'Goods Receiving (GRN)',
      subtitle: 'Record supplier deliveries and update cost history',
      category: 'Navigation',
      icon: <ClipboardList className="w-4 h-4 text-brand-600" />,
      action: () => navigate('/purchasing'),
      allowedRoles: ['manager', 'owner'],
    },
    {
      id: 'nav-reports',
      title: 'Financial Reports & Z-Reports',
      subtitle: 'P&L statements, VAT filing, and stock valuation',
      category: 'Navigation',
      icon: <BarChart3 className="w-4 h-4 text-brand-600" />,
      action: () => navigate('/reports'),
      allowedRoles: ['manager', 'owner'],
    },
    {
      id: 'nav-settings',
      title: 'Shop Settings',
      subtitle: 'VAT rates, receipt header, SMS gateway, and printer settings',
      category: 'Navigation',
      icon: <Settings className="w-4 h-4 text-brand-600" />,
      action: () => navigate('/settings'),
      allowedRoles: ['manager', 'owner'],
    },
    {
      id: 'nav-staff',
      title: 'Staff Management',
      subtitle: 'User roles, cashier PINs, and access provisioning',
      category: 'Navigation',
      icon: <Users className="w-4 h-4 text-brand-600" />,
      action: () => navigate('/staff'),
      allowedRoles: ['owner'],
    },
    {
      id: 'nav-audit',
      title: 'Security Audit Log',
      subtitle: 'Immutable record of voids, price edits, and staff logins',
      category: 'Navigation',
      icon: <ShieldCheck className="w-4 h-4 text-brand-600" />,
      action: () => navigate('/audit'),
      allowedRoles: ['owner'],
    },

    // Actions
    {
      id: 'act-theme',
      title: `Switch to ${effectiveTheme === 'dark' ? 'Light' : 'Dark'} Mode`,
      subtitle: `Currently using ${effectiveTheme} theme`,
      category: 'Actions',
      icon: effectiveTheme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-500" />,
      action: () => toggleTheme(),
    },
    {
      id: 'act-density',
      title: `Toggle Density (${density === 'comfortable' ? 'Switch to Compact' : 'Switch to Comfortable'})`,
      subtitle: `Currently: ${density} density mode`,
      category: 'Actions',
      icon: <LayoutGrid className="w-4 h-4 text-sky-500" />,
      action: () => toggleDensity(),
    },
    {
      id: 'act-mute',
      title: soundEffects.getMuted() ? 'Unmute Audio Feedback' : 'Mute Audio Feedback',
      subtitle: 'Barcode beep and cash drawer sound effects',
      category: 'Actions',
      icon: soundEffects.getMuted() ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4 text-emerald-500" />,
      action: () => soundEffects.toggleMute(),
    },
    {
      id: 'act-lock',
      title: 'Lock POS Terminal',
      subtitle: 'Requires password/PIN to unlock',
      category: 'Actions',
      icon: <Lock className="w-4 h-4 text-amber-500" />,
      action: () => lockApp(),
    },
  ];

  // Add shift actions if available
  if (onOpenShift) {
    allCommands.push({
      id: 'act-open-shift',
      title: 'Open Cashier Shift',
      subtitle: 'Count opening float and begin till session',
      category: 'Actions',
      icon: <Clock className="w-4 h-4 text-emerald-500" />,
      action: () => onOpenShift(),
      allowedRoles: ['cashier', 'manager', 'owner'],
    });
  }

  if (onCloseShift) {
    allCommands.push({
      id: 'act-close-shift',
      title: 'Close Cashier Shift (Z-Report)',
      subtitle: 'Reconcile drawer cash and print shift summary',
      category: 'Actions',
      icon: <Clock className="w-4 h-4 text-rose-500" />,
      action: () => onCloseShift(),
      allowedRoles: ['cashier', 'manager', 'owner'],
    });
  }

  // Filter commands by role and query
  const filteredCommands = allCommands.filter((cmd) => {
    if (cmd.allowedRoles && role && !cmd.allowedRoles.includes(role)) {
      return false;
    }
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      cmd.title.toLowerCase().includes(q) ||
      (cmd.subtitle && cmd.subtitle.toLowerCase().includes(q))
    );
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((idx) => (idx + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((idx) =>
        idx === 0 ? filteredCommands.length - 1 : idx - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-start justify-center pt-16 sm:pt-24 p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-overlay border border-slate-200 dark:border-slate-800 overflow-hidden outline-none transition-subtle">
        {/* Search Input Bar */}
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center space-x-3 bg-slate-50/60 dark:bg-slate-800/40">
          <Search className="w-5 h-5 text-slate-400 dark:text-slate-500 ml-1.5 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or jump to page... (e.g. POS, Sales, Dark)"
            className="w-full bg-transparent text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>

        {/* Command List */}
        <div className="max-h-[380px] overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/60">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
              No matching commands or destinations found for "{query}".
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center space-x-3.5 px-3 py-2.5 rounded-xl transition-subtle cursor-pointer select-none ${
                    isSelected
                      ? 'bg-brand-50 dark:bg-brand-950/60 text-brand-900 dark:text-brand-100'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isSelected
                        ? 'bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {cmd.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{cmd.title}</div>
                    {cmd.subtitle && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {cmd.subtitle}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {cmd.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Command Palette Footer Hints */}
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between select-none">
          <div className="flex items-center space-x-2">
            <span>Navigate</span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            <span>Select</span>
            <Kbd>↵</Kbd>
          </div>
          <div className="flex items-center space-x-1.5">
            <span>Wewala Quick Actions</span>
          </div>
        </div>
      </div>
    </div>
  );
};

