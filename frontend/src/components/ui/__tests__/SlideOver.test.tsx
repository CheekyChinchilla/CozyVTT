/**
 * The shared slide-over panel: a dialog at the edge of the screen.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import SlideOver, { SlideOverClose, SlideOverTitle } from '../SlideOver';
import Modal from '../Modal';
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

  it('leaves the field being edited before Escape closes it', async () => {
    const order: string[] = [];
    render(
      <SlideOver open onClose={() => order.push('close')}>
        <SlideOverTitle>Notes</SlideOverTitle>
        <input aria-label="Notes" onBlur={() => order.push('blur')} />
      </SlideOver>
    );
    await waitForDialogFocus(screen.getByRole('dialog'));
    const field = screen.getByRole('textbox', { name: 'Notes' });
    field.focus();

    fireEvent.keyDown(field, { key: 'Escape' });

    expect(order).toEqual(['blur', 'close']);
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

  // The asset library mounts its details panel inside AnimatePresence and
  // removes the whole panel to close it.
  it('fades out when a parent AnimatePresence removes it', async () => {
    const shown = (open: boolean) => (
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {open && (
            <SlideOver key="panel" open onClose={() => {}}>
              <SlideOverTitle>Rules</SlideOverTitle>
            </SlideOver>
          )}
        </AnimatePresence>
      </MotionConfig>
    );
    const view = render(shown(true));
    await waitFor(() => expect(screen.getByRole('dialog').style.opacity).toBe('1'));
    view.rerender(shown(false));
    await act(() => pause(50));

    const dialog = screen.queryByRole('dialog');
    expect(dialog).not.toBeNull();
    expect(Number(dialog?.style.opacity)).toBeLessThan(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

// A window opened from a panel (Invite Player from Campaign Settings, Create
// Map from the Map Library) dims everything behind it, the panel included.
// Its backdrop sat a layer below the panel, which stayed at full brightness.
describe('a window opened from a panel', () => {
  const layer = (el: Element | null) => Number(/(?:^|\s)z-(\d+)(?:\s|$)/.exec(el?.getAttribute('class') ?? '')?.[1] ?? 0);

  it('draws its backdrop over the panel', () => {
    render(
      <>
        <SlideOver open onClose={() => {}}><SlideOverTitle>Campaign Settings</SlideOverTitle></SlideOver>
        <Modal open onClose={() => {}} title="Invite Player"><p>invite</p></Modal>
      </>
    );
    const panel = screen.getByText('Campaign Settings').closest('[role="dialog"]');
    const modalBackdrop = screen.getByRole('dialog', { name: 'Invite Player' }).parentElement?.previousElementSibling ?? null;
    expect(modalBackdrop?.getAttribute('aria-hidden')).toBe('true');
    expect(layer(modalBackdrop)).toBeGreaterThanOrEqual(layer(panel));
  });
});
