/**
 * Flexible Character Templates
 * Templates for flexible, system-agnostic characters
 */

import { randomUUID } from 'crypto';

export interface FlexibleCharacterTemplate {
  name: string;
  description: string;
  gameSystem: null;
  /** The sheet itself. Shaped by `gameSystem`; validated by that system's Zod schema. */
  data: Record<string, unknown>;
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
 * Basic flexible character template with common sections. A function, so each
 * sheet made from it gets section and field ids of its own.
 *
 * Its four sections are the editor's Attributes, Skills, Inventory and
 * Background section templates (frontend .../flexible/utils/section-templates.ts);
 * keepInStep.test.ts fails when they disagree.
 */
export const flexibleBasicTemplate = (): FlexibleCharacterTemplate => ({
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
});

/**
 * All flexible templates, each built afresh when asked for.
 */
export const FLEXIBLE_TEMPLATES: Record<string, () => FlexibleCharacterTemplate> = {
  blank: () => structuredClone(flexibleBlankTemplate),
  basic: flexibleBasicTemplate,
};
