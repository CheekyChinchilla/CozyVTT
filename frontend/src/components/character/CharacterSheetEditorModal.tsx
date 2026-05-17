/**
 * Character Sheet Editor Modal
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/services/api';
import type { Character } from '@/types';
import ConfirmDialog from '@/components/common/ConfirmDialog';

// Import editor components
import DnD5eCharacterEditor from '../character-sheets/dnd5e/DnD5eCharacterEditor';
import Pathfinder2eCharacterEditor from '../character-sheets/pathfinder2e/Pathfinder2eCharacterEditor';
import CallOfCthulhu7eCharacterEditor from '../character-sheets/call-of-cthulhu-7e/CallOfCthulhu7eCharacterEditor';
import { FlexibleCharacterSheetEdit } from '../character-sheets/flexible/FlexibleCharacterSheetEdit';

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
  const { showToast } = useToast();

  // Handle save
  const handleSave = async (data: any) => {
    try {
      setSaving(true);
      // Only send the data field - name and tokenImageUrl are managed by the editor
      await api.updateCharacter(character.id, {
        data,
      });

      // Call optional callback
      if (onSaved) {
        onSaved();
      }

      // Close modal
      onClose();
    } catch (error: any) {
      console.error('Error saving character:', error);

      // Show detailed error message
      const errorMessage = error.response?.data?.message || 'Failed to save character. Please try again.';
      const validationErrors = error.response?.data?.validationErrors;

      if (validationErrors) {
        console.error('Validation errors:', validationErrors);
        showToast(`Validation Error: ${errorMessage}`, 'error');
      } else {
        showToast(errorMessage, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setConfirmClose(true);
  };

  const modalRef = useFocusTrap(true, onClose);

  // Render appropriate character sheet editor based on game system
  const renderCharacterEditor = () => {
    switch (character.gameSystem) {
      case 'DND_5E':
        return (
          <DnD5eCharacterEditor
            character={character}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        );
      case 'PATHFINDER_2E':
        return (
          <Pathfinder2eCharacterEditor
            character={character}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        );
      case 'CALL_OF_CTHULHU_7E':
        return (
          <CallOfCthulhu7eCharacterEditor
            character={character}
            onSave={handleSave}
            onCancel={handleCancel}
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
          />
        );
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" aria-hidden="true">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-sheet-editor-title"
        className="bg-soft-cream border-2 border-moss-green/30 rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col"
      >
        {/* Close Button */}
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={handleCancel}
            aria-label="Close dialog"
            className="p-2 rounded-lg bg-soft-cream/90 hover:bg-stone-gray/10 transition-colors border border-moss-green/20"
            disabled={saving}
          >
            <X className="w-5 h-5 text-stone-gray" />
          </button>
        </div>

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
    </>
  );
}
