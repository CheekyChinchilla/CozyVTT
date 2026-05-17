/**
 * Flexible Character Sheet Section Templates
 */

import type {
  SectionTemplate,
  StatsSection,
  ListSection,
  TextSection,
  TableSection,
} from '../../../../types/flexible-character-sheet';
import { generateId } from './section-helpers';

/**
 * All available section templates
 */
export const SECTION_TEMPLATES: SectionTemplate[] = [
  // Common Templates
  {
    id: 'attributes',
    name: 'Attributes',
    description: 'Standard D&D-style attributes',
    icon: 'Target',
    create: (): StatsSection => ({
      id: generateId(),
      title: 'Attributes',
      type: 'stats',
      fields: [
        { id: generateId(), name: 'Strength', value: 10, modifier: 0 },
        { id: generateId(), name: 'Dexterity', value: 10, modifier: 0 },
        { id: generateId(), name: 'Constitution', value: 10, modifier: 0 },
        { id: generateId(), name: 'Intelligence', value: 10, modifier: 0 },
        { id: generateId(), name: 'Wisdom', value: 10, modifier: 0 },
        { id: generateId(), name: 'Charisma', value: 10, modifier: 0 },
      ],
    }),
  },
  {
    id: 'skills',
    name: 'Skills',
    description: 'Custom skills list',
    icon: 'Target',
    create: (): StatsSection => ({
      id: generateId(),
      title: 'Skills',
      type: 'stats',
      fields: [],
    }),
  },
  {
    id: 'inventory',
    name: 'Inventory',
    description: 'List of items and equipment',
    icon: 'Package',
    create: (): ListSection => ({
      id: generateId(),
      title: 'Inventory',
      type: 'list',
      items: [],
    }),
  },
  {
    id: 'spells',
    name: 'Spells',
    description: 'List of spells or abilities',
    icon: 'Sparkles',
    create: (): ListSection => ({
      id: generateId(),
      title: 'Spells',
      type: 'list',
      items: [],
    }),
  },
  {
    id: 'equipment',
    name: 'Equipment',
    description: 'Equipment table with stats',
    icon: 'Sword',
    create: (): TableSection => ({
      id: generateId(),
      title: 'Equipment',
      type: 'table',
      columns: [
        { id: generateId(), name: 'Item', width: '30%' },
        { id: generateId(), name: 'Type', width: '20%' },
        { id: generateId(), name: 'Damage/AC', width: '20%' },
        { id: generateId(), name: 'Notes', width: '30%' },
      ],
      rows: [],
    }),
  },
  {
    id: 'background',
    name: 'Background',
    description: 'Character backstory and history',
    icon: 'BookOpen',
    create: (): TextSection => ({
      id: generateId(),
      title: 'Background',
      type: 'text',
      value: '',
    }),
  },
  {
    id: 'notes',
    name: 'Notes',
    description: 'General notes and information',
    icon: 'FileText',
    create: (): TextSection => ({
      id: generateId(),
      title: 'Notes',
      type: 'text',
      value: '',
    }),
  },

  // Blank Templates
  {
    id: 'blank-stats',
    name: 'Blank Stats',
    description: 'Empty stats section',
    icon: 'Hash',
    create: (): StatsSection => ({
      id: generateId(),
      title: 'New Stats',
      type: 'stats',
      fields: [],
    }),
  },
  {
    id: 'blank-list',
    name: 'Blank List',
    description: 'Empty list section',
    icon: 'List',
    create: (): ListSection => ({
      id: generateId(),
      title: 'New List',
      type: 'list',
      items: [],
    }),
  },
  {
    id: 'blank-text',
    name: 'Blank Text',
    description: 'Empty text section',
    icon: 'FileText',
    create: (): TextSection => ({
      id: generateId(),
      title: 'New Text',
      type: 'text',
      value: '',
    }),
  },
  {
    id: 'blank-table',
    name: 'Blank Table',
    description: 'Empty table section',
    icon: 'Table',
    create: (): TableSection => ({
      id: generateId(),
      title: 'New Table',
      type: 'table',
      columns: [
        { id: generateId(), name: 'Column 1', width: '50%' },
        { id: generateId(), name: 'Column 2', width: '50%' },
      ],
      rows: [],
    }),
  },
];

/**
 * Get template by ID
 */
export const getTemplate = (id: string): SectionTemplate | undefined => {
  return SECTION_TEMPLATES.find((t) => t.id === id);
};

/**
 * Get templates by category
 */
export const getCommonTemplates = (): SectionTemplate[] => {
  return SECTION_TEMPLATES.filter((t) => !t.id.startsWith('blank'));
};

export const getBlankTemplates = (): SectionTemplate[] => {
  return SECTION_TEMPLATES.filter((t) => t.id.startsWith('blank'));
};
