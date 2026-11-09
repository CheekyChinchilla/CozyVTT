/**
 * The door menu as data: its heading, what each viewer may make of the door,
 * and the line a player reads at a locked one. Pure; MapCanvasMenus.test.tsx
 * checks the menu MapCanvas draws from it.
 */

import { describe, it, expect, vi } from 'vitest';
import { CampaignRole } from '@/types';
import type { WallSegment, WallType } from '@/types/walls';
import type { MenuItem } from '@/components/ui/menu';
import { doorMenuItems } from '../doorMenuItems';

const door = (type: WallType): WallSegment => ({ id: 'd1', x1: 0, y1: 0, x2: 50, y2: 0, type });

/** Each row as `kind: label`, a command with its tone. */
const rows = (items: MenuItem[]) => items.map((i) => {
  if (i.kind === 'separator') return '---';
  if (i.kind === 'command') return `command: ${i.label}${i.tone ? ` (${i.tone})` : ''}`;
  return `${i.kind}: ${i.label}`;
});

describe("the DM's door menu", () => {
  it.each([
    ['door-closed', ['heading: 🚪 Closed Door', 'command: Open Door (brand)', 'command: Lock Door (danger)']],
    ['door-open', ['heading: 🚪 Open Door', 'command: Close Door (brand)', 'command: Lock Door (danger)']],
    ['door-locked', ['heading: 🔒 Locked Door', 'command: Unlock Door (brand)']],
  ] as const)('on a door that is %s', (type, expected) => {
    expect(rows(doorMenuItems(door(type), { role: CampaignRole.DM, actions: { setType: vi.fn() } }))).toEqual(expected);
  });
});

describe("anyone else's door menu", () => {
  it.each([CampaignRole.PLAYER, CampaignRole.SPECTATOR, null])('as %s: opening and closing, and a line at a locked door', (role) => {
    const ctx = { role, actions: { setType: vi.fn() } };
    expect(rows(doorMenuItems(door('door-closed'), ctx))).toEqual(['heading: 🚪 Closed Door', 'command: Open Door (brand)']);
    expect(rows(doorMenuItems(door('door-open'), ctx))).toEqual(['heading: 🚪 Open Door', 'command: Close Door (brand)']);
    expect(rows(doorMenuItems(door('door-locked'), ctx))).toEqual(['heading: 🔒 Locked Door', 'text: This door is locked.']);
  });
});

describe('what each item does', () => {
  it.each([
    ['door-closed', 'open', 'door-open'],
    ['door-open', 'close', 'door-closed'],
    ['door-closed', 'lock', 'door-locked'],
    ['door-open', 'lock', 'door-locked'],
    ['door-locked', 'unlock', 'door-closed'],
  ] as const)('on a door that is %s, %s makes it %s', (type, id, next) => {
    const setType = vi.fn();
    const shut = door(type);
    const item = doorMenuItems(shut, { role: CampaignRole.DM, actions: { setType } }).find((i) => i.id === id);
    if (item?.kind !== 'command') throw new Error(`no command ${id}`);

    expect(setType).not.toHaveBeenCalled();
    item.run?.();
    expect(setType).toHaveBeenCalledWith(shut, next);
  });

  it('closes the menu after every item', () => {
    for (const type of ['door-closed', 'door-open', 'door-locked'] as const) {
      const items = doorMenuItems(door(type), { role: CampaignRole.DM, actions: { setType: vi.fn() } });
      expect(items.filter((i) => i.kind === 'command' && i.keepsOpen)).toEqual([]);
    }
  });
});
