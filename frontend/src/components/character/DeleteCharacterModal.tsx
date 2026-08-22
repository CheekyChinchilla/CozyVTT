// ============================================
// Delete Character Modal
// Confirmation dialog with campaign assignment validation
// ============================================

import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import type { Character, Campaign } from '@/types';
import { Button, Modal } from '@/components/ui';

interface DeleteCharacterModalProps {
  isOpen: boolean;
  character: Character | null;
  campaign?: Campaign | null;
  onClose: () => void;
  onConfirm: (characterId: string) => Promise<void>;
}

export default function DeleteCharacterModal({
  isOpen,
  character,
  campaign,
  onClose,
  onConfirm,
}: DeleteCharacterModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    if (!loading) {
      setError('');
      onClose();
    }
  };

  if (!character) return null;

  // Check if character is in an active or paused campaign
  const isInActiveCampaign = campaign && (
    campaign.status === 'ACTIVE' || campaign.status === 'PAUSED'
  );

  // Check if character is in preparation/completed/archived campaign
  const isInInactiveCampaign = campaign && (
    campaign.status === 'PREPARATION' ||
    campaign.status === 'COMPLETED' ||
    campaign.status === 'ARCHIVED'
  );

  const handleConfirm = async () => {
    // Prevent deletion if in active campaign
    if (isInActiveCampaign) {
      setError(`Cannot delete character assigned to ${campaign!.status.toLowerCase()} campaign`);
      return;
    }

    setError('');
    setLoading(true);

    try {
      await onConfirm(character.id);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete character');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={handleClose} title="Delete Character" icon={Trash2} size="sm" closeDisabled={loading}>
      {/* Error Alert */}
      {error && (
        <div role="alert" className="mb-4 bg-danger/10 border border-danger/30 rounded-lg p-4">
          <p className="text-sm text-danger font-medium">{error}</p>
        </div>
      )}

      {/* Content */}
      <div className="space-y-4">
                {/* Active Campaign Warning */}
                {isInActiveCampaign && (
                  <div className="bg-warm-amber/10 border border-warm-amber/30 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-warm-amber flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-semibold text-warm-amber mb-1">
                          Cannot Delete Character
                        </h3>
                        <p className="text-sm text-stone-gray">
                          This character is assigned to <strong>{campaign!.name}</strong>,
                          which is currently {campaign!.status.toLowerCase()}. You cannot delete
                          characters that are assigned to active or paused campaigns.
                        </p>
                        <p className="text-sm text-stone-gray mt-2">
                          To delete this character, first unassign it from the campaign or wait
                          until the campaign is completed or archived.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Inactive Campaign Warning */}
                {isInInactiveCampaign && (
                  <div className="bg-warm-amber/10 border border-warm-amber/30 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-warm-amber flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-semibold text-warm-amber mb-1">
                          Character is Assigned to Campaign
                        </h3>
                        <p className="text-sm text-stone-gray">
                          This character is assigned to <strong>{campaign!.name}</strong>{' '}
                          ({campaign!.status.toLowerCase()}). It's recommended to unassign the
                          character first before deleting.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Unassigned Character Confirmation */}
                {!campaign && (
                  <div className="bg-moss-green/10 border border-moss-green/30 rounded-lg p-4">
                    <p className="text-sm text-stone-gray">
                      Are you sure you want to delete <strong className="text-brand-ink">{character.name}</strong>?
                      This action cannot be undone.
                    </p>
                  </div>
                )}

                {/* Character Info */}
                <div className="glass-panel p-4">
                  <h3 className="font-semibold text-brand-ink mb-2">Character Details</h3>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-warm-gray">Name:</dt>
                      <dd className="text-stone-gray font-medium">{character.name}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-warm-gray">Game System:</dt>
                      <dd className="text-stone-gray font-medium">
                        {character.gameSystem || 'Flexible'}
                      </dd>
                    </div>
                    {campaign && (
                      <div className="flex justify-between">
                        <dt className="text-warm-gray">Campaign:</dt>
                        <dd className="text-stone-gray font-medium">{campaign.name}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

      {/* Actions */}
      <div className="flex gap-3 pt-6">
        <Button
          type="button"
          onClick={handleClose}
          disabled={loading}
          variant="secondary"
          className="flex-1"
        >
          Cancel
        </Button>

        <Button
          type="button"
          onClick={handleConfirm}
          disabled={!!isInActiveCampaign}
          loading={loading}
          icon={Trash2}
          variant="danger"
          className="flex-1"
        >
          {loading ? 'Deleting...' : 'Delete Character'}
        </Button>
      </div>
    </Modal>
  );
}
