/**
 * Who wrote a line of the admins' activity log, and what it changed, for the
 * Activity tab's Recent Admin Actions.
 */
import type { AdminSystemLog } from '@/types';

/** The names the Admin Panel gives the fields a line's changes can list; any other is shown as stored. */
const FIELD_LABELS: Record<string, string> = {
  globalAssetManager: 'Global Assets',
  templateEditor: 'Templates',
  email: 'Email',
  displayName: 'Display name',
  avatarUrl: 'Avatar',
  bio: 'Bio',
  instanceName: 'Instance Name',
  timezone: 'Timezone',
  allowRegistration: 'Allow Public Registration',
  requireAdminApproval: 'Require Admin Approval',
  themeId: 'Theme',
  fontId: 'Font',
  customThemeColors: 'Custom colours',
  customLogoUrl: 'Logo',
  customFaviconUrl: 'Favicon',
  customMascotUrl: 'Mascot',
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'none';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

function isBeforeAndAfter(value: unknown): value is { from: unknown; to: unknown } {
  return typeof value === 'object' && value !== null && 'from' in value && 'to' in value;
}

/**
 * A line's changes in words. An account change stores each field as
 * `{ from, to }`; a settings change stores only the new values.
 */
export function changeLines(context: AdminSystemLog['context']): string[] {
  const changes = context?.changes;
  if (typeof changes !== 'object' || changes === null || Array.isArray(changes)) return [];
  return Object.entries(changes as Record<string, unknown>).map(([field, value]) => {
    const label = FIELD_LABELS[field] ?? field;
    return isBeforeAndAfter(value)
      ? `${label}: was ${formatValue(value.from)}, now ${formatValue(value.to)}`
      : `${label}: now ${formatValue(value)}`;
  });
}

/** The administrator who acted; a line keeps only the account's id, so a deleted account names no one. */
export function LogActor({ log }: { log: Pick<AdminSystemLog, 'userId' | 'actor'> }) {
  if (log.actor) {
    return (
      <>
        <div className="text-stone-gray">{log.actor.displayName}</div>
        <div className="text-xs text-warm-gray break-all">{log.actor.email}</div>
      </>
    );
  }
  if (log.userId) return <span className="text-xs text-warm-gray italic">Deleted account</span>;
  return <span className="text-xs text-warm-gray">The instance</span>;
}

/** The values before and after, folded away under the message. */
export function LogChanges({ context }: { context: AdminSystemLog['context'] }) {
  const lines = changeLines(context);
  if (lines.length === 0) return null;
  return (
    <details className="mt-1">
      <summary className="text-xs text-warm-gray cursor-pointer">What changed</summary>
      <ul className="mt-1 space-y-0.5 text-xs text-stone-gray">
        {lines.map((text) => (
          <li key={text} className="break-words whitespace-pre-wrap">{text}</li>
        ))}
      </ul>
    </details>
  );
}
