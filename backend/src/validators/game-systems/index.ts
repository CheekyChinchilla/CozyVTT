/**
 * Game Systems Validation Index
 * Exports validation schemas and helper functions
 */

import { z } from 'zod';
import { GameSystem, isSupportedGameSystem, type SupportedGameSystem } from '../../game-systems';
import { withUnionChecks } from './unionIssues';
import { getBlankTemplate } from '../../utils/character-templates';
import {
  fifthEditionCharacterDataSchema,
  type FifthEditionCharacterData,
} from './fifthEdition.schema';
import {
  fantasyD20CharacterDataSchema,
  type FantasyD20CharacterData,
} from './fantasyD20.schema';
import {
  HorrorD100SheetSchema,
  type HorrorD100Sheet,
} from './horrorD100Sheet.schema';
import {
  flexibleCharacterDataSchema,
  type FlexibleCharacterData,
} from './flexible.schema';

// Re-export schemas
export {
  fifthEditionCharacterDataSchema,
  fantasyD20CharacterDataSchema,
  HorrorD100SheetSchema,
  flexibleCharacterDataSchema,
};

// Re-export types
export type {
  FifthEditionCharacterData,
  FantasyD20CharacterData,
  HorrorD100Sheet,
  FlexibleCharacterData,
};

/**
 * Validation result type
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: z.ZodError };

/**
 * Validate character data for a specific game system
 * @param gameSystem - The game system to validate against
 * @param data - The character data to validate
 * @returns Validation result with typed data or errors
 */
export function validateCharacterData(
  gameSystem: SupportedGameSystem,
  data: unknown
): ValidationResult<
  | FifthEditionCharacterData
  | FantasyD20CharacterData
  | HorrorD100Sheet
> {
  try {
    switch (gameSystem) {
      case GameSystem.FIFTH_EDITION: {
        const validated = fifthEditionCharacterDataSchema.parse(data);
        return { success: true, data: validated };
      }
      case GameSystem.FANTASY_D20: {
        const validated = fantasyD20CharacterDataSchema.parse(data);
        return { success: true, data: validated };
      }
      case GameSystem.HORROR_D100: {
        const validated = HorrorD100SheetSchema.parse(data);
        return { success: true, data: validated };
      }
      default: {
        // TypeScript should prevent this, but handle it anyway
        const error = new z.ZodError([
          {
            code: 'custom',
            message: `Unknown game system: ${gameSystem}`,
            path: ['gameSystem'],
          },
        ]);
        return { success: false, errors: error };
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: withUnionChecks(error) };
    }
    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Validate a Flexible sheet: the sheet of a character or template with no
 * game system. Anything that is not an object, null included, is refused.
 */
export function validateFlexibleSheet(data: unknown): ValidationResult<FlexibleCharacterData> {
  const result = flexibleCharacterDataSchema.safeParse(data);
  return result.success ? { success: true, data: result.data } : { success: false, errors: withUnionChecks(result.error) };
}

/** One problem with a sheet, as a refused save lists it. */
export interface SheetIssue {
  path: string;
  message: string;
  code: string;
}

/** The problems a refused sheet has, each with the dotted path of its field. */
export function sheetIssues(errors: z.ZodError): SheetIssue[] {
  return errors.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * The blank sheet a game system ships, the one New Character starts from,
 * parsed as a save parses it. Tests build their sheets on it, so they test the
 * sheet players actually get.
 */
export function getBlankCharacterTemplate(
  gameSystem: SupportedGameSystem
):
  | FifthEditionCharacterData
  | FantasyD20CharacterData
  | HorrorD100Sheet {
  const result = validateCharacterData(gameSystem, structuredClone(getBlankTemplate(gameSystem).data));
  if (!result.success) throw new Error(`The ${gameSystem} blank template does not pass its own schema`);
  return result.data;
}

/**
 * The field each system keeps the character's own name in.
 *
 * A character has a top-level `name` column AND a name inside its sheet blob,
 * and nothing used to reconcile them: a character created as "Aldra" opened its
 * sheet showing the factory placeholder, because only the column was set.
 *
 * Every system keeps it in `characterName` today. The table stays, so a new
 * system whose sheet names the field otherwise only has to be added here.
 */
const SHEET_NAME_FIELD: Record<SupportedGameSystem, string> = {
  [GameSystem.FIFTH_EDITION]: 'characterName',
  [GameSystem.FANTASY_D20]: 'characterName',
  [GameSystem.HORROR_D100]: 'characterName',
};

/** The name field of a stored row's system; none for one CozyVTT no longer supports. */
function sheetNameField(gameSystem: GameSystem | null | undefined): string | undefined {
  return isSupportedGameSystem(gameSystem) ? SHEET_NAME_FIELD[gameSystem] : undefined;
}

/** The sheet field holding the owner's display name, the same in every system. */
const PLAYER_NAME_FIELD = 'playerName';

/**
 * The name written on a sheet, whichever field that system keeps it in.
 *
 * Returns undefined when the sheet has no usable name, so callers can leave the
 * existing one alone rather than blanking it.
 */
export function sheetNameFor(
  gameSystem: GameSystem | null | undefined,
  data: Record<string, unknown> | null | undefined
): string | undefined {
  if (!data) return undefined;
  const field = sheetNameField(gameSystem);
  if (!field) return undefined;
  const value = data[field];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Stamp the character's name and its owner's display name into the sheet.
 *
 * Called from character creation and nowhere else, where the caller has just
 * supplied a name for the character being made — so that name wins outright.
 *
 * It used to overwrite only a blank field or one of four known factory
 * placeholders, which meant a character started from an *example* template kept
 * the template's name: type "Gorrun Ashfield", pick the Level 1 Fighter, and
 * get a sheet headed "Brave Fighter". Worse, `PUT /characters/:id` takes the
 * sheet as authoritative for the name, so the first save copied that back over
 * the character record and renamed the character permanently.
 *
 * Returns a new object; the input is not mutated.
 */
export function applyIdentityToSheet(
  gameSystem: GameSystem | null | undefined,
  data: Record<string, unknown> | null | undefined,
  characterName: string,
  playerDisplayName: string
): Record<string, unknown> {
  const sheet = { ...(data ?? {}) };
  if (!gameSystem) return sheet;

  const nameField = sheetNameField(gameSystem);
  if (nameField) {
    // Only when one was actually supplied: an empty name would blank the sheet
    // rather than leave it as it is.
    const supplied = typeof characterName === 'string' ? characterName.trim() : '';
    if (supplied) {
      sheet[nameField] = supplied;
    }
  }

  // The player name belongs to whoever owns the character rather than being
  // free text, so it is ALWAYS set from their display name — never their email,
  // which is admin-only information.
  //
  // Unconditionally, unlike the character name above: a sheet can arrive here
  // carrying somebody else's name, most obviously when copying a published
  // template, and the field is not editable on the sheet, so anything left
  // behind could not be corrected afterwards.
  if (playerDisplayName) {
    sheet[PLAYER_NAME_FIELD] = playerDisplayName;
  }

  return sheet;
}

/**
 * The sheet without its player's name, for a template: the name is whoever
 * owned the character it was saved from, and a character made from the
 * template is given its own owner's. Any other sheet is returned as it is.
 */
export function sheetWithoutPlayerName<T>(gameSystem: GameSystem | null | undefined, data: T): T {
  if (!gameSystem || typeof data !== 'object' || data === null || Array.isArray(data)) return data;
  if (!(PLAYER_NAME_FIELD in data)) return data;
  const { [PLAYER_NAME_FIELD]: _dropped, ...rest } = data as Record<string, unknown>;
  return rest as T;
}
