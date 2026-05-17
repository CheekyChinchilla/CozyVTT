// ============================================
// MFA Setup Page
// Per SOW Section 19.3
//
// Two-step flow:
//   Step 1: Scan QR code → enter 6-digit TOTP to verify
//   Step 2: Save backup codes (shown once)
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, Copy, CheckCircle, AlertTriangle, Loader2, ChevronRight } from 'lucide-react';

type Step = 'loading' | 'scan' | 'backup-codes' | 'error';

export default function MFASetupPage() {
  const navigate = useNavigate();
  const { authenticated, setupMFA, completeMFASetup } = useAuth();

  // Setup data
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // UI state
  const [step, setStep] = useState<Step>('loading');
  const [token, setToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [secretCopied, setSecretCopied] = useState(false);
  const [codesCopied, setCodesCopied] = useState(false);
  const [codesAcknowledged, setCodesAcknowledged] = useState(false);
  const [initError, setInitError] = useState('');

  // Redirect if not authenticated
  useEffect(() => {
    if (!authenticated) {
      navigate('/auth/login', { replace: true });
    }
  }, [authenticated, navigate]);

  // Kick off MFA setup on mount
  useEffect(() => {
    if (!authenticated) return;

    const initSetup = async () => {
      try {
        const data = await setupMFA();
        setQrCodeUrl(data.qrCodeUrl);
        setSecret(data.secret);
        setStep('scan');
      } catch (err: any) {
        setInitError(err.response?.data?.message || 'Failed to initiate MFA setup');
        setStep('error');
      }
    };

    initSetup();
  }, [authenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ============================================
  // Handlers
  // ============================================

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setTokenError('');

    if (token.length !== 6) {
      setTokenError('Code must be 6 digits');
      return;
    }

    try {
      setVerifying(true);
      const result = await completeMFASetup(token);
      setBackupCodes(result.backupCodes);
      setStep('backup-codes');
    } catch (err: any) {
      setTokenError(err.response?.data?.message || 'Invalid code. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 2000);
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCodesCopied(true);
    setTimeout(() => setCodesCopied(false), 2000);
  };

  const handleDone = () => {
    navigate('/profile');
  };

  // ============================================
  // Render
  // ============================================

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20 px-4 py-8">
      <div className="glass-panel max-w-lg w-full p-8 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-moss-green/10 rounded-full p-3">
              <Shield className="w-8 h-8 text-moss-green" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-moss-green font-heading">
            Set Up Two-Factor Authentication
          </h1>
          <p className="mt-1 text-sm text-warm-gray">
            {step === 'backup-codes'
              ? 'MFA enabled! Save your backup codes.'
              : 'Add an extra layer of security to your account.'}
          </p>
        </div>

        {/* ── Loading ── */}
        {step === 'loading' && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-moss-green animate-spin" />
          </div>
        )}

        {/* ── Error ── */}
        {step === 'error' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{initError}</p>
            </div>
            <button onClick={() => navigate('/profile')} className="btn-secondary w-full">
              Back to Profile
            </button>
          </div>
        )}

        {/* ── Step 1: Scan QR code ── */}
        {step === 'scan' && (
          <div className="space-y-6">
            {/* Instructions */}
            <ol className="text-sm text-warm-gray space-y-2 list-decimal list-inside">
              <li>Install an authenticator app (Google Authenticator, Authy, etc.)</li>
              <li>Scan the QR code below, or enter the secret key manually</li>
              <li>Enter the 6-digit code from your app to verify</li>
            </ol>

            {/* QR Code */}
            <div className="flex justify-center">
              <div className="p-3 bg-white rounded-xl border border-moss-green/20 inline-block">
                <img src={qrCodeUrl} alt="MFA QR Code" className="w-48 h-48" />
              </div>
            </div>

            {/* Manual Secret Key */}
            <div>
              <p className="text-xs font-medium text-stone-gray mb-1.5">Manual entry key</p>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-parchment/60 border border-moss-green/15">
                <code className="flex-1 text-sm font-mono text-moss-green break-all">{secret}</code>
                <button
                  onClick={copySecret}
                  className="flex-shrink-0 p-1.5 rounded hover:bg-moss-green/10 transition-colors"
                  title="Copy secret"
                >
                  {secretCopied ? (
                    <CheckCircle className="w-4 h-4 text-moss-green" />
                  ) : (
                    <Copy className="w-4 h-4 text-stone-gray" />
                  )}
                </button>
              </div>
            </div>

            {/* Verification Form */}
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-gray mb-1.5">
                  Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value.replace(/[^0-9]/g, ''));
                    setTokenError('');
                  }}
                  placeholder="000000"
                  className={`input-cozy w-full text-center text-2xl tracking-widest font-mono ${
                    tokenError ? 'border-red-400 focus:ring-red-400' : ''
                  }`}
                  autoFocus
                  autoComplete="one-time-code"
                />
                {tokenError && (
                  <p className="mt-1 text-xs text-red-600">{tokenError}</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/profile')}
                  disabled={verifying}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifying || token.length !== 6}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      Verify & Enable
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Step 2: Backup codes ── */}
        {step === 'backup-codes' && (
          <div className="space-y-5">
            {/* Success banner */}
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">MFA Enabled Successfully</p>
                <p className="text-xs text-green-700 mt-0.5">
                  Your account is now protected with two-factor authentication.
                </p>
              </div>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-3 p-4 rounded-lg bg-warm-amber/10 border border-warm-amber/30">
              <AlertTriangle className="w-5 h-5 text-warm-amber flex-shrink-0 mt-0.5" />
              <p className="text-sm text-stone-gray">
                <span className="font-semibold">Save these backup codes now.</span> They will not
                be shown again. Each code can only be used once to access your account if you lose
                your authenticator device.
              </p>
            </div>

            {/* Backup code grid */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-stone-gray uppercase tracking-wide">
                  Backup Codes (10 single-use)
                </p>
                <button
                  onClick={copyBackupCodes}
                  className="flex items-center gap-1 text-xs text-moss-green hover:text-moss-green/80 transition-colors"
                >
                  {codesCopied ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy all
                    </>
                  )}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 p-4 rounded-lg bg-parchment/60 border border-moss-green/15">
                {backupCodes.map((code, i) => (
                  <code
                    key={i}
                    className="text-sm font-mono text-moss-green text-center py-1.5 px-2 rounded bg-paper/60 border border-moss-green/10"
                  >
                    {code.slice(0, 4)}-{code.slice(4)}
                  </code>
                ))}
              </div>
            </div>

            {/* Acknowledge + Done */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={codesAcknowledged}
                onChange={(e) => setCodesAcknowledged(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-moss-green/30 text-moss-green focus:ring-moss-green/50"
              />
              <span className="text-sm text-stone-gray">
                I have saved my backup codes in a secure location.
              </span>
            </label>

            <button
              onClick={handleDone}
              disabled={!codesAcknowledged}
              className="btn-primary w-full"
            >
              Done — Return to Profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
