/**
 * D&D 5e Character Sheet
 *
 * Main component that switches between view and edit modes.
 */

import React, { useState } from 'react';
import { CharacterSheetProps } from '../types';
import { DnD5eCharacterView } from './DnD5eCharacterView';
import { DnD5eCharacterEditor } from './DnD5eCharacterEditor';

/**
 * DnD5eCharacterSheet - Mode switcher for D&D 5e character sheet
 */
export const DnD5eCharacterSheet: React.FC<CharacterSheetProps> = (props) => {
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
      <DnD5eCharacterEditor
        character={character}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );
  }

  // View mode - pass a callback to switch to edit mode
  return <DnD5eCharacterView character={character} onEdit={() => setCurrentMode('edit')} />;
};

export default DnD5eCharacterSheet;
