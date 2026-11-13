/**
 * Horror d100 Character Sheet
 *
 * Main component that switches between view and edit modes.
 */

import React, { useEffect, useEffectEvent, useState } from 'react';
import { CharacterSheetProps } from '../types';
import type { CharacterData } from '../../../types';
import { HorrorD100CharacterView } from './HorrorD100CharacterView';
import { HorrorD100CharacterEditor } from './HorrorD100CharacterEditor';

/**
 * HorrorD100CharacterSheet - Mode switcher for the Horror d100 character sheet
 */
export const HorrorD100CharacterSheet: React.FC<CharacterSheetProps> = (props) => {
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
      <HorrorD100CharacterEditor
        character={character}
        onSave={handleSave}
        onCancel={handleCancel}
        onDirtyChange={onDirtyChange}
        onDone={() => setCurrentMode('view')}
        allowTokenPicture={allowTokenPicture}
      />
    );
  }

  // View mode - pass a callback to switch to edit mode. This sheet is hosted
  // only where its editor is: by the character's owner or the campaign's GM,
  // or by someone editing a template. They are the ones shown the values a
  // sheet held before it was rebuilt.
  return <HorrorD100CharacterView character={character} onEdit={() => setCurrentMode('edit')} showOriginalValues />;
};

export default HorrorD100CharacterSheet;
