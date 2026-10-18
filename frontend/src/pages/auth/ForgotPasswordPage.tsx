// ============================================
// Forgot Password Page
// Allows unauthenticated users to request a password reset email
// ============================================

import { useState, FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { isValidEmail } from '@/utils/validation';
import authService from '@/services/auth.service';
import Button from '@/components/ui/Button';
import { apiErrorMessage, apiErrorStatus } from '@/utils/errors';
import { useServerConfigQuery } from '@/hooks/queries';

/** Shown for a failure that is not a refusal for too many requests. */
const NOT_COMPLETED = 'Your request could not be completed, so no email was sent. Please try again in a few minutes.';

export default function ForgotPasswordPage() {
  const { authenticated } = useAuth();
  // Whether this instance can send email at all, from its public settings.
  const smtpConfigured = useServerConfigQuery().data?.smtp?.configured;

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [serverMessage, setServerMessage] = useState('');
  /** A refusal or a failure: shown on the form, since no email was sent. */
  const [refusal, setRefusal] = useState('');

  if (authenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const validate = (): boolean => {
    if (!email) {
      setEmailError('Email is required');
      return false;
    }
    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    setEmailError('');
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setRefusal('');
    try {
      setServerMessage(await authService.forgotPassword(email.trim().toLowerCase()));
      setSubmitted(true);
    } catch (err) {
      // Nothing was sent: too many requests from this address, a failure on
      // the server, or no answer at all. Say so and keep the form. None of
      // these depends on whether the address has an account, so this tells
      // nobody which addresses do.
      if (apiErrorStatus(err) === 429) {
        setRefusal(apiErrorMessage(err) || 'Too many requests. Please try again later.');
        return;
      }
      const status = apiErrorStatus(err);
      setRefusal(status !== undefined && status < 500 ? apiErrorMessage(err) || NOT_COMPLETED : NOT_COMPLETED);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-soft-cream via-parchment to-warm-amber/20 px-4">
      <main id="main-content" className="glass-panel max-w-md w-full p-8 space-y-6">

        {smtpConfigured === false ? (
          /* This instance cannot send email, so there is nothing to request. */
          <div className="text-center space-y-4">
            <Mail className="w-10 h-10 text-brand-ink/70 mx-auto" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-brand-ink font-heading">Password reset by email is not available</h1>
            <p className="text-sm text-warm-gray leading-relaxed">
              This server cannot send email, so it cannot send you a reset link. To get back into your account, ask
              your platform administrator, who can give you a temporary password from the Admin Panel.
            </p>
            <Link
              to="/auth/login"
              className="inline-flex items-center gap-2 text-sm text-brand-ink hover:text-brand-ink/80 font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back to Sign In
            </Link>
          </div>
        ) : submitted ? (
          /* Success state */
          <div className="text-center space-y-4">
            <CheckCircle className="w-14 h-14 text-brand-ink mx-auto" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-brand-ink font-heading">
              {smtpConfigured ? 'Check your inbox' : 'Request received'}
            </h1>
            <p className="text-sm text-warm-gray leading-relaxed">
              {serverMessage || (smtpConfigured
                ? 'If an account with that email address exists, we\'ve sent a password reset link. The link expires in 1 hour.'
                : 'Your request was received.')}
            </p>
            <p className="text-xs text-stone-gray/70">
              {smtpConfigured
                ? "Didn't receive it? Check your spam folder, or contact your administrator."
                : 'If no email arrives, contact your administrator.'}
            </p>
            <Link
              to="/auth/login"
              className="inline-flex items-center gap-2 text-sm text-brand-ink hover:text-brand-ink/80 font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back to Sign In
            </Link>
          </div>
        ) : (
          /* Form state */
          <>
            <div className="text-center">
              <div className="flex justify-center mb-3">
                <Mail className="w-10 h-10 text-brand-ink/70" aria-hidden="true" />
              </div>
              <h1 className="text-2xl font-bold text-brand-ink font-heading">Forgot your password?</h1>
              <p className="mt-2 text-sm text-warm-gray">
                Enter your email address and we'll send you a link to reset your password.
              </p>
            </div>

            {refusal && (
              <div role="alert" className="bg-danger/10 border border-danger/30 rounded-lg p-3">
                <p className="text-sm text-danger-ink">{refusal}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-brand-ink mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError('');
                  }}
                  className={`input-cozy w-full ${emailError ? 'border-danger/60 focus:ring-danger' : ''}`}
                  placeholder="your@email.com"
                  disabled={loading}
                  aria-required="true"
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? 'email-error' : undefined}
                />
                {emailError && (
                  <p id="email-error" role="alert" className="mt-1 text-xs text-danger-ink">{emailError}</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending...
                  </span>
                ) : (
                  'Send Reset Link'
                )}
              </Button>
            </form>

            <div className="text-center">
              <Link
                to="/auth/login"
                className="inline-flex items-center gap-1.5 text-sm text-brand-ink hover:text-brand-ink/80 transition-colors"
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
