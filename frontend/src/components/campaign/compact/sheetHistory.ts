// ============================================
// The browser's Back closes the open sheet
//
// On a phone, Back (Android's button or gesture, the browser's own) used to
// leave the campaign page. A sheet that opens puts an entry on the
// browser's history, so Back takes that entry off and closes the sheet; a
// sheet closed another way (its X, Escape, a drag, a choice) takes its entry
// back off.
//
// - One entry stands for every open sheet. Back closes the one on top, and
//   while others stay open the entry goes back on for them.
// - A sheet that closes as another opens, in the same moment, such as one
//   tab's sheet for the next, leaves the entry where it is: history.back()
//   lands later, and an entry pushed before it lands would be the one it
//   took off. So the entry is taken off once nothing has opened by the end
//   of the task that closed the last sheet. A sheet that opens after that,
//   before the browser has gone back, gets its entry once it has.
// - The entry is the page's own entry with a mark added, at the same
//   address, so the router sees no navigation. Only a marked entry is taken
//   back off: a sheet that closes because the page is being left, after the
//   router has put the next page's entry on, leaves history alone. A sheet
//   still open as the page is left leaves its entry behind it, so Back to
//   the page lands on that entry first, one press that changes nothing; a
//   reload with a sheet open leaves the same. History has no way to take
//   an entry off once the page is past it, so the page's own ways out
//   replace it (onSheetEntry): the header's back button, and leaving or
//   being removed from the campaign (useAccessRevoked, which always
//   replaces). The browser's address bar and a lost sign-in, which loads
//   the sign-in page, still leave it.
// - A dialog (a Modal, a SlideOver, the character sheet and its editor)
//   holds the entry on the compact layout as a sheet does, whether a sheet
//   is under it or not: its focus trap says so as it opens (dialogOpened,
//   from useFocusTrap). A row of More or of an action sheet closes its
//   sheet and opens a dialog in the same press, or a moment later, so the
//   dialog keeps the entry or gets one. Back calls the dialog's own close,
//   the one Escape calls, so a dialog that asks before closing asks; the
//   entry goes back on while it stays, and comes off once it has closed
//   with nothing else open.
// - The list is kept in the order the sheets and dialogs opened. A dialog
//   takes its place as its trap opens (nextOpening), on either layout, and
//   keeps it: when the layout turns compact with one dialog inside another,
//   such as the editor in the character sheet, both take their holds again,
//   the inner one first (React runs a child's effects before its parent's),
//   and Back must still close the one on top.
// - Something holding work the page would lose (Paint not saved) holds the
//   entry as a dialog, on both layouts, so Back asks first. Told to leave,
//   its release takes the entry off and then goes Back once more, past the
//   page, as the Back it asked about would have; one that leaves by the
//   page's own way out releases it in place, for that way out to replace.
//   Either holds until any dialog opened after it, its own question on a
//   phone, has closed.
// ============================================

const MARK = 'cozyvttSheet';

interface OpenSheet {
  /**
   * What Back does to it: a sheet closes at once; a dialog is asked to close,
   * and leaves the list only as it does, since it may ask first.
   */
  kind: 'sheet' | 'dialog';
  close: () => void;
  /** Its place in the order they opened (nextOpening). */
  opened: number;
}

/** The open sheets and dialogs, in the order they opened; Back closes the last. */
const openSheets: OpenSheet[] = [];

let openings = 0;

/**
 * The place of a hold beneath every sheet and dialog, those open already
 * included: Back reaches it only once none of them is open.
 */
export const BENEATH_EVERY_SHEET = 0;

/** A number that grows with each opening of a sheet or a dialog's trap, which keeps its place in the list. */
export function nextOpening(): number {
  openings += 1;
  return openings;
}

/** The popstate our own history.back() brings, which closes nothing. */
let ownBack = false;
/** Once our own Back has taken the entry off, go Back again, leaving the page. */
let leaveAfterOwnBack = false;
/**
 * A hold released to leave, or in place, while dialogs opened after it,
 * such as its own question, still hold the entry: once they have closed,
 * the page is left, or the entry is left for the page's way out to replace.
 */
