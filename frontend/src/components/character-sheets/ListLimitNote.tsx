import { SHEET_LIST_MAX } from '@/constants/sheetLimits';

/**
 * Whether a list on a character sheet already holds as many entries as the
 * server keeps. Its add button is turned off, since an entry past that makes
 * the sheet unsaveable.
 */
export function listIsFull(list: readonly unknown[] | undefined | null, max: number = SHEET_LIST_MAX): boolean {
  return (list?.length ?? 0) >= max;
}

/**
 * Whether a box that says a list may change. One that adds an entry past the
 * limit is refused; one that keeps or shortens the list is not, so a list
 * stored over the limit can still be edited down.
 */
export function listChangeAllowed(nextCount: number, currentCount: number, max: number = SHEET_LIST_MAX): boolean {
  return nextCount <= max || nextCount <= currentCount;
}

/** What to say where a list is full. */
export function listFullMessage(max: number): string {
  return `This list is full: a sheet holds at most ${max.toLocaleString('en-US')} entries here. Remove one to add another.`;
}

/**
 * The note under an add button or a list box that has stopped taking entries.
 * Draws nothing while the list has room.
 */
export default function ListLimitNote({
  full,
  max = SHEET_LIST_MAX,
  className = 'mt-1 text-xs italic text-stone-600',
}: {
  full: boolean;
  max?: number;
  /** The note's classes, for a sheet with a palette of its own. */
  className?: string;
}) {
  if (!full) return null;
  return (
    <p role="status" className={className}>
      {listFullMessage(max)}
    </p>
  );
}

/** Classes an add button gets so that it looks off while its list is full. */
export const ADD_BUTTON_OFF = 'disabled:opacity-50 disabled:cursor-not-allowed';
