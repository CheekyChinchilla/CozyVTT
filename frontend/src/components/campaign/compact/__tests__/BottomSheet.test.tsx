/**
 * The compact arrangement's sheet: named, modal only at full height, closed
 * by its X, Escape, its backdrop, a drag of its handle and the browser's
 * Back, kept mounted while closed, and drawn in front of nothing opened
 * after it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MotionConfig } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { BottomSheet, settleDrag, useSheetMotion, type SheetEdges, type SheetHeight } from '../BottomSheet';
import Modal from '@/components/ui/Modal';
import SlideOver, { SlideOverTitle } from '@/components/ui/SlideOver';
import { anyMenuShown } from '@/components/ui/openMenus';
import { SHORT_SCREEN_QUERY } from '@/constants/layout';
import { contact } from '@/test/pointer';
import { LayoutProvider } from '@/contexts/LayoutContext';

const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

/** Whether the browser's current history entry is a sheet's. */
const onSheetEntry = () => (window.history.state as Record<string, unknown> | null)?.cozyvttSheet === true;

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  // A sheet unmounted open takes its history entry back off, a moment later.
  await waitFor(() => expect(onSheetEntry()).toBe(false));
});

function Sheet({
  open = true,
  height = 'half',
  onClose = () => undefined,
  onHeightChange,
  edges,
  children = <p>Sheet content</p>,
}: {
  open?: boolean;
  height?: SheetHeight;
  onClose?: () => void;
  onHeightChange?: (height: SheetHeight) => void;
  edges?: SheetEdges;
  children?: ReactNode;
}) {
  return (
    <>
      <button type="button">Chat tab</button>
      <BottomSheet open={open} title="Chat" height={height} onClose={onClose} onHeightChange={onHeightChange} edges={edges}>
        {children}
      </BottomSheet>
    </>
  );
}

/** The sheet's element, open or not. */
const sheetElement = () => {
  const sheet = document.querySelector<HTMLElement>('[data-sheet]');
  if (!sheet) throw new Error('no sheet');
  return sheet;
};
const backdrop = () => document.querySelector<HTMLElement>('[data-sheet-backdrop]');

describe('a sheet', () => {
  it('is a dialog named by its title, with a close button named for it', () => {
    render(<Sheet />);
    const sheet = screen.getByRole('dialog', { name: 'Chat' });
    expect(sheet).toContainElement(screen.getByRole('heading', { name: 'Chat', level: 2 }));
    expect(screen.getByRole('button', { name: 'Close Chat' })).toBeInTheDocument();
  });

  it('closes on its X', () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close Chat' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps its content mounted while closed, inert and out of reach', () => {
    const { rerender } = render(<Sheet open />);
    const content = screen.getByText('Sheet content');
    rerender(<Sheet open={false} />);
    expect(screen.getByText('Sheet content')).toBe(content);
    expect(sheetElement()).toHaveAttribute('inert');
    expect(sheetElement()).toHaveAttribute('data-state', 'closed');
    expect(sheetElement().className).toContain('pointer-events-none');
  });

  it('scrolls its content inside itself, never the page under it', () => {
    render(<Sheet />);
    const body = sheetElement().querySelector('[data-sheet-body]');
    expect(body?.className).toContain('overflow-y-auto');
    expect(body?.className).toContain('overscroll-contain');
  });

  it('is at most 672 px wide, centred, on a tablet', () => {
    render(<Sheet />);
    expect(sheetElement().className).toContain('max-w-2xl');
    expect(sheetElement().className).toContain('mx-auto');
    expect(sheetElement().className).toContain('inset-x-0');
  });
});

