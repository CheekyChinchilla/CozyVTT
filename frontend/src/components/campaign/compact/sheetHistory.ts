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
// ============================================

const MARK = 'cozyvttSheet';

interface OpenSheet {
  /**
   * What Back does to it: a sheet closes at once; a dialog is asked to close,
   * and leaves the list only as it does, since it may ask first.
   */
  kind: 'sheet' | 'dialog';
  close: () => void;
}

/** The open sheets and dialogs, oldest first; Back closes the last. */
const openSheets: OpenSheet[] = [];

/** The popstate our own history.back() brings, which closes nothing. */
let ownBack = false;
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

/** An open sheet's hold on the entry. */
export interface SheetEntry {
  /**
   * The sheet has closed, however it closed. Calling it after Back has
   * closed the sheet, or a second time, does nothing.
   */
  release: () => void;
  /** Whether this is the sheet or dialog opened last of those still open. */
  isTop: () => boolean;
}

function holdEntry(kind: OpenSheet['kind'], close: () => void): SheetEntry {
  if (!listening) {
    window.addEventListener('popstate', onPopState);
    listening = true;
  }
  const sheet: OpenSheet = { kind, close };
  openSheets.push(sheet);
  if (!onMarkedEntry()) pushMarkedEntry();

  return {
    release: () => {
      const at = openSheets.indexOf(sheet);
      if (at === -1) return;
      openSheets.splice(at, 1);
      if (openSheets.length > 0) return;
      queueMicrotask(() => {
        if (openSheets.length > 0 || !onMarkedEntry()) return;
        ownBack = true;
        window.history.back();
      });
    },
    isTop: () => openSheets[openSheets.length - 1] === sheet,
  };
}

/** A sheet has opened: Back now calls `close`, unless a sheet or dialog that opened after it is still open. */
export function sheetOpened(close: () => void): SheetEntry {
  return holdEntry('sheet', close);
}

/**
 * A dialog has opened on the compact layout: Back now calls `close`, the
 * close Escape calls, unless a sheet or dialog that opened after it is still
 * open. `release` once the dialog has closed.
 */
export function dialogOpened(close: () => void): SheetEntry {
  return holdEntry('dialog', close);
}
