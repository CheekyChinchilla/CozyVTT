/**
 * The profile picture's Crop Avatar window is a dialog a finger, a pen and
 * the keyboard can use.
 *
 * It was a box drawn over the page with no dialog role, so a screen reader
 * was not told it had opened, focus stayed behind it and Escape did nothing;
 * the picture moved only under a mouse, so on a phone or a tablet it could
 * not be framed at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import ProfilePage from '../ProfilePage';
import { recordDrawing } from '@/test/recordingCanvas';
import { contact, mouse } from '@/test/pointer';
import { waitForDialogFocus } from '@/test/dialogFocus';
import { SIDEWAYS_QUERY } from '@/constants/layout';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'sam@example.test', displayName: 'Sam', platformRole: 'USER', mfaEnabled: false, avatarUrl: null },
    logout: vi.fn(),
    refreshUser: vi.fn(),
    changePassword: vi.fn(),
  }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ appearance: null, applyUserPreferences: vi.fn() }),
}));
vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/components/profile/MFASection', () => ({ default: () => null }));

const drawing = recordDrawing();

/** The picture chosen, 1000 by 500: at the first zoom the crop shows its middle 500 by 500, from x 250. */
const loaded: Array<() => void> = [];
class Picture {
  onload: (() => void) | null = null;
  naturalWidth = 1000;
  naturalHeight = 500;
  private source = '';
  set src(value: string) {
    this.source = value;
    loaded.push(() => this.onload?.());
  }
  get src() { return this.source; }
}

/** The crop area is drawn 200 px across, so a screen pixel is 2.5 of the picture's. */
const SHOWN = 200;

