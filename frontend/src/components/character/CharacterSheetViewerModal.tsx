/**
 * Character Sheet Viewer Modal
 */

import { useState, useEffect } from 'react';
import { X, Edit, Shield, User as UserIcon } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useAuth } from '@/contexts/AuthContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { canEditCharacter } from '@/services/permissions';
import { api } from '@/services/api';
import type { Character, GameSystem, CampaignMembership } from '@/types';

// Import view components
import { DnD5eCharacterView } from '../character-sheets/dnd5e/DnD5eCharacterView';
import Pathfinder2eCharacterView from '../character-sheets/pathfinder2e/Pathfinder2eCharacterView';
import Shadowrun6eCharacterSheet from '../character-sheets/shadowrun6e/Shadowrun6eCharacterSheet';
import CallOfCthulhu7eCharacterView from '../character-sheets/call-of-cthulhu-7e/CallOfCthulhu7eCharacterView';
import { FlexibleCharacterSheetView } from '../character-sheets/flexible/FlexibleCharacterSheetView';

// Import editor modal
import CharacterSheetEditorModal from './CharacterSheetEditorModal';

interface CharacterSheetViewerModalProps {
  character: Character;
  campaignId: string;
  membership: CampaignMembership;
  onClose: () => void;
}

export default function CharacterSheetViewerModal({
  character: initialCharacter,
  campaignId: _campaignId,
  membership,
  onClose,
}: CharacterSheetViewerModalProps) {
  const { user } = useAuth();
  const { socket } = useWebSocket();
  const [character, setCharacter] = useState(initialCharacter);
  const [ownerName, setOwnerName] = useState<string>('');
  const [showEditor, setShowEditor] = useState(false);

  // Fetch character owner's name
  useEffect(() => {
    const fetchOwnerName = async () => {
      try {
        const response = await api.getUser(character.userId);
        setOwnerName(response.user.displayName);
      } catch (error) {
        console.error('Error fetching character owner:', error);
        setOwnerName('Unknown Player');
      }
    };

    if (character.userId !== user?.id) {
      fetchOwnerName();
    } else {
      setOwnerName('You');
    }
  }, [character.userId, user?.id]);

  // Listen for character updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleCharacterUpdate = (data: { characterId: string; character: Character }) => {
      if (data.characterId === character.id) {
        console.log('Character updated - refreshing viewer');
        setCharacter(data.character);
      }
    };

    socket.on('character.updated', handleCharacterUpdate);

    return () => {
      socket.off('character.updated', handleCharacterUpdate);
    };
  }, [socket, character.id]);

  // Check if user can edit
  const canEdit = user ? canEditCharacter(user, character, membership) : false;
  const isDMEditingOtherCharacter =
    membership.role === 'DM' && character.userId !== user?.id;

  // Handle edit - open editor modal
  const handleEdit = () => {
    setShowEditor(true);
  };

  // Handle editor save - refresh character data
  const handleEditorSaved = async () => {
    try {
      const { character: updatedCharacter } = await api.getCharacter(character.id);
      setCharacter(updatedCharacter);
    } catch (error) {
      console.error('Error refreshing character after save:', error);
    }
  };

  // Close editor modal
  const handleCloseEditor = () => {
    setShowEditor(false);
  };

  const modalRef = useFocusTrap(true, onClose);

  // Get game system display name
  const getSystemName = (gameSystem: GameSystem | null) => {
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

  // Handle click-to-roll — emit dice roll via WebSocket
  const handleRoll = (expression: string, purpose: string) => {
    if (socket) {
      socket.emitDiceRoll({ expression, purpose });
    }
  };

  // Render appropriate character sheet view based on game system
  const renderCharacterSheet = () => {
    switch (character.gameSystem) {
      case 'DND_5E':
        return <DnD5eCharacterView character={character} onEdit={canEdit ? handleEdit : undefined} onRoll={handleRoll} />;
      case 'PATHFINDER_2E':
        return <Pathfinder2eCharacterView character={character} onEdit={canEdit ? handleEdit : undefined} onRoll={handleRoll} />;
      case 'SHADOWRUN_6E':
        return <Shadowrun6eCharacterSheet character={character} mode="view" />;
      case 'CALL_OF_CTHULHU_7E':
        return <CallOfCthulhu7eCharacterView character={character} onEdit={canEdit ? handleEdit : undefined} onRoll={handleRoll} />;
      default:
        return <FlexibleCharacterSheetView character={character} onEdit={canEdit ? handleEdit : undefined} />;
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" aria-hidden="true">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-sheet-viewer-title"
        className="bg-soft-cream border-2 border-moss-green/30 rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-moss-green/20 bg-parchment/30">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-full bg-moss-green/10">
                <UserIcon className="w-5 h-5 text-brand-ink" />
              </div>
              <div>
                <h2 id="character-sheet-viewer-title" className="text-2xl font-bold text-brand-ink">
                  {character.name}
                </h2>
                <div className="flex items-center gap-3 text-sm text-warm-gray">
                  <span>Player: {ownerName}</span>
                  <span>•</span>
                  <span>{getSystemName(character.gameSystem)}</span>
                </div>
              </div>
            </div>

            {/* DM Edit Banner */}
            {isDMEditingOtherCharacter && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-moss-green/10 border border-moss-green/30 rounded-lg">
                <Shield className="w-4 h-4 text-brand-ink" />
                <p className="text-sm text-brand-ink">
                  You are viewing <strong>{ownerName}'s</strong> character as DM
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-4">
            {canEdit && (
              <button
                onClick={handleEdit}
                className="flex items-center gap-2 px-4 py-2 bg-moss-green text-white rounded-lg hover:bg-moss-green/90 transition-colors"
              >
                <Edit className="w-4 h-4" />
                Edit
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="p-2 rounded-lg hover:bg-stone-gray/10 transition-colors"
            >
              <X className="w-5 h-5 text-stone-gray" />
            </button>
          </div>
        </div>

        {/* Character Sheet Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {renderCharacterSheet()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-moss-green/20 bg-parchment/30">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg bg-stone-gray/10 text-stone-gray hover:bg-stone-gray/20 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>

      {/* Character Editor Modal */}
      {showEditor && (
        <CharacterSheetEditorModal
          character={character}
          onClose={handleCloseEditor}
          onSaved={handleEditorSaved}
        />
      )}
    </>
  );
}
