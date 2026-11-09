/**
 * The frame the character sheet and its editor share.
 *
 * Below `sm`, and on a screen under 500 px tall (`short:`, a phone turned
 * sideways), the dialog takes the whole screen with no margin, border or
 * rounded corners, so a phone gets every pixel of its width for the sheet.
 * From `sm` up it is the window it always was: a 16 px margin, a 2 px border,
 * rounded corners and at most 95 percent of the screen's height.
 */

/** The dimmed overlay the dialog is centred in. */
export const SHEET_SHELL_OVERLAY =
  'fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 short:p-0 bg-black/70 backdrop-blur-xs';

/** The dialog itself. */
export const SHEET_SHELL_DIALOG = [
  'bg-soft-cream border-moss-green/30 shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col',
  'h-dvh max-h-dvh rounded-none border-0',
  'sm:h-auto sm:max-h-[95vh] sm:rounded-xl sm:border-2',
  'short:h-dvh short:max-h-dvh short:rounded-none short:border-0',
].join(' ');
