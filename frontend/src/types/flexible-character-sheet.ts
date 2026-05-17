/**
 * Flexible Character Sheet Types
 */

/**
 * Section type determines what kind of fields it contains
 */
export type FlexibleSectionType = 'stats' | 'list' | 'text' | 'table';

/**
 * Stats section - Key-value pairs of numbers (attributes, skills)
 */
export interface StatsSection {
  id: string;
  title: string;
  type: 'stats';
  fields: Array<{
    id: string;
    name: string;
    value: number;
    modifier?: number;
  }>;
  collapsed?: boolean;
}

/**
 * List section - Array of text items (inventory, spells)
 */
export interface ListSection {
  id: string;
  title: string;
  type: 'list';
  items: Array<{
    id: string;
    text: string;
    checked?: boolean;
  }>;
  collapsed?: boolean;
}

/**
 * Text section - Rich text area (backstory, notes)
 */
export interface TextSection {
  id: string;
  title: string;
  type: 'text';
  value: string;
  collapsed?: boolean;
}

/**
 * Table section - Rows and columns (equipment stats, spell list)
 */
export interface TableSection {
  id: string;
  title: string;
  type: 'table';
  columns: Array<{
    id: string;
    name: string;
    width?: string;
  }>;
  rows: Array<{
    id: string;
    cells: Record<string, string>; // columnId -> value
  }>;
  collapsed?: boolean;
}

/**
 * Union type for all section types
 */
export type FlexibleSection = StatsSection | ListSection | TextSection | TableSection;

/**
 * Complete flexible character data structure
 */
export interface FlexibleCharacterData {
  sections: FlexibleSection[];
}

/**
 * Section template for quick creation
 */
export interface SectionTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  create: () => FlexibleSection;
}
