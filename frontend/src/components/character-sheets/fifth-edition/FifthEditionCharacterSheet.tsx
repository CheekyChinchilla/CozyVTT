/**
 * 5E Character Sheet
 *
 * Main component that switches between view and edit modes.
 */

import React, { useEffect, useEffectEvent, useState } from 'react';
import { CharacterSheetProps } from '../types';
import type { CharacterData } from '../../../types';
import { FifthEditionCharacterView } from './FifthEditionCharacterView';
import { FifthEditionCharacterEditor } from './FifthEditionCharacterEditor';

/**
 * FifthEditionCharacterSheet - Mode switcher for 5E character sheet
 */
export const FifthEditionCharacterSheet: React.FC<CharacterSheetProps> = (props) => {
  const { mode, character, onSave, onDirtyChange, onEditStart, allowTokenPicture } = props;
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);

  // Each time the editor opens, its form is made from the character passed now.
  const editStarted = useEffectEvent(() => onEditStart?.());
  useEffect(() => {
    if (currentMode === 'edit') editStarted();
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
      <FifthEditionCharacterEditor
        character={character}
        onSave={handleSave}
        onCancel={handleCancel}
        onDirtyChange={onDirtyChange}
        onDone={() => setCurrentMode('view')}
        allowTokenPicture={allowTokenPicture}
      />
    );
  }

  // View mode - pass a callback to switch to edit mode
  return <FifthEditionCharacterView character={character} onEdit={() => setCurrentMode('edit')} />;
};

export default FifthEditionCharacterSheet;
