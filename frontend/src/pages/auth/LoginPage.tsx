// ============================================
// Login Page
// Handles user authentication with email/password
// Supports MFA flow and "Remember Me" functionality
// ============================================

import { useState, useEffect, FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { isValidEmail } from '@/utils/validation';
import { api } from '@/services/api';
import Button from '@/components/ui/Button';
import { apiErrorMessage, apiErrorStatus, apiErrorText } from '@/utils/errors';
import { readSignInNotice, forgetSignInNotice } from '@/services/signInNotice';
import { AFTER_SIGN_IN, keepingReturnPath, returnPathFrom } from '@/utils/returnTo';

export default function LoginPage() {
  const { login, authenticated, mfaPending } = useAuth();
  // The page that sent the visitor here, to go back to once signed in.
  const { search } = useLocation();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Why this page was opened, when the server said, such as a sign-in that
  // reached its 30-day limit. Shown once: read as the page first renders,
  // and forgotten after.
  const [notice] = useState<string | null>(readSignInNotice);
  useEffect(() => {
    forgetSignInNotice();
  }, []);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

  // Registration availability — fetched once on mount
  const [registrationAllowed, setRegistrationAllowed] = useState(false);
  useEffect(() => {
    api.getRegistrationStatus()
      .then((data) => setRegistrationAllowed(data.allowRegistration))
      .catch(() => setRegistrationAllowed(false));
  }, []);

  // Redirect if already authenticated (use <Navigate> not navigate() to avoid render-phase state update)
  if (authenticated) {
    return <Navigate to={returnPathFrom(search) ?? AFTER_SIGN_IN} replace />;
  }

  // Redirect to MFA verification if MFA is pending
  if (mfaPending) {
    return <Navigate to={keepingReturnPath('/auth/mfa-verify', search)} replace />;
  }

  /**
   * Validate form fields
   * Returns true if valid, false otherwise
   */
  const validateForm = (): boolean => {
    const errors: { email?: string; password?: string } = {};

    // Validate email
    if (!email) {
      errors.email = 'Email is required';
    } else if (!isValidEmail(email)) {
      errors.email = 'Please enter a valid email address';
    }

    // Validate password
    if (!password) {
      errors.password = 'Password is required';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Validate form
    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      await login(email, password, rememberMe);

      // If MFA is not required, user is logged in and will be redirected by auth check above
      // If MFA is required, mfaPending will be true and user will be redirected to MFA page
    } catch (err) {
      // The reply's sentence (`message`) is for the person; its `error` is a
      // short label, shown only when there is no sentence.
      const serverError = apiErrorMessage(err) || apiErrorText(err);
      if (apiErrorStatus(err) === 429) {
        // The limiter's answer says what happened and when to come back.
        setError(apiErrorMessage(err) || 'Too many login attempts. Please try again later.');
      } else if (serverError) {
        setError(serverError);
      } else if (apiErrorStatus(err) === 401) {
        setError('Invalid email or password');
      } else {
        setError('An error occurred during login. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20 px-4">
      <main id="main-content" className="glass-panel max-w-md w-full p-8 space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-brand-ink font-heading">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-warm-gray">
            Sign in to your CozyVTT account
          </p>
        </div>

        {/* Why the sign-in page was opened */}
        {notice && !error && (
          <div role="status" className="bg-warm-amber/10 border border-warm-amber/30 rounded-lg p-4">
            <p className="text-sm text-brand-ink">{notice}</p>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div role="alert" className="bg-spirit-red/10 border border-spirit-red/30 rounded-lg p-4">
            <p className="text-sm text-spirit-red font-medium">{error}</p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Input */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-brand-ink mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              className={`input-cozy w-full ${
                fieldErrors.email ? 'border-spirit-red focus:ring-spirit-red' : ''
              }`}
              placeholder="your@email.com"
              disabled={loading}
              aria-required="true"
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            />
            {fieldErrors.email && (
              <p id="email-error" role="alert" className="mt-1 text-xs text-spirit-red">{fieldErrors.email}</p>
            )}
          </div>

          {/* Password Input */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-brand-ink mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
              className={`input-cozy w-full ${
                fieldErrors.password ? 'border-spirit-red focus:ring-spirit-red' : ''
              }`}
              placeholder="Enter your password"
              disabled={loading}
              aria-required="true"
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            />
            {fieldErrors.password && (
              <p id="password-error" role="alert" className="mt-1 text-xs text-spirit-red">{fieldErrors.password}</p>
            )}
          </div>

          {/* Remember Me & Forgot Password */}
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-warm-amber focus:ring-warm-amber border-warm-gray/30 rounded"
                disabled={loading}
              />
              <label
                htmlFor="remember-me"
                className="ml-2 block text-sm text-warm-gray"
              >
                Remember me
              </label>
            </div>

            <Link
              to="/auth/forgot-password"
              className="text-sm text-brand-ink hover:text-brand-ink/80 transition-colors"
            >
              Forgot password?
            </Link>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full"
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
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </Button>
        </form>

        {/* Register Link — only shown when public registration is enabled */}
        {registrationAllowed && (
          <div className="text-center">
            <p className="text-sm text-warm-gray">
              Don't have an account?{' '}
              <Link
                to="/auth/register"
                className="text-brand-ink hover:text-brand-ink/80 font-medium transition-colors"
              >
                Create one
              </Link>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
