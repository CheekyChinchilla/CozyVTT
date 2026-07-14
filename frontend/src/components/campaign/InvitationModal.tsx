/**
 * Campaign Invitation Modal
 */

import { useState, useEffect } from 'react';
import { Check, XCircle, Users } from 'lucide-react';
import { api } from '@/services/api';
import Toast, { useToast } from '@/components/Toast';
import type { CampaignInvitation, Character } from '@/types';
import { Modal } from '@/components/ui';

interface InvitationModalProps {
  invitation: CampaignInvitation;
  onClose: () => void;
  onAccept: () => void;
  onDecline: () => void;
}

export default function InvitationModal({
  invitation,
  onClose,
  onAccept,
  onDecline,
}: InvitationModalProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const { toast, showToast, hideToast } = useToast();

  // Fetch user's characters
  useEffect(() => {
    const fetchCharacters = async () => {
      try {
        setLoading(true);
        const response = await api.listCharacters();

        // Filter for compatible characters
        const compatible = response.characters.filter((char: Character) => {
          // Not already assigned
          const notAssigned = !char.campaignId;

          // Game system compatible
          const systemMatch =
            !char.gameSystem ||
            !invitation.campaign?.gameSystem ||
            char.gameSystem === invitation.campaign.gameSystem;

          return notAssigned && systemMatch;
        });

        setCharacters(compatible);
      } catch (error) {
        console.error('Error fetching characters:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCharacters();
  }, [invitation.campaign?.gameSystem]);

  // Toggle character selection
  const toggleCharacter = (characterId: string) => {
    setSelectedCharacterIds((prev) =>
      prev.includes(characterId)
        ? prev.filter((id) => id !== characterId)
        : [...prev, characterId]
    );
  };

  // Handle accept invitation
  const handleAccept = async () => {
    try {
      setProcessing(true);
      await api.acceptInvitation(invitation.id, selectedCharacterIds);
      onAccept();
    } catch (error: any) {
      console.error('Error accepting invitation:', error);
      showToast(error.response?.data?.message || 'Failed to accept invitation', 'error');
    } finally {
      setProcessing(false);
    }
  };

  // Handle decline invitation
  const handleDecline = async () => {
    try {
      setProcessing(true);
      await api.declineInvitation(invitation.id);
      onDecline();
    } catch (error: any) {
      console.error('Error declining invitation:', error);
      showToast(error.response?.data?.message || 'Failed to decline invitation', 'error');
    } finally {
      setProcessing(false);
    }
  };

  // Get game system display name
  const getSystemName = (gameSystem: string | null) => {
    switch (gameSystem) {
      case 'DND_5E':
        return 'D&D 5th Edition';
      case 'PATHFINDER_2E':
        return 'Pathfinder 2nd Edition';
      case 'SHADOWRUN_6E':
        return 'Shadowrun 6th Edition';
      case 'CALL_OF_CTHULHU_7E':
        return 'Call of Cthulhu 7th Edition';
      case null:
        return 'Flexible/Custom';
      default:
        return gameSystem;
    }
  };

  return (
    <>
      <Modal open onClose={onClose} title="Campaign Invitation" icon={Users} size="lg" closeDisabled={processing}>
          <p className="text-sm text-ink-muted -mt-4 mb-4">
            You've been invited to join a campaign
          </p>

          {/* Campaign Details */}
          <div className="mb-6 p-4 rounded-lg bg-parchment/50 border border-moss-green/20">
            <h3 className="text-lg font-semibold text-moss-green mb-2">
              {invitation.campaign?.name}
            </h3>
            {invitation.campaign?.description && (
              <p className="text-sm text-warm-gray mb-3">
                {invitation.campaign.description}
              </p>
            )}
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-warm-gray">Game System:</span>{' '}
                <span className="font-medium text-stone-gray">
                  {getSystemName(invitation.campaign?.gameSystem || null)}
                </span>
              </div>
              {invitation.campaign?.owner && (
                <div>
                  <span className="text-warm-gray">DM:</span>{' '}
                  <span className="font-medium text-stone-gray">
                    {invitation.campaign.owner.displayName}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Character Selection */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-moss-green mb-3">
              Select Characters (Optional)
            </h3>
            <p className="text-sm text-warm-gray mb-4">
              Choose which characters you'd like to bring to this campaign. You can also join without characters and add them later.
            </p>

            {loading ? (
              <div className="text-center py-8">
                <p className="text-sm text-warm-gray">Loading characters...</p>
              </div>
            ) : characters.length === 0 ? (
              <div className="text-center py-8 px-4 rounded-lg bg-parchment/50">
                <p className="text-sm text-warm-gray mb-2">
                  No compatible characters available
                </p>
                <p className="text-xs text-warm-gray">
                  Create a new character or unassign one from another campaign to bring it here.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {characters.map((character) => (
                  <label
                    key={character.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-parchment/50 hover:bg-parchment cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCharacterIds.includes(character.id)}
                      onChange={() => toggleCharacter(character.id)}
                      className="w-4 h-4 rounded border-moss-green/30 text-moss-green focus:ring-moss-green focus:ring-offset-0"
                    />
                    {character.tokenImageUrl ? (
                      <img
                        src={character.tokenImageUrl}
                        alt={character.name}
                        className="w-10 h-10 rounded-full object-cover border border-moss-green/20"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-moss-green/10 border border-moss-green/20 flex items-center justify-center">
                        <span className="text-sm text-moss-green font-semibold">
                          {character.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-stone-gray">
                        {character.name}
                      </p>
                      {character.gameSystem && (
                        <p className="text-xs text-warm-gray">
                          {getSystemName(character.gameSystem)}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleDecline}
              disabled={processing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <XCircle className="w-4 h-4" />
              Decline
            </button>
            <button
              onClick={handleAccept}
              disabled={processing}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-moss-green text-white hover:bg-moss-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              {processing ? 'Processing...' : 'Accept Invitation'}
            </button>
          </div>
      </Modal>

      <Toast message={toast.message} type={toast.type} show={toast.show} onClose={hideToast} />
    </>
  );
}
