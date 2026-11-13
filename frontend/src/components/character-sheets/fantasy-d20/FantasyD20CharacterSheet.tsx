/**
 * FantasyD20CharacterSheet Component
 *
 * Main component that switches between view and edit modes
 * for Fantasy d20 character sheets.
 */

import React, { useEffect, useEffectEvent, useState } from 'react';
import { CharacterSheetProps } from '../types';
import type { CharacterData } from '../../../types';
import FantasyD20CharacterView from './FantasyD20CharacterView';
import FantasyD20CharacterEditor from './FantasyD20CharacterEditor';

export const FantasyD20CharacterSheet: React.FC<CharacterSheetProps> = (props) => {
  const { mode, character, onSave, onDirtyChange, onEditStart, allowTokenPicture } = props;
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);

  // Each time the editor opens, its form is made from the character passed now.
  const editStarted = useEffectEvent(() => onEditStart?.());
  useEffect(() => {
    if (currentMode === 'edit') editStarted();
  }, [currentMode]);

  // Saving leaves edit mode only through the editor's onDone, which it calls
  // when nothing was typed while the save was in flight. Going back to the
  // view here, as soon as the save finished, threw that typing away.
  const handleSave = async (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => {
    if (onSave) {
      await onSave(data, showToast, tokenImageUrl);
    }
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
      <FantasyD20CharacterEditor
        character={character}
        onSave={handleSave}
        onCancel={handleCancel}
        onDirtyChange={onDirtyChange}
        onDone={() => setCurrentMode('view')}
        allowTokenPicture={allowTokenPicture}
      />
    );
  }

  return (
    <FantasyD20CharacterView
      character={character}
      onEdit={handleEdit}
    />
  );
};

export default FantasyD20CharacterSheet;
