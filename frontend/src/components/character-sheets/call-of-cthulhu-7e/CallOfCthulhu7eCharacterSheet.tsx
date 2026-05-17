/**
 * Call of Cthulhu 7e Character Sheet
 *
 * Main component that switches between view and edit modes.
 */

import React, { useState } from 'react';
import { CharacterSheetProps } from '../types';
import { CallOfCthulhu7eCharacterView } from './CallOfCthulhu7eCharacterView';
import { CallOfCthulhu7eCharacterEditor } from './CallOfCthulhu7eCharacterEditor';

/**
 * CallOfCthulhu7eCharacterSheet - Mode switcher for Call of Cthulhu 7e character sheet
 */
export const CallOfCthulhu7eCharacterSheet: React.FC<CharacterSheetProps> = (props) => {
  const { mode, character, onSave } = props;
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);

  // Handle cancel - return to view mode
  const handleCancel = () => {
    setCurrentMode('view');
  };

  // Handle save - save data and return to view mode
  const handleSave = async (data: any, showToast?: boolean, tokenImageUrl?: string) => {
    if (onSave) {
      await onSave(data, showToast, tokenImageUrl);
    }
    setCurrentMode('view');
  };

  // Render based on mode
  if (currentMode === 'edit') {
    return (
      <CallOfCthulhu7eCharacterEditor
        character={character}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );
  }

  // View mode - pass a callback to switch to edit mode
  return <CallOfCthulhu7eCharacterView character={character} onEdit={() => setCurrentMode('edit')} />;
};

export default CallOfCthulhu7eCharacterSheet;