let whenClear: SheetRelease | null = null;
let listening = false;

function onMarkedEntry(): boolean {
  const state: unknown = window.history.state;
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>)[MARK] === true;
}

function pushMarkedEntry(): void {
  const state: unknown = window.history.state;
  const page = typeof state === 'object' && state !== null ? state : {};
  window.history.pushState({ ...page, [MARK]: true }, '');
}

function onPopState(): void {
  if (ownBack) {
    ownBack = false;
    if (leaveAfterOwnBack) {
      leaveAfterOwnBack = false;
      if (openSheets.length === 0) {
        window.history.back();
        return;
      }
    }
    // A sheet opened after the close asked to go back, before the browser
    // got there, found the entry still on and put none on; it gets one now.
    if (openSheets.length > 0 && !onMarkedEntry()) pushMarkedEntry();
    return;
  }
  // Back or Forward between two entries of the page: only leaving the marked
  // entry with a sheet or dialog open is Back closing it.
  if (onMarkedEntry()) return;
  const top = openSheets[openSheets.length - 1];
  if (!top) return;
  // A dialog may ask before it closes, or not close; it holds the entry
  // until it has, and its release then takes the entry off.
  if (top.kind === 'dialog') {
    pushMarkedEntry();
    top.close();
    return;
  }
  openSheets.pop();
  if (openSheets.length > 0) pushMarkedEntry();
  top.close();
}

/**
 * Whether the browser's current entry is a sheet's. A way out of the page,
 * such as its header's back button, replaces that entry with the page it
 * goes to, so Back from there comes to the campaign page and not to a
 * press that does nothing.
 */
export function onSheetEntry(): boolean {
  return onMarkedEntry();
}

/** How a hold on the entry ends: `leave` goes Back past the page as well; `inPlace` leaves the entry for the page's way out to replace. */
export type SheetRelease = 'leave' | 'inPlace';

/** An open sheet's hold on the entry. */
export interface SheetEntry {
  /**
   * The sheet has closed, however it closed. Calling it after Back has
   * closed the sheet, or a second time, does nothing. With nothing else
   * open, the entry comes off, unless `how` says otherwise.
   */
  release: (how?: SheetRelease) => void;
  /** Whether this is the sheet or dialog opened last of those still open. */
  isTop: () => boolean;
}

function holdEntry(kind: OpenSheet['kind'], close: () => void, opened: number): SheetEntry {
  if (!listening) {
    window.addEventListener('popstate', onPopState);
    listening = true;
  }
  const sheet: OpenSheet = { kind, close, opened };
  const later = openSheets.findIndex((other) => other.opened > opened);
  openSheets.splice(later === -1 ? openSheets.length : later, 0, sheet);
  if (!onMarkedEntry()) pushMarkedEntry();

  return {
    release: (how?: SheetRelease) => {
      const at = openSheets.indexOf(sheet);
      if (at === -1) return;
      openSheets.splice(at, 1);
      if (openSheets.length > 0) {
        if (how) whenClear = openSheets.every((other) => other.opened > opened) ? how : null;
        return;
      }
      // The last one: its own way, or the way of a hold released under it.
      const then = how ?? whenClear;
      whenClear = null;
      if (then === 'inPlace') return;
      queueMicrotask(() => {
        if (openSheets.length > 0 || !onMarkedEntry()) return;
        ownBack = true;
        leaveAfterOwnBack = then === 'leave';
        window.history.back();
      });
    },
    isTop: () => openSheets[openSheets.length - 1] === sheet,
  };
}

/** A sheet has opened: Back now calls `close`, unless a sheet or dialog that opened after it is still open. */
export function sheetOpened(close: () => void): SheetEntry {
  return holdEntry('sheet', close, nextOpening());
}

/**
 * A dialog is open on the compact layout: Back now calls `close`, the close
 * Escape calls, unless a sheet or dialog that opened after it is still open.
 * `opened` is the number its trap took as it opened (nextOpening), which
 * stays the same when the layout turns. `release` once the dialog has closed.
 */
export function dialogOpened(close: () => void, opened: number): SheetEntry {
  return holdEntry('dialog', close, opened);
}
