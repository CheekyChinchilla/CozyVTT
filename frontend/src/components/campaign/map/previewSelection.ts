// ============================================
// Player Preview selection — whose eyes the DM's canvas is drawn through.
//
// A preview used to mean one player. A table that projects a single screen
// and moves every token itself has no player accounts to preview as, so the
// choice is now a player, one token, or every player-type token (the party).
// Pure: the predicate this produces is what MapCanvas feeds everywhere it
// already asks "is this token the viewer's".
// ============================================

import type { CampaignMembership, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';
import { controlsToken } from '@/utils/tokenControl';
import { gridYToCentrePx } from './coords';

/**
 * Whether a token can supply a preview's sight at all. The DM's token list
 * holds every token; a player is never sent one that is hidden or on the
 * spirit plane, so a preview must not look through one either. Without this
 * a hidden player token still lit its surroundings on the projector.
 */
function suppliesPreviewSight(t: Token): boolean {
  return t.visible && t.layer === TokenLayer.TOKEN;
}

export type PreviewSelection =
  | { kind: 'player'; userId: string }
  | { kind: 'token'; tokenId: string }
  | { kind: 'party' };

/** One entry in the preview picker. */
export interface PreviewOption {
  group: 'players' | 'tokens';
  value: string;
  label: string;
}

const PARTY = 'party';

/** The <select> value for a selection. */
export function encodePreviewSelection(selection: PreviewSelection): string {
  switch (selection.kind) {
    case 'player': return `player:${selection.userId}`;
    case 'token': return `token:${selection.tokenId}`;
    case 'party': return PARTY;
  }
}

/** The selection a <select> value names, or null for anything else. */
export function decodePreviewSelection(value: string): PreviewSelection | null {
  if (value === PARTY) return { kind: 'party' };
  const sep = value.indexOf(':');
  if (sep <= 0) return null;
  const kind = value.slice(0, sep);
  const id = value.slice(sep + 1);
  if (!id) return null;
  if (kind === 'player') return { kind, userId: id };
  if (kind === 'token') return { kind, tokenId: id };
  return null;
}

/**
 * Which tokens supply the previewed view.
 *
 * A player: the tokens they control, the same rule as a real player's own
 * view and the server's. One token: that token only. The party: every
 * player-type token, whoever controls it, which is the union an in-person
 * table wants on the projector.
 */
export function previewOwnFor(selection: PreviewSelection | null): (t: Token) => boolean {
  if (!selection) return () => false;
  const chosen = ownByKind(selection);
  return (t) => suppliesPreviewSight(t) && chosen(t);
}

function ownByKind(selection: PreviewSelection): (t: Token) => boolean {
  switch (selection.kind) {
    case 'player': {
      const { userId } = selection;
      return (t) => controlsToken(t, userId);
    }
    case 'token': {
      const { tokenId } = selection;
      return (t) => t.id === tokenId;
    }
    case 'party':
      return (t) => t.type === TokenType.PLAYER;
  }
}

/**
 * The tokens a preview draws and lets the pointer find: the viewer's own,
 * plus whatever the visibility rule says the viewer can see, never one that
 * is hidden or off the material plane. `canSee` is null when the map has no
 * dynamic lighting, in which case every such token shows. One function, so
 * the hover panel can never name a token the canvas does not draw.
 */
export function tokensShownInPreview(
  tokens: ReadonlyArray<Token>,
  viewerOwn: (t: Token) => boolean,
  canSee: ((cx: number, cy: number) => boolean) | null,
  viewport: { gridSize: number; mapHeight: number }
): Token[] {
  return tokens.filter((t) => {
    if (!suppliesPreviewSight(t)) return false;
    if (viewerOwn(t) || !canSee) return true;
    const cx = (t.position.x + t.size.width / 2) * viewport.gridSize;
    const cy = gridYToCentrePx(t.position.y, t.size.height, viewport.mapHeight, viewport.gridSize);
    return canSee(cx, cy);
  });
}

/**
 * Whose explored memory the preview shows.
 *
 * Memory belongs to a person, so a player preview shows theirs and a token
 * preview shows its controller's: previewing one character is the in-person
 * table's way of asking what that character knows, and the ground they have
 * already walked is part of the answer. A token nobody controls has no
 * memory to show. The party is several people at once, whose memories laid
 * over each other would describe nobody, so it shows none.
 */
export function previewMemoryUser(
  selection: PreviewSelection | null,
  tokens: ReadonlyArray<Token>
): string | null {
  if (!selection) return null;
  switch (selection.kind) {
    case 'player':
      return selection.userId;
    case 'token':
      return tokens.find((t) => t.id === selection.tokenId)?.controlledBy ?? null;
    case 'party':
      return null;
  }
}

/**
 * The picker's entries: players first, then the tokens a preview may look
 * through (visible, material plane) with player-type tokens ahead of the
 * rest, each group by name, and the party entry whenever there is a
 * player-type token to make one of.
 */
export function previewOptions(
  memberships: ReadonlyArray<Pick<CampaignMembership, 'userId' | 'role' | 'user'>>,
  tokens: ReadonlyArray<Token>
): PreviewOption[] {
  const players: PreviewOption[] = memberships
    .filter((m) => (m.role as string) === 'PLAYER')
    .map((m) => ({ group: 'players', value: `player:${m.userId}`, label: m.user?.displayName ?? 'Player' }));

  const material = tokens.filter(suppliesPreviewSight);
  const byName = (a: Token, b: Token) => a.name.localeCompare(b.name);
  const pcs = material.filter((t) => t.type === TokenType.PLAYER).sort(byName);
  const others = material.filter((t) => t.type !== TokenType.PLAYER).sort(byName);

  const tokenEntries: PreviewOption[] = [];
  if (pcs.length > 0) tokenEntries.push({ group: 'tokens', value: PARTY, label: 'All player tokens' });
  for (const t of [...pcs, ...others]) {
    tokenEntries.push({ group: 'tokens', value: `token:${t.id}`, label: t.name });
  }
  return [...players, ...tokenEntries];
}

/**
 * The selection to keep: the current one while the picker still offers it,
 * else the default. A token that left the map (a switch, a deletion) would
 * otherwise leave a preview with no viewer and a picker showing a value it
 * does not hold.
 */
export function reconcilePreviewSelection(
  selection: PreviewSelection | null,
  memberships: ReadonlyArray<Pick<CampaignMembership, 'userId' | 'role' | 'user'>>,
  tokens: ReadonlyArray<Token>
): PreviewSelection | null {
  if (!selection) return null;
  const value = encodePreviewSelection(selection);
  if (previewOptions(memberships, tokens).some((o) => o.value === value)) return selection;
  return defaultPreviewSelection(memberships, tokens);
}

/**
 * What the preview starts on: the first player if there is one, else the
 * party, else the first token, else nothing to preview.
 */
export function defaultPreviewSelection(
  memberships: ReadonlyArray<Pick<CampaignMembership, 'userId' | 'role' | 'user'>>,
  tokens: ReadonlyArray<Token>
): PreviewSelection | null {
  const first = previewOptions(memberships, tokens)[0];
  return first ? decodePreviewSelection(first.value) : null;
}
