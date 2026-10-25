/**
 * waitForDialogFocus returns only after the dialog's focus trap has moved
 * focus, so keys a test types next land where it expects.
 *
 * A field with React's autoFocus puts focus inside the dialog before the
 * trap's frame runs. Waiting for focus to be inside the dialog is then not
 * enough: the trap's frame still moves focus to the field marked
 * data-autofocus, or to the dialog's first control, afterwards.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { waitForDialogFocus } from './dialogFocus';

function TrappedDialog() {
  const ref = useFocusTrap(true);
  return (
    <div ref={ref} role="dialog" aria-label="Trapped">
      <button type="button">Close dialog</button>
      <input aria-label="Name" autoFocus />
      <input aria-label="Email" data-autofocus />
    </div>
  );
}

function nextFrame(): Promise<void> {
  return act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

// jsdom paints a frame every 16 ms, so whether the trap's frame lands before
// or after the helper's first look depends on timing. A frame that always
// comes 30 ms after it is requested makes the order the same on every run.
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 30)
  );
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('waitForDialogFocus', () => {
  it('returns after the focus trap has moved focus, even when a field has autoFocus', async () => {
    render(<TrappedDialog />);
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));

    await waitForDialogFocus();
    const focusedWhenReturned = document.activeElement;
    await nextFrame();

    expect(document.activeElement).toBe(focusedWhenReturned);
    expect(document.activeElement).toBe(screen.getByLabelText('Email'));
  });
});
