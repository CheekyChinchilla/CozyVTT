/**
 * A roll from a character sheet shows that it went: the stat tapped gives a
 * short pulse, the device gives a short buzz where the browser allows one,
 * and while no Dice log is on the screen a message gives the result.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Character, CampaignMembership, DiceRolledEvent } from '@/types';
import CharacterSheetViewerModal from '../CharacterSheetViewerModal';

const h = vi.hoisted(() => ({
  rollDice: vi.fn(),
  showToast: vi.fn(),
  rolled: [] as Array<(e: DiceRolledEvent) => void>,
  logOnScreen: false,
}));

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', platformRole: 'USER' } }) }));
vi.mock('@/utils/diceLogOnScreen', () => ({ diceLogOnScreen: () => h.logOnScreen, useDiceLogOnScreen: () => undefined }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useOptionalWebSocket: () => ({
    socket: {
      rollDice: (roll: unknown) => h.rollDice(roll),
      emitHitDiceSpend: vi.fn(),
      on: (event: string, fn: (e: DiceRolledEvent) => void) => {
        if (event.startsWith('dice.rolled')) h.rolled.push(fn);
      },
      off: (event: string, fn: (e: DiceRolledEvent) => void) => {
        if (event.startsWith('dice.rolled')) h.rolled.splice(h.rolled.indexOf(fn), 1);
      },
    },
  }),
}));
vi.mock('@/services/api', () => ({ api: { getUser: vi.fn().mockRejectedValue(new Error('Forbidden')) } }));
vi.mock('../../character-sheets/dnd5e/DnD5eCharacterView', () => ({
  DnD5eCharacterView: ({ onRoll }: { onRoll?: (expression: string, purpose: string) => void }) => (
    <div>
      <div data-roll="1d20+3" data-roll-purpose="Perception Check" onClick={() => onRoll?.('1d20+3', 'Perception Check')}>
        <span>Perception</span>
      </div>
      <div data-sheet-roll="" onClick={() => onRoll?.('1d8+3', 'Longsword Damage')}>Damage 1d8+3</div>
      <p onClick={() => undefined}>Background</p>
    </div>
  ),
}));

const character = {
  id: 'char-1', userId: 'me', name: 'Aria', gameSystem: 'DND_5E', data: {}, campaignId: 'camp-1',
  updatedAt: '2026-01-01T00:00:00.000Z', user: { id: 'me', displayName: 'Me', avatarUrl: null },
} as unknown as Character;
const membership = { userId: 'me', campaignId: 'camp-1', role: 'PLAYER', characterIds: ['char-1'] } as unknown as CampaignMembership;

const rolledEvent = (id: string, result: number, purpose: string, secret = false): DiceRolledEvent => ({
  id, userId: 'me', userName: 'Me', characterName: 'Aria', expression: '1d20+3', result,
  breakdown: { expression: '1d20+3', rolls: [], total: result, formula: '' }, purpose, timestamp: '2026-11-07T20:00:00Z',
  ...(secret ? { secret: true } : {}),
});

function open() {
  render(<CharacterSheetViewerModal character={character} campaignId="camp-1" membership={membership} onClose={() => {}} />);
}

beforeEach(() => {
  h.rollDice.mockReset().mockResolvedValue({ ok: true, id: 'roll-1' });
  h.showToast.mockReset();
  h.rolled.length = 0;
  h.logOnScreen = false;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'vibrate');
});

describe('the stat tapped', () => {
  it('pulses for a moment, a d20 test and a damage roll alike', async () => {
    open();
    const perception = screen.getByText('Perception').closest('[data-roll]') as HTMLElement;
    await act(async () => { fireEvent.click(screen.getByText('Perception')); });
    expect(perception.classList.contains('roll-pulse')).toBe(true);
    act(() => { vi.advanceTimersByTime(400); });
    expect(perception.classList.contains('roll-pulse')).toBe(false);

    const damage = screen.getByText('Damage 1d8+3');
    await act(async () => { fireEvent.click(damage); });
    expect(damage.classList.contains('roll-pulse')).toBe(true);
  });

  it('is the only thing that pulses: a click elsewhere on the sheet pulses nothing', async () => {
    open();
    await act(async () => { fireEvent.click(screen.getByText('Background')); });
    expect(document.querySelector('.roll-pulse')).toBeNull();
  });
});

describe('the buzz', () => {
  it('is 15 ms where the browser can vibrate', async () => {
    const vibrate = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    open();
    await act(async () => { fireEvent.click(screen.getByText('Perception')); });
    expect(vibrate).toHaveBeenCalledWith(15);
  });

  it('is skipped where it cannot, and the roll still goes', async () => {
    open();
    await act(async () => { fireEvent.click(screen.getByText('Perception')); });
    expect(h.rollDice).toHaveBeenCalledTimes(1);
  });
});

describe('the result message', () => {
  it('gives the roll\'s purpose and total once its answer arrives, while no Dice log is on the screen', async () => {
    open();
    await act(async () => { fireEvent.click(screen.getByText('Perception')); });
    expect(h.showToast).not.toHaveBeenCalled();

    act(() => { h.rolled.forEach((fn) => fn(rolledEvent('roll-1', 17, 'Perception Check'))); });

    expect(h.showToast).toHaveBeenCalledWith('Perception Check: 17', 'info', 4000);
  });

  it('comes for a roll whose result arrived before the server\'s answer', async () => {
    let answer!: (a: { ok: true; id: string }) => void;
    h.rollDice.mockReturnValue(new Promise((r) => { answer = r; }));
    open();
    await act(async () => { fireEvent.click(screen.getByText('Perception')); });
    act(() => { h.rolled.forEach((fn) => fn(rolledEvent('roll-1', 9, 'Perception Check'))); });
    await act(async () => { answer({ ok: true, id: 'roll-1' }); });

    expect(h.showToast).toHaveBeenCalledWith('Perception Check: 9', 'info', 4000);
  });

  it('marks a secret roll as secret', async () => {
    open();
    await act(async () => { fireEvent.click(screen.getByText('Perception')); });
    act(() => { h.rolled.forEach((fn) => fn(rolledEvent('roll-1', 12, 'Perception Check', true))); });
    expect(h.showToast).toHaveBeenCalledWith('Perception Check: 12 (secret)', 'info', 4000);
  });

  it('does not come while a Dice log is on the screen', async () => {
    h.logOnScreen = true;
    open();
    await act(async () => { fireEvent.click(screen.getByText('Perception')); });
    act(() => { h.rolled.forEach((fn) => fn(rolledEvent('roll-1', 17, 'Perception Check'))); });
    expect(h.showToast).not.toHaveBeenCalled();
  });

  it('is never given for someone else\'s roll', async () => {
    open();
    await act(async () => { fireEvent.click(screen.getByText('Perception')); });
    act(() => { h.rolled.forEach((fn) => fn(rolledEvent('roll-other', 3, 'Stealth'))); });
    expect(h.showToast).not.toHaveBeenCalled();
  });
});
