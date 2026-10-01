/**
 * Flexible Character Sheet
 */

import React, { useState } from 'react';
import { CharacterSheetProps } from './types';
import type { CharacterData } from '../../types';
import { FlexibleCharacterSheetView } from './flexible/FlexibleCharacterSheetView';
import { FlexibleCharacterSheetEdit } from './flexible/FlexibleCharacterSheetEdit';

export const FlexibleCharacterSheet: React.FC<CharacterSheetProps> = (props) => {
  // TODO(ui): `onDirtyChange` is never called, so the full-page editor's back
  // arrow leaves a Flexible sheet without asking even with unsaved edits, and
  // the in-page editor has to ask on every Cancel. Report it from
  // FlexibleCharacterSheetEdit as the system editors do.
  const { mode, character, onSave } = props;
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);

  const handleCancel = () => {
    setCurrentMode('view');
  };

  const handleSave = async (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => {
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
