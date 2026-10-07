/**
 * D&D 5e Character Sheet
 *
 * Main component that switches between view and edit modes.
 */

import React, { useEffect, useState } from 'react';
import { CharacterSheetProps } from '../types';
import type { CharacterData } from '../../../types';
import { DnD5eCharacterView } from './DnD5eCharacterView';
import { DnD5eCharacterEditor } from './DnD5eCharacterEditor';

/**
 * DnD5eCharacterSheet - Mode switcher for D&D 5e character sheet
 */
export const DnD5eCharacterSheet: React.FC<CharacterSheetProps> = (props) => {
  const { mode, character, onSave, onDirtyChange, onEditStart } = props;
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);

  // Each time the editor opens, its form is made from the character passed now.
  useEffect(() => {
    if (currentMode === 'edit') onEditStart?.();
  }, [currentMode]);

  // Handle cancel - return to view mode
  const handleCancel = () => {
    // Discarding the edit leaves nothing outstanding for a host to warn about.
    onDirtyChange?.(false);
    setCurrentMode('view');
  };

  // Saving leaves edit mode only through the editor's onDone, which it calls
  // when nothing was typed while the save was in flight. Going back to the
  // view here, as soon as the save finished, threw that typing away.
  const handleSave = async (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => {
    if (onSave) {
      await onSave(data, showToast, tokenImageUrl);
    }
  };

  // Render based on mode
  if (currentMode === 'edit') {
    return (
      <DnD5eCharacterEditor
        character={character}
        onSave={handleSave}
        onCancel={handleCancel}
        onDirtyChange={onDirtyChange}
        onDone={() => setCurrentMode('view')}
      />
    );
  }

  // View mode - pass a callback to switch to edit mode
  return <DnD5eCharacterView character={character} onEdit={() => setCurrentMode('edit')} />;
};

export default DnD5eCharacterSheet;
