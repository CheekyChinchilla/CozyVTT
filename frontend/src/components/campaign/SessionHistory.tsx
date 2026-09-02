/**
 * Session History
 *
 * The notes a DM writes when ending a session, read back.
 *
 * Those notes have always been saved — the end-session dialog said so — but
 * nothing displayed them, so they went into the database and stayed there. This
 * is the panel the dialog was promising. Everyone in the campaign sees it: the
 * notes describe what happened at the table, which is exactly what a player
 * wants before the next game.
 */

import { useCallback, useEffect, useState } from 'react';
import { ScrollText, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import api from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import type { SessionSummary } from '@/types';

/** "8 Jan 2026" — short enough for a side panel, unambiguous about the month. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * "3h 30m", or null when a session has no end recorded.
 *
 * Anything under a minute reads "<1m" rather than "0m" — a session ended by
 * accident right after starting is a real thing, and "0m" looks like a bug.
 */
function formatDuration(startedAt: string, endedAt: string | null): string | null {
  if (!endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return '<1m';
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export default function SessionHistory() {
  const { campaign, activeSession } = useCampaign();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const campaignId = campaign?.id;

  const load = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const { sessions: fetched } = await api.listSessions(campaignId);
      setSessions(fetched);
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not load past sessions.');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  // Reload when the campaign changes, and whenever a session starts or ends —
  // ending one is what adds the notes this panel exists to show.
  useEffect(() => {
    void load();
  }, [load, activeSession?.id]);

  if (!campaignId) return null;

  // Only sessions that have finished. The one in progress has nothing written
  // about it yet, and listing it would read as an empty entry.
  const past = sessions.filter((session) => session.endedAt !== null);

  return (
    <div className="glass-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded((open) => !open)}
          className="flex items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-stone-gray" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-stone-gray" />
          )}
          <ScrollText className="w-4 h-4 text-warm-amber" />
          <h3 className="text-sm font-semibold text-brand-ink">Past Sessions</h3>
          {past.length > 0 && (
            <span className="text-xs text-stone-gray">({past.length})</span>
          )}
        </button>

        <button
          onClick={() => void load()}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-moss-green/10 transition-colors text-stone-gray hover:text-brand-ink disabled:opacity-50"
          title="Refresh"
          aria-label="Refresh past sessions"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="space-y-3">
          {error && <p className="text-xs text-danger-ink">{error}</p>}

          {!error && past.length === 0 && !loading && (
            <p className="text-xs text-warm-gray">
              No finished sessions yet. When the DM ends a session, whatever they write
              about it appears here.
            </p>
          )}

          {past.map((session) => {
            const duration = formatDuration(session.startedAt, session.endedAt);
            return (
              <article
                key={session.id}
                className="rounded-cozy border border-warm-amber/30 bg-parchment/40 p-3"
              >
                <header className="flex items-baseline justify-between gap-2 mb-1">
                  <h4 className="text-xs font-semibold text-brand-ink">
                    Session {session.sessionNumber}
                  </h4>
                  <span className="text-[11px] text-stone-gray shrink-0">
                    {formatDate(session.startedAt)}
                    {duration && ` · ${duration}`}
                  </span>
                </header>

                {session.notes ? (
                  // `whitespace-pre-wrap` so the DM's own line breaks survive —
                  // these are usually written as a short list of what happened.
                  <p className="text-xs text-brand-ink whitespace-pre-wrap break-words">
                    {session.notes}
                  </p>
                ) : (
                  <p className="text-xs text-warm-gray italic">No notes were written.</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
