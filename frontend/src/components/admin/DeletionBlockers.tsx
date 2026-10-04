/**
 * The campaigns that stop a user being deleted, and what an admin can do
 * about each: hand the DM seat to another member, or delete the campaign.
 * Both are routes an admin may call for any campaign. Without this, a user
 * who runs campaigns of their own could keep their account by refusing to
 * hand them over.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import type { DeletionBlocker } from '@/types';

interface DeletionBlockersProps {
  campaigns: DeletionBlocker[];
  /** A campaign no longer stands in the way. */
  onCleared: (campaignId: string) => void;
  onError: (message: string) => void;
}

export default function DeletionBlockers({ campaigns, onCleared, onError }: DeletionBlockersProps) {
  const [heirs, setHeirs] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const act = async (campaignId: string, action: () => Promise<unknown>, fallback: string) => {
    setWorking(campaignId);
    try {
      await action();
      onCleared(campaignId);
    } catch (err: unknown) {
      onError(apiErrorMessage(err) ?? fallback);
    } finally {
      setWorking(null);
      setConfirming(null);
    }
  };

  return (
    <div className="mb-3 space-y-2">
      <p className="text-xs text-warm-gray">
        Hand each campaign to another member as DM, or delete it. The campaign then belongs to its new DM.
      </p>
      {campaigns.map((c) => {
        const heir = heirs[c.id] ?? c.members[0]?.userId ?? '';
        const busy = working === c.id;
        return (
          <div key={c.id} className="p-2.5 rounded-lg border border-warm-gray/20 bg-surface/40 text-xs space-y-2">
            <p className="font-medium text-brand-ink">{c.name}</p>
            {c.members.length > 0 ? (
              <div className="flex items-center gap-2">
                <select
                  aria-label={`New DM for ${c.name}`}
                  value={heir}
                  onChange={(e) => setHeirs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  disabled={busy}
                  className="input-cozy text-xs flex-1"
                >
                  {c.members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName} ({m.role.toLowerCase()})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => act(c.id, () => api.transferDM(c.id, heir), 'Failed to hand over the campaign')}
                  disabled={busy || heir === ''}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg font-medium bg-moss-green text-white disabled:opacity-50"
                >
                  {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                  Make DM
                </button>
              </div>
            ) : (
              <p className="text-warm-gray">No other members, so it can only be deleted.</p>
            )}
            {confirming === c.id ? (
              <div className="flex items-center gap-2">
                <span className="text-danger-ink">Its maps, tokens, chat and rolls go with it.</span>
                <button
                  type="button"
                  onClick={() => act(c.id, () => api.deleteCampaign(c.id), 'Failed to delete the campaign')}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg font-medium bg-danger text-white disabled:opacity-50"
                >
                  {`Delete ${c.name} for good`}
                </button>
                <button type="button" onClick={() => setConfirming(null)} className="underline">
                  Keep it
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(c.id)} disabled={busy} className="text-danger-ink underline disabled:opacity-50">
                Delete campaign
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
