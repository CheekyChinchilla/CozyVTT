// ============================================
// API Keys Section
//
// Embedded in ProfilePage, under Security, for an account that may hold
// keys (user.apiKeysAllowed). Lists the account's keys by name and the first
// characters of each, never the key itself, and makes, changes, replaces and
// revokes them. A new or replaced key is shown once (ApiKeyReveal).
// ============================================

import { useCallback, useEffect, useState } from 'react';
import { Clock, KeyRound, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { api } from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/format';
import type { ApiKey, ApiKeyPermission } from '@/types';
import ApiKeyEditor, { type ApiKeyDraft } from './ApiKeyEditor';
import ApiKeyReveal from './ApiKeyReveal';
import { expiresSoon, expiryFor, expiryText, lastUsedText, permissionSummary } from './apiKeyFormat';

type Editing = { mode: 'new' } | { mode: 'edit'; key: ApiKey } | null;
type Confirming = { action: 'regenerate' | 'revoke'; key: ApiKey } | null;

export default function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [permissions, setPermissions] = useState<ApiKeyPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState('');
  const [revealed, setRevealed] = useState<{ secret: string; name: string; replaced: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [list, offer] = await Promise.all([api.listApiKeys(), api.listApiKeyPermissions()]);
      setKeys(list.apiKeys);
      setPermissions(offer.permissions);
    } catch (err) {
      setLoadError(apiErrorMessage(err) || 'Failed to load your API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (draft: ApiKeyDraft) => {
    if (!editing) return;
    setSaving(true);
    setEditError('');
    try {
      const expiresAt = expiryFor(draft.expiry);
      if (editing.mode === 'new') {
        const made = await api.createApiKey({ name: draft.name, permissions: draft.permissions, expiresAt: expiresAt ?? null });
        setKeys((prev) => [made.apiKey, ...prev]);
        setRevealed({ secret: made.key, name: made.apiKey.name, replaced: false });
      } else {
        const { apiKey } = await api.updateApiKey(editing.key.id, {
          name: draft.name,
          permissions: draft.permissions,
          ...(expiresAt !== undefined ? { expiresAt } : {}),
        });
        setKeys((prev) => prev.map((k) => (k.id === apiKey.id ? apiKey : k)));
      }
      setEditing(null);
    } catch (err) {
      setEditError(apiErrorMessage(err) || 'Failed to save the API key');
    } finally {
      setSaving(false);
    }
  };

  const confirm = async () => {
    if (!confirming) return;
    const { action, key } = confirming;
    setWorking(true);
    setActionError('');
    try {
      if (action === 'revoke') {
        await api.deleteApiKey(key.id);
        setKeys((prev) => prev.filter((k) => k.id !== key.id));
      } else {
        const made = await api.regenerateApiKey(key.id);
        setKeys((prev) => prev.map((k) => (k.id === made.apiKey.id ? made.apiKey : k)));
        setRevealed({ secret: made.key, name: made.apiKey.name, replaced: true });
      }
      setConfirming(null);
    } catch (err) {
      setActionError(apiErrorMessage(err) || `Failed to ${action} the API key`);
      setConfirming(null);
    } finally {
      setWorking(false);
    }
  };

  const openEditor = (next: Editing) => {
    setEditError('');
    setEditing(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <KeyRound className="w-5 h-5 text-brand-ink shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-brand-ink">API Keys</h3>
            <p className="text-xs text-warm-gray max-w-prose">
              Let a script or another tool use CozyVTT as you, limited to what you allow. Keys cannot sign in, join a
              live table, or change your password, email or two-factor settings.
            </p>
          </div>
        </div>
        <Button
          onClick={() => openEditor({ mode: 'new' })}
          disabled={loading || !!loadError}
          className="text-sm py-1.5 px-3 flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          New key
        </Button>
      </div>

      {actionError && (
        <div role="alert" className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger-ink">
          {actionError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-warm-gray">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading your API keys…
        </div>
      ) : loadError ? (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger-ink flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <Button variant="secondary" onClick={() => void load()} className="text-xs py-1 px-2.5">
            Try again
          </Button>
        </div>
      ) : keys.length === 0 ? (
        <p className="text-sm text-warm-gray py-2">You have no API keys yet.</p>
      ) : (
        <ul className="divide-y divide-moss-green/10 rounded-lg border border-moss-green/15" aria-label="Your API keys">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-stone-gray truncate">{key.name}</span>
                  <code className="text-xs font-mono text-brand-ink px-1.5 py-0.5 rounded-sm bg-parchment/60 border border-moss-green/10">
                    {key.prefix}…
                  </code>
                  {key.expired && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-danger/10 text-danger-ink">Expired</span>
                  )}
                </div>
                <p className="text-xs text-warm-gray mt-0.5 flex flex-wrap gap-x-2">
                  <span>{permissionSummary(key.permissions)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{lastUsedText(key)}</span>
                  <span aria-hidden="true">·</span>
                  <span className={cn('inline-flex items-center gap-1', expiresSoon(key) && 'text-warning-ink font-medium')}>
                    {expiresSoon(key) && <Clock className="w-3 h-3" aria-hidden="true" />}
                    {expiryText(key)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Created {formatDate(key.createdAt)}</span>
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openEditor({ mode: 'edit', key })}
                  className="p-1.5 rounded-lg text-stone-gray hover:bg-moss-green/10 hover:text-brand-ink transition-colors"
                  aria-label={`Edit ${key.name}`}
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming({ action: 'regenerate', key })}
                  disabled={key.expired}
                  className="p-1.5 rounded-lg text-stone-gray hover:bg-moss-green/10 hover:text-brand-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  aria-label={`Regenerate ${key.name}`}
                  title={key.expired ? 'Expired: give it a new expiry first' : 'Regenerate'}
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming({ action: 'revoke', key })}
                  className="p-1.5 rounded-lg text-danger-ink hover:bg-danger/10 transition-colors"
                  aria-label={`Revoke ${key.name}`}
                  title="Revoke"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ApiKeyEditor
          key={editing.mode === 'edit' ? editing.key.id : 'new'}
          open
          editing={editing.mode === 'edit' ? editing.key : null}
          permissions={permissions}
          saving={saving}
          error={editError}
          onSave={(draft) => void save(draft)}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        isOpen={confirming !== null}
        title={confirming?.action === 'revoke' ? 'Revoke this key?' : 'Regenerate this key?'}
        message={
          confirming?.action === 'revoke'
            ? `"${confirming.key.name}" stops working at once, and anything still using it will be refused.`
            : `"${confirming?.key.name ?? ''}" gets a new secret with the same permissions. The current one stops working at once.`
        }
        confirmLabel={confirming?.action === 'revoke' ? 'Revoke' : 'Regenerate'}
        variant={confirming?.action === 'revoke' ? 'danger' : 'warning'}
        isLoading={working}
        onConfirm={() => void confirm()}
        onCancel={() => setConfirming(null)}
      />

      <ApiKeyReveal
        secret={revealed?.secret ?? null}
        name={revealed?.name ?? ''}
        replaced={revealed?.replaced}
        onDone={() => setRevealed(null)}
      />
    </div>
  );
}
