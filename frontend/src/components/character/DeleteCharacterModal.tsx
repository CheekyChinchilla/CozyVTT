// ============================================
// Delete Character Modal
// Confirmation dialog with campaign assignment validation
// ============================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { X, Loader2, AlertTriangle, Trash2 } from 'lucide-react';
import type { Character, Campaign } from '@/types';

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

  // handleClose must be defined before useFocusTrap (and before the early return)
  // so the hook is always called unconditionally — Rules of Hooks.
  const handleClose = () => {
    if (!loading) {
      setError('');
      onClose();
    }
  };

  // useFocusTrap must be called unconditionally. Pass isOpen && !!character so
  // the trap only activates when there is actually a character to display.
  const modalRef = useFocusTrap(isOpen && !!character, handleClose);

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
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-character-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-md p-6 relative rounded-lg border border-spirit-red/30 shadow-2xl"
              style={{
                background: 'rgba(254, 243, 199, 0.98)',
                backdropFilter: 'blur(10px)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-spirit-red/10">
                    <Trash2 className="w-6 h-6 text-spirit-red" />
                  </div>
                  <h2 id="delete-character-title" className="text-2xl font-semibold text-spirit-red font-heading">
                    Delete Character
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="p-2 rounded-lg hover:bg-warm-gray/10 transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Close dialog"
                >
                  <X className="w-5 h-5 text-stone-gray" />
                </button>
              </div>

              {/* Error Alert */}
              {error && (
                <div className="mb-4 bg-spirit-red/10 border border-spirit-red/30 rounded-lg p-4">
                  <p className="text-sm text-spirit-red font-medium">{error}</p>
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
                      Are you sure you want to delete <strong className="text-moss-green">{character.name}</strong>?
                      This action cannot be undone.
                    </p>
                  </div>
                )}

                {/* Character Info */}
                <div className="glass-panel p-4">
                  <h3 className="font-semibold text-moss-green mb-2">Character Details</h3>
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
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="btn-secondary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={loading || !!isInActiveCampaign}
                  className="btn-danger flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 inline-block mr-2" />
                      Delete Character
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
