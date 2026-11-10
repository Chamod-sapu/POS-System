import React, { useState, useEffect } from 'react';
import { ShieldAlert, Key, CheckCircle, AlertTriangle, Copy, Check } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useAuth } from '../hooks/useAuth';

interface MfaEnrollModalProps {
  isOpen: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
  isMandatory?: boolean;
}

export const MfaEnrollModal: React.FC<MfaEnrollModalProps> = ({
  isOpen,
  onSuccess,
  onCancel,
  isMandatory = false,
}) => {
  const { enrollTotp, verifyEnrollment, signOut } = useAuth();
  const [factorId, setFactorId] = useState<string>('');
  const [qrCodeSvg, setQrCodeSvg] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [verifyCode, setVerifyCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    setIsLoading(true);
    setError(null);

    if (!enrollTotp) {
      setError('MFA enrollment service unavailable.');
      setIsLoading(false);
      return;
    }

    enrollTotp()
      .then((data) => {
        if (!active) return;
        setFactorId(data.id);
        setQrCodeSvg(data.qrCode);
        setSecret(data.secret);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to generate TOTP enrollment key');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, enrollTotp]);

  if (!isOpen) return null;

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim() || verifyCode.trim().length !== 6) {
      setError('Please enter the 6-digit verification code from your authenticator app.');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      if (!verifyEnrollment) {
        throw new Error('MFA enrollment service unavailable.');
      }
      const res = await verifyEnrollment(factorId, verifyCode.trim());
      if (res.success) {
        onSuccess?.();
      } else {
        setError(res.error || 'Invalid verification code. Please check your authenticator and try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 to-indigo-800 p-6 text-white text-center">
          <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-3 backdrop-blur-md">
            <ShieldAlert className="w-6 h-6 text-purple-200" />
          </div>
          <h2 className="text-xl font-bold">Two-Factor Authentication Setup</h2>
          <p className="text-xs text-purple-100 mt-1">
            {isMandatory
              ? 'MFA is mandatory for Store Owner accounts before accessing the POS system.'
              : 'Add an extra layer of security to your management account.'}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Generating secure authenticator key...
            </div>
          ) : (
            <>
              {/* Step 1: Scan QR */}
              <div className="text-center space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Step 1: Scan with Authenticator App
                </p>
                <div className="inline-block p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
                  <img
                    src={qrCodeSvg.startsWith('data:') ? qrCodeSvg : `data:image/svg+xml;utf8,${encodeURIComponent(qrCodeSvg)}`}
                    alt="TOTP QR Code"
                    className="w-48 h-48 mx-auto"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Use Google Authenticator, Authy, or 1Password to scan this QR code.
                </p>
              </div>

              {/* Manual Secret Key */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1 font-medium">
                    <Key className="w-3.5 h-3.5 text-slate-400" /> Or enter code manually
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="flex items-center gap-1 text-purple-700 hover:text-purple-800 font-semibold"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="font-mono text-xs text-slate-800 break-all select-all font-semibold">
                  {secret}
                </div>
              </div>

              {/* Step 2: Verification Input */}
              <form onSubmit={handleVerify} className="space-y-4 pt-2 border-t border-slate-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 text-center">
                  Step 2: Enter 6-Digit Code
                </p>
                <div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                    className="text-center font-mono tracking-widest text-lg font-bold"
                    autoFocus
                  />
                </div>

                <div className="flex gap-2">
                  {isMandatory ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full text-slate-600 hover:text-rose-600"
                      onClick={() => signOut()}
                    >
                      Sign Out
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={onCancel}
                      disabled={isVerifying}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full"
                    isLoading={isVerifying}
                    leftIcon={<CheckCircle className="w-4 h-4" />}
                  >
                    Verify & Activate
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
