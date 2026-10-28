/**
 * The character menu and the two roll pickers on the compact layout: the
 * menu an action sheet, the pickers full-height sheets, each closing itself
 * and none closed by a press elsewhere, as their popovers are.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { Eye, Dices } from 'lucide-react';
import CharacterRollPicker from '../CharacterRollPicker';
import NpcRollPicker from '../NpcRollPicker';
import CharacterContextMenu from '../CharacterContextMenu';
import { LayoutProvider } from '@/contexts/LayoutContext';
import type { Character, CharacterData, GameSystem, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';
import type { FlatMenuItem } from '@/components/ui/menu';

const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
const onSheetEntry = () => (window.history.state as Record<string, unknown> | null)?.cozyvttSheet === true;

afterEach(async () => {
  cleanup();
  await waitFor(() => expect(onSheetEntry()).toBe(false));
});

const seelah = {
  id: 'char-1', userId: 'alice', campaignId: 'camp-1', gameSystem: 'DND_5E' as GameSystem, name: 'Seelah',
  data: { characterName: 'Seelah', stats: { strength: { score: 14, modifier: 2 } } } as unknown as CharacterData, tokenImageUrl: null, createdAt: '', updatedAt: '',
} as Character;

const goblin = {
  id: 'g', name: 'Goblin', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null,
  statBlock: { abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 } },
} as unknown as Token;

const Compact = ({ children }: { children: ReactNode }) => <LayoutProvider compact>{children}</LayoutProvider>;

describe("a character's menu on the compact layout", () => {
  function menu(run = vi.fn(), onClose = vi.fn()) {
    const items: FlatMenuItem[] = [
      { kind: 'command', id: 'view', icon: Eye, label: 'View Character Sheet', run },
      { kind: 'command', id: 'roll', icon: Dices, label: 'Roll...', run },
    ];
    render(<Compact><CharacterContextMenu x={10} y={10} title="Seelah" items={items} onClose={onClose} /></Compact>);
    return { run, onClose };
  }

  it('is an action sheet named by the character, with its items and no popover', () => {
    menu();
    const sheet = screen.getByRole('dialog', { name: 'Seelah' });
    expect(within(sheet).getByRole('button', { name: 'View Character Sheet' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Roll...' })).toBeInTheDocument();
    expect(document.querySelector('div.fixed.z-50.bg-soft-cream')).toBeNull();
  });

  it('runs an item and closes', () => {
    const { run, onClose } = menu();
    fireEvent.click(screen.getByRole('button', { name: 'Roll...' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is not closed by a press elsewhere, but by its backdrop and once by Escape', async () => {
    const { onClose } = menu();
    fireEvent.mouseDown(document.body);
    expect(onClose).not.toHaveBeenCalled();
    await nextFrame();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('[data-sheet-backdrop]') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("a character's roll picker on the compact layout", () => {
  it('is a modal sheet at full height, named for the character, with rows a finger can press', () => {
    render(<Compact><CharacterRollPicker character={seelah} onRoll={() => undefined} onClose={() => undefined} anchorX={0} anchorY={0} /></Compact>);
    const sheet = screen.getByRole('dialog', { name: 'Roll for Seelah' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    const rolls = within(sheet).getAllByRole('button').filter((b) => b.className.includes('px-3 py-1.5'));
    expect(rolls.length).toBeGreaterThan(0);
    for (const row of rolls) expect(row.className).toContain('min-h-11');
    // No popover's close button: the sheet has its own X.
    expect(within(sheet).queryByRole('button', { name: 'Close' })).toBeNull();
    expect(within(sheet).getByRole('button', { name: 'Close Roll for Seelah' })).toBeInTheDocument();
  });

  it('rolls and closes', () => {
    const onRoll = vi.fn();
    const onClose = vi.fn();
    render(<Compact><CharacterRollPicker character={seelah} onRoll={onRoll} onClose={onClose} anchorX={0} anchorY={0} /></Compact>);
    const sheet = screen.getByRole('dialog', { name: 'Roll for Seelah' });
    const first = within(sheet).getAllByRole('button').find((b) => b.className.includes('min-h-11') && b.className.includes('px-3 py-1.5'));
    fireEvent.click(first as HTMLElement);
    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(onRoll.mock.calls[0][2]).toBe('Seelah');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is not closed by a press elsewhere, and once by Escape', async () => {
    const onClose = vi.fn();
    render(<Compact><CharacterRollPicker character={seelah} onRoll={() => undefined} onClose={onClose} anchorX={0} anchorY={0} /></Compact>);
    fireEvent.mouseDown(document.body);
    expect(onClose).not.toHaveBeenCalled();
    await nextFrame();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("a creature's roll picker on the compact layout", () => {
  it('is a modal sheet at full height, named for the creature, with rows a finger can press', () => {
    render(<Compact><NpcRollPicker token={goblin} gameSystem="DND_5E" onRoll={() => undefined} onClose={() => undefined} anchorX={0} anchorY={0} /></Compact>);
    const sheet = screen.getByRole('dialog', { name: 'Roll for Goblin' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    const rolls = within(sheet).getAllByRole('button').filter((b) => b.className.includes('px-3 py-1.5'));
    expect(rolls.length).toBeGreaterThan(0);
    for (const row of rolls) expect(row.className).toContain('min-h-11');
    expect(within(sheet).getByPlaceholderText('e.g. 2d6+3')).toBeInTheDocument();
  });

  it('is not closed by a press elsewhere, and once by Escape', async () => {
    const onClose = vi.fn();
    render(<Compact><NpcRollPicker token={goblin} gameSystem="DND_5E" onRoll={() => undefined} onClose={onClose} anchorX={0} anchorY={0} /></Compact>);
    fireEvent.mouseDown(document.body);
    expect(onClose).not.toHaveBeenCalled();
    await nextFrame();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the popovers off the compact layout', () => {
  it('keep their rows as they were', () => {
    render(<NpcRollPicker token={goblin} gameSystem="DND_5E" onRoll={() => undefined} onClose={() => undefined} anchorX={0} anchorY={0} />);
    const rows = screen.getAllByRole('button').filter((b) => b.className.includes('px-3 py-1.5'));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.className).toBe('w-full flex items-center gap-2 px-3 py-1.5 text-sm text-stone-gray hover:bg-moss-green/10 transition-colors text-left');
    }
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe("the pickers' custom roll on the compact layout", () => {
  it.each([
    ['character', () => <CharacterRollPicker character={seelah} onRoll={() => undefined} onClose={() => undefined} anchorX={0} anchorY={0} />],
    ['creature', () => <NpcRollPicker token={goblin} gameSystem="DND_5E" onRoll={() => undefined} onClose={() => undefined} anchorX={0} anchorY={0} />],
  ] as const)("in the %s's picker, takes a finger: its boxes and Roll at 44 px", (_kind, picker) => {
    render(<Compact>{picker()}</Compact>);
    const sheet = screen.getByRole('dialog', { name: /^Roll for / });
    const footer = within(sheet).getByPlaceholderText('e.g. 2d6+3').closest('div.shrink-0') as HTMLElement;
    for (const control of [...within(footer).getAllByRole('textbox'), within(footer).getByRole('button', { name: /Roll/ })]) {
      expect(control.className).toContain('min-h-11');
    }
  });

  it("keeps the popover's custom roll as it was", () => {
    render(<NpcRollPicker token={goblin} gameSystem="DND_5E" onRoll={() => undefined} onClose={() => undefined} anchorX={0} anchorY={0} />);
    expect(screen.getByPlaceholderText('e.g. 2d6+3').className).toBe('input-cozy flex-1 text-xs py-1');
    expect(screen.getByPlaceholderText('Label (optional, e.g. Fireball Damage)').className).toBe('input-cozy w-full text-xs py-1');
    expect(screen.getByTitle('Roll').className).toBe('flex items-center gap-1 px-2 py-1 text-xs rounded-cozy bg-moss-green/10 text-brand-ink border border-moss-green/30 hover:bg-moss-green/15 transition-colors');
  });
});

describe("the pickers' list on the compact layout", () => {
  it('keeps a scroll at its end from moving the page under it', () => {
    render(<Compact><NpcRollPicker token={goblin} gameSystem="DND_5E" onRoll={() => undefined} onClose={() => undefined} anchorX={0} anchorY={0} /></Compact>);
    const list = screen.getByText('Abilities').closest('div.overflow-y-auto') as HTMLElement;
    expect(list.className).toContain('overscroll-contain');
  });

  it("is the popover's list as it was off the compact layout", () => {
    render(<NpcRollPicker token={goblin} gameSystem="DND_5E" onRoll={() => undefined} onClose={() => undefined} anchorX={0} anchorY={0} />);
    expect((screen.getByText('Abilities').closest('div.overflow-y-auto') as HTMLElement).className).toBe('flex-1 min-h-0 overflow-y-auto');
  });
});

/** A layout the test can switch, as a tablet turned across 1024 px would. */
let switchLayout: (compact: boolean) => void = () => undefined;
function Switchable({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(true);
  switchLayout = setCompact;
  return <LayoutProvider compact={compact}>{children}</LayoutProvider>;
}

describe("a character's menu open as the layout switches to the desktop", () => {
  it('is placed and shown as the popover', () => {
    const items: FlatMenuItem[] = [{ kind: 'command', id: 'view', icon: Eye, label: 'View Character Sheet', run: () => undefined }];
    render(<Switchable><CharacterContextMenu x={10} y={10} title="Seelah" items={items} onClose={() => undefined} /></Switchable>);
    expect(screen.getByRole('dialog', { name: 'Seelah' })).toBeInTheDocument();

    act(() => { switchLayout(false); });
    const popover = document.querySelector<HTMLElement>('div.fixed.z-50.bg-soft-cream');
    expect(popover?.style.visibility).toBe('visible');
  });
});
