/**
 * Flexible Character Sheet Utility Functions
 */

import type { FlexibleCharacterData } from '../../../../types/flexible-character-sheet';
import { randomId } from '../../../../utils/uuid';

/**
 * Calculate modifier from stat value (D&D-style)
 * Formula: floor((value - 10) / 2)
 */
export const calculateModifier = (value: number): number => {
  return Math.floor((value - 10) / 2);
};

/**
 * Generate a unique id. The shared helper works on plain HTTP too, where
 * crypto.randomUUID is missing.
 */
export const generateId = (): string => randomId();

/**
 * Initialize data for characters with empty/missing data
 * Handles legacy flexible characters with raw JSON or empty data
 */
export const initializeFlexibleData = (data: unknown): FlexibleCharacterData => {
  // Check if data already has sections array
  if (data && Array.isArray((data as { sections?: unknown }).sections)) {
    return data as FlexibleCharacterData;
  }

  // Legacy data or empty - initialize with empty sections array
  return { sections: [] };
};

/**
 * Format modifier for display (+2, -1, +0)
 */
export const formatModifier = (modifier: number): string => {
  if (modifier >= 0) {
    return `+${modifier}`;
  }
  return `${modifier}`;
};

/**
 * Validate section ID uniqueness
 */
export const validateUniqueIds = (sections: { id: string }[]): boolean => {
  const ids = sections.map((s) => s.id);
  return new Set(ids).size === ids.length;
};