describe('a sheet at half height', () => {
  it('leaves the map live: no backdrop, not modal, and not a menu on the screen', () => {
    render(<Sheet />);
    expect(backdrop()).toBeNull();
    expect(sheetElement()).not.toHaveAttribute('aria-modal');
    expect(anyMenuShown()).toBe(false);
    expect(sheetElement().style.height).toBe('50dvh');
  });

  it('gives its heading the focus as it opens, and the focus back as it closes', async () => {
    const { rerender } = render(<Sheet open={false} />);
    const tab = screen.getByRole('button', { name: 'Chat tab' });
    tab.focus();
    rerender(<Sheet open />);
    await nextFrame();
    expect(screen.getByRole('heading', { name: 'Chat' })).toHaveFocus();

    rerender(<Sheet open={false} />);
    expect(tab).toHaveFocus();
  });

  it('closes on Escape, used up so the map does not act on it too', () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { document.body.dispatchEvent(escape); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(escape.defaultPrevented).toBe(true);
  });

  it('leaves Escape to a dialog opened over it', async () => {
    const onClose = vi.fn();
    const onModalClose = vi.fn();
    function Confirm() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Remove</button>
          <Modal open={open} onClose={onModalClose} title="Confirm"><button type="button">OK</button></Modal>
        </>
      );
    }
    render(<Sheet onClose={onClose}><Confirm /></Sheet>);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await nextFrame();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onModalClose).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Escape in a half sheet, with a field in it', () => {
  it('is left to a box being typed in, which may use it to cancel', () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose}><input aria-label="Initiative" /><button type="button">Roll</button></Sheet>);
    const box = screen.getByRole('textbox', { name: 'Initiative' });
    box.focus();
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    const roll = screen.getByRole('button', { name: 'Roll' });
    roll.focus();
    fireEvent.keyDown(roll, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is left to a handler that has used it', () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose}><button type="button" onKeyDown={(e) => { if (e.key === 'Escape') e.preventDefault(); }}>Cancel edit</button></Sheet>);
    const button = screen.getByRole('button', { name: 'Cancel edit' });
    button.focus();
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('a half sheet made full height', () => {
  it('leaves the focus on the control in use, and gives it back to that control when made half again', async () => {
    const { rerender } = render(<Sheet onHeightChange={() => undefined}><input aria-label="Message" /></Sheet>);
    await nextFrame();
    const box = screen.getByRole('textbox', { name: 'Message' });
    box.focus();
    rerender(<Sheet height="full" onHeightChange={() => undefined}><input aria-label="Message" /></Sheet>);
    await nextFrame();
    expect(box).toHaveFocus();

    rerender(<Sheet onHeightChange={() => undefined}><input aria-label="Message" /></Sheet>);
    await nextFrame();
    expect(box).toHaveFocus();
  });
});

describe('a sheet at full height', () => {
  it('is modal, with a backdrop that closes it, and a menu on the screen while open', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Sheet height="full" onClose={onClose} />);
    expect(sheetElement()).toHaveAttribute('aria-modal', 'true');
    expect(anyMenuShown()).toBe(true);
    expect(sheetElement().style.top).toBe('max(3rem, 0px)');

    fireEvent.click(backdrop() as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<Sheet height="full" open={false} onClose={onClose} />);
    expect(anyMenuShown()).toBe(false);
  });

  // The backdrop fades out for 0.2 s after the sheet closes; a press on the
  // map or the bar in that time landed on it and closed the sheet again.
  it('takes no press while its backdrop fades after closing', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Sheet height="full" onClose={onClose} />);
    rerender(<Sheet height="full" open={false} onClose={onClose} />);

    const fading = backdrop();
    expect(fading).not.toBeNull();
    expect(fading?.style.pointerEvents).toBe('none');
    fireEvent.click(fading as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('holds the keyboard: its heading takes the focus, Tab stays inside and Escape closes it', async () => {
    const onClose = vi.fn();
    render(
      <Sheet height="full" onClose={onClose}>
        <button type="button">Inside</button>
      </Sheet>
    );
    await nextFrame();
    expect(screen.getByRole('heading', { name: 'Chat' })).toHaveFocus();

    const inside = screen.getByRole('button', { name: 'Inside' });
    inside.focus();
    fireEvent.keyDown(inside, { key: 'Tab' });
    expect(sheetElement()).toContainElement(document.activeElement as HTMLElement);

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the edges an arrangement gives a sheet', () => {
  const edges = { top: '3.5rem', bottom: '57px' };

  it('stand a half sheet on the bar and keep it below the header', () => {
    render(<Sheet edges={edges} />);
    expect(sheetElement().style.bottom).toBe('57px');
    // jsdom rewrites calc() and max() as it stores them, so only the parts are read.
    expect(sheetElement().style.maxHeight).toMatch(/100dvh.*57px.*3\.5rem|100dvh.*3\.5rem.*57px/);
  });

  it('leave the bar free of a full sheet and its backdrop', () => {
    render(<Sheet edges={edges} height="full" />);
    expect(sheetElement().style.top).toMatch(/3\.5rem/);
    expect(sheetElement().style.bottom).toBe('57px');
    expect(backdrop()?.style.bottom).toBe('57px');
  });
});

describe("a drag of the sheet's handle", () => {
  const finger = contact('touch', 7);
  /** The sheet stands 400 px tall. */
  function sized() {
    vi.spyOn(sheetElement(), 'getBoundingClientRect').mockReturnValue({ height: 400 } as DOMRect);
  }
  function drag(handle: Element, dy: number) {
    finger.down(handle, { clientX: 100, clientY: 500 });
    finger.move(handle, { clientX: 100, clientY: 500 + dy });
    finger.up(handle, { clientX: 100, clientY: 500 + dy });
  }
  const grip = () => sheetElement().querySelector('[data-sheet-handle]') as HTMLElement;

  it('closes the sheet past 30 percent of its height, and moves it with the finger on the way', () => {
    const onClose = vi.fn();
    render(<Sheet height="full" onClose={onClose} />);
    sized();
    finger.down(grip(), { clientX: 100, clientY: 500 });
    finger.move(grip(), { clientX: 100, clientY: 640 });
    expect(sheetElement().style.transform).toBe('translateY(140px)');
    finger.up(grip(), { clientX: 100, clientY: 640 });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(sheetElement().style.transform).toBe('');
  });

  it('puts the sheet back for a shorter drag', () => {
    const onClose = vi.fn();
    render(<Sheet height="full" onClose={onClose} />);
    sized();
    drag(grip(), 100);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('makes a half sheet full height when dragged up, and a full one half when dragged down a little', () => {
    const onHeightChange = vi.fn();
    const { rerender } = render(<Sheet onHeightChange={onHeightChange} />);
    sized();
    drag(screen.getByRole('button', { name: 'Make Chat full height' }), -60);
    expect(onHeightChange).toHaveBeenLastCalledWith('full');

    rerender(<Sheet height="full" onHeightChange={onHeightChange} />);
    sized();
    drag(screen.getByRole('button', { name: 'Make Chat half height' }), 60);
    expect(onHeightChange).toHaveBeenLastCalledWith('half');
  });

  it('switches the height on a tap or Enter, but not on the click that ends a drag', () => {
    const onHeightChange = vi.fn();
    render(<Sheet onHeightChange={onHeightChange} />);
    sized();
    const handle = screen.getByRole('button', { name: 'Make Chat full height' });
    fireEvent.click(handle);
    expect(onHeightChange).toHaveBeenCalledWith('full');

    onHeightChange.mockClear();
    drag(handle, 20);
    fireEvent.click(handle);
    expect(onHeightChange).not.toHaveBeenCalled();
  });

  it('settles by these rules', () => {
    expect(settleDrag(121, 400, 'half', true)).toBe('close');
    expect(settleDrag(120, 400, 'full', false)).toBe('full');
    expect(settleDrag(-41, 400, 'half', true)).toBe('full');
    expect(settleDrag(-41, 400, 'half', false)).toBe('half');
    expect(settleDrag(41, 400, 'full', true)).toBe('half');
    expect(settleDrag(40, 400, 'full', true)).toBe('full');
  });
});

describe("the browser's Back", () => {
  it('closes the open sheet, and the sheet puts an entry on the history as it opens', async () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    expect(onSheetEntry()).toBe(true);

    act(() => { window.history.back(); });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('is taken back off the history when the sheet closes another way', async () => {
    const { rerender } = render(<Sheet />);
    expect(onSheetEntry()).toBe(true);
    rerender(<Sheet open={false} />);
    await waitFor(() => expect(onSheetEntry()).toBe(false));
  });

  it('closes only the sheet on top, and stays for the one under it', async () => {
    const onUnder = vi.fn();
    const onTop = vi.fn();
    function Second() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Roll...</button>
          <BottomSheet open={open} title="Roll" height="full" onClose={() => { onTop(); setOpen(false); }}><p>Rolls</p></BottomSheet>
        </>
      );
    }
    render(<Sheet onClose={onUnder}><Second /></Sheet>);
    fireEvent.click(screen.getByRole('button', { name: 'Roll...' }));
    act(() => { window.history.back(); });
    await waitFor(() => expect(onTop).toHaveBeenCalledTimes(1));
    expect(onUnder).not.toHaveBeenCalled();
    expect(onSheetEntry()).toBe(true);

    act(() => { window.history.back(); });
    await waitFor(() => expect(onUnder).toHaveBeenCalledTimes(1));
  });

  it('keeps the one entry when one sheet closes as another opens', async () => {
    function Tabs() {
      const [tab, setTab] = useState<'chat' | 'party'>('chat');
      return (
        <>
          <button type="button" onClick={() => setTab('party')}>Party tab</button>
          <BottomSheet open={tab === 'chat'} title="Chat" height="half" onClose={() => undefined}><p>Chat</p></BottomSheet>
          <BottomSheet open={tab === 'party'} title="Party" height="half" onClose={() => undefined}><p>Party</p></BottomSheet>
        </>
      );
    }
    render(<Tabs />);
    const length = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: 'Party tab' }));
    // Long enough for a history.back() to have landed.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(onSheetEntry()).toBe(true);
    expect(window.history.length).toBe(length);
  });
});

