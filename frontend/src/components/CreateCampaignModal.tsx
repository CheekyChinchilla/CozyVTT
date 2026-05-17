// ============================================
// Create Campaign Modal
// Modal dialog for creating a new campaign
// ============================================

import { useState, useCallback, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Plus } from 'lucide-react';
import campaignService from '@/services/campaign.service';
import type { Campaign, GameSystem } from '@/types';
import { GAME_SYSTEM_OPTIONS } from '@/constants/game-systems';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface CreateCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (campaign: Campaign) => void;
}

export default function CreateCampaignModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateCampaignModalProps) {
  const [name, setName] = useState('');
  const [gameSystem, setGameSystem] = useState<GameSystem | null>(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleClose = useCallback(() => {
    if (!loading) {
      setName('');
      setGameSystem(null);
      setDescription('');
      setError('');
      onClose();
    }
  }, [loading, onClose]);

  const modalRef = useFocusTrap(isOpen, handleClose);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    // Validation
    if (name.trim().length < 2) {
      setError('Campaign name must be at least 2 characters');
      return;
    }

    if (name.trim().length > 100) {
      setError('Campaign name must be less than 100 characters');
      return;
    }

    setLoading(true);

    try {
      const campaign = await campaignService.createCampaign({
        name: name.trim(),
        gameSystem: gameSystem || undefined,
        description: description.trim() || undefined,
      });

      // Reset form
      setName('');
      setGameSystem(null);
      setDescription('');

      // Notify parent
      onSuccess(campaign);

      // Close modal
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create campaign');
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
              aria-labelledby="create-campaign-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg p-6 relative rounded-lg border border-moss-green/20 shadow-2xl"
              style={{
                background: 'rgba(254, 243, 199, 0.98)', // Almost opaque parchment
                backdropFilter: 'blur(10px)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-moss-green/10" aria-hidden="true">
                    <Plus className="w-6 h-6 text-moss-green" />
                  </div>
                  <h2
                    id="create-campaign-title"
                    className="text-2xl font-semibold text-moss-green font-heading"
                  >
                    Create Campaign
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
                  <X className="w-5 h-5 text-stone-gray" aria-hidden="true" />
                </button>
              </div>

              {/* Error Alert */}
              {error && (
                <div
                  role="alert"
                  className="mb-4 bg-spirit-red/10 border border-spirit-red/30 rounded-lg p-4"
                >
                  <p className="text-sm text-spirit-red font-medium">{error}</p>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Campaign Name */}
                <div>
                  <label htmlFor="campaignName" className="block text-sm font-semibold text-gray-700 mb-2">
                    Campaign Name <span className="text-spirit-red" aria-hidden="true">*</span>
                    <span className="sr-only">(required)</span>
                  </label>
                  <input
                    type="text"
                    id="campaignName"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="The Lost Mines of Phandelver"
                    disabled={loading}
                    className="input-cozy w-full disabled:opacity-50 disabled:cursor-not-allowed"
                    autoFocus
                    required
                    aria-required="true"
                    aria-describedby="campaignName-hint"
                  />
                  <p id="campaignName-hint" className="mt-1 text-xs text-gray-600">
                    Give your campaign a memorable name (2-100 characters)
                  </p>
                </div>

                {/* Game System */}
                <div>
                  <label htmlFor="gameSystem" className="block text-sm font-semibold text-gray-700 mb-2">
                    Game System <span className="text-gray-500">(optional)</span>
                  </label>
                  <select
                    id="gameSystem"
                    value={gameSystem || ''}
                    onChange={(e) => setGameSystem((e.target.value as GameSystem) || null)}
                    disabled={loading}
                    className="input-cozy w-full disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-describedby="gameSystem-hint"
                  >
                    <option value="">Flexible (No System)</option>
                    {GAME_SYSTEM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p id="gameSystem-hint" className="mt-1 text-xs text-gray-600">
                    Select the game system for this campaign. This determines character sheet layouts and validation.
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="campaignDescription" className="block text-sm font-semibold text-gray-700 mb-2">
                    Description <span className="text-gray-500">(optional)</span>
                  </label>
                  <textarea
                    id="campaignDescription"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="A classic D&D adventure where heroes search for the lost mines..."
                    rows={4}
                    disabled={loading}
                    className="input-cozy w-full resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-describedby="campaignDescription-hint"
                  />
                  <p id="campaignDescription-hint" className="mt-1 text-xs text-gray-600">
                    Brief overview of your campaign's story and setting
                  </p>
                </div>

                {/* Info Box */}
                <div className="rounded-lg p-4 bg-moss-green/10 border border-moss-green/30">
                  <p className="text-sm text-gray-700">
                    <strong className="text-moss-green">Note:</strong> You will be automatically assigned
                    as the Dungeon Master (DM) for this campaign. You can invite players from the campaign
                    settings page.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    className="btn-secondary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={loading || name.trim().length < 2}
                    className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-busy={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" aria-hidden="true" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 inline-block mr-2" aria-hidden="true" />
                        Create Campaign
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
