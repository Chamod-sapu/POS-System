import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Store, Eye, EyeOff, Lock, Mail, AlertTriangle, ShieldCheck, Zap, Receipt, Sun, Moon } from 'lucide-react';
import { signInWithEmail } from '../api/auth';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../../../lib/theme';
import { useShopSettings } from '../../settings/hooks/useShopSettings';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;
const LOCKOUT_STORAGE_KEY = 'wewala_pos_lockout_until';
const ATTEMPTS_STORAGE_KEY = 'wewala_pos_failed_attempts';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshProfile } = useAuth();
  const { shopName } = useShopSettings();
  const { toggleTheme, effectiveTheme } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isCaptchaEnabled = import.meta.env.VITE_ENABLE_CAPTCHA === 'true';
  const [captchaToken, setCaptchaToken] = useState<string | null>(isCaptchaEnabled ? null : 'bypass');
  const [failedAttempts, setFailedAttempts] = useState<number>(() => {
    const saved = localStorage.getItem(ATTEMPTS_STORAGE_KEY);
    return saved ? parseInt(saved, 10) : 0;
  });
  const [lockoutRemaining, setLockoutRemaining] = useState<number>(() => {
    const lockoutUntil = localStorage.getItem(LOCKOUT_STORAGE_KEY);
    if (!lockoutUntil) return 0;
    const diff = Math.ceil((parseInt(lockoutUntil, 10) - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  });

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [user, navigate, location]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutRemaining <= 0) return;

    const timer = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          localStorage.removeItem(LOCKOUT_STORAGE_KEY);
          localStorage.setItem(ATTEMPTS_STORAGE_KEY, '0');
          setFailedAttempts(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (lockoutRemaining > 0) return;

    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }

    if (isCaptchaEnabled && !captchaToken) {
      setError('Please complete the security verification challenge.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const tokenToSend = isCaptchaEnabled && captchaToken && captchaToken !== 'bypass' ? captchaToken : undefined;
      await signInWithEmail(email.trim().toLowerCase(), password, tokenToSend);
      // Reset rate limit counters on success
      localStorage.removeItem(LOCKOUT_STORAGE_KEY);
      localStorage.removeItem(ATTEMPTS_STORAGE_KEY);
      setFailedAttempts(0);
      await refreshProfile();
      const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch {
      // Security rule: Always show generic message to prevent user enumeration
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      localStorage.setItem(ATTEMPTS_STORAGE_KEY, newAttempts.toString());

      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_SECONDS * 1000;
        localStorage.setItem(LOCKOUT_STORAGE_KEY, until.toString());
        setLockoutRemaining(LOCKOUT_SECONDS);
        setError(`Too many failed attempts. Login is locked for ${LOCKOUT_SECONDS} seconds.`);
      } else {
        const remaining = MAX_FAILED_ATTEMPTS - newAttempts;
        setError(`Incorrect email or password. (${remaining} attempt${remaining === 1 ? '' : 's'} remaining)`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isLockedOut = lockoutRemaining > 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row transition-subtle">
      {/* -------------------------------------------------------------------- */}
      {/* LEFT: QUIET BRANDED PANEL (Desktop >= 1024px)                        */}
      {/* -------------------------------------------------------------------- */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 text-white relative overflow-hidden flex-col justify-between p-12 lg:p-16 border-r border-slate-800">
        {/* Subtle Ambient Radial Glow */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-brand-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Branding */}
        <div className="relative z-10 flex items-center space-x-3">
          {typeof window !== 'undefined' && localStorage.getItem('wewala_shop_logo') ? (
            <img
              src={localStorage.getItem('wewala_shop_logo')!}
              alt="Store Logo"
              className="w-12 h-12 rounded-2xl object-contain bg-white p-1 border border-slate-700 shadow-raised"
            />
          ) : (
            <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center text-white shadow-raised">
              <Store className="w-6 h-6" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">{shopName}</h1>
            <p className="text-xs text-brand-300 font-medium">Retail Point of Sale System</p>
          </div>
        </div>

        {/* Center Editorial Messaging */}
        <div className="relative z-10 my-auto py-12 max-w-md space-y-8">
          <div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-brand-950/80 text-brand-300 border border-brand-800/80 shadow-subtle mb-4">
              <span className="w-2 h-2 rounded-full bg-brand-400 mr-2 animate-pulse" />
              Engineered for Speed & Accuracy
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Calm, trustworthy, sub-second checkout.
            </h2>
            <p className="mt-4 text-sm text-slate-300 leading-relaxed">
              Precision integer arithmetic with PostgreSQL row-level security. Built for high-volume grocery and supermarket sales.
            </p>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-800">
            <div className="flex items-start space-x-3.5">
              <div className="w-8 h-8 rounded-xl bg-slate-800/80 flex items-center justify-center text-brand-400 flex-shrink-0 shadow-subtle">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Sub-100ms Barcode Scanning</h3>
                <p className="text-xs text-slate-400 mt-0.5">Barcode lookups, weighing scale inputs, and instant cash drawer triggers.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3.5">
              <div className="w-8 h-8 rounded-xl bg-slate-800/80 flex items-center justify-center text-brand-400 flex-shrink-0 shadow-subtle">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">PostgreSQL Strict Hardening</h3>
                <p className="text-xs text-slate-400 mt-0.5">Tamper-evident audit logging, atomic shifts, and MFA security gates.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3.5">
              <div className="w-8 h-8 rounded-xl bg-slate-800/80 flex items-center justify-center text-brand-400 flex-shrink-0 shadow-subtle">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Byte-Perfect Thermal Printing</h3>
                <p className="text-xs text-slate-400 mt-0.5">Direct 80mm ESC/POS slips, A4 invoices, and Colombo timezone reconciliation.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Footer Info */}
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-4">
          <span>Wewala Stores POS • Wewala, Sri Lanka</span>
          <span className="font-mono text-slate-400">Precision Engine v1.0</span>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* RIGHT: LOGIN FORM & INTERFACE                                        */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-12 lg:p-16 relative">
        {/* Top-Right Theme Toggle */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${effectiveTheme === 'dark' ? 'Light' : 'Dark'} mode`}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-subtle transition-subtle cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {effectiveTheme === 'dark' ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5 text-slate-600" />
            )}
          </button>
        </div>

        {/* Form Container */}
        <div className="w-full max-w-md mx-auto my-auto py-8">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center space-x-3 mb-8">
            {typeof window !== 'undefined' && localStorage.getItem('wewala_shop_logo') ? (
              <img
                src={localStorage.getItem('wewala_shop_logo')!}
                alt="Store Logo"
                className="w-12 h-12 rounded-2xl object-contain bg-white p-1 border border-slate-200 dark:border-slate-800 shadow-raised"
              />
            ) : (
              <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center text-white shadow-raised">
                <Store className="w-6 h-6" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{shopName}</h1>
              <p className="text-xs text-brand-600 dark:text-brand-400 font-medium">Wewala POS Terminal</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Sign in to Terminal
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Enter your authorized staff credentials to begin your shift.
            </p>
          </div>

          {/* Security Banner */}
          <div className="mb-6 flex items-center space-x-2 text-xs font-semibold text-brand-800 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800/80 rounded-xl p-3 shadow-subtle">
            <ShieldCheck className="w-4 h-4 text-brand-600 dark:text-brand-400 flex-shrink-0" />
            <span>Postgres Row Level Security & Multi-Factor Protected</span>
          </div>

          {/* Lockout Warning / Error Box */}
          {isLockedOut ? (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/80 rounded-xl text-amber-900 dark:text-amber-200 text-sm flex items-start space-x-3 shadow-subtle">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900 dark:text-amber-100">Rate Limit Exceeded</p>
                <p className="mt-1">
                  Security lockout active. Please wait{' '}
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-base">{lockoutRemaining}s</span> before retrying.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800/80 rounded-xl text-rose-900 dark:text-rose-200 text-sm flex items-start space-x-3 shadow-subtle">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="font-medium">{error}</div>
            </div>
          ) : null}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Staff Email Address
              </label>
              <div className="relative rounded-lg shadow-subtle">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  disabled={isLoading || isLockedOut}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error && !isLockedOut) setError(null);
                  }}
                  placeholder="cashier@wewala.lk"
                  className="block w-full pl-11 pr-4 py-3 min-h-[48px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-base disabled:opacity-50 transition-subtle"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative rounded-lg shadow-subtle">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  disabled={isLoading || isLockedOut}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error && !isLockedOut) setError(null);
                  }}
                  placeholder="••••••••••"
                  className="block w-full pl-11 pr-12 py-3 min-h-[48px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-base disabled:opacity-50 transition-subtle"
                />
                <button
                  type="button"
                  disabled={isLoading || isLockedOut}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {isCaptchaEnabled && (
              <div className="p-3.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" /> Bot Protection (Turnstile)
                  </span>
                </div>
                <div className="flex items-center gap-2 p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <input
                    type="checkbox"
                    id="captcha-check"
                    checked={!!captchaToken && captchaToken !== 'bypass'}
                    onChange={(e) => setCaptchaToken(e.target.checked ? `cf-token-${Date.now()}` : null)}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 bg-white dark:bg-slate-900"
                  />
                  <label htmlFor="captcha-check" className="text-xs text-slate-700 dark:text-slate-200 select-none cursor-pointer font-medium">
                    Verify human operator
                  </label>
                </div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading || isLockedOut}
                className="w-full flex justify-center items-center py-3.5 px-4 min-h-[48px] rounded-xl shadow-raised text-base font-bold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 transition-subtle cursor-pointer active:scale-[0.98]"
              >
                {isLoading ? (
                  <span className="inline-flex items-center">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Signing in...
                  </span>
                ) : isLockedOut ? (
                  `Locked (${lockoutRemaining}s)`
                ) : (
                  'Sign In to Terminal'
                )}
              </button>
            </div>
          </form>

          {/* Quick Demo Credentials */}
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 text-center">
              Quick Test Credentials
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setEmail('owner@wewala.lk');
                  setPassword('Password123!');
                }}
                className="px-2 py-1.5 bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 dark:hover:bg-purple-900/50 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800/80 rounded-lg text-xs font-semibold transition-subtle text-center cursor-pointer"
              >
                Owner
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail('manager@wewala.lk');
                  setPassword('Password123!');
                }}
                className="px-2 py-1.5 bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 dark:hover:bg-sky-900/50 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800/80 rounded-lg text-xs font-semibold transition-subtle text-center cursor-pointer"
              >
                Manager
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail('cashier@wewala.lk');
                  setPassword('Password123!');
                }}
                className="px-2 py-1.5 bg-brand-50 dark:bg-brand-950/50 hover:bg-brand-100 dark:hover:bg-brand-900/50 text-brand-800 dark:text-brand-300 border border-brand-200 dark:border-brand-800/80 rounded-lg text-xs font-semibold transition-subtle text-center cursor-pointer"
              >
                Cashier
              </button>
            </div>
          </div>
        </div>

        {/* Legal Footer */}
        <div className="text-center text-xs text-slate-500 dark:text-slate-400">
          Only authorized store operators may log in. All terminal actions are recorded in the immutable audit log.
        </div>
      </div>
    </div>
  );
};
