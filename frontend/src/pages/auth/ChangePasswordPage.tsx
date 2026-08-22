// ============================================
// Forced Change Password Page
// Shown when an account is flagged `mustChangePassword` — an admin created it,
// or an admin reset its password. Until the password is replaced the server
// rejects every other API call, so this page has no way out except finishing.
// Accessed via /auth/change-password
// ============================================

import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, AlertCircle, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Button from '@/components/ui/Button';
import { PASSWORD_REQUIREMENTS } from '@/utils/validation';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { changePassword, logout, user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    current?: string;
    password?: string;
    confirm?: string;
  }>({});

  const requirementsMet = PASSWORD_REQUIREMENTS.map((r) => r.test(password));
  const allRequirementsMet = requirementsMet.every(Boolean);

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {};
    if (!currentPassword) {
      errors.current = 'Enter the password you just signed in with';
    }
    if (!password) {
      errors.password = 'Password is required';
    } else if (!allRequirementsMet) {
      errors.password = 'Password does not meet requirements';
    } else if (password === currentPassword) {
      errors.password = 'New password must differ from your current one';
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
    if (!validate()) return;

    setError('');
    setLoading(true);
    try {
      await changePassword(currentPassword, password);
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Failed to change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/auth/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20 px-4">
      <main id="main-content" className="glass-panel max-w-md w-full p-8 space-y-6">
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <KeyRound className="w-10 h-10 text-moss-green/70" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-moss-green font-heading">Choose your password</h1>
          <p className="mt-2 text-sm text-warm-gray">
            {user?.displayName ? `Welcome, ${user.displayName}. ` : ''}
            Your account was set up with a temporary password. Pick your own to continue — whoever
            created the account can&apos;t see this one.
          </p>
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Current (temporary) password */}
          <div>
            <label htmlFor="current-password" className="block text-sm font-medium text-moss-green mb-1">
              Temporary password
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, current: undefined }));
              }}
              className={`input-cozy w-full ${fieldErrors.current ? 'border-red-400 focus:ring-red-400' : ''}`}
              disabled={loading}
              aria-required="true"
              aria-invalid={!!fieldErrors.current}
            />
            {fieldErrors.current && (
              <p role="alert" className="mt-1 text-xs text-red-600">{fieldErrors.current}</p>
            )}
          </div>

          {/* New password */}
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-moss-green mb-1">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
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

          {/* Requirements checklist */}
          {password.length > 0 && (
            <ul id="password-requirements" className="space-y-1" aria-label="Password requirements">
              {PASSWORD_REQUIREMENTS.map((req, i) => (
                <li
                  key={req.label}
                  className={`flex items-center gap-2 text-xs ${requirementsMet[i] ? 'text-moss-green' : 'text-warm-gray'}`}
                >
                  <span aria-hidden="true">{requirementsMet[i] ? '✓' : '○'}</span>
                  {req.label}
                </li>
              ))}
            </ul>
          )}

          {/* Confirm */}
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
            {loading ? 'Saving...' : 'Set Password and Continue'}
          </Button>
        </form>

        <button
          type="button"
          onClick={handleSignOut}
          className="w-full inline-flex items-center justify-center gap-1.5 text-sm text-warm-gray hover:text-moss-green transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          Sign out instead
        </button>
      </main>
    </div>
  );
}
