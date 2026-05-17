/**
 * Flexible Character Templates
 * Templates for flexible, system-agnostic characters
 */

import { randomUUID } from 'crypto';

export interface FlexibleCharacterTemplate {
  name: string;
  description: string;
  gameSystem: null;
  data: any;
}

/**
 * Blank flexible character template with no sections
 */
export const flexibleBlankTemplate: FlexibleCharacterTemplate = {
  name: 'Blank Flexible Character',
  description: 'An empty flexible character sheet',
  gameSystem: null,
  data: {
    sections: [],
  },
};

/**
 * Basic flexible character template with common sections
 */
export const flexibleBasicTemplate: FlexibleCharacterTemplate = {
  name: 'Basic Flexible Character',
  description: 'Basic template with Attributes, Skills, Inventory, and Background sections',
  gameSystem: null,
  data: {
    sections: [
      {
        id: randomUUID(),
        title: 'Attributes',
        type: 'stats',
        fields: [
          { id: randomUUID(), name: 'Strength', value: 10, modifier: 0 },
          { id: randomUUID(), name: 'Dexterity', value: 10, modifier: 0 },
          { id: randomUUID(), name: 'Constitution', value: 10, modifier: 0 },
          { id: randomUUID(), name: 'Intelligence', value: 10, modifier: 0 },
          { id: randomUUID(), name: 'Wisdom', value: 10, modifier: 0 },
          { id: randomUUID(), name: 'Charisma', value: 10, modifier: 0 },
        ],
      },
      {
        id: randomUUID(),
        title: 'Skills',
        type: 'stats',
        fields: [],
      },
      {
        id: randomUUID(),
        title: 'Inventory',
        type: 'list',
        items: [],
      },
      {
        id: randomUUID(),
        title: 'Background',
        type: 'text',
        value: '',
      },
    ],
  },
};

/**
 * All flexible templates
 */
export const FLEXIBLE_TEMPLATES: Record<string, FlexibleCharacterTemplate> = {
  blank: flexibleBlankTemplate,
  basic: flexibleBasicTemplate,
};
