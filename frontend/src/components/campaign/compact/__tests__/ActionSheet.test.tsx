/**
 * The action sheet: a menu as a sheet, drawing the same MenuItems as the
 * desktop's popovers, with the same labels in the same order, the same
 * rows disabled while they wait, the same actions run and the same closing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { Dices, Eye, Trash2 } from 'lucide-react';
import { CampaignRole, TokenLayer, TokenType, type Token } from '@/types';
import type { WallSegment } from '@/types/walls';
import type { FlatMenuItem, MenuItem } from '@/components/ui/menu';
import { MENU_ROW_CLASSES } from '@/components/ui/menu';
import { anyMenuShown } from '@/components/ui/openMenus';
import MapMenuRows from '@/components/campaign/MapMenuRows';
import CharacterContextMenu from '@/components/campaign/CharacterContextMenu';
import { tokenMenuItems, type TokenMenuActions, type TokenMenuView } from '@/components/campaign/map/tokenMenuItems';
import { doorMenuItems } from '@/components/campaign/map/doorMenuItems';
import ActionSheet from '../ActionSheet';

const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
const onSheetEntry = () => (window.history.state as Record<string, unknown> | null)?.cozyvttSheet === true;

afterEach(async () => {
  cleanup();
  await waitFor(() => expect(onSheetEntry()).toBe(false));
});

function token(extra: Partial<Token> = {}): Token {
  return {
    id: 'tok-goblin', name: 'Goblin Scout', imageUrl: '', characterId: null, position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN, visible: true, type: TokenType.NPC, conditions: [], rotation: 0, controlledBy: null, hp: null, showHpBar: false,
    ...extra,
  } as unknown as Token;
}

function tokenActions(): TokenMenuActions {
  return {
    viewSheet: vi.fn(), rollCharacter: vi.fn(), rotate: vi.fn(), rollCreature: vi.fn(), edit: vi.fn(), addToInitiative: vi.fn(),
    duplicate: vi.fn(), saveAsTemplate: vi.fn(), setVisible: vi.fn(), setObscured: vi.fn(), setLayer: vi.fn(), moveToMap: vi.fn(),
    remove: vi.fn(),
  };
}

const DM_VIEW: TokenMenuView = {
  role: CampaignRole.DM, mayViewSheet: true, mayRoll: true, mayRotate: true, mapId: 'map-a',
  maps: [{ id: 'map-a', name: 'Map A' }, { id: 'map-b', name: 'Map B' }, { id: 'map-c', name: 'Map C' }],
  busy: { crossing: false, moving: false },
};

/** A row's label: its first text span's, or its text. */
const labelOf = (row: Element) => (row.querySelector('span')?.textContent ?? row.textContent ?? '').trim();
const describeButton = (button: HTMLButtonElement) => `${labelOf(button)}${button.disabled ? ' [disabled]' : ''}`;

/** The desktop popover's rows, a row a line: a command's label, a rule as ---, a heading after #, a line of text in quotes. */
function popoverRows(popover: HTMLElement): string[] {
  return Array.from(popover.children).flatMap((row): string[] => {
    if (row instanceof HTMLButtonElement) return [describeButton(row)];
    if (row.className === MENU_ROW_CLASSES.separator) return ['---'];
    if (row instanceof HTMLParagraphElement && row.className === MENU_ROW_CLASSES.heading) return [`# ${row.textContent}`];
    if (row instanceof HTMLParagraphElement && row.className === MENU_ROW_CLASSES.text) return [`“${row.textContent}”`];
    const [command, submenu] = Array.from(row.children);
    if (command instanceof HTMLButtonElement) {
      const choices = submenu ? Array.from(submenu.children).map((choice) => `› ${choice instanceof HTMLButtonElement ? describeButton(choice) : `(${choice.textContent})`}`) : [];
      return [describeButton(command), ...choices];
    }
    throw new Error(`an unknown popover row: ${row.outerHTML}`);
  });
}

/** The action sheet's page, read the same way. */
function sheetRows(): string[] {
  const page = document.querySelector<HTMLElement>('[data-action-sheet-page]');
  if (!page) throw new Error('no action sheet open');
  return Array.from(page.children).map((row) => {
    if (row instanceof HTMLButtonElement) return describeButton(row);
    if (row.getAttribute('role') === 'separator') return '---';
    if (row instanceof HTMLParagraphElement && row.className.includes('uppercase')) return `# ${row.textContent}`;
    if (row instanceof HTMLParagraphElement && row.className.includes('italic')) return `“${row.textContent}”`;
    if (row instanceof HTMLParagraphElement) return `(${row.textContent})`;
    throw new Error(`an unknown sheet row: ${row.outerHTML}`);
  });
}

