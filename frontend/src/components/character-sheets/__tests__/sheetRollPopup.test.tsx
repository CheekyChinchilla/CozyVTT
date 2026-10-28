/**
 * A sheet's roll menu: Normal, Advantage and Disadvantage for one d20 test,
 * Fortune and Misfortune on a Pathfinder 2e sheet, opened over the stat.
 *
 * The D&D 5e and Pathfinder 2e sheets each drew a copy of it. It ran off the
 * right or the bottom of the screen when opened near either edge, Escape
 * closed the whole sheet under it, and it closed on a mousedown anywhere
 * else, which iOS sends as the finger of a long-press lifts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Character, CampaignMembership } from '@/types';
import { DnD5eCharacterView } from '../dnd5e/DnD5eCharacterView';
import { Pathfinder2eCharacterView } from '../pathfinder2e/Pathfinder2eCharacterView';
import { dnd5eCharacter } from '../dnd5e/__tests__/dnd5eFixture';
import { pf2eCharacter } from '../pathfinder2e/__tests__/pf2eFixture';
import { placeRollPopup } from '../SheetRollPopup';
import CharacterSheetViewerModal from '../../character/CharacterSheetViewerModal';

const rollDice = vi.fn().mockResolvedValue({ ok: true, id: 'r' });

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', platformRole: 'USER' } }) }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => ({ socket: { rollDice, emitHitDiceSpend: vi.fn(), on: vi.fn(), off: vi.fn() } }),
}));
vi.mock('@/services/api', () => ({ api: {} }));

const at = (clientX: number, clientY: number) => ({ clientX, clientY });
const menu = () => screen.queryByRole('menu');
const items = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

afterEach(() => { vi.restoreAllMocks(); });

describe('on a D&D 5e sheet', () => {
  it('offers Normal, Advantage and Disadvantage for a save, named after it, and rolls the one chosen', () => {
    const onRoll = vi.fn();
    render(<DnD5eCharacterView character={dnd5eCharacter()} onRoll={onRoll} />);

    fireEvent.contextMenu(screen.getByText('dexterity'), at(40, 40));

    expect(screen.getByRole('menu', { name: 'Dexterity Save' })).toBeInTheDocument();
    expect(items()).toEqual(['Normal', 'Advantage', 'Disadvantage']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Advantage' }));
    expect(onRoll).toHaveBeenCalledWith('2d20kh1+0', 'Dexterity Save (Advantage)');
    expect(menu()).toBeNull();
  });

  it('rolls Normal as the stat is, with nothing added to its purpose', () => {
    const onRoll = vi.fn();
    render(<DnD5eCharacterView character={dnd5eCharacter()} onRoll={onRoll} />);

    fireEvent.contextMenu(screen.getByText('Stealth'), at(40, 40));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Normal' }));

    expect(onRoll).toHaveBeenCalledWith('1d20+0', 'Stealth Check');
  });

  it('opens over an ability and an attack too', () => {
    const attack = { name: 'Spear', attackBonus: 4, damageRoll: '1d6+2', damageType: 'piercing', range: 20, properties: [], notes: '' };
    const onRoll = vi.fn();
    render(<DnD5eCharacterView character={dnd5eCharacter({ attacks: [attack] })} onRoll={onRoll} />);

    fireEvent.contextMenu(screen.getByText('STR'), at(40, 40));
    expect(screen.getByRole('menu', { name: 'Strength Check' })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    fireEvent.click(screen.getByRole('button', { name: 'Combat' }));
    fireEvent.contextMenu(screen.getByText('Spear'), at(40, 40));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Disadvantage' }));

    expect(onRoll).toHaveBeenCalledWith('2d20kl1+4', 'Spear Attack (Disadvantage)');
  });
});

describe('on a Pathfinder 2e sheet', () => {
  it('offers Normal, Fortune and Misfortune, and rolls Misfortune twice keeping the lower', () => {
    const onRoll = vi.fn();
    render(<Pathfinder2eCharacterView character={pf2eCharacter()} onRoll={onRoll} />);

    fireEvent.contextMenu(screen.getByText('Perception', { selector: 'div' }), at(40, 40));

    expect(screen.getByRole('menu', { name: 'Perception' })).toBeInTheDocument();
    expect(items()).toEqual(['Normal', 'Fortune', 'Misfortune']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Misfortune' }));
    expect(onRoll).toHaveBeenCalledTimes(1);
    expect(onRoll.mock.calls[0][0]).toMatch(/^2d20kl1/);
    expect(onRoll.mock.calls[0][1]).toBe('Perception (Misfortune)');
  });
});

describe('closing it', () => {
  it('closes on a press anywhere else, by finger, pen or mouse', () => {
    render(<DnD5eCharacterView character={dnd5eCharacter()} onRoll={vi.fn()} />);

    fireEvent.contextMenu(screen.getByText('dexterity'), at(40, 40));
    expect(menu()).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByText('Saving Throws'), { pointerType: 'touch' });

    expect(menu()).toBeNull();
  });

  it('stays open on a mousedown with no press, as iOS sends when a long-press lifts', () => {
    render(<DnD5eCharacterView character={dnd5eCharacter()} onRoll={vi.fn()} />);

    fireEvent.contextMenu(screen.getByText('dexterity'), at(40, 40));
    fireEvent.mouseDown(screen.getByText('Saving Throws'));

    expect(menu()).toBeInTheDocument();
  });

  it('stays open on a press inside it', () => {
    render(<DnD5eCharacterView character={dnd5eCharacter()} onRoll={vi.fn()} />);

    fireEvent.contextMenu(screen.getByText('dexterity'), at(40, 40));
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Normal' }));

    expect(menu()).toBeInTheDocument();
  });

  it('closes on Escape, and the sheet under it stays open', async () => {
    const character = { ...dnd5eCharacter(), userId: 'owner' } as Character;
    const membership = { userId: 'owner', campaignId: 'camp-1', role: 'PLAYER', characterIds: [] } as unknown as CampaignMembership;
    const onClose = vi.fn();
    render(<CharacterSheetViewerModal character={character} campaignId="camp-1" membership={membership} onClose={onClose} />);

    fireEvent.contextMenu(screen.getByText('dexterity'), at(40, 40));
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Normal' })).toHaveFocus());
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(menu()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('from the keyboard', () => {
  it('takes the focus on its first item, and the arrows, Home and End move through the items', async () => {
    render(<DnD5eCharacterView character={dnd5eCharacter()} onRoll={vi.fn()} />);

    fireEvent.contextMenu(screen.getByText('dexterity'), at(40, 40));
    const [normal, advantage, disadvantage] = screen.getAllByRole('menuitem');
    await waitFor(() => expect(normal).toHaveFocus());
    const press = (key: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key });

    press('ArrowDown');
    expect(advantage).toHaveFocus();
    press('End');
    expect(disadvantage).toHaveFocus();
    press('ArrowDown');
    expect(normal).toHaveFocus();
    press('ArrowUp');
    expect(disadvantage).toHaveFocus();
    press('Home');
    expect(normal).toHaveFocus();
  });
});

describe('where it opens', () => {
  it('opens at the point, and on the other side of it where it would run off the screen', () => {
    const size = { width: 180, height: 150 };
    const screenSize = { width: 360, height: 640 };
    expect(placeRollPopup(at(40, 60), size, screenSize)).toEqual({ left: 40, top: 60 });
    expect(placeRollPopup(at(300, 600), size, screenSize)).toEqual({ left: 120, top: 450 });
  });

  it('stays 8 pixels inside the screen however near the edge the point is', () => {
    const screenSize = { width: 360, height: 640 };
    // Too wide for either side of the point: turned, then held inside.
    expect(placeRollPopup(at(100, 100), { width: 300, height: 150 }, screenSize)).toEqual({ left: 8, top: 100 });
    expect(placeRollPopup(at(2, 3), { width: 180, height: 150 }, screenSize)).toEqual({ left: 8, top: 8 });
    expect(placeRollPopup(at(200, 100), { width: 400, height: 150 }, screenSize)).toEqual({ left: 8, top: 100 });
  });

  it('is placed inside the screen on a phone', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(360);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(640);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { x: 0, y: 0, left: 0, top: 0, right: 180, bottom: 150, width: 180, height: 150, toJSON: () => ({}) } as DOMRect
    );
    render(<DnD5eCharacterView character={dnd5eCharacter()} onRoll={vi.fn()} />);

    fireEvent.contextMenu(screen.getByText('dexterity'), at(300, 600));

    expect(screen.getByRole('menu')).toHaveStyle({ left: '120px', top: '450px' });
  });

  it('has items a finger can hit on a touch screen', () => {
    render(<DnD5eCharacterView character={dnd5eCharacter()} onRoll={vi.fn()} />);

    fireEvent.contextMenu(screen.getByText('dexterity'), at(40, 40));

    for (const item of screen.getAllByRole('menuitem')) expect(item.className.split(/\s+/)).toContain('pointer-coarse:min-h-11');
  });
});