describe("a sheet opened while the browser is still going back for the last one's close", () => {
  // A browser's history.back() lands a task or more later. A sheet opened in
  // between found the entry still there and put none on; the late arrival
  // then left it with none, so the next Back left the page.
  it('gets an entry of its own once the browser has gone back', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    try {
      const { rerender } = render(<Sheet open />);
      rerender(<Sheet open={false} />);
      // The close's history.back() is asked for after the task that closed it.
      await waitFor(() => expect(back).toHaveBeenCalledTimes(1));

      rerender(<Sheet open />);
      // The browser lands on the page's own entry, the sheet still open.
      act(() => {
        const { cozyvttSheet: _mark, ...page } = (window.history.state ?? {}) as Record<string, unknown>;
        window.history.replaceState(page, '');
        window.dispatchEvent(new PopStateEvent('popstate', { state: page }));
      });

      expect(onSheetEntry()).toBe(true);
    } finally {
      back.mockRestore();
    }
  });
});

describe("the browser's Back with a dialog over a sheet", () => {
  it('closes the dialog through its own close, never the sheet under it, and keeps the entry and the focus', async () => {
    const onSheetClose = vi.fn();
    function Confirm() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Remove</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Confirm"><button type="button">OK</button></Modal>
        </>
      );
    }
    render(<Sheet height="full" onClose={onSheetClose}><Confirm /></Sheet>);
    await nextFrame();
    const remove = screen.getByRole('button', { name: 'Remove' });
    remove.focus();
    fireEvent.click(remove);
    await nextFrame();
    expect(screen.getByRole('dialog', { name: 'Confirm' })).toContainElement(document.activeElement as HTMLElement);

    act(() => { window.history.back(); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confirm' })).toBeNull());
    expect(onSheetClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onSheetEntry()).toBe(true));
    expect(remove).toHaveFocus();

    act(() => { window.history.back(); });
    await waitFor(() => expect(onSheetClose).toHaveBeenCalledTimes(1));
  });

  it('asks an editor that asks before it closes, leaving the editor, the sheet and the entry', async () => {
    const onSheetClose = vi.fn();
    function Editor() {
      const [open, setOpen] = useState(false);
      const [asking, setAsking] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Edit</button>
          <SlideOver open={open} onClose={() => setAsking(true)}>
            <SlideOverTitle>Character Editor</SlideOverTitle>
            <input aria-label="Name" />
          </SlideOver>
          <Modal open={asking} onClose={() => setAsking(false)} layer="overlay" title="Discard changes?">
            <button type="button" onClick={() => { setAsking(false); setOpen(false); }}>Discard</button>
          </Modal>
        </>
      );
    }
    render(<LayoutProvider compact><Sheet onClose={onSheetClose}><Editor /></Sheet></LayoutProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await nextFrame();

    act(() => { window.history.back(); });
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Character Editor' })).toBeInTheDocument();
    expect(onSheetClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onSheetEntry()).toBe(true));

    // Back again answers the question with its own close: keep editing.
    act(() => { window.history.back(); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Character Editor' })).toBeInTheDocument();
    expect(onSheetClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onSheetEntry()).toBe(true));
  });
});

