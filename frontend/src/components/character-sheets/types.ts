/**
 * Shared types for character sheet components
 */

import { Character, CharacterData } from '../../types';

/**
 * Character sheet display mode
 * - 'view': Read-only display of character data
 * - 'edit': Editable form for modifying character data
 */
export type CharacterSheetMode = 'view' | 'edit';

/**
 * Shared props interface for all character sheet components
 * All game-specific character sheets must implement this interface
 */
export interface CharacterSheetProps {
  /** The character to display */
  character: Character;

  /** Display mode (view or edit) */
  mode: CharacterSheetMode;

  /**
   * Callback when character data is saved (edit mode only).
   *
   * `CharacterData` is the same union `Character.data` and
   * `UpdateCharacterRequest.data` already use, so this closes a gap rather than
   * inventing a type: both ends of the round trip were typed and only the
   * callback between them was `any`.
   */
  onSave?: (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => Promise<void>;

  /** Callback when edit mode is cancelled */
  onCancel?: () => void;

  /**
   * Fired the first time the user changes anything, and again after each save,
   * so a host can tell whether leaving would lose work.
   *
   * The sheets own their form state and used to report nothing, which left the
   * page editor's "unsaved changes" guard permanently unable to fire. Making it
   * always warn instead was worse: it asked after a successful save, and even
   * when only viewing.
   */
  onDirtyChange?: (dirty: boolean) => void;
}
