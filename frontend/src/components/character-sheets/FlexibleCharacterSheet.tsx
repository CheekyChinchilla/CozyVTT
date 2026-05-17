/**
 * Flexible Character Sheet
 */

import React, { useState } from 'react';
import { CharacterSheetProps } from './types';
import { FlexibleCharacterSheetView } from './flexible/FlexibleCharacterSheetView';
import { FlexibleCharacterSheetEdit } from './flexible/FlexibleCharacterSheetEdit';

export const FlexibleCharacterSheet: React.FC<CharacterSheetProps> = (props) => {
  const { mode, character, onSave } = props;
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);

  const handleCancel = () => {
    setCurrentMode('view');
  };

  const handleSave = async (data: any, showToast?: boolean, tokenImageUrl?: string) => {
    if (onSave) {
      await onSave(data, showToast, tokenImageUrl);
    }
    setCurrentMode('view');
  };

  if (currentMode === 'edit') {
    return (
      <FlexibleCharacterSheetEdit
        character={character}
        onSave={handleSave}
        onCancel={handleCancel}
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
