// ============================================
// MFA Setup Page
//
// Three-step flow:
//   Step 1: Confirm the current password (the server asks for it before it
//           issues a secret)
//   Step 2: Scan QR code → enter 6-digit TOTP to verify
//   Step 3: Save backup codes (shown once)
// ============================================

import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, Copy, CheckCircle, AlertTriangle, Loader2, ChevronRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import { apiErrorMessage } from '@/utils/errors';
import { copyText } from '@/utils/clipboard';

type Step = 'password' | 'scan' | 'backup-codes';

/** What the last press of a Copy button did; 'idle' once its note has gone. */
type CopyState = 'idle' | 'copied' | 'failed';

export default function MFASetupPage() {
  const navigate = useNavigate();
  const { authenticated, loading, setupMFA, completeMFASetup } = useAuth();

  // Setup data
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // UI state
  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [starting, setStarting] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [token, setToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [secretCopy, setSecretCopy] = useState<CopyState>('idle');
  const [codesCopy, setCodesCopy] = useState<CopyState>('idle');
  const [codesAcknowledged, setCodesAcknowledged] = useState(false);

  // The backup codes exist only on this page once two-factor authentication
  // is on, so leaving before they are marked saved asks first.
  const codesUnsaved = step === 'backup-codes' && !codesAcknowledged;
  useEffect(() => {
    if (!codesUnsaved) return undefined;
    const askFirst = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers show the dialog only when this is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', askFirst);
    return () => window.removeEventListener('beforeunload', askFirst);
  }, [codesUnsaved]);

  // ============================================
  // Handlers
  // ============================================

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (!password) {
      setPasswordError('Enter your current password');
      return;
    }

    try {
      setStarting(true);
      const data = await setupMFA(password);
      setQrCodeUrl(data.qrCodeUrl);
      setSecret(data.secret);
      setPassword('');
      setStep('scan');
    } catch (err) {
      setPasswordError(apiErrorMessage(err) || 'Failed to start MFA setup');
    } finally {
      setStarting(false);
    }
  };

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
    } catch (err) {
      setTokenError(apiErrorMessage(err) || 'Invalid code. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  // A failed copy stays on screen until the next press: the codes are shown
  // once, and the person has to know to copy them by hand.
  const copySecret = async () => {
    const copied = await copyText(secret);
    setSecretCopy(copied ? 'copied' : 'failed');
    if (copied) setTimeout(() => setSecretCopy('idle'), 2000);
  };

  const copyBackupCodes = async () => {
    const copied = await copyText(backupCodes.join('\n'));
    setCodesCopy(copied ? 'copied' : 'failed');
    if (copied) setTimeout(() => setCodesCopy('idle'), 2000);
  };

  const handleDone = () => {
    navigate('/profile');
  };

  // ============================================
  // Render
  // ============================================

  // Wait for the sign-in check a page load starts before deciding: a reload
  // during setup went to the sign-in page, and on to the dashboard, before it
  // had answered.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20" aria-live="polite">
        <Loader2 className="w-8 h-8 text-brand-ink animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20 px-4 py-8">
      <div className="glass-panel max-w-lg w-full p-8 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-moss-green/10 rounded-full p-3">
              <Shield className="w-8 h-8 text-brand-ink" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-brand-ink font-heading">
            Set Up Two-Factor Authentication
          </h1>
          <p className="mt-1 text-sm text-warm-gray">
            {step === 'backup-codes'
              ? 'MFA enabled! Save your backup codes.'
              : 'Add an extra layer of security to your account.'}
          </p>
        </div>

        {/* ── Step 1: Confirm the password ── */}
        {step === 'password' && (
          <form onSubmit={handleStart} className="space-y-4">
            <p className="text-sm text-warm-gray">
              Enter your current password to begin. This stops anyone else who has your
              account open from setting up an authenticator of their own.
            </p>
            <div>
              <label htmlFor="mfa-setup-password" className="block text-sm font-medium text-stone-gray mb-1.5">
                Current password
              </label>
              <input
                id="mfa-setup-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                disabled={starting}
                className={`input-cozy w-full ${passwordError ? 'border-danger/60 focus:ring-danger' : ''}`}
                autoFocus
                autoComplete="current-password"
              />
              {passwordError && (
                <p className="mt-1 text-xs text-danger-ink">{passwordError}</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                onClick={() => navigate('/profile')}
                disabled={starting}
                variant="secondary" className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={starting || !password}
                className="flex-1 flex items-center justify-center gap-2"
              >
                {starting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* ── Step 2: Scan QR code ── */}
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
                <code className="flex-1 text-sm font-mono text-brand-ink break-all">{secret}</code>
                <button
                  onClick={copySecret}
                  className="flex-shrink-0 p-1.5 rounded hover:bg-moss-green/10 transition-colors"
                  title="Copy secret"
                >
                  {secretCopy === 'copied' ? (
                    <CheckCircle className="w-4 h-4 text-brand-ink" />
                  ) : (
                    <Copy className="w-4 h-4 text-stone-gray" />
                  )}
                </button>
              </div>
              {secretCopy === 'failed' && (
                <p role="status" className="mt-1 text-xs text-danger-ink">
                  Copy failed. Select the key and copy it by hand.
                </p>
              )}
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
                    tokenError ? 'border-danger/60 focus:ring-danger' : ''
                  }`}
                  autoFocus
                  autoComplete="one-time-code"
                />
                {tokenError && (
                  <p className="mt-1 text-xs text-danger-ink">{tokenError}</p>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={() => navigate('/profile')}
                  disabled={verifying}
                  variant="secondary" className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={verifying || token.length !== 6}
                  className="flex-1 flex items-center justify-center gap-2"
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
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* ── Step 3: Backup codes ── */}
        {step === 'backup-codes' && (
          <div className="space-y-5">
            {/* Success banner */}
            <div className="flex items-center gap-3 p-4 rounded-lg bg-success/10 border border-success/30">
              <CheckCircle className="w-5 h-5 text-success-ink flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-success-ink">MFA Enabled Successfully</p>
                <p className="text-xs text-success-ink mt-0.5">
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
                  className="flex items-center gap-1 text-xs text-brand-ink hover:text-brand-ink/80 transition-colors"
                >
                  {codesCopy === 'copied' ? (
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
              {codesCopy === 'failed' && (
                <p role="status" className="mb-2 text-xs text-danger-ink">
                  Copy failed. Select the codes and copy them by hand.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 p-4 rounded-lg bg-parchment/60 border border-moss-green/15">
                {backupCodes.map((code, i) => (
                  <code
                    key={i}
                    className="text-sm font-mono text-brand-ink text-center py-1.5 px-2 rounded bg-paper/60 border border-moss-green/10"
                  >
                    {code}
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
                className="mt-0.5 w-4 h-4 rounded border-moss-green/30 text-brand-ink focus:ring-moss-green/50"
              />
              <span className="text-sm text-stone-gray">
                I have saved my backup codes in a secure location.
              </span>
            </label>

            <Button
              onClick={handleDone}
              disabled={!codesAcknowledged}
              className="w-full"
            >
              Done — Return to Profile
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
