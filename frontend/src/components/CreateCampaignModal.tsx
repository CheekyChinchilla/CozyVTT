// ============================================
// Create Campaign Modal
// Modal dialog for creating a new campaign
// ============================================

import { useState, useCallback, FormEvent } from 'react';
import { Plus } from 'lucide-react';
import campaignService from '@/services/campaign.service';
import type { Campaign, GameSystem } from '@/types';
import { GAME_SYSTEM_OPTIONS } from '@/constants/game-systems';
import { Button, Modal, Field, Input, Textarea, Select } from '@/components/ui';

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
    <Modal open={isOpen} onClose={handleClose} title="Create Campaign" icon={Plus} closeDisabled={loading}>
      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="mb-4 bg-danger/10 border border-danger/30 rounded-lg p-4"
        >
          <p className="text-sm text-danger font-medium">{error}</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Campaign Name" required hint="Give your campaign a memorable name (2-100 characters)">
          {(field) => (
            <Input
              {...field}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Lost Mines of Phandelver"
              disabled={loading}
              autoFocus
              required
            />
          )}
        </Field>

        <Field label="Game System" hint="Select the game system for this campaign. This determines character sheet layouts and validation.">
          {(field) => (
            <Select
              {...field}
              value={gameSystem || ''}
              onChange={(e) => setGameSystem((e.target.value as GameSystem) || null)}
              disabled={loading}
            >
              <option value="">Flexible (No System)</option>
              {GAME_SYSTEM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Description" hint="Brief overview of your campaign's story and setting">
          {(field) => (
            <Textarea
              {...field}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A classic D&D adventure where heroes search for the lost mines..."
              rows={4}
              disabled={loading}
            />
          )}
        </Field>

        {/* Info Box */}
        <div className="rounded-lg p-4 bg-brand/10 border border-brand/30">
          <p className="text-sm text-ink">
            <strong className="text-brand">Note:</strong> You will be automatically assigned
            as the Dungeon Master (DM) for this campaign. You can invite players from the campaign
            settings page.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
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
            type="submit"
            disabled={name.trim().length < 2}
            loading={loading}
            icon={Plus}
            className="flex-1"
          >
            {loading ? 'Creating...' : 'Create Campaign'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
