/**
 * Call of Cthulhu 7e Character Sheet
 *
 * Main component that switches between view and edit modes.
 */

import React, { useState } from 'react';
import { CharacterSheetProps } from '../types';
import type { CharacterData } from '../../../types';
import { CallOfCthulhu7eCharacterView } from './CallOfCthulhu7eCharacterView';
import { CallOfCthulhu7eCharacterEditor } from './CallOfCthulhu7eCharacterEditor';

/**
 * CallOfCthulhu7eCharacterSheet - Mode switcher for Call of Cthulhu 7e character sheet
 */
export const CallOfCthulhu7eCharacterSheet: React.FC<CharacterSheetProps> = (props) => {
  const { mode, character, onSave, onDirtyChange } = props;
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);

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
      <CallOfCthulhu7eCharacterEditor
        character={character}
        onSave={handleSave}
        onCancel={handleCancel}
        onDirtyChange={onDirtyChange}
        onDone={() => setCurrentMode('view')}
      />
    );
  }

  // View mode - pass a callback to switch to edit mode
  return <CallOfCthulhu7eCharacterView character={character} onEdit={() => setCurrentMode('edit')} />;
};

export default CallOfCthulhu7eCharacterSheet;
