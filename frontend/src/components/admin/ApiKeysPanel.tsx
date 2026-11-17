/**
 * Every account's personal API keys, for an administrator to review and
 * revoke. Revoking is all it offers: nobody changes or replaces a key that is
 * not theirs, so nobody is ever handed a secret for someone else's account.
 * The key itself is never listed, only its first characters.
 */
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Trash2 } from 'lucide-react';
import { api } from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import { formatDate } from '@/utils/format';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { expiryText, lastUsedText, permissionSummary } from '@/components/profile/apiKeyFormat';
import type { ApiKey } from '@/types';

export default function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setKeys((await api.listApiKeys(true)).apiKeys);
    } catch (err) {
      setError(apiErrorMessage(err) || 'Failed to load the API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async () => {
    if (!revoking) return;
    setWorking(true);
    setError('');
    try {
      await api.deleteApiKey(revoking.id);
      setKeys((prev) => prev?.filter((k) => k.id !== revoking.id) ?? null);
    } catch (err) {
      setError(apiErrorMessage(err) || 'Failed to revoke the API key');
    } finally {
      setWorking(false);
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-brand-ink flex items-center gap-2">
            <KeyRound className="w-4 h-4" aria-hidden="true" /> API keys on this instance
          </h3>
          <p className="text-xs text-warm-gray mt-0.5">Every account&apos;s keys. Revoking one stops it at once.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading} className="text-xs py-1 px-2.5 flex items-center gap-1.5">
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
          Refresh
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}

      {keys && keys.length === 0 && <p className="text-sm text-warm-gray">No account has an API key.</p>}

      {keys && keys.length > 0 && (
        <ul className="divide-y divide-warm-gray/15 rounded-lg border border-warm-gray/20" aria-label="Every API key">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-stone-gray truncate">{key.name}</span>
                  <code className="text-xs font-mono text-brand-ink">{key.prefix}…</code>
                  {key.expired && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-danger/10 text-danger-ink">Expired</span>
                  )}
                </div>
                <p className="text-xs text-warm-gray mt-0.5">
                  {key.owner ? `${key.owner.displayName} (${key.owner.email})` : 'Unknown account'} ·{' '}
                  {permissionSummary(key.permissions)} · {lastUsedText(key)} · {expiryText(key)} · Created{' '}
                  {formatDate(key.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRevoking(key)}
                className="p-1.5 rounded-lg text-danger-ink hover:bg-danger/10 transition-colors"
                aria-label={`Revoke ${key.name}`}
                title="Revoke"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={revoking !== null}
        title="Revoke this key?"
        message={`"${revoking?.name ?? ''}"${revoking?.owner ? ` of ${revoking.owner.displayName}` : ''} stops working at once.${revoking?.owner ? ' The activity log records it.' : ''}`}
        confirmLabel="Revoke"
        isLoading={working}
        onConfirm={() => void revoke()}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}
