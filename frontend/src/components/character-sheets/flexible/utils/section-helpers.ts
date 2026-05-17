/**
 * Flexible Character Sheet Utility Functions
 */

import type { FlexibleCharacterData } from '../../../../types/flexible-character-sheet';

/**
 * Calculate modifier from stat value (D&D-style)
 * Formula: floor((value - 10) / 2)
 */
export const calculateModifier = (value: number): number => {
  return Math.floor((value - 10) / 2);
};

/**
 * Generate unique ID using crypto.randomUUID or fallback
 */
export const generateId = (): string => {
  // Use native crypto.randomUUID if available
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback: simple UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Initialize data for characters with empty/missing data
 * Handles legacy flexible characters with raw JSON or empty data
 */
export const initializeFlexibleData = (data: any): FlexibleCharacterData => {
  // Check if data already has sections array
  if (data && Array.isArray(data.sections)) {
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
export const validateUniqueIds = (sections: any[]): boolean => {
  const ids = sections.map((s) => s.id);
  return new Set(ids).size === ids.length;
};
