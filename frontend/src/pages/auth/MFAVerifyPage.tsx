// ============================================
// MFA Verify Page
// Handles MFA verification during login
// Supports both TOTP tokens and backup codes
// ============================================

import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export default function MFAVerifyPage() {
  const navigate = useNavigate();
  const { verifyMFA, verifyMFAWithBackupCode, mfaPending, authenticated } =
    useAuth();

  // Form state
  const [token, setToken] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if authenticated (check this first!)
  if (authenticated) {
    navigate('/dashboard');
    return null;
  }

  // Redirect if not in MFA flow
  if (!mfaPending) {
    navigate('/auth/login');
    return null;
  }

  /**
   * Handle TOTP token verification
   */
  const handleTokenSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Please enter your authentication code');
      return;
    }

    if (token.length !== 6) {
      setError('Authentication code must be 6 digits');
      return;
    }

    try {
      setLoading(true);
      await verifyMFA(token);

      // On success, user is logged in and will be redirected
    } catch (err: any) {
      console.error('MFA verification error:', err);

      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else if (err.response?.status === 401) {
        setError('Invalid authentication code. Please try again.');
      } else if (err.response?.status === 429) {
        setError('Too many attempts. Please try again later.');
      } else {
        setError('An error occurred during verification. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle backup code verification
   */
  const handleBackupCodeSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!backupCode) {
      setError('Please enter your backup code');
      return;
    }

    // Remove any dashes or spaces from backup code
    const cleanedCode = backupCode.replace(/[-\s]/g, '');

    if (cleanedCode.length !== 8) {
      setError('Backup code must be 8 characters');
      return;
    }

    try {
      setLoading(true);
      await verifyMFAWithBackupCode(cleanedCode);

      // On success, user is logged in and will be redirected
    } catch (err: any) {
      console.error('Backup code verification error:', err);

      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else if (err.response?.status === 401) {
        setError('Invalid backup code. Please try again.');
      } else if (err.response?.status === 429) {
        setError('Too many attempts. Please try again later.');
      } else {
        setError('An error occurred during verification. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Toggle between token and backup code input
   */
  const toggleInputMode = () => {
    setUseBackupCode(!useBackupCode);
    setToken('');
    setBackupCode('');
    setError(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20 px-4">
      <div className="glass-panel max-w-md w-full p-8 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-moss-green/10 rounded-full p-3">
              <svg
                className="w-8 h-8 text-moss-green"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-moss-green font-heading">
            Two-Factor Authentication
          </h1>
          <p className="mt-2 text-sm text-warm-gray">
            {useBackupCode
              ? 'Enter one of your backup codes'
              : 'Enter the 6-digit code from your authenticator app'}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-spirit-red/10 border border-spirit-red/30 rounded-lg p-4">
            <p className="text-sm text-spirit-red font-medium">{error}</p>
          </div>
        )}

        {/* TOTP Token Form */}
        {!useBackupCode && (
          <form onSubmit={handleTokenSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="token"
                className="block text-sm font-medium text-moss-green mb-1"
              >
                Authentication Code
              </label>
              <input
                id="token"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={token}
                onChange={(e) => {
                  // Only allow numbers
                  const value = e.target.value.replace(/[^0-9]/g, '');
                  setToken(value);
                  setError(null);
                }}
                className="input-cozy w-full text-center text-2xl tracking-widest font-mono"
                placeholder="000000"
                disabled={loading}
                autoFocus
              />
              <p className="mt-1 text-xs text-warm-gray text-center">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || token.length !== 6}
              className="btn-primary w-full"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Verifying...
                </span>
              ) : (
                'Verify Code'
              )}
            </button>
          </form>
        )}

        {/* Backup Code Form */}
        {useBackupCode && (
          <form onSubmit={handleBackupCodeSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="backupCode"
                className="block text-sm font-medium text-moss-green mb-1"
              >
                Backup Code
              </label>
              <input
                id="backupCode"
                type="text"
                maxLength={9} // 8 chars + 1 dash
                value={backupCode}
                onChange={(e) => {
                  // Allow alphanumeric and dashes
                  let value = e.target.value.replace(/[^a-zA-Z0-9-]/g, '');

                  // Auto-format with dash after 4 characters
                  if (value.length === 4 && !value.includes('-')) {
                    value = value + '-';
                  }

                  setBackupCode(value);
                  setError(null);
                }}
                className="input-cozy w-full text-center text-xl tracking-wider font-mono"
                placeholder="XXXX-XXXX"
                disabled={loading}
                autoFocus
              />
              <p className="mt-1 text-xs text-warm-gray text-center">
                Enter one of your 8-character backup codes
              </p>
            </div>

            <button
              type="submit"
              disabled={
                loading || backupCode.replace(/[-\s]/g, '').length !== 8
              }
              className="btn-primary w-full"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Verifying...
                </span>
              ) : (
                'Verify Backup Code'
              )}
            </button>
          </form>
        )}

        {/* Toggle Input Mode */}
        <div className="text-center">
          <button
            onClick={toggleInputMode}
            className="text-sm text-moss-green hover:text-moss-green/80 transition-colors"
            disabled={loading}
          >
            {useBackupCode
              ? 'Use authenticator app instead'
              : "Can't access your app? Use a backup code"}
          </button>
        </div>

        {/* Back to Login */}
        <div className="text-center pt-4 border-t border-warm-gray/20">
          <button
            onClick={() => navigate('/auth/login')}
            className="text-sm text-warm-gray hover:text-moss-green transition-colors"
            disabled={loading}
          >
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
