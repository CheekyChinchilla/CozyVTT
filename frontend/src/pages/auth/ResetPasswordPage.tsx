// ============================================
// Reset Password Page
// Allows users to set a new password via a valid reset token
// Accessed via /reset-password?token=<uuid>
//
// Also serves invitations at /accept-invite?token=<uuid> (`invite` prop). Same
// token, same endpoint — an invited account has no password yet, so "set one"
// and "reset yours" are the same operation with different wording.
// ============================================

import { useState, FormEvent, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import authService from '@/services/auth.service';
import Button from '@/components/ui/Button';
import { PASSWORD_REQUIREMENTS } from '@/utils/validation';

interface ResetPasswordPageProps {
  /** Render invitation copy instead of password-reset copy (route: /accept-invite) */
  invite?: boolean;
}

export default function ResetPasswordPage({ invite = false }: ResetPasswordPageProps) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});

  useEffect(() => {
    if (!token) {
      setError(
        invite
          ? 'This invitation link is invalid. Ask your administrator to send a new one.'
          : 'This password reset link is invalid. Please request a new one.'
      );
    }
  }, [token, invite]);

  const requirementsMet = PASSWORD_REQUIREMENTS.map((r) => r.test(password));
  const allRequirementsMet = requirementsMet.every(Boolean);

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {};
    if (!password) {
      errors.password = 'Password is required';
    } else if (!allRequirementsMet) {
      errors.password = 'Password does not meet requirements';
    }
    if (!confirmPassword) {
      errors.confirm = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      errors.confirm = 'Passwords do not match';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!validate()) return;

    setError('');
    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      setSuccess(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(
        msg ||
          (invite
            ? 'Failed to set your password. This invitation may have expired.'
            : 'Failed to reset password. This link may have expired.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20 px-4">
      <main id="main-content" className="glass-panel max-w-md w-full p-8 space-y-6">

        {success ? (
          /* Success state */
          <div className="text-center space-y-4">
            <CheckCircle className="w-14 h-14 text-moss-green mx-auto" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-moss-green font-heading">
              {invite ? "You're all set!" : 'Password updated!'}
            </h1>
            <p className="text-sm text-warm-gray">
              {invite
                ? 'Your account is ready. Sign in with the password you just chose.'
                : 'Your password has been reset successfully. You can now sign in with your new password.'}
            </p>
            <Link to="/auth/login" className="btn-primary inline-block px-6 py-2">
              Sign In
            </Link>
          </div>
        ) : !token ? (
          /* Invalid / missing token */
          <div className="text-center space-y-4">
            <AlertCircle className="w-14 h-14 text-red-500 mx-auto" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-moss-green font-heading">Invalid link</h1>
            <p className="text-sm text-warm-gray">{error}</p>
            {!invite && (
              <Link
                to="/auth/forgot-password"
                className="inline-flex items-center gap-1.5 text-sm text-moss-green hover:text-moss-green/80 font-medium transition-colors"
              >
                Request a new reset link
              </Link>
            )}
          </div>
        ) : (
          /* Form state */
          <>
            <div className="text-center">
              <div className="flex justify-center mb-3">
                <KeyRound className="w-10 h-10 text-moss-green/70" aria-hidden="true" />
              </div>
              <h1 className="text-2xl font-bold text-moss-green font-heading">
                {invite ? 'Welcome to CozyVTT' : 'Set new password'}
              </h1>
              <p className="mt-2 text-sm text-warm-gray">
                {invite
                  ? 'Choose a password to finish setting up your account.'
                  : 'Choose a strong password for your account.'}
              </p>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* New password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-moss-green mb-1">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  className={`input-cozy w-full ${fieldErrors.password ? 'border-red-400 focus:ring-red-400' : ''}`}
                  disabled={loading}
                  aria-required="true"
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby="password-requirements"
                />
                {fieldErrors.password && (
                  <p role="alert" className="mt-1 text-xs text-red-600">{fieldErrors.password}</p>
                )}
              </div>

              {/* Password requirements checklist */}
              {password.length > 0 && (
                <ul id="password-requirements" className="space-y-1" aria-label="Password requirements">
                  {PASSWORD_REQUIREMENTS.map((req, i) => (
                    <li key={i} className={`flex items-center gap-2 text-xs ${requirementsMet[i] ? 'text-moss-green' : 'text-warm-gray'}`}>
                      <span aria-hidden="true">{requirementsMet[i] ? '✓' : '○'}</span>
                      {req.label}
                    </li>
                  ))}
                </ul>
              )}

              {/* Confirm password */}
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-moss-green mb-1">
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, confirm: undefined }));
                  }}
                  className={`input-cozy w-full ${fieldErrors.confirm ? 'border-red-400 focus:ring-red-400' : ''}`}
                  disabled={loading}
                  aria-required="true"
                  aria-invalid={!!fieldErrors.confirm}
                  aria-describedby={fieldErrors.confirm ? 'confirm-error' : undefined}
                />
                {fieldErrors.confirm && (
                  <p id="confirm-error" role="alert" className="mt-1 text-xs text-red-600">{fieldErrors.confirm}</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading || !allRequirementsMet || password !== confirmPassword}
                className="w-full"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Updating...
                  </span>
                ) : (
                  invite ? 'Create My Account' : 'Set New Password'
                )}
              </Button>
            </form>

            <div className="text-center">
              <Link
                to="/auth/login"
                className="inline-flex items-center gap-1.5 text-sm text-moss-green hover:text-moss-green/80 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                Back to Sign In
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
