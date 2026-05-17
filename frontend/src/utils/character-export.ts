/**
 * Character Export/Import Utilities
 *
 * Handles exporting characters to JSON with metadata
 * and importing characters from JSON files.
 */

import type { Character } from '@/types';

export interface ExportMetadata {
  cozyVttVersion: string;
  exportedAt: string;
  character: {
    name: string;
    gameSystem: string | null;
    data: any;
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
  const blob = new Blob([jsonString], { type: 'application/json' });

  // Generate filename: character_name_YYYYMMDD.json
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const safeName = character.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${safeName}_${dateStr}.json`;

  // Create download link and trigger download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Validate imported character JSON structure
 */
export function validateImportedCharacter(data: any): {
  valid: boolean;
  error?: string;
  character?: {
    name: string;
    gameSystem: string | null;
    data: any;
  };
} {
  // Check basic structure
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid JSON format' };
  }

  // Check for cozyVttVersion
  if (!data.cozyVttVersion) {
    return { valid: false, error: 'Missing cozyVttVersion field' };
  }

  // Check version compatibility
  const supportedVersions = ['1.0'];
  if (!supportedVersions.includes(data.cozyVttVersion)) {
    return {
      valid: false,
      error: `Unsupported cozyVttVersion: ${data.cozyVttVersion}. Supported versions: ${supportedVersions.join(', ')}`,
    };
  }

  // Check for character object
  if (!data.character || typeof data.character !== 'object') {
    return { valid: false, error: 'Missing or invalid character data' };
  }

  // Check required fields
  if (!data.character.name || typeof data.character.name !== 'string') {
    return { valid: false, error: 'Character name is required' };
  }

  if (!data.character.data || typeof data.character.data !== 'object') {
    return { valid: false, error: 'Character data is required' };
  }

  // Return validated character data
  return {
    valid: true,
    character: {
      name: data.character.name,
      gameSystem: data.character.gameSystem || null,
      data: data.character.data,
    },
  };
}

/**
 * Read and parse a JSON file
 */
export function readJSONFile(file: File): Promise<any> {
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
      } catch (error) {
        reject(new Error('Invalid JSON format'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}

/**
 * Export multiple characters as a ZIP archive
 * (This will require a ZIP library like JSZip)
 */
export async function downloadMultipleCharactersZIP(characters: Character[]): Promise<void> {
  // For now, download each character individually
  // TODO: Implement ZIP archive download using JSZip library
  for (const character of characters) {
    downloadCharacterJSON(character);
    // Add small delay to prevent browser from blocking multiple downloads
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}
