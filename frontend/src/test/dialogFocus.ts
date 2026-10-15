import { expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

/**
 * Waits until a dialog has moved focus into itself.
 *
 * A dialog with a focus trap (src/hooks/useFocusTrap.ts) focuses its first
 * control on the next animation frame. A test that starts typing in a field
 * before that frame loses every key typed after it, since focus has moved to
 * the dialog's first control, so the test fails at random. Call this after the
 * dialog opens and before typing into it.
 */
export async function waitForDialogFocus(dialog: HTMLElement = screen.getByRole('dialog')): Promise<HTMLElement> {
  await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement | null));
  return dialog;
}
