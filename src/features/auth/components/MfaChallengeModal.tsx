import React, { useState } from 'react';
import { ShieldCheck, Lock, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useAuth } from '../hooks/useAuth';

interface MfaChallengeModalProps {
  isOpen: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const MfaChallengeModal: React.FC<MfaChallengeModalProps> = ({
  isOpen,
  onSuccess,
  onCancel,
}) => {
  const { verifyMfaCode, signOut, user } = useAuth();
  const [code, setCode] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setError('Please enter your 6-digit authenticator code.');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      if (!verifyMfaCode) {
        throw new Error('MFA verification is unavailable.');
      }
      const res = await verifyMfaCode(cleanCode);
      if (res.success) {
        onSuccess?.();
      } else {
        setError(res.error || 'Invalid authentication code. Please check your authenticator and try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 p-6 text-white text-center">
          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-md">
            <Lock className="w-6 h-6 text-purple-300" />
          </div>
          <h2 className="text-xl font-bold">Two-Factor Challenge</h2>
          <p className="text-xs text-slate-300 mt-1">
            Enter the 6-digit verification code from your authenticator app for <span className="text-white font-medium">{user?.email}</span>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 text-center">
              Authenticator Code
            </label>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="text-center font-mono tracking-widest text-2xl font-bold py-3"
              autoFocus
            />
          </div>

          <div className="space-y-2 pt-2">
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isVerifying}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Verify Session
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-xs text-slate-500 hover:text-rose-600"
              onClick={() => {
                onCancel?.();
                signOut();
              }}
            >
              Cancel & Sign Out
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

