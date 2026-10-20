/**
 * The shared slide-over panel: a dialog at the edge of the screen.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MotionConfig } from 'framer-motion';
import SlideOver, { SlideOverClose, SlideOverTitle } from '../SlideOver';
import { waitForDialogFocus } from '@/test/dialogFocus';

// framer-motion reads the reduce-motion setting once, the first time a
// component asks for it, so it is switched on before anything here renders.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function Panel({ open = true, onClose = () => {}, side }: { open?: boolean; onClose?: () => void; side?: 'left' | 'right' }) {
  return (
    <MotionConfig reducedMotion="user">
      <button type="button">Outside</button>
      <SlideOver open={open} onClose={onClose} side={side} className="max-w-sm bg-paper-white">
        <div>
          <SlideOverTitle>Token Manager</SlideOverTitle>
          <SlideOverClose />
        </div>
        <input aria-label="Token name" />
        <button type="button">Add Token</button>
      </SlideOver>
    </MotionConfig>
  );
}

describe('SlideOver', () => {
  it('is a modal dialog named by its title', () => {
    render(<Panel />);
    const dialog = screen.getByRole('dialog', { name: 'Token Manager' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('renders outside the page tree, so no ancestor can clip it', () => {
    const { container } = render(<Panel />);
    expect(container).not.toContainElement(screen.getByRole('dialog'));
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<Panel onClose={onClose} />);
    await waitForDialogFocus(screen.getByRole('dialog'));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has a Close button that closes it', () => {
    const onClose = vi.fn();
    render(<Panel onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<Panel onClose={onClose} />);
    fireEvent.click(screen.getByTestId('slide-over-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the panel', async () => {
    render(<Panel />);
    const dialog = await waitForDialogFocus(screen.getByRole('dialog'));
    const last = screen.getByRole('button', { name: 'Add Token' });
    last.focus();

    fireEvent.keyDown(last, { key: 'Tab' });

    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('sits at the edge it is asked for', () => {
    const { unmount } = render(<Panel side="left" />);
    expect(screen.getByRole('dialog').className).toMatch(/\bleft-0\b/);
    unmount();
    render(<Panel />);
    expect(screen.getByRole('dialog').className).toMatch(/\bright-0\b/);
  });

  // framer-motion makes transforms instant under the setting both ways, so a
  // panel whose exit moves it jumped off screen at once.
  it('fades where it stands as it closes with reduce motion turned on', async () => {
    const view = render(<Panel />);
    await waitFor(() => expect(screen.getByRole('dialog').style.opacity).toBe('1'));
    view.rerender(<Panel open={false} />);
    await act(() => pause(50));

    const dialog = screen.getByRole('dialog');
    expect(dialog.style.transform).toMatch(/^(none)?$/);
  });
});