beforeEach(() => {
  loaded.length = 0;
  vi.stubGlobal('Image', Picture);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    { x: 0, y: 0, left: 0, top: 0, right: SHOWN, bottom: SHOWN, width: SHOWN, height: SHOWN, toJSON: () => ({}) }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Choose a picture and wait for the crop window to show it; returns its canvas. */
async function openCrop(): Promise<HTMLCanvasElement> {
  const { container } = render(
    <MemoryRouter initialEntries={['/profile']}>
      <ProfilePage />
    </MemoryRouter>
  );
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('No avatar file input');
  await userEvent.upload(input, new File(['picture'], 'me.png', { type: 'image/png' }));
  await waitFor(() => expect(loaded.length).toBeGreaterThan(0));
  act(() => loaded.forEach((load) => load()));
  const canvas = document.querySelector('canvas');
  if (!canvas) throw new Error('No crop canvas');
  return canvas;
}

/** Where the picture's visible square starts, from the canvas's latest draw. */
function cropStart(canvas: HTMLCanvasElement): { x: number; y: number } {
  const draws = drawing.recorded.get(canvas)?.filter((call) => call.method === 'drawImage') ?? [];
  const last = draws[draws.length - 1];
  if (!last) throw new Error('Nothing drawn');
  return { x: Number(last.args[1]), y: Number(last.args[2]) };
}

describe('the Crop Avatar window', () => {
  it('is a dialog named Crop Avatar that takes the focus, and Escape closes it', async () => {
    await openCrop();

    const dialog = screen.getByRole('dialog', { name: 'Crop Avatar' });
    await waitForDialogFocus(dialog);
    // The keys reach the picture: a screen reader names it and passes them on.
    expect(screen.getByRole('application', { name: 'Picture to crop' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['a finger', contact('touch', 7)],
    ['a pen', contact('pen', 8)],
    ['a mouse', { down: mouse.down, move: (el: Element, at: { clientX: number; clientY: number }) => mouse.move(el, at, 1), up: mouse.up }],
  ])('moves the picture under %s dragged across it', async (_name, pointer) => {
    const canvas = await openCrop();
    expect(cropStart(canvas)).toEqual({ x: 250, y: 0 });

    pointer.down(canvas, { clientX: 100, clientY: 100 });
    pointer.move(canvas, { clientX: 60, clientY: 100 });
    pointer.up(canvas, { clientX: 60, clientY: 100 });

    // 40 screen pixels to the left is 100 of the picture's, so the crop
    // starts 100 pixels further right.
    expect(cropStart(canvas)).toEqual({ x: 350, y: 0 });
  });

  it('lets go of a drag whose pointer capture is lost, so the next finger moves the picture', async () => {
    const canvas = await openCrop();

    contact('touch', 7).down(canvas, { clientX: 100, clientY: 100 });
    fireEvent.lostPointerCapture(canvas, { pointerId: 7, pointerType: 'touch' });
    const next = contact('touch', 9);
    next.down(canvas, { clientX: 100, clientY: 100 });
    next.move(canvas, { clientX: 60, clientY: 100 });
    next.up(canvas, { clientX: 60, clientY: 100 });

    expect(cropStart(canvas)).toEqual({ x: 350, y: 0 });
  });

  it('lets go of a cancelled drag, and ignores a second finger while the first holds', async () => {
    const canvas = await openCrop();
    const first = contact('touch', 7);
    const second = contact('touch', 8, false);

    first.down(canvas, { clientX: 100, clientY: 100 });
    second.down(canvas, { clientX: 150, clientY: 100 });
    second.move(canvas, { clientX: 10, clientY: 100 });
    expect(cropStart(canvas)).toEqual({ x: 250, y: 0 });
    first.cancel(canvas);

    const next = contact('touch', 9);
    next.down(canvas, { clientX: 100, clientY: 100 });
    next.move(canvas, { clientX: 60, clientY: 100 });
    expect(cropStart(canvas)).toEqual({ x: 350, y: 0 });
  });

  it('saves the square the window shows', async () => {
    const canvas = await openCrop();
    const finger = contact('touch', 7);
    finger.down(canvas, { clientX: 100, clientY: 100 });
    finger.move(canvas, { clientX: 60, clientY: 100 });
    finger.up(canvas, { clientX: 60, clientY: 100 });

    await userEvent.click(screen.getByRole('button', { name: 'Apply & Upload' }));

    const saved = [...drawing.recorded.entries()].find(([c]) => c !== canvas && c.width === 512);
    const draw = saved?.[1].find((call) => call.method === 'drawImage');
    expect(draw?.args.slice(1, 9)).toEqual([350, 0, 500, 500, 0, 0, 512, 512]);
  });

  it('moves the picture with the arrow keys', async () => {
    const canvas = await openCrop();

    fireEvent.keyDown(canvas, { key: 'ArrowLeft' });
    expect(cropStart(canvas).x).toBe(275);
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    expect(cropStart(canvas).x).toBe(225);
  });
});

/**
 * What the window's height comes to on a 360 px tall phone screen, where a
 * finger is the pointer, rests on these classes: the window is at most 90% of
 * the screen's height and its padding 24 px, its header 44 px (the close
 * button) and 24 below it, and the picture is sized from what is left.
 */
describe('the Crop Avatar window on a small screen', () => {
  function screenIs(sideways: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: sideways && query === SIDEWAYS_QUERY,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  }

  /** The dialog, its header, the close button, the picture and the row of buttons. */
  async function parts() {
    await openCrop();
    const dialog = screen.getByRole('dialog', { name: 'Crop Avatar' });
    const heading = screen.getByRole('heading', { name: 'Crop Avatar' });
    return {
      dialog: dialog.className,
      header: heading.closest('div.flex')?.parentElement?.className ?? '',
      close: screen.getByRole('button', { name: 'Close dialog' }).className,
      picture: screen.getByLabelText('Picture to crop').className,
      buttons: screen.getByRole('button', { name: 'Cancel' }).parentElement?.className ?? '',
    };
  }

  it('puts the picture beside its controls on a phone on its side, sized to the height left', async () => {
    screenIs(true);
    const { dialog, header, close, picture, buttons } = await parts();

    expect(dialog).toContain('max-h-[90dvh]');
    expect(dialog).toContain('sm:p-6');
    expect(dialog).toContain('max-w-2xl');
    expect(header).toContain('mb-6');
    expect(close).toContain('touch-target');
    // 90% of 360 is 324; less 118 for the padding, border and header leaves
    // 206, and the picture takes 204.
    expect(picture).toContain('w-[min(300px,calc(90dvh-7.5rem))]');
    // The buttons share one row, so the controls (44 + 12 + the hint + 12 +
    // 44) stay shorter than the picture.
    expect(buttons.split(' ')).toContain('flex');
    expect(buttons).not.toContain('flex-col');
  });

  it('keeps the picture and its controls within the height of a phone held upright', async () => {
    screenIs(false);
    const { dialog, picture } = await parts();

    expect(dialog).toContain('max-w-sm');
    // The padding, border and header take 102 on a phone this narrow, the
    // controls and the gap above them at most 176: 18rem is 288.
    expect(picture).toContain('w-[min(300px,100%,calc(90dvh-18rem))]');
  });
});
