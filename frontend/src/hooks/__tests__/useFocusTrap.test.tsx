/**
 * The dialog focus trap, alone and with one dialog open over another.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useFocusTrap } from '../useFocusTrap';

function nextFrame(): Promise<void> {
  return act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

function Dialog({ name, onClose, children }: { name: string; onClose?: () => void; children?: React.ReactNode }) {
  const ref = useFocusTrap(true, onClose);
  return (
    <div ref={ref} role="dialog" aria-label={name}>
      <button type="button">Close {name}</button>
      {children}
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('one dialog over another', () => {
  function Stacked({ onBaseClose, onTopClose }: { onBaseClose: () => void; onTopClose: () => void }) {
    return (
      <>
        <Dialog name="Base" onClose={onBaseClose}>
          <input aria-label="Base field" />
        </Dialog>
        <Dialog name="Top" onClose={onTopClose}>
          <input aria-label="Top field" />
          <button type="button">Confirm</button>
        </Dialog>
      </>
    );
  }

  it('closes only the top dialog on Escape', async () => {
    const onBaseClose = vi.fn();
    const onTopClose = vi.fn();
    render(<Stacked onBaseClose={onBaseClose} onTopClose={onTopClose} />);
    await nextFrame();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(onTopClose).toHaveBeenCalledTimes(1);
    expect(onBaseClose).not.toHaveBeenCalled();
  });

  it('lets Tab reach the top dialog\'s middle controls', async () => {
    render(<Stacked onBaseClose={vi.fn()} onTopClose={vi.fn()} />);
    await nextFrame();
    const field = screen.getByLabelText('Top field');
    field.focus();

    const tab = fireEvent.keyDown(field, { key: 'Tab' });

    // Not cancelled: the browser moves focus to the next control itself.
    expect(tab).toBe(true);
    expect(document.activeElement).toBe(field);
  });

  it('hands Escape back to the lower dialog once the top one closes', async () => {
    const onBaseClose = vi.fn();
    function Harness() {
      const [top, setTop] = useState(true);
      return (
        <>
          <Dialog name="Base" onClose={onBaseClose} />
          {top && <Dialog name="Top" onClose={() => setTop(false)} />}
        </>
      );
    }
    render(<Harness />);
    await nextFrame();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Top' })).toBeNull();
    expect(onBaseClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onBaseClose).toHaveBeenCalledTimes(1);
  });
});

describe('Escape', () => {
  it('goes no further than the dialog it closes', async () => {
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    try {
      render(<Dialog name="Only" onClose={vi.fn()} />);
      await nextFrame();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onWindowKey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', onWindowKey);
    }
  });
});

describe('where focus goes', () => {
  function Opener() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Create User</button>
        {open && (
          <Dialog name="Create User" onClose={() => setOpen(false)}>
            <input aria-label="Email" data-autofocus />
          </Dialog>
        )}
      </>
    );
  }

  it('starts on the field marked data-autofocus, and returns to the opener on close', async () => {
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Create User' });
    opener.focus();
    fireEvent.click(opener);
    await nextFrame();

    expect(document.activeElement).toBe(screen.getByLabelText('Email'));

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(document.activeElement).toBe(opener);
  });

  it('starts on the first control when nothing is marked', async () => {
    render(<Dialog name="Plain"><input aria-label="Name" /></Dialog>);
    await nextFrame();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close Plain' }));
  });
});
