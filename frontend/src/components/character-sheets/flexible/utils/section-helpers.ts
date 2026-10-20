/**
 * Flexible Character Sheet Utility Functions
 */

import type {
  FlexibleCharacterData,
  FlexibleSection,
  ListSection,
  StatsSection,
  TableSection,
} from '../../../../types/flexible-character-sheet';
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

/** A plain object, or null for anything else. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A list, or empty for anything else. */
function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Text to show for a stored value: a string as it is, a number or true/false
 * written out, and anything else (an object, a list, nothing) as empty.
 */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/**
 * The stored id, or one made from where the entry sits. Made the same way on
 * every render, so the view does not redraw the entry each time.
 */
function idOf(value: Record<string, unknown>, fallback: string): string {
  return typeof value.id === 'string' && value.id !== '' ? value.id : fallback;
}

function asNumber(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * One stored section in the shape its type reads, or null when it is not a
 * section the sheet knows. Only the keys the sheet uses are kept.
 */
function repairSection(stored: unknown, index: number): FlexibleSection | null {
  const section = asRecord(stored);
  if (!section) return null;
  const id = idOf(section, `section-${index}`);
  const base = {
    id,
    title: asText(section.title),
    ...(typeof section.collapsed === 'boolean' ? { collapsed: section.collapsed } : {}),
  };

  switch (section.type) {
    case 'stats': {
      const fields: StatsSection['fields'] = asList(section.fields).flatMap((entry, i) => {
        const field = asRecord(entry);
        if (!field) return [];
        const modifier = asNumber(field.modifier);
        return [{
          id: idOf(field, `${id}-field-${i}`),
          name: asText(field.name),
          value: asNumber(field.value) ?? 0,
          ...(modifier !== undefined ? { modifier } : {}),
        }];
      });
      return { ...base, type: 'stats', fields };
    }
    case 'list': {
      const items: ListSection['items'] = asList(section.items).flatMap((entry, i) => {
        const item = asRecord(entry);
        if (!item) return [];
        return [{
          id: idOf(item, `${id}-item-${i}`),
          text: asText(item.text),
          ...(typeof item.checked === 'boolean' ? { checked: item.checked } : {}),
        }];
      });
      return { ...base, type: 'list', items };
    }
    case 'text':
      return { ...base, type: 'text', value: asText(section.value) };
    case 'table': {
      const columns: TableSection['columns'] = asList(section.columns).flatMap((entry, i) => {
        const column = asRecord(entry);
        if (!column) return [];
        return [{
          id: idOf(column, `${id}-column-${i}`),
          name: asText(column.name),
          ...(typeof column.width === 'string' ? { width: column.width } : {}),
        }];
      });
      const rows: TableSection['rows'] = asList(section.rows).flatMap((entry, i) => {
        const row = asRecord(entry);
        if (!row) return [];
        const cells = Object.fromEntries(
          Object.entries(asRecord(row.cells) ?? {}).map(([column, value]) => [column, asText(value)])
        );
        return [{ id: idOf(row, `${id}-row-${i}`), cells }];
      });
      return { ...base, type: 'table', columns, rows };
    }
    default:
      return null;
  }
}

/**
 * A character's Flexible sheet, in the shape the view and the editor read.
 *
 * A sheet with no list of sections (legacy raw JSON, or nothing yet) has
 * none. A sheet stored before the server checked Flexible sheets may hold a
 * section missing its entries, a section of a type the sheet does not know,
 * or a cell holding an object, and reading those as they were threw. Each
 * section is put in the shape its type reads: what cannot be shown is left
 * out, or shown as empty text. Keys beside `sections` are passed through.
 */
export const initializeFlexibleData = (data: unknown): FlexibleCharacterData & { sections: FlexibleSection[] } => {
  const sheet = asRecord(data);
  if (!sheet || !Array.isArray(sheet.sections)) {
    return { sections: [] };
  }
  const sections = sheet.sections
    .map((section, index) => repairSection(section, index))
    .filter((section): section is FlexibleSection => section !== null);
  return { ...sheet, sections };
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
