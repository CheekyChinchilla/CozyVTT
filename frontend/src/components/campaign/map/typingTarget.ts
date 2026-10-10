// ============================================
// Whether a key press belongs to a text box rather than the map.
//
// The map's shortcuts listen on the window, so they hear every key on the
// page. While the DM typed in the chat box, a note or a dialog, Backspace
// deleted the selected walls, Ctrl+Z undid a wall edit and the arrow keys
// moved walls, and the key never reached the box. A key pressed in anything
// that takes typing is now left to it.
// ============================================

/**
 * Inputs that take no typing. A shortcut still works after one of these is
 * clicked, as after clicking a tool button.
 */
const NON_TEXT_INPUTS = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'color', 'file', 'image']);

const EDITABLE = '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

/** Whether a key pressed with this element focused is meant for the element. */
export function isTypingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest(EDITABLE) !== null) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return false;
}
