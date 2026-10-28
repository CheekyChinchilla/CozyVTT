// ============================================
// The header of a token's action sheet: its picture, and a line saying
// whose it is and the hit points this viewer may see
// ============================================

import type { CampaignMembership, Token } from '@/types';
import type { CharacterHpInfo } from '@/utils/characterHp';
import { tokenControllerStanding } from '@/utils/tokenCopy';
import { placeholderColor } from '@/components/campaign/map/layers/drawTokens';

type Member = Pick<CampaignMembership, 'userId' | 'role'> & { user?: { displayName?: string } };

/**
 * "Yours" or "Alice's" for a token a player moves, and its hit points as
 * `hp` gives them (the map passes what `visibleTokenHp` lets this viewer
 * see), joined by a dot; nothing when there is neither.
 */
export function tokenSheetLine(
  token: Pick<Token, 'controlledBy'>,
  viewerId: string | undefined,
  memberships: readonly Member[] | undefined,
  hp: CharacterHpInfo | null
): string | undefined {
  const parts: string[] = [];
  const standing = tokenControllerStanding(token.controlledBy, memberships);
  if (standing.kind === 'player') parts.push(token.controlledBy === viewerId ? 'Yours' : `${standing.name}'s`);
  if (hp) parts.push(`${hp.current} / ${hp.max} HP${hp.temp > 0 ? ` +${hp.temp}` : ''}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** The token's picture, when this viewer is sent one, else its colour and first letter, as the details card draws it. */
export function TokenSheetPicture({ token, imageSrc }: { token: Token; imageSrc?: string }) {
  if (imageSrc) {
    return <img src={imageSrc} alt="" className="size-10 shrink-0 rounded-full border-2 border-warm-amber/50 object-cover" />;
  }
  return (
    <div
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-warm-amber/50 font-semibold text-white"
      style={{ backgroundColor: placeholderColor(token) }}
    >
      {(token.name || '?').charAt(0).toUpperCase()}
    </div>
  );
}
