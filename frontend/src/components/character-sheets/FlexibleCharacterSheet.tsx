/**
 * Flexible Character Sheet
 */

import React, { useEffect, useState } from 'react';
import { CharacterSheetProps } from './types';
import type { CharacterData } from '../../types';
import { FlexibleCharacterSheetView } from './flexible/FlexibleCharacterSheetView';
import { FlexibleCharacterSheetEdit } from './flexible/FlexibleCharacterSheetEdit';

export const FlexibleCharacterSheet: React.FC<CharacterSheetProps> = (props) => {
  const { mode, character, onSave, onDirtyChange, onEditStart } = props;
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);

  // Each time the editor opens, its form is made from the character passed now.
  useEffect(() => {
    if (currentMode === 'edit') onEditStart?.();
  }, [currentMode]);

  const handleCancel = () => {
    setCurrentMode('view');
  };

  // Saving leaves edit mode only through the editor's onDone, so what was
  // typed while the save was in flight is not thrown away.
  const handleSave = async (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => {
    if (onSave) {
      await onSave(data, showToast, tokenImageUrl);
    }
  };

  if (currentMode === 'edit') {
    return (
      <FlexibleCharacterSheetEdit
        character={character}
        onSave={handleSave}
        onCancel={handleCancel}
        onDirtyChange={onDirtyChange}
        onDone={() => setCurrentMode('view')}
      />
    );
  }

  return (
    <FlexibleCharacterSheetView
      character={character}
      onEdit={() => setCurrentMode('edit')}
    />
  );
};
