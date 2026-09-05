/**
 * Pathfinder2eCharacterSheet Component
 *
 * Main component that switches between view and edit modes
 * for Pathfinder 2nd Edition character sheets.
 */

import React, { useState } from 'react';
import { CharacterSheetProps } from '../types';
import type { CharacterData } from '../../../types';
import Pathfinder2eCharacterView from './Pathfinder2eCharacterView';
import Pathfinder2eCharacterEditor from './Pathfinder2eCharacterEditor';

export const Pathfinder2eCharacterSheet: React.FC<CharacterSheetProps> = (props) => {
  const { mode, character, onSave, onDirtyChange } = props;
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);

  const handleSave = async (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => {
    if (onSave) {
      await onSave(data, showToast, tokenImageUrl);
    }
    onDirtyChange?.(false);
    setCurrentMode('view');
  };

  const handleCancel = () => {
    // Discarding the edit leaves nothing outstanding for a host to warn about.
    onDirtyChange?.(false);
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
        onDirtyChange={onDirtyChange}
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
