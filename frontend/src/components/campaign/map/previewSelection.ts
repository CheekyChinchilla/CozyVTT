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

export type PreviewSelection =
  | { kind: 'player'; userId: string }
  | { kind: 'token'; tokenId: string }
  | { kind: 'party' };

/** A character's owner, the one fact the player predicate needs. */
export interface CharacterOwner {
  id: string;
  userId: string;
}

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
 * A player: the tokens they control, or that are bound to one of their
 * characters, the same two clauses as a real player's own view. One token:
 * that token only. The party: every player-type token, whoever controls it,
 * which is the union an in-person table wants on the projector.
 */
export function previewOwnFor(
  selection: PreviewSelection | null,
  characters: ReadonlyArray<CharacterOwner>
): (t: Token) => boolean {
  if (!selection) return () => false;
  switch (selection.kind) {
    case 'player': {
      const { userId } = selection;
      return (t) =>
        t.controlledBy === userId ||
        !!(t.characterId && characters.some((c) => c.id === t.characterId && c.userId === userId));
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
 * Whose explored memory the preview shows. Memory is kept per user, so only
 * a player preview has any; a token or party preview shows current sight.
 */
export function previewMemoryUser(selection: PreviewSelection | null): string | null {
  return selection?.kind === 'player' ? selection.userId : null;
}

/**
 * The picker's entries: players first, then the material-plane tokens with
 * player-type tokens ahead of the rest, each group by name, and the party
 * entry whenever there is a player-type token to make one of.
 */
export function previewOptions(
  memberships: ReadonlyArray<Pick<CampaignMembership, 'userId' | 'role' | 'user'>>,
  tokens: ReadonlyArray<Token>
): PreviewOption[] {
  const players: PreviewOption[] = memberships
    .filter((m) => (m.role as string) === 'PLAYER')
    .map((m) => ({ group: 'players', value: `player:${m.userId}`, label: m.user?.displayName ?? 'Player' }));

  const material = tokens.filter((t) => t.layer === TokenLayer.TOKEN);
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
