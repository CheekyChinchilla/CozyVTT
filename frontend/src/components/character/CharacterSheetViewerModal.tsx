/**
 * Character Sheet Viewer Modal
 */

import { useState, useEffect } from 'react';
import { X, Shield, User as UserIcon } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useAuth } from '@/contexts/AuthContext';
import { useOptionalWebSocket } from '@/contexts/WebSocketContext';
import { useTableRoll } from '@/hooks/useTableRoll';
import { canEditCharacter, canEditCharacterIn, canRollAsCharacter } from '@/services/permissions';
import { api } from '@/services/api';
import type { Campaign, Character, CampaignMembership } from '@/types';
import { gameSystemName } from '@/constants/game-systems';

// Import view components
import { DnD5eCharacterView } from '../character-sheets/dnd5e/DnD5eCharacterView';
import Pathfinder2eCharacterView from '../character-sheets/pathfinder2e/Pathfinder2eCharacterView';
import Shadowrun6eCharacterSheet from '../character-sheets/shadowrun6e/Shadowrun6eCharacterSheet';
import CallOfCthulhu7eCharacterView from '../character-sheets/call-of-cthulhu-7e/CallOfCthulhu7eCharacterView';
import { FlexibleCharacterSheetView } from '../character-sheets/flexible/FlexibleCharacterSheetView';
import { CharacterSheetErrorBoundary } from '../character-sheets/ErrorBoundary';

// Import editor modal
import CharacterSheetEditorModal from './CharacterSheetEditorModal';

interface CharacterSheetViewerModalProps {
  character: Character;
  /**
   * Campaign context, when the sheet was opened from inside a campaign. Absent
   * when opened from the character gallery, where a character is always your
   * own; there `campaign`, the character's campaign as your campaign list
   * gives it, says whether you are a spectator in it and so may not edit.
   */
  campaignId?: string;
  membership?: CampaignMembership;
  campaign?: Campaign | null;
  /**
   * The name rolls go under in the dice log, when the sheet was opened from a
   * token that may not be named in front of everyone. The character's name
   * otherwise.
   */
  publicName?: string;
  onClose: () => void;
  /**
   * Called with the character as stored, each time the sheet loads it again
   * after its editor closes: after a save, or after a save refused because the
   * character had changed. For a page that keeps its own copy and has no live
   * updates to follow, such as the character gallery.
   */
  onCharacterChanged?: (character: Character) => void;
}

