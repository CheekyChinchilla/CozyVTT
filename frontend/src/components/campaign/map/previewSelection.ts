// ============================================
// Player Preview selection — whose eyes the DM's canvas is drawn through.
//
// A preview used to mean one player. A table that projects a single screen
// and moves every token itself has no player accounts to preview as, so the
// choice is now a player, one token, or every player-type token (the party),
// or Follow my selection, which looks through whichever token the DM has
// selected and is resolved to that token before anything else reads it.
// Pure: the predicate this produces is what MapCanvas feeds everywhere it
// already asks "is this token the viewer's".
// ============================================

import type { CampaignMembership, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';
import { controlsToken } from '@/utils/tokenOwnership';
import { tokenCentre } from '@/utils/tokenCentre';
import { tokenSentTo } from '@/utils/tokenMask';

/** The plane a previewed viewer is on: what they are sent, and see through. */
export type PreviewPlane = 'material' | 'spirit';

/**
 * Whether a token is on the previewed viewer's plane and so can be shown or
 * supply sight at all. The DM's token list holds every token; a player is
 * sent only visible tokens on their own plane (the server's
 * filterTokensByRole), so a preview must not look through any other. Without
 * this a hidden player token still lit its surroundings on the projector.
 */
function onViewersPlane(t: Token, plane: PreviewPlane): boolean {
  return t.visible && t.layer === (plane === 'spirit' ? TokenLayer.SPIRIT : TokenLayer.TOKEN);
}

/**
 * Which plane the previewed viewer is on, by the server's rule
 * (getSpiritVisibility): the spirit plane for everyone while the DM has it
 * open to all, else for a player who controls a visible token on the spirit
 * layer. One token: its own plane. The party is several people, so it
 * crosses only while the plane is open to all.
 */
export function previewPlane(
  selection: ResolvedPreviewSelection | null,
  tokens: ReadonlyArray<Token>,
  spiritLayerEnabled: boolean
): PreviewPlane {
  if (!selection) return 'material';
  if (spiritLayerEnabled) return 'spirit';
  const crossedOver = (t: Token) => t.visible && t.layer === TokenLayer.SPIRIT;
  switch (selection.kind) {
    case 'player':
      return tokens.some((t) => crossedOver(t) && controlsToken(t, selection.userId, 'PLAYER')) ? 'spirit' : 'material';
    case 'token':
      return tokens.some((t) => t.id === selection.tokenId && crossedOver(t)) ? 'spirit' : 'material';
    case 'party':
      return 'material';
  }
}

/** Whose eyes a preview looks through: a player, one token, or the party. */
export type ResolvedPreviewSelection =
  | { kind: 'player'; userId: string }
  | { kind: 'token'; tokenId: string }
  | { kind: 'party' };

/**
 * What the picker holds: one of those, or Follow my selection, which
 * `resolvePreviewSelection` turns into the selected token before anything
 * else reads it.
 */
export type PreviewSelection = ResolvedPreviewSelection | { kind: 'selected' };

/** An id no token has: Follow my selection with nothing to follow looks through no token. */
const FOLLOWING_NOBODY = '';

/**
 * The viewer a preview looks through. Follow my selection is the selected
 * token, or with none the one `followedTokenId` names, the last followed; with
 * neither it is a token that matches nothing, a viewer with no tokens of its
 * own, which on a lit map sees nothing. Never null for a selection that is
 * not null: a preview that resolved to nothing would draw the DM's own view,
 * every hidden token and the whole fog, onto a projector.
 */
export function resolvePreviewSelection(
  selection: PreviewSelection | null,
  followedTokenId: string | null
): ResolvedPreviewSelection | null {
  if (!selection) return null;
  if (selection.kind !== 'selected') return selection;
  return { kind: 'token', tokenId: followedTokenId ?? FOLLOWING_NOBODY };
}

/** One entry in the preview picker. */
export interface PreviewOption {
  group: 'players' | 'tokens';
  value: string;
  label: string;
}

const PARTY = 'party';
const FOLLOW = 'selected';

/** The <select> value for a selection. */
export function encodePreviewSelection(selection: PreviewSelection): string {
  switch (selection.kind) {
    case 'player': return `player:${selection.userId}`;
    case 'token': return `token:${selection.tokenId}`;
    case 'party': return PARTY;
    case 'selected': return FOLLOW;
  }
}

/** The selection a <select> value names, or null for anything else. */
export function decodePreviewSelection(value: string): PreviewSelection | null {
  if (value === PARTY) return { kind: 'party' };
  if (value === FOLLOW) return { kind: 'selected' };
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
export function previewOwnFor(selection: ResolvedPreviewSelection | null, plane: PreviewPlane): (t: Token) => boolean {
  if (!selection) return () => false;
  const chosen = ownByKind(selection);
  return (t) => onViewersPlane(t, plane) && chosen(t);
}

/**
 * Which tokens the previewed viewer is sent whole. A player: the tokens they
 * control, as the server decides it. One token: itself. The party: none,
 * since the screen is shared by several people and the server sends no one
 * of them another's token unmasked. Sight and control differ only for the
 * party, but they are two questions, and the party is where conflating them
 * put a disguised character's name and art on the projector.
 */
export function previewControlsFor(selection: ResolvedPreviewSelection | null): (t: Token) => boolean {
  if (!selection || selection.kind === 'party') return () => false;
  return ownByKind(selection);
}

function ownByKind(selection: ResolvedPreviewSelection): (t: Token) => boolean {
  switch (selection.kind) {
    case 'player': {
      // The previewed member is a player: previewOptions lists only those.
      const { userId } = selection;
      return (t) => controlsToken(t, userId, 'PLAYER');
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
 * is hidden or off the viewer's plane. `canSee` is null when the map has no
 * dynamic lighting, in which case every such token shows. One function, so
 * the hover panel can never name a token the canvas does not draw.
 */
export function tokensShownInPreview(
  tokens: ReadonlyArray<Token>,
  viewerOwn: (t: Token) => boolean,
  canSee: ((cx: number, cy: number) => boolean) | null,
  viewport: { gridSize: number; mapHeight: number },
  plane: PreviewPlane
): Token[] {
  return tokens.filter((t) => {
    if (!onViewersPlane(t, plane)) return false;
    if (viewerOwn(t) || !canSee) return true;
    const centre = tokenCentre(t, viewport.gridSize, viewport.mapHeight);
    return canSee(centre.x, centre.y);
  });
}

/**
 * The tokens a preview draws and names, exactly as the server would send the
 * previewed viewer: what `tokensShownInPreview` keeps, each passed through
 * the same per-recipient rule the server applies before sending (hit points
 * only with the bar on or for the viewer's own, no darkvision for others, an
 * obscured token the viewer does not control masked). The hover card and the
 * downed fade read the result, so they show what the player is sent and not
 * what the DM holds.
 */
export function previewTokens(
  tokens: ReadonlyArray<Token>,
  viewerOwn: (t: Token) => boolean,
  viewerControls: (t: Token) => boolean,
  canSee: ((cx: number, cy: number) => boolean) | null,
  viewport: { gridSize: number; mapHeight: number },
  plane: PreviewPlane
): Token[] {
  return tokensShownInPreview(tokens, viewerOwn, canSee, viewport, plane).map((t) => tokenSentTo(t, viewerControls(t)));
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
  selection: ResolvedPreviewSelection | null,
  tokens: ReadonlyArray<Token>,
  memberships: ReadonlyArray<Pick<CampaignMembership, 'userId' | 'role'>>
): string | null {
  if (!selection) return null;
  switch (selection.kind) {
    case 'player':
      return selection.userId;
    case 'token': {
      // Only a player of the campaign has memory to show or write: a token
      // still names whoever controlled it after they leave or stop playing,
      // and the server refuses to write memory for someone not in it.
      const controller = tokens.find((t) => t.id === selection.tokenId)?.controlledBy ?? null;
      return controller && memberships.some((m) => m.userId === controller && m.role === 'PLAYER') ? controller : null;
    }
    case 'party':
      return null;
  }
}

/**
 * The picker's entries: players first, then the tokens a preview may look
 * through (visible, on either plane, a spirit one named as such) with
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

  const seeing = tokens.filter((t) => onViewersPlane(t, 'material') || onViewersPlane(t, 'spirit'));
  const byName = (a: Token, b: Token) => a.name.localeCompare(b.name);
  const pcs = seeing.filter((t) => t.type === TokenType.PLAYER).sort(byName);
  const others = seeing.filter((t) => t.type !== TokenType.PLAYER).sort(byName);

  const tokenEntries: PreviewOption[] = [];
  if (pcs.length > 0) tokenEntries.push({ group: 'tokens', value: PARTY, label: 'All player tokens' });
  for (const t of [...pcs, ...others]) {
    const label = t.layer === TokenLayer.SPIRIT ? `${t.name} (spirit)` : t.name;
    tokenEntries.push({ group: 'tokens', value: `token:${t.id}`, label });
  }
  return [...players, ...tokenEntries];
}

/**
 * The selection to keep: the current one while the picker still offers it,
 * else the default. A token that left the map (a switch, a deletion) would
 * otherwise leave a preview with no viewer and a picker showing a value it
 * does not hold. Follow my selection is always offered, so it is kept.
 */
export function reconcilePreviewSelection(
  selection: PreviewSelection | null,
  memberships: ReadonlyArray<Pick<CampaignMembership, 'userId' | 'role' | 'user'>>,
  tokens: ReadonlyArray<Token>
): PreviewSelection | null {
  if (!selection) return null;
  if (selection.kind === 'selected') return selection;
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

/**
 * What `,` and `.` step through while the preview follows the selection:
 * whatever the preview draws, and every visible party token on the plane it
 * is on, wherever that token stands. Stepping by what the followed token
 * sees alone left a split party out of reach, and found nothing at all on a
 * lit map before a first selection. A hidden token is never among them, nor
 * a creature the current view does not draw.
 */
export function followStepTokens(
  tokens: ReadonlyArray<Token>,
  drawn: ReadonlyArray<Token>,
  plane: PreviewPlane
): Token[] {
  const drawnIds = new Set(drawn.map((t) => t.id));
  const party = tokens.filter((t) => t.type === TokenType.PLAYER && onViewersPlane(t, plane) && !drawnIds.has(t.id));
  return [...drawn, ...party];
}
