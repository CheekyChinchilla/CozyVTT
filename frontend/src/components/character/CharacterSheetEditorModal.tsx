/**
 * Character Sheet Editor Modal
 */

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useUnsavedWorkGuard } from '@/hooks/useUnsavedWorkGuard';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/services/api';
import type { Character } from '@/types';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import SignedOutNotice from '@/components/common/SignedOutNotice';

// Import editor components
import DnD5eCharacterEditor from '../character-sheets/dnd5e/DnD5eCharacterEditor';
import Pathfinder2eCharacterEditor from '../character-sheets/pathfinder2e/Pathfinder2eCharacterEditor';
import CallOfCthulhu7eCharacterEditor from '../character-sheets/call-of-cthulhu-7e/CallOfCthulhu7eCharacterEditor';
import { FlexibleCharacterSheetEdit } from '../character-sheets/flexible/FlexibleCharacterSheetEdit';
import { apiErrorMessage, apiValidationIssues } from '@/utils/errors';
import { isStaleCharacterSave } from '@/utils/staleCharacter';
import { useStaleSaveReapply } from './StaleSaveDialog';
import { isSignedOutSave, SIGNED_OUT_NOT_SAVED } from '@/utils/signedOut';
import { reportSignedIn, reportSignedOut } from '@/services/unsavedWork';
import type { CharacterData } from '@/types';

interface CharacterSheetEditorModalProps {
  character: Character;
  onClose: () => void;
  onSaved?: () => void; // Optional callback after save
}

