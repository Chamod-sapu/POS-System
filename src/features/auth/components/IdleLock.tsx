import React, { useState } from 'react';
import { Lock, Eye, EyeOff, LogOut, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const IdleLock: React.FC = () => {
  const { isLocked, user, profile, unlockApp, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLocked || !user) {
    return null;
  }

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your password to unlock');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await unlockApp(password);
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || 'Incorrect password. Please try again.');
    } else {
      setPassword('');
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="POS Terminal Locked"
      className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-700/40 p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
            <Lock className="w-8 h-8" aria-label="Locked terminal" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Terminal Locked</h2>
          <p className="text-sm text-slate-500 mt-1">
            Locked after 10 minutes of inactivity for security.
          </p>
        </div>

        {/* User Badge */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Active Staff</div>
            <div className="text-base font-bold text-slate-900">
              {profile?.full_name || user.email || 'Cashier'}
            </div>
            <div className="text-xs text-slate-500 capitalize">
              Role: <span className="font-semibold text-slate-700">{profile?.role || 'Staff'}</span>
            </div>
          </div>
          <div className="inline-flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            Cart Preserved
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-medium animate-shake">
            {error}
          </div>
        )}

        <form onSubmit={handleUnlock} className="space-y-4">
          <div>
            <label
              htmlFor="unlock-password"
              className="block text-sm font-semibold text-slate-700 mb-1"
            >
              Enter Password to Resume
            </label>
            <div className="relative">
              <input
                id="unlock-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                autoFocus
                placeholder="••••••••••"
                className="w-full px-4 py-3 min-h-[48px] rounded-lg border border-slate-300 text-slate-900 text-base focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none pr-12 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 focus:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-lg px-4 py-3 text-base shadow-sm hover:shadow transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 flex items-center justify-center"
          >
            {isSubmitting ? (
              <span className="inline-flex items-center">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Unlocking...
              </span>
            ) : (
              'Unlock Terminal'
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-200 text-center">
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center justify-center min-h-[44px] text-sm font-medium text-slate-600 hover:text-red-600 transition-colors focus:outline-none focus:underline"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Switch User or Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