function Popover({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const [submenu, setSubmenu] = useState<string | null>(null);
  return (
    <div data-testid="popover">
      <MapMenuRows items={items} onClose={onClose} openSubmenu={submenu} onToggleSubmenu={(id) => setSubmenu((open) => (open === id ? null : id))} />
    </div>
  );
}

function Sheet({ items, onClose = () => undefined, open = true }: { items: MenuItem[]; onClose?: () => void; open?: boolean }) {
  return <ActionSheet open={open} title="Goblin Scout" subtitle="7 / 7 HP" items={items} onClose={onClose} />;
}

describe('an action sheet', () => {
  it('is a modal dialog named by its title, with its line under it and Cancel', () => {
    render(<ActionSheet open title="Goblin Scout" subtitle="Yours · 7 / 7 HP" leading={<span data-testid="picture" />} items={[]} onClose={() => undefined} />);
    const sheet = screen.getByRole('dialog', { name: 'Goblin Scout' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(within(sheet).getByText('Yours · 7 / 7 HP')).toBeInTheDocument();
    expect(within(sheet).getByTestId('picture')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('closes on Cancel, its backdrop and Escape, and is a menu on the screen until it does', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Sheet items={tokenMenuItems(token(), { ...DM_VIEW, actions: tokenActions() })} onClose={onClose} />);
    expect(anyMenuShown()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(document.querySelector('[data-sheet-backdrop]') as HTMLElement);
    await nextFrame();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);

    rerender(<Sheet open={false} items={[]} onClose={onClose} />);
    expect(anyMenuShown()).toBe(false);
  });

  it('closes on the browser’s Back', async () => {
    const onClose = vi.fn();
    render(<Sheet items={tokenMenuItems(token(), { ...DM_VIEW, actions: tokenActions() })} onClose={onClose} />);
    act(() => { window.history.back(); });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('puts the focus on its first item as it opens', async () => {
    render(<Sheet items={tokenMenuItems(token(), { ...DM_VIEW, actions: tokenActions() })} />);
    await nextFrame();
    expect(document.activeElement).toHaveTextContent('Rotate Left');
  });

  it('draws rows a finger can press: 52 px or more', () => {
    render(<Sheet items={tokenMenuItems(token(), { ...DM_VIEW, actions: tokenActions() })} />);
    const page = document.querySelector('[data-action-sheet-page]') as HTMLElement;
    for (const row of within(page).getAllByRole('button')) expect(row.className).toContain('min-h-13');
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('min-h-13');
  });

  it('opens a submenu as a second page, under its name, and goes back by a row named for the sheet', () => {
    render(<Sheet items={tokenMenuItems(token(), { ...DM_VIEW, actions: tokenActions() })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move to Map…' }));
    expect(sheetRows()).toEqual(['Back to Goblin Scout', '# Move to Map…', 'Map B', 'Map C']);
    expect(screen.queryByRole('button', { name: 'Move to Map…' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Goblin Scout' }));
    expect(sheetRows()).toContain('Remove from Map');
  });

  it('shows a submenu’s wait in place of its choices', () => {
    render(<Sheet items={tokenMenuItems(token(), { ...DM_VIEW, busy: { crossing: false, moving: true }, actions: tokenActions() })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move to Map…' }));
    expect(sheetRows()).toEqual(['Back to Goblin Scout', '# Move to Map…', '(Moving…)']);
  });

  // A held Enter that opened the menu (on a selected token, from the keyboard)
  // must not press the first item the sheet puts the focus on.
  it('does not press its first item on a held Enter, as the popover does not', async () => {
    render(<Sheet items={tokenMenuItems(token(), { ...DM_VIEW, actions: tokenActions() })} />);
    await nextFrame();
    const first = document.activeElement as HTMLElement;
    expect(first).toHaveTextContent('Rotate Left');
    const held = createEvent.keyDown(first, { key: 'Enter', repeat: true });
    fireEvent(first, held);
    expect(held.defaultPrevented).toBe(true);
    const pressed = createEvent.keyDown(first, { key: 'Enter' });
    fireEvent(first, pressed);
    expect(pressed.defaultPrevented).toBe(false);
  });
});

describe('the same items as the desktop popover', () => {
  const cases: Array<[string, () => MenuItem[]]> = [
    ["the DM's menu on a creature", () => tokenMenuItems(token(), { ...DM_VIEW, actions: tokenActions() })],
    ["the DM's menu while a crossing waits", () => tokenMenuItems(token(), { ...DM_VIEW, busy: { crossing: true, moving: false }, actions: tokenActions() })],
    ["a player's menu on their own character", () => tokenMenuItems(token({ characterId: 'char-1', type: TokenType.PLAYER, controlledBy: 'me' }), {
      ...DM_VIEW, role: CampaignRole.PLAYER, actions: tokenActions(),
    })],
    ["the DM's door menu", () => doorMenuItems({ id: 'd', x1: 0, y1: 0, x2: 1, y2: 0, type: 'door-closed' } as WallSegment, { role: CampaignRole.DM, actions: { setType: vi.fn() } })],
    ["a player's locked door", () => doorMenuItems({ id: 'd', x1: 0, y1: 0, x2: 1, y2: 0, type: 'door-locked' } as WallSegment, { role: CampaignRole.PLAYER, actions: { setType: vi.fn() } })],
  ];

  it.each(cases)('%s: the labels, in order, disabled alike', (_name, build) => {
    const items = build();
    render(<Popover items={items} onClose={() => undefined} />);
    const desktop = popoverRows(screen.getByTestId('popover'));
    cleanup();
    render(<Sheet items={items} />);
    expect(sheetRows()).toEqual(desktop);
  });

  it("a submenu's choices, in order", () => {
    const items = tokenMenuItems(token(), { ...DM_VIEW, actions: tokenActions() });
    render(<Popover items={items} onClose={() => undefined} />);
    fireEvent.click(within(screen.getByTestId('popover')).getByText('Move to Map…'));
    const desktop = popoverRows(screen.getByTestId('popover')).filter((row) => row.startsWith('› ')).map((row) => row.slice(2));
    cleanup();
    render(<Sheet items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Move to Map…' }));
    expect(sheetRows().slice(2)).toEqual(desktop);
  });

  it('runs the same action with the same token and closes alike, the turns keeping it open', () => {
    const labels = ['Rotate Left', 'Rotate Right', 'Roll...', 'Edit Token', 'Add to Initiative', 'Duplicate Token', 'Save as Template',
      'Hide from Players', 'Obscure Identity', 'Send to Spirit Realm', 'Remove from Map'];
    const results = (container: 'popover' | 'sheet') => labels.map((label) => {
      const actions = tokenActions();
      const onClose = vi.fn();
      const items = tokenMenuItems(token(), { ...DM_VIEW, actions });
      if (container === 'popover') render(<Popover items={items} onClose={onClose} />);
      else render(<Sheet items={items} onClose={onClose} />);
      const scope = container === 'popover' ? within(screen.getByTestId('popover')) : within(document.querySelector('[data-action-sheet-page]') as HTMLElement);
      fireEvent.click(scope.getByText(label));
      const called = Object.entries(actions)
        .filter(([, fn]) => (fn as ReturnType<typeof vi.fn>).mock.calls.length > 0)
        .map(([name, fn]) => `${name}(${(fn as ReturnType<typeof vi.fn>).mock.calls.map((args) => JSON.stringify(args.slice(1))).join(';')})`);
      cleanup();
      return `${label}: ${called.join(', ')}${onClose.mock.calls.length > 0 ? ', closed' : ''}`;
    });
    const desktop = results('popover');
    expect(desktop).toContain('Rotate Left: rotate([-45])');
    expect(desktop).toContain('Edit Token: edit([]), closed');
    expect(results('sheet')).toEqual(desktop);
  });

  it("runs a submenu's choice and closes, as the popover does", () => {
    const run = (container: 'popover' | 'sheet') => {
      const actions = tokenActions();
      const onClose = vi.fn();
      const items = tokenMenuItems(token(), { ...DM_VIEW, actions });
      if (container === 'popover') render(<Popover items={items} onClose={onClose} />);
      else render(<Sheet items={items} onClose={onClose} />);
      fireEvent.click(screen.getByText('Move to Map…'));
      fireEvent.click(screen.getByText('Map C'));
      const result = { moved: (actions.moveToMap as ReturnType<typeof vi.fn>).mock.calls.map((args) => args[1]), closed: onClose.mock.calls.length };
      cleanup();
      return result;
    };
    expect(run('sheet')).toEqual(run('popover'));
    expect(run('sheet')).toEqual({ moved: ['map-c'], closed: 1 });
  });

  it('presses nothing that waits', () => {
    const actions = tokenActions();
    render(<Sheet items={tokenMenuItems(token(), { ...DM_VIEW, busy: { crossing: true, moving: false }, actions })} />);
    const waiting = screen.getByRole('button', { name: 'Moving…' });
    expect(waiting).toBeDisabled();
    fireEvent.click(waiting);
    expect(actions.setLayer).not.toHaveBeenCalled();
  });

  it("draws the character menu's items, icons and all, as its popover does", () => {
    const run = vi.fn();
    const items: FlatMenuItem[] = [
      { kind: 'command', id: 'view', label: 'View Character Sheet', icon: Eye, run },
      { kind: 'command', id: 'roll', label: 'Roll...', icon: Dices, run },
      { kind: 'separator', id: 'rule' },
      { kind: 'command', id: 'remove', label: 'Remove from Campaign', icon: Trash2, tone: 'danger', run },
    ];
    render(<CharacterContextMenu x={10} y={10} items={items} onClose={() => undefined} />);
    const menu = document.querySelector<HTMLElement>('div.fixed.z-50') as HTMLElement;
    const desktop = popoverRows(menu);
    const icons = Array.from(menu.querySelectorAll('svg')).map((svg) => svg.getAttribute('class')?.split(' ')[1]);
    cleanup();
    render(<Sheet items={items} />);
    expect(sheetRows()).toEqual(desktop);
    const page = document.querySelector('[data-action-sheet-page]') as HTMLElement;
    expect(Array.from(page.querySelectorAll('svg')).map((svg) => svg.getAttribute('class')?.split(' ')[1])).toEqual(icons);
    expect(screen.getByRole('button', { name: 'Remove from Campaign' }).className).toContain('text-danger-ink');
  });
});
