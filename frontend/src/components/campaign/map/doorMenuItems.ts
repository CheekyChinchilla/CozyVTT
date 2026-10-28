// ============================================
// The door menu as data: what a right-click or a long-press on a door offers
// a viewer, for a door the map offers them (map/doorAccess.ts). The DM opens,
// closes, locks and unlocks; anyone else opens and closes, and reads that a
// locked door is locked.
//
// Pure: no React, no DOM.
// ============================================

import { CampaignRole } from '@/types';
import type { WallSegment, WallType } from '@/types/walls';
import type { MenuItem } from '@/components/ui/menu';

export interface DoorMenuContext {
  /** The viewer's role in the campaign; null until it is known. */
  role: CampaignRole | null;
  actions: {
    /** Makes the door `type`, for everyone. */
    setType: (door: WallSegment, type: WallType) => void;
  };
}

export function doorMenuItems(door: WallSegment, ctx: DoorMenuContext): MenuItem[] {
  const isDM = ctx.role === CampaignRole.DM;
  const set = (type: WallType) => () => ctx.actions.setType(door, type);
  const items: MenuItem[] = [{
    kind: 'heading',
    id: 'state',
    label: door.type === 'door-closed' ? '🚪 Closed Door' : door.type === 'door-open' ? '🚪 Open Door' : '🔒 Locked Door',
  }];

  if (door.type === 'door-closed') items.push({ kind: 'command', id: 'open', label: 'Open Door', tone: 'brand', run: set('door-open') });
  if (door.type === 'door-open') items.push({ kind: 'command', id: 'close', label: 'Close Door', tone: 'brand', run: set('door-closed') });
  if (isDM && door.type !== 'door-locked') items.push({ kind: 'command', id: 'lock', label: 'Lock Door', tone: 'danger', run: set('door-locked') });
  if (isDM && door.type === 'door-locked') items.push({ kind: 'command', id: 'unlock', label: 'Unlock Door', tone: 'brand', run: set('door-closed') });
  if (!isDM && door.type === 'door-locked') items.push({ kind: 'text', id: 'locked', label: 'This door is locked.' });
  return items;
}
