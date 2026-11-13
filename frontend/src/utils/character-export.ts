/**
 * Character Export/Import Utilities
 *
 * Handles exporting characters to JSON with metadata
 * and importing characters from JSON files.
 */

import type { Character, CharacterData, GameSystem } from '@/types';
import { downloadTextFile } from '@/utils/download';
import { isGameSystem } from '@/constants/game-systems';
import { normaliseGameSystem } from '@/legacy/gameSystemAliases';
import { RETIRED_GAME_SYSTEM } from '@/legacy/retiredGameSystem';

/** What the import window says of a file naming the unreleased system versions before 1.7.0 could hold. */
export const RETIRED_SYSTEM_FILE_NOTICE =
  "This file's game system is no longer supported, so the character is imported with none, as a Flexible sheet.";

export interface ExportMetadata {
  cozyVttVersion: string;
  exportedAt: string;
  character: {
    name: string;
    gameSystem: string | null;
    data: CharacterData;
    createdAt?: string;
    updatedAt?: string;
  };
}

/**
 * Export a character to JSON format with metadata
 */
export function exportCharacterToJSON(character: Character): ExportMetadata {
  return {
    cozyVttVersion: '1.0',
    exportedAt: new Date().toISOString(),
    character: {
      name: character.name,
      gameSystem: character.gameSystem,
      data: character.data,
      createdAt: character.createdAt,
      updatedAt: character.updatedAt,
    },
  };
}

/**
 * Download a character as a JSON file
 */
export function downloadCharacterJSON(character: Character): void {
  const exportData = exportCharacterToJSON(character);
  const jsonString = JSON.stringify(exportData, null, 2);

  // Generate filename: character_name_YYYYMMDD.json
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const safeName = character.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${safeName}_${dateStr}.json`;

  downloadTextFile(filename, jsonString, 'application/json');
}

/**
 * Validate imported character JSON structure
 */
export function validateImportedCharacter(data: unknown): {
  valid: boolean;
  error?: string;
  character?: {
    name: string;
    gameSystem: GameSystem | null;
    data: CharacterData;
  };
  /** Something the person importing should know about how the file was read. */
  notice?: string;
} {
  // Check basic structure
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid JSON format' };
  }

  // The argument is a file someone chose off disk, so nothing about its shape
  // can be assumed. Everything below is a check; this names what is being
  // checked for, and leaves the values `unknown` so each one still has to be.
  const candidate = data as {
    cozyVttVersion?: unknown;
    character?: { name?: unknown; gameSystem?: unknown; data?: unknown };
  };

  // Check for cozyVttVersion
  if (!candidate.cozyVttVersion) {
    return { valid: false, error: 'Missing cozyVttVersion field' };
  }

  // Check version compatibility
  const supportedVersions = ['1.0'];
  if (typeof candidate.cozyVttVersion !== 'string' || !supportedVersions.includes(candidate.cozyVttVersion)) {
    return {
      valid: false,
      error: `Unsupported cozyVttVersion: ${candidate.cozyVttVersion}. Supported versions: ${supportedVersions.join(', ')}`,
    };
  }

  // Check for character object
  if (!candidate.character || typeof candidate.character !== 'object') {
    return { valid: false, error: 'Missing or invalid character data' };
  }

  // Check required fields
  if (!candidate.character.name || typeof candidate.character.name !== 'string') {
    return { valid: false, error: 'Character name is required' };
  }

  if (!candidate.character.data || typeof candidate.character.data !== 'object') {
    return { valid: false, error: 'Character data is required' };
  }

  // A file an older version exported names its system by the value that
  // version used, which is read as the new one. One naming the unreleased
  // system those versions could hold is read as having no system, as the
  // upgrade left such characters, and the window says so. A file made on an
  // instance with another game system cannot be stored here, so it is
  // refused, before the preview. No code is shown, as no system is shown by
  // its code anywhere else.
  const named = candidate.character.gameSystem || null;
  const retired = named === RETIRED_GAME_SYSTEM;
  const gameSystem = retired ? null : normaliseGameSystem(named) ?? named;
  if (gameSystem !== null && !isGameSystem(gameSystem)) {
    return { valid: false, error: 'This character is for a game system this CozyVTT does not have.' };
  }

  // Return validated character data
  return {
    valid: true,
    character: {
      name: candidate.character.name as string,
      gameSystem,
      data: candidate.character.data as CharacterData,
    },
    ...(retired ? { notice: RETIRED_SYSTEM_FILE_NOTICE } : {}),
  };
}

/**
 * Read and parse a JSON file
 */
export function readJSONFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('File too large. Maximum size is 5MB'));
      return;
    }

    // Check file type
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      reject(new Error('Invalid file type. Please upload a JSON file'));
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        resolve(parsed);
      } catch {
        reject(new Error('Invalid JSON format'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}
