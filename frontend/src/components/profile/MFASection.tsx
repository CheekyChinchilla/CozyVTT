// ============================================
// MFA Section
//
// Embedded in ProfilePage > Security section.
// Shows MFA status and provides enable/disable/regenerate actions.
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Copy,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Button from '@/components/ui/Button';

// ============================================
// Inline Disable Form
// ============================================

function DisableForm({ onClose }: { onClose: () => void }) {
  const { disableMFA, user } = useAuth();
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isAdmin = user?.platformRole === 'ADMIN';

  if (isAdmin) {
    return (
      <div className="mt-4 p-4 rounded-lg bg-warm-amber/10 border border-warm-amber/30 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-warm-amber flex-shrink-0 mt-0.5" />
        <p className="text-sm text-stone-gray">
          Admin accounts are required to keep MFA enabled and cannot disable it.
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!password || !token) {
      setError('Password and authentication code are required');
      return;
    }
    try {
      setSubmitting(true);
      await disableMFA(password, token);
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to disable MFA');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="mt-4 flex items-center gap-2 text-sm text-brand-ink">
        <CheckCircle className="w-4 h-4" />
        MFA disabled successfully.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t border-moss-green/10 pt-4">
      {error && (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger-ink">
          {error}
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-stone-gray mb-1">Current Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
          className="input-cozy w-full text-sm"
          placeholder="Enter your password"
          autoComplete="current-password"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-gray mb-1">
          Authentication Code
        </label>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={token}
          onChange={(e) => setToken(e.target.value.replace(/[^0-9]/g, ''))}
          disabled={submitting}
          className="input-cozy w-full text-sm font-mono tracking-widest text-center"
          placeholder="000000"
          autoComplete="one-time-code"
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={onClose} disabled={submitting} variant="secondary" className="flex-1 text-sm">
          Cancel
        </Button>
        <button
          type="submit"
          disabled={submitting || !password || token.length !== 6}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-danger hover:bg-danger text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldOff className="w-3.5 h-3.5" />}
          {submitting ? 'Disabling...' : 'Disable MFA'}
        </button>
      </div>
    </form>
  );
}

// ============================================
// Inline Regenerate Form
// ============================================

function RegenerateForm({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!password) {
      setError('Password is required');
      return;
    }
    try {
      setSubmitting(true);
      // Call authService directly via api
      const { api } = await import('@/services/api');
      const result = await api.mfaRegenerateBackupCodes(password);
      setNewCodes(result.backupCodes);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to regenerate backup codes');
    } finally {
      setSubmitting(false);
    }
  };

  const copyAll = () => {
    navigator.clipboard.writeText(newCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (newCodes.length > 0) {
    return (
      <div className="mt-4 space-y-4 border-t border-moss-green/10 pt-4">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-warm-amber/10 border border-warm-amber/30">
          <AlertTriangle className="w-4 h-4 text-warm-amber flex-shrink-0" />
          <p className="text-xs text-stone-gray font-medium">
            Your old codes are now invalid. Save these new codes securely.
          </p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-stone-gray uppercase tracking-wide">New Backup Codes</p>
            <button onClick={copyAll} className="flex items-center gap-1 text-xs text-brand-ink hover:text-brand-ink/80">
              {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy all'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 p-3 rounded-lg bg-parchment/60 border border-moss-green/15">
            {newCodes.map((code, i) => (
              <code key={i} className="text-xs font-mono text-brand-ink text-center py-1 px-1.5 rounded bg-paper/60 border border-moss-green/10">
                {code.slice(0, 4)}-{code.slice(4)}
              </code>
            ))}
          </div>
        </div>
        <Button onClick={onClose} variant="secondary" className="w-full text-sm">Done</Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-3 border-t border-moss-green/10 pt-4">
      {error && (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger-ink">{error}</div>
      )}
      <div>
        <label className="block text-xs font-medium text-stone-gray mb-1">Current Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
          className="input-cozy w-full text-sm"
          placeholder="Enter your password"
          autoComplete="current-password"
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={onClose} disabled={submitting} variant="secondary" className="flex-1 text-sm">
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={submitting || !password}
          className="flex-1 flex items-center justify-center gap-2 text-sm"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {submitting ? 'Regenerating...' : 'Regenerate'}
        </Button>
      </div>
    </form>
  );
}

// ============================================
// MFA Section (main export)
// ============================================

export default function MFASection() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeForm, setActiveForm] = useState<'disable' | 'regenerate' | null>(null);

  const isEnabled = user?.mfaEnabled ?? false;
  const isAdmin = user?.platformRole === 'ADMIN';

  const closeForm = () => setActiveForm(null);

  return (
    <div className="space-y-4">
      {/* Status Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isEnabled ? (
            <ShieldCheck className="w-5 h-5 text-brand-ink" />
          ) : (
            <Shield className="w-5 h-5 text-stone-gray/50" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-brand-ink">Two-Factor Authentication</h3>
            <p className="text-xs text-warm-gray">
              {isEnabled ? (
                <span className="text-brand-ink font-medium">Enabled</span>
              ) : (
                'Not enabled'
              )}
              {!isEnabled && isAdmin && (
                <span className="ml-2 text-warm-amber font-medium">Admin accounts should enable MFA</span>
              )}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {!isEnabled && (
            <Button
              onClick={() => navigate('/auth/mfa-setup')}
              className="text-sm py-1.5 px-3"
            >
              Enable
            </Button>
          )}
          {isEnabled && (
            <>
              <Button
                onClick={() => setActiveForm(activeForm === 'regenerate' ? null : 'regenerate')}
                variant="secondary" className="text-sm py-1.5 px-3 flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Backup Codes
                {activeForm === 'regenerate' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
              {!isAdmin && (
                <button
                  onClick={() => setActiveForm(activeForm === 'disable' ? null : 'disable')}
                  className="text-sm py-1.5 px-3 rounded-lg border border-danger/30 text-danger-ink hover:bg-danger/10 transition-colors font-medium flex items-center gap-1.5"
                >
                  <ShieldOff className="w-3.5 h-3.5" />
                  Disable
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Admin MFA notice */}
      {isEnabled && isAdmin && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-moss-green/5 border border-moss-green/15">
          <ShieldCheck className="w-4 h-4 text-brand-ink flex-shrink-0 mt-0.5" />
          <p className="text-xs text-stone-gray">
            MFA is required for admin accounts and cannot be disabled.
          </p>
        </div>
      )}

      {/* Expanded forms */}
      {activeForm === 'disable' && <DisableForm onClose={closeForm} />}
      {activeForm === 'regenerate' && <RegenerateForm onClose={closeForm} />}
    </div>
  );
}
