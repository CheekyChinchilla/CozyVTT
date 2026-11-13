/**
 * The sheet of a character or a template stored with a game system this
 * build does not know: the value of one CozyVTT no longer supports, kept
 * until a migration moves it. Its data is shown as a Flexible sheet,
 * read-only, under a line saying why. The server refuses to save its sheet;
 * a character can still be exported and deleted, and a template deleted.
 */

import type { Character } from '../../types';
import { UNSUPPORTED_SYSTEM_NOTICE, UNSUPPORTED_SYSTEM_TEMPLATE_NOTICE } from '../../constants/game-systems';
import { FlexibleCharacterSheetView } from './flexible/FlexibleCharacterSheetView';

interface UnsupportedSystemSheetProps {
  character: Character;
  /** Whether the sheet is a template's, which its line names as a template. */
  isTemplate?: boolean;
}

export function UnsupportedSystemSheet({ character, isTemplate = false }: UnsupportedSystemSheetProps) {
  return (
    <div className="space-y-4">
      <p role="note" className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-sm text-ink">
        {isTemplate ? UNSUPPORTED_SYSTEM_TEMPLATE_NOTICE : UNSUPPORTED_SYSTEM_NOTICE}
      </p>
      <FlexibleCharacterSheetView character={character} />
    </div>
  );
}