export default function CharacterSheetViewerModal({
  character: initialCharacter,
  campaignId: _campaignId,
  membership,
  campaign,
  publicName,
  onClose,
  onCharacterChanged,
}: CharacterSheetViewerModalProps) {
  const { user } = useAuth();
  // Optional: this modal opens both from the campaign roster, where there is a
  // websocket, and from the character gallery, where there is not. Live updates
  // and click-to-roll are a bonus in the first case rather than a requirement.
  const ws = useOptionalWebSocket();
  const socket = ws?.socket;
  const tableRoll = useTableRoll(socket);
  const [character, setCharacter] = useState(initialCharacter);
  const [showEditor, setShowEditor] = useState(false);

  // The owner's name comes with the character: GET /api/characters/:id names
  // its owner to anyone who may read it. Asking GET /api/users/:id instead was
  // refused for anyone but the owner and an admin.
  const ownerName = character.userId === user?.id
    ? 'You'
    : character.user?.displayName ?? 'Unknown Player';

  // Listen for character updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleCharacterUpdate = (data: { characterId: string; character?: Character }) => {
      // The same event is also sent to campaigns that merely hold a token for
      // this character, and those carry no sheet — reading it is not something
      // membership of *that* campaign entitles you to. Nothing to refresh here.
      if (!data.character) return;
      if (data.characterId === character.id) {
        console.log('Character updated - refreshing viewer');
        // A live update carries no owner; keep the one already loaded.
        const updated = data.character;
        setCharacter((previous) => ({ ...updated, user: updated.user ?? previous.user }));
      }
    };

    // Hit points changed at the table (the roster's +/- buttons) arrive as
    // `character.hp.updated`, carrying only the numbers. The character is
    // loaded again, so the sheet shows them and an edit opened from here
    // starts from the current version.
    const handleHpUpdate = (data: { characterId: string }) => {
      if (data.characterId !== character.id) return;
      api
        .getCharacter(character.id)
        .then(({ character: fresh }) => setCharacter(fresh))
        .catch((error: unknown) => console.error('Error refreshing character after an HP change:', error));
    };

    socket.on('character.updated', handleCharacterUpdate);
    socket.on('character.hp.updated', handleHpUpdate);

    return () => {
      socket.off('character.updated', handleCharacterUpdate);
      socket.off('character.hp.updated', handleHpUpdate);
    };
  }, [socket, character.id]);

  // Check if user can edit
  const canEdit = user
    ? (membership ? canEditCharacter(user, character, membership) : canEditCharacterIn(user, character, campaign))
    : false;
  // Reading someone else's sheet is deliberate — the server lets any campaign
  // member do it. Rolling from it is not: those are their modifiers.
  const canRoll = user ? canRollAsCharacter(user, character, membership) : false;
  const isDMEditingOtherCharacter =
    membership?.role === 'DM' && character.userId !== user?.id;

  // Handle edit - open editor modal
  const handleEdit = () => {
    setShowEditor(true);
  };

  // Handle editor save - refresh character data
  const handleEditorSaved = async () => {
    try {
      const { character: updatedCharacter } = await api.getCharacter(character.id);
      setCharacter(updatedCharacter);
      onCharacterChanged?.(updatedCharacter);
    } catch (error) {
      console.error('Error refreshing character after save:', error);
    }
  };

  // Close editor modal
  const handleCloseEditor = () => {
    setShowEditor(false);
  };

  // Every open dialog hears Escape, so with the editor open over the sheet
  // the sheet leaves it to the editor.
  const modalRef = useFocusTrap(true, showEditor ? undefined : onClose);

  // Handle click-to-roll: rolls at the table, and says so when refused.
  // Named so the panel heads the entry with the character whose sheet this
  // is, not with whoever happens to be reading it.
  const handleRoll = (expression: string, purpose: string) =>
    tableRoll({ expression, purpose, characterName: publicName ?? character.name });

  // Passed to the sheet views only when this viewer may roll and there is a
  // table to roll at; without it the stats render as plain text. The
  // Characters page has no socket, so its sheets offer no rolls.
  const rollHandler = canRoll && socket ? handleRoll : undefined;

  // Spending follows the same rule as rolling. The server checks it again
  // (owner or DM), so this only decides whether the control is offered.
  const spendHitDie = canRoll && socket
    ? (index: number) => socket.emitHitDiceSpend({ characterId: character.id, index })
    : undefined;

  // Render appropriate character sheet view based on game system
  const renderCharacterSheet = () => {
    switch (character.gameSystem) {
      case 'DND_5E':
        return <DnD5eCharacterView character={character} onEdit={canEdit ? handleEdit : undefined} onRoll={rollHandler} onSpendHitDie={spendHitDie} />;
      case 'PATHFINDER_2E':
        return <Pathfinder2eCharacterView character={character} onEdit={canEdit ? handleEdit : undefined} onRoll={rollHandler} />;
      case 'SHADOWRUN_6E':
        return <Shadowrun6eCharacterSheet character={character} mode="view" />;
      case 'CALL_OF_CTHULHU_7E':
        return <CallOfCthulhu7eCharacterView character={character} onEdit={canEdit ? handleEdit : undefined} onRoll={rollHandler} />;
      default:
        return <FlexibleCharacterSheetView character={character} onEdit={canEdit ? handleEdit : undefined} />;
    }
  };

  return (
    <>
    {/* m-0: the roster renders this inside its spaced list (space-y-4), whose
        margin would otherwise leave a strip of the window uncovered. */}
    <div className="fixed inset-0 z-50 m-0 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
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
                  <span>{gameSystemName(character.gameSystem)}</span>
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

          {/* Actions — close only. Edit lives on the sheet itself, which
              receives handleEdit as onEdit below; rendering it here as well
              produced two working Edit buttons on every character. */}
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="p-2 rounded-lg hover:bg-stone-gray/10 transition-colors"
            >
              <X className="w-5 h-5 text-stone-gray" />
            </button>
          </div>
        </div>

        {/* Character Sheet Content. A sheet that cannot be drawn fails here,
            inside the dialog, and not across the whole page; a new version of
            the character tries it again. Keyed on the character alone, so a
            sheet that is drawn keeps its open tab through every update. */}
        <div className="flex-1 overflow-y-auto p-6">
          <CharacterSheetErrorBoundary key={character.id} resetKey={character.updatedAt}>
            {renderCharacterSheet()}
          </CharacterSheetErrorBoundary>
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