describe('what is drawn in front of a sheet', () => {
  /** Whether `later` comes after `earlier` in the page, and so is drawn over it on the same layer. */
  const follows = (earlier: Element, later: Element) =>
    (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

  function Opener({ what }: { what: 'modal' | 'slide-over' | 'sheet' }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Open</button>
        {what === 'modal' && <Modal open={open} onClose={() => setOpen(false)} title="Remove"><p>Sure?</p></Modal>}
        {what === 'slide-over' && (
          <SlideOver open={open} onClose={() => setOpen(false)}><SlideOverTitle>Token Manager</SlideOverTitle></SlideOver>
        )}
        {what === 'sheet' && open && (
          <BottomSheet open title="Roll for Aldra" height="full" onClose={() => setOpen(false)}><p>Rolls</p></BottomSheet>
        )}
      </>
    );
  }

  it('a Modal opened from it, on its layer and after it in the page', () => {
    render(<Sheet height="full"><Opener what="modal" /></Sheet>);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const modal = screen.getByRole('dialog', { name: 'Remove' });
    const layer = modal.parentElement as HTMLElement;
    expect(layer.className).toContain('z-50');
    expect(sheetElement().className).toContain('z-50');
    expect(follows(sheetElement(), layer)).toBe(true);
  });

  it('a SlideOver opened from it, on its layer and after it in the page, backdrop and all', () => {
    render(<LayoutProvider compact><Sheet><Opener what="slide-over" /></Sheet></LayoutProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const panel = screen.getByRole('dialog', { name: 'Token Manager' });
    const dim = screen.getByTestId('slide-over-backdrop');
    expect(panel.className).toContain('z-50');
    expect(dim.className).toContain('z-50');
    expect(follows(sheetElement(), dim)).toBe(true);
    expect(follows(dim, panel)).toBe(true);
  });

  it('a sheet opened from it, its backdrop over the first sheet', () => {
    render(<Sheet><Opener what="sheet" /></Sheet>);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const second = screen.getByRole('dialog', { name: 'Roll for Aldra' });
    const dim = backdrop() as HTMLElement;
    expect(dim.className).toContain('z-50');
    expect(follows(sheetElement(), dim)).toBe(true);
    expect(follows(dim, second)).toBe(true);
  });
});

describe('a phone turned sideways', () => {
  it('draws the sheet from the right at full height, with no handle', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === SHORT_SCREEN_QUERY,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }));
    render(<Sheet onHeightChange={() => undefined} />);
    expect(sheetElement().className).toContain('right-0');
    expect(sheetElement().className).toContain('w-88');
    expect(sheetElement().style.top).toBe('0px');
    expect(sheetElement().style.bottom).toBe('0px');
    expect(screen.queryByRole('button', { name: /Make Chat/ })).toBeNull();
    // As open to the map as at half height.
    expect(backdrop()).toBeNull();
  });
});

describe('with reduced motion', () => {
  it('a sheet fades in place in place of sliding', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <MotionConfig reducedMotion="always">{children}</MotionConfig>;
    const { result } = renderHook(() => useSheetMotion(false, 'bottom'), { wrapper });
    expect(result.current.animate).toMatchObject({ opacity: 0, transitionEnd: { visibility: 'hidden' } });
    expect(result.current.animate).not.toHaveProperty('y');
  });

  it('a sheet slides with motion on', () => {
    const { result } = renderHook(() => useSheetMotion(false, 'bottom'));
    expect(result.current.animate).toMatchObject({ y: '100%' });
  });
});
