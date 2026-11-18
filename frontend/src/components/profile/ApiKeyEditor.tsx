// ============================================
// ApiKeyEditor — make a key, or change one
//
// A name, how long it lasts, and what it may reach: each permission at No
// access, Read, or Read & write, offered only at the levels this account can
// use. "Everything" sets a floor for every permission at once, those added
// in later versions included, but not the administration ones, which are
// granted one by one; a permission can be raised above it, and the levels
// below it are shown but cannot be picked. A key holding a permission the
// account is no longer offered (an administrator since demoted) loses it on
// save, and the editor says so, since the server refuses to store it.
// ============================================

import { useId, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/format';
import type { ApiKey, ApiKeyLevel, ApiKeyPermission } from '@/types';
import {
  ALL_PERMISSIONS,
  DEFAULT_EXPIRY,
  EXPIRY_CHOICES,
  GROUP_LABELS,
  GROUP_ORDER,
  LEVEL_LABELS,
  levelAtLeast,
  type ExpiryChoice,
} from './apiKeyFormat';

export interface ApiKeyDraft {
  name: string;
  permissions: Record<string, string>;
  expiry: ExpiryChoice;
}

interface ApiKeyEditorProps {
  open: boolean;
  /** The key being changed; left out to make a new one. */
  editing?: ApiKey | null;
  permissions: ApiKeyPermission[];
  saving: boolean;
  error: string;
  onSave: (draft: ApiKeyDraft) => void;
  onClose: () => void;
}

const NAME_MAX_LENGTH = 100;
const FLOOR_LEVELS: ApiKeyLevel[] = ['none', 'read', 'write'];

function LevelPicker({
  label,
  levels,
  value,
  floor,
  disabled,
  onChange,
}: {
  label: string;
  levels: ApiKeyLevel[];
  value: ApiKeyLevel;
  floor: ApiKeyLevel;
  disabled: boolean;
  onChange: (level: ApiKeyLevel) => void;
}) {
  // What the key holds here once the floor is counted.
  const shown = levelAtLeast(value, floor) ? value : floor;
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-lg border border-moss-green/20 bg-paper/60 p-0.5">
      {levels.map((level) => {
        const belowFloor = !levelAtLeast(level, floor);
        const selected = shown === level;
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled || belowFloor}
            title={belowFloor ? `"Everything" already gives ${LEVEL_LABELS[floor].toLowerCase()}` : undefined}
            onClick={() => onChange(level)}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap',
              selected ? 'bg-brand text-brand-text shadow-sm' : 'text-stone-gray hover:bg-moss-green/10',
              belowFloor && 'opacity-40 cursor-not-allowed hover:bg-transparent'
            )}
          >
            {LEVEL_LABELS[level]}
          </button>
        );
      })}
    </div>
  );
}

export default function ApiKeyEditor({ open, editing, permissions, saving, error, onSave, onClose }: ApiKeyEditorProps) {
  const nameId = useId();
  const expiryId = useId();
  const [name, setName] = useState(editing?.name ?? '');
  const offeredIds = new Set([ALL_PERMISSIONS, ...permissions.map((p) => p.id)]);
  const held = Object.entries(editing?.permissions ?? {});
  const dropped = held.filter(([id]) => !offeredIds.has(id)).length;
  const [granted, setGranted] = useState<Record<string, string>>(() =>
    Object.fromEntries(held.filter(([id]) => offeredIds.has(id)))
  );
  const [expiry, setExpiry] = useState<ExpiryChoice>(editing ? 'keep' : DEFAULT_EXPIRY);

  const floor = (granted[ALL_PERMISSIONS] ?? 'none') as ApiKeyLevel;
  const setLevel = (id: string, level: ApiKeyLevel) =>
    setGranted((prev) => {
      const next = { ...prev };
      if (level === 'none') delete next[id];
      else next[id] = level;
      return next;
    });

  const grouped = GROUP_ORDER.map((group) => ({ group, items: permissions.filter((p) => p.group === group) })).filter(
    (g) => g.items.length > 0
  );
  const trimmed = name.trim();
  const nothingGranted = Object.keys(granted).length === 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || saving) return;
    onSave({ name: trimmed, permissions: granted, expiry });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeDisabled={saving}
      title={editing ? 'Edit API key' : 'New API key'}
      icon={KeyRound}
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={`${nameId}-form`} disabled={saving || !trimmed} className="flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {editing ? 'Save changes' : 'Create key'}
          </Button>
        </>
      }
    >
      <form id={`${nameId}-form`} onSubmit={submit} className="space-y-5">
        {error && (
          <div role="alert" className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger-ink">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label htmlFor={nameId} className="block text-xs font-medium text-stone-gray mb-1">
              Name
            </label>
            <input
              id={nameId}
              data-autofocus
              value={name}
              maxLength={NAME_MAX_LENGTH}
              onChange={(e) => setName(e.target.value)}
              placeholder="What uses it, such as Discord dice bot"
              className="input-cozy w-full text-sm"
              disabled={saving}
            />
          </div>
          <div>
            <label htmlFor={expiryId} className="block text-xs font-medium text-stone-gray mb-1">
              Expires
            </label>
            <select
              id={expiryId}
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as ExpiryChoice)}
              className="input-cozy w-full text-sm sm:w-44"
              disabled={saving}
            >
              {editing && (
                <option value="keep">
                  {editing.expiresAt ? `Keep: ${formatDate(editing.expiresAt)}` : 'Keep: never'}
                </option>
              )}
              {EXPIRY_CHOICES.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {editing && choice.days !== null ? `${choice.label} from now` : choice.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-brand-ink mb-1">Permissions</legend>
          <p className="text-xs text-warm-gray -mt-2">
            The key acts as you and never does more than your account can.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-moss-green/5 border border-moss-green/15">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-gray">Everything</p>
              <p className="text-xs text-warm-gray">
                At least this for every permission, including later ones, except Administration.
              </p>
            </div>
            <LevelPicker
              label="Everything"
              levels={FLOOR_LEVELS}
              value={floor}
              floor="none"
              disabled={saving}
              onChange={(level) => setLevel(ALL_PERMISSIONS, level)}
            />
          </div>

          {grouped.map(({ group, items }) => (
            <div key={group}>
              <p className="text-xs font-semibold text-stone-gray uppercase tracking-wide mb-1.5">{GROUP_LABELS[group]}</p>
              <ul className="divide-y divide-moss-green/10 rounded-lg border border-moss-green/15">
                {items.map((perm) => (
                  <li key={perm.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-stone-gray">{perm.name}</p>
                      <p className="text-xs text-warm-gray">{perm.description}</p>
                    </div>
                    <LevelPicker
                      label={perm.name}
                      levels={perm.levels}
                      value={(granted[perm.id] ?? 'none') as ApiKeyLevel}
                      floor={perm.group === 'admin' ? 'none' : perm.levels.includes(floor) ? floor : perm.levels[perm.levels.length - 1]}
                      disabled={saving}
                      onChange={(level) => setLevel(perm.id, level)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {dropped > 0 && (
            <p role="status" className="text-xs text-accent-ink">
              This key holds {dropped === 1 ? 'a permission' : `${dropped} permissions`} your account can no longer use.
              Saving removes {dropped === 1 ? 'it' : 'them'}.
            </p>
          )}

          {nothingGranted && (
            <p className="text-xs text-accent-ink">With no permissions the key can reach nothing yet.</p>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
