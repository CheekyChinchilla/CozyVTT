import { expect } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';

/**
 * Waits until a dialog's focus trap has moved focus into it.
 *
 * A dialog with a focus trap (src/hooks/useFocusTrap.ts) focuses its first
 * control on the next animation frame. A test that starts typing in a field
 * before that frame loses every key typed after it, so the test fails at
 * random. Focus already being inside the dialog proves nothing: a field with
 * autoFocus is focused on mount, before the trap's frame. So this waits for a
 * frame requested after the trap's, which runs only once the trap's has run.
 * Call it after the dialog opens and before typing into it.
 */
export async function waitForDialogFocus(dialog: HTMLElement = screen.getByRole('dialog')): Promise<HTMLElement> {
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement | null));
  return dialog;
}