export default function CharacterSheetEditorModal({
  character,
  onClose,
  onSaved,
}: CharacterSheetEditorModalProps) {
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const signedOut = useUnsavedWorkGuard(hasUnsavedChanges);
  const { showToast } = useToast();
  // The version the editor's form was made from: the one it opened, then the
  // one each save stored while the editor stays open. The character handed in
  // here can be refreshed meanwhile, since the sheet behind it follows the
  // table, but the editor's form is not, so its save is made from this one,
  // and a refused save's changes are measured from its sheet.
  const [loadedAt, setLoadedAt] = useState(character.updatedAt);
  const openedSheetRef = useRef(character.data);
  const staleSave = useStaleSaveReapply();

  // Handle save. The editors pass a freshly-uploaded token image URL as the
  // third argument — forward it so the character's token actually updates.
  // (Omit it when undefined so an edit that didn't touch the token keeps the
  // existing image.)
  const handleSave = async (data: CharacterData, _showToast?: boolean, tokenImageUrl?: string) => {
    const picture = tokenImageUrl !== undefined ? { tokenImageUrl } : {};
    try {
      setSaving(true);
      let saved: Character;
      let carriedOver = false;
      try {
        ({ character: saved } = await api.updateCharacter(character.id, { data, updatedAt: loadedAt, ...picture }));
      } catch (error) {
        // Saving over a newer version would undo it. The editor stays open,
        // the player's changes are carried onto the newest version, and that
        // is saved once they say so.
        if (!isStaleCharacterSave(error)) throw error;
        const stored = await staleSave.reapply({
          opened: openedSheetRef.current,
          edited: data,
          withNewPicture: tokenImageUrl !== undefined,
          fetchLatest: async () => (await api.getCharacter(character.id)).character,
          // The sheet behind loads it too, and the Characters page with it.
          onLatest: () => onSaved?.(),
          save: async (merged, updatedAt) =>
            (await api.updateCharacter(character.id, { data: merged, updatedAt, ...picture })).character,
        });
        if (!stored) throw error;
        saved = stored;
        carriedOver = true;
      }
      reportSignedIn();
      // The editor closes through onDone once it holds nothing unsaved. With
      // something typed while this save was in flight it stays open, and its
      // next save is made from the version just stored. After changes were
      // carried over, its form is still the older version's, so it keeps that
      // one: another save is refused and carried over in turn, and cannot put
      // the older values back.
      if (!carriedOver) {
        setLoadedAt(saved.updatedAt);
        openedSheetRef.current = saved.data;
      }

      // Call optional callback
      if (onSaved) {
        onSaved();
      }
    } catch (error) {
      console.error('Error saving character:', error);

      // Signed out meanwhile: the editor stays open with the changes, and the
      // notice says how to save them.
      if (isSignedOutSave(error)) {
        reportSignedOut();
        showToast(SIGNED_OUT_NOT_SAVED, 'error');
        throw error;
      }

      // The player chose to keep editing; the dialog has said why.
      if (isStaleCharacterSave(error)) throw error;

      // Show detailed error message
      const message = apiErrorMessage(error) || 'Failed to save character. Please try again.';
      const validationErrors = apiValidationIssues(error);

      if (validationErrors) {
        console.error('Validation errors:', validationErrors);
        // TODO(ui): the message here is "Character data does not match game
        // system schema" and the issues go only to the console, so the user is
        // not told which field to fix. List each issue's path and message, as
        // CharacterEditorPage does.
        showToast(`Validation Error: ${message}`, 'error');
      } else {
        showToast(message, 'error');
      }
      // Thrown on so the sheet knows nothing was saved: it keeps its unsaved
      // changes, and leaving still asks before discarding them.
      throw error;
    } finally {
      setSaving(false);
    }
  };

  // Ask before leaving only when something would be lost.
  const handleCancel = () => {
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }
    setConfirmClose(true);
  };

  // Escape does what Cancel does. While a question is up, Escape is its to
  // answer, so this one stands aside.
  const modalRef = useFocusTrap(true, confirmClose || staleSave.asking ? undefined : handleCancel);

  // Render appropriate character sheet editor based on game system
  const renderCharacterEditor = () => {
    switch (character.gameSystem) {
      case 'DND_5E':
        return (
          <DnD5eCharacterEditor
            character={character}
            onSave={handleSave}
            onCancel={handleCancel}
            onDirtyChange={setHasUnsavedChanges}
            onDone={onClose}
          />
        );
      case 'PATHFINDER_2E':
        return (
          <Pathfinder2eCharacterEditor
            character={character}
            onSave={handleSave}
            onCancel={handleCancel}
            onDirtyChange={setHasUnsavedChanges}
            onDone={onClose}
          />
        );
      case 'CALL_OF_CTHULHU_7E':
        return (
          <CallOfCthulhu7eCharacterEditor
            character={character}
            onSave={handleSave}
            onCancel={handleCancel}
            onDirtyChange={setHasUnsavedChanges}
            onDone={onClose}
          />
        );
      case 'SHADOWRUN_6E':
        // Shadowrun editor not yet implemented
        return (
          <div className="glass-panel p-6">
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <h3 className="text-xl font-semibold text-warm-gray">
                Shadowrun 6e Character Editor
              </h3>
              <p className="text-stone-gray text-center max-w-md">
                The Shadowrun 6th Edition character editor is not yet implemented.
              </p>
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-lg bg-moss-green text-white hover:bg-moss-green/90 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        );
      default:
        // Flexible character sheet
        return (
          <FlexibleCharacterSheetEdit
            character={character}
            onSave={handleSave}
            onCancel={handleCancel}
            onDirtyChange={setHasUnsavedChanges}
            onDone={onClose}
          />
        );
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-sheet-editor-title"
        className="bg-soft-cream border-2 border-moss-green/30 rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col"
      >
        {/* Close button, in flow rather than absolute. It used to be
            `absolute top-4 right-4`, but the dialog is not a positioned
            ancestor — so it resolved against the full-viewport overlay and
            floated outside the dialog entirely. Making the dialog `relative`
            would fix that but drop it straight onto the sheet's own palette
            button, which sits at the same offset inside the sheet header. A
            flow row keeps it clear of the sheet's controls at every width. */}
        <div className="flex justify-end px-3 py-2 border-b border-moss-green/20 flex-shrink-0">
          <button
            onClick={handleCancel}
            aria-label="Close dialog"
            className="p-2 rounded-lg hover:bg-stone-gray/10 transition-colors"
            disabled={saving}
          >
            <X className="w-5 h-5 text-stone-gray" />
          </button>
        </div>

        {signedOut && (
          <div className="px-4 pt-4 flex-shrink-0">
            <SignedOutNotice />
          </div>
        )}

        {/* Visually hidden title for accessibility */}
        <h2 id="character-sheet-editor-title" className="sr-only">
          Edit Character Sheet: {character.name}
        </h2>

        {/* Editor Content */}
        <div className="flex-1 overflow-y-auto">
          {renderCharacterEditor()}
        </div>
      </div>
    </div>
    {/* ConfirmDialog must be rendered AFTER the modal overlay so it appears
        on top at the same z-50 stacking level (later DOM = visually on top). */}
    <ConfirmDialog
      isOpen={confirmClose}
      title="Discard Changes?"
      message="Are you sure you want to cancel? Any unsaved changes will be lost."
      confirmLabel="Discard"
      cancelLabel="Keep Editing"
      variant="warning"
      onConfirm={onClose}
      onCancel={() => setConfirmClose(false)}
    />
    {staleSave.dialog}
    </>
  );
}
