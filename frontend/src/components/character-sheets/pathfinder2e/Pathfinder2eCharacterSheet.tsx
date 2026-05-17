/**
 * Pathfinder2eCharacterSheet Component
 *
 * Main component that switches between view and edit modes
 * for Pathfinder 2nd Edition character sheets.
 */

import React, { useState } from 'react';
import { CharacterSheetProps } from '../types';
import Pathfinder2eCharacterView from './Pathfinder2eCharacterView';
import Pathfinder2eCharacterEditor from './Pathfinder2eCharacterEditor';

export const Pathfinder2eCharacterSheet: React.FC<CharacterSheetProps> = (props) => {
  const { mode, character, onSave } = props;
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);

  const handleSave = async (data: any, showToast?: boolean, tokenImageUrl?: string) => {
    if (onSave) {
      await onSave(data, showToast, tokenImageUrl);
    }
    setCurrentMode('view');
  };

  const handleCancel = () => {
    setCurrentMode('view');
  };

  const handleEdit = () => {
    setCurrentMode('edit');
  };

  if (currentMode === 'edit') {
    return (
      <Pathfinder2eCharacterEditor
        character={character}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <Pathfinder2eCharacterView
      character={character}
      onEdit={handleEdit}
    />
  );
};

export default Pathfinder2eCharacterSheet;
