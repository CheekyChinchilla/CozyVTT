// ============================================
// Initiative tracker handlers (DM-only controls; the order is sent to every
// member as they may see it, see sendInitiativeState).
// initiative.add / remove / set / roll / reorder / start / next / end /
// request_state
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket, type AuthenticatedFields } from '../auth';
import { prisma } from '../../config/database';
import { rollDice, parseDiceExpression, DiceParserError } from '../../utils/dice-parser';
import {
  resolveCharacterInitiative,
  resolveStatBlockInitiative,
  DEFAULT_INITIATIVE_EXPRESSION,
} from '../../utils/rules/initiative';
import logger from '../../utils/logger';
import { readTokens, toJson } from '../../utils/prisma-json';
import { filterTokensByRole, getSpiritVisibilityBatch } from '../../utils/spirit-layer';
import { canControlToken } from '../../services/permissions';
import {
  getState as getCombatState,
  setState as setCombatState,
  clearState as clearCombatState,
  sortCombatants,
  projectCombatState,
  getVersion,
  type CombatantEntry,
  type CombatantSource,
  type CombatState,
} from '../initiativeState';
import { campaignSockets, getSocketInstance } from '../utils';
import { diceRollLimiter, stateRequestAllowed } from '../shared';

/** What a send needs of a socket; a connected one and a fetched one both have it. */
type Recipient = Pick<AuthenticatedFields, 'userId' | 'role'> & {
  emit(event: 'initiative.state', state: CombatState): unknown;
  emit(event: 'dice.rolled', roll: Record<string, unknown>): unknown;
};

/**
 * The sockets in the campaign that are sent `token` at all: every DM's, and
 * a player's when the role filter keeps it for them (visible, on their
 * plane). The dice log entry for a token's roll goes to these and no one
 * else, so a hidden or off-plane combatant the tracker keeps from a player is
 * not announced to them by its roll.
 */
async function recipientsSentToken(
  io: Server,
  campaignId: string,
  token: ReturnType<typeof readTokens>[number]
): Promise<Recipient[]> {
  const recipients = (await campaignSockets(io, campaignId)).map((s) => s as unknown as Recipient);
  const playerIds = recipients.filter((r) => r.role !== 'DM' && r.userId).map((r) => r.userId as string);
  const spiritVisibility = await getSpiritVisibilityBatch(campaignId, playerIds);
  return recipients.filter((r) => {
    if (r.role === 'DM') return true;
    if (!r.userId) return false;
    return filterTokensByRole([token], r.role ?? 'PLAYER', spiritVisibility.get(r.userId) ?? false, r.userId).length > 0;
  });
}

/**
 * Send the order to the given sockets, or to every socket in the campaign,
 * each as they may see it. The combatants' tokens are read as they are now,
 * so a name, picture or hit points the DM changes follow the token, and a
 * player's copy goes through the same role filter as the map itself: a hidden
 * token's entry, and hit points behind a bar the DM keeps off, never reach
 * them. The stored state is the DM's view and is not changed.
 */
export async function sendInitiativeState(io: Server, campaignId: string, only?: Recipient[]): Promise<void> {
  const state = getCombatState(campaignId);
  const version = getVersion(campaignId);
  // A change that lands while this send is still reading starts its own
  // send with the newer state; this one would arrive after it and show the
  // older, so it is dropped instead. Checked before every emit.
  const overtaken = () => getVersion(campaignId) !== version;
  const recipients: Recipient[] = only ?? (await campaignSockets(io, campaignId)).map((s) => s as unknown as Recipient);
  if (recipients.length === 0 || overtaken()) return;

  // Nothing in the order means nothing to look up: every client asks for
  // the state when it opens a campaign, and a reply that costs several
  // queries for an empty list was the most expensive request a member could
  // repeat.
  if (state.combatants.length === 0) {
    const nothing = new Map<string, CombatantSource>();
    for (const r of recipients) r.emit('initiative.state', projectCombatState(state, nothing, r.role === 'DM'));
    return;
  }

  const mapIds = [...new Set(state.combatants.map((c) => c.mapId))];
  const maps = mapIds.length === 0
    ? []
    : await prisma.map.findMany({ where: { id: { in: mapIds }, campaignId }, select: { tokens: true } });
  const tokens = maps.flatMap((m) => readTokens(m.tokens));
  const playerIds = recipients.filter((r) => r.role !== 'DM' && r.userId).map((r) => r.userId as string);
  const spiritVisibility = await getSpiritVisibilityBatch(campaignId, playerIds);
  if (overtaken()) return;
  const byId = (list: CombatantSource[]) => new Map(list.map((t) => [t.id, t]));

  const forDM = byId(tokens);
  for (const r of recipients) {
    if (r.role === 'DM') {
      r.emit('initiative.state', projectCombatState(state, forDM, true));
      continue;
    }
    if (!r.userId) continue;
    const forRole = filterTokensByRole(tokens, r.role ?? 'PLAYER', spiritVisibility.get(r.userId) ?? false, r.userId);
    r.emit('initiative.state', projectCombatState(state, byId(forRole), false));
  }
}

/**
 * Send the order again after something changed, and never let that fail the
 * change: the state or the token is already saved by the time this runs, so
 * a database blip here used to tell the DM "Failed to add to initiative"
 * for an addition that had been made, and a retry was refused as a
 * duplicate. The next change, or a client's request on reconnect, catches
 * everyone up.
 */
export async function resendInitiativeState(io: Server, campaignId: string): Promise<void> {
  try {
    await sendInitiativeState(io, campaignId);
  } catch (error) {
    logger.warn('initiative.state fan-out failed; the change stands', { err: error, campaignId });
  }
}

/**
 * The same from a REST route, which has no socket server in hand. A member's
 * copy of the order depends on their plane, their role and each token, so
 * the routes that change any of those call this. Skipped while nothing is in
 * the order, unless told otherwise (a deletion that emptied it still has to
 * be sent).
 */
export async function resendInitiative(campaignId: string, options: { evenWhenEmpty?: boolean } = {}): Promise<void> {
  if (!options.evenWhenEmpty && getCombatState(campaignId).combatants.length === 0) return;
  let io: Server;
  try {
    io = getSocketInstance();
  } catch {
    return;
  }
  await resendInitiativeState(io, campaignId);
}

export function registerInitiativeHandlers(io: Server, socket: AuthenticatedSocket): void {
  /** Send the order to every member, each as they may see it, after a change. */
  async function broadcastInitiativeState(campaignId: string) {
    await resendInitiativeState(io, campaignId);
  }

  /**
   * INITIATIVE.ADD — DM adds a token to the combatant list.
   */
  socket.on('initiative.add', async (data: { tokenId: string; mapId: string }) => {
    try {
      if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can modify initiative' }); return; }

      const { tokenId, mapId } = data;
      if (!tokenId || !mapId) { socket.emit('error', { message: 'tokenId and mapId required' }); return; }

      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) { socket.emit('error', { message: 'Map not found' }); return; }

      const tokens = readTokens(map.tokens);
      const token = tokens.find((t) => t.id === tokenId);
      if (!token) { socket.emit('error', { message: 'Token not found' }); return; }

      const state = getCombatState(socket.campaignId);

      // Idempotent — don't add duplicates
      if (state.combatants.some((c) => c.tokenId === tokenId)) {
        socket.emit('error', { message: 'Token is already in initiative' });
        return;
      }

      const entry: CombatantEntry = {
        tokenId,
        mapId,
        name: token.name,
        imageUrl: token.imageUrl || '',
        // Always null, never `token.initiative`.
        //
        // A rolled value is persisted onto the map token, and ending combat
        // clears only the in-memory order — so the number outlives the fight it
        // was rolled for. Seeding from it meant a token joining a *new* fight
        // arrived carrying its result from the last one, already placed in the
        // order before anyone had rolled.
        //
        // Joining the order and having a place in it are separate steps: a
        // combatant sorts to the bottom as "—" until something rolls for it.
        initiative: null,
        hp: token.hp ?? null,
        type: token.type ?? 'npc',
        disposition: token.disposition ?? null,
      };

      state.combatants = sortCombatants([...state.combatants, entry]);
      setCombatState(socket.campaignId, state);
      await broadcastInitiativeState(socket.campaignId);
      logger.debug('initiative.add', { name: token.name, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('initiative.add failed', { err: error });
      socket.emit('error', { message: 'Failed to add to initiative' });
    }
  });

  /**
   * INITIATIVE.REMOVE — DM removes a token from the combatant list.
   */
  socket.on('initiative.remove', async (data: { tokenId: string }) => {
    try {
      if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can modify initiative' }); return; }

      const { tokenId } = data;
      if (!tokenId) { socket.emit('error', { message: 'tokenId required' }); return; }

      const state = getCombatState(socket.campaignId);
      state.combatants = state.combatants.filter((c) => c.tokenId !== tokenId);

      // If we just removed the current combatant, advance to the next one
      if (state.currentTokenId === tokenId) {
        state.currentTokenId = state.combatants[0]?.tokenId ?? null;
      }

      setCombatState(socket.campaignId, state);
      await broadcastInitiativeState(socket.campaignId);
    } catch (error) {
      logger.error('initiative.remove failed', { err: error });
      socket.emit('error', { message: 'Failed to remove from initiative' });
    }
  });

  /**
   * INITIATIVE.SET — DM manually sets a token's initiative value.
   */
  socket.on('initiative.set', async (data: { tokenId: string; mapId: string; value: number | null }) => {
    try {
      if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can modify initiative' }); return; }

      const { tokenId, mapId, value } = data;
      if (!tokenId || !mapId) { socket.emit('error', { message: 'tokenId and mapId required' }); return; }
      if (value !== null && typeof value !== 'number') { socket.emit('error', { message: 'value must be a number or null' }); return; }

      // Persist to DB token record
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) { socket.emit('error', { message: 'Map not found' }); return; }

      const tokens = readTokens(map.tokens);
      const tokenIndex = tokens.findIndex((t) => t.id === tokenId);
      if (tokenIndex !== -1) {
        tokens[tokenIndex] = { ...tokens[tokenIndex], initiative: value };
        await prisma.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
      }

      // Update in-memory combat state
      const state = getCombatState(socket.campaignId);
      const combatantIndex = state.combatants.findIndex((c) => c.tokenId === tokenId);
      if (combatantIndex !== -1) {
        state.combatants[combatantIndex].initiative = value;
        state.combatants = sortCombatants(state.combatants);
        setCombatState(socket.campaignId, state);
      }

      await broadcastInitiativeState(socket.campaignId);
      logger.debug('initiative.set', { tokenId, value, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('initiative.set failed', { err: error });
      socket.emit('error', { message: 'Failed to set initiative value' });
    }
  });

  /**
   * INITIATIVE.ROLL — roll initiative for a token using a dice expression.
   *
   * The DM may roll for anything on the map. A player may roll only for a token
   * they control, and only once the DM has put that token into the initiative
   * order — rolling is how you take your turn in a fight you are already part
   * of, not a way to insert yourself into one. Everything else about initiative
   * (who is in it, the order, whose turn it is) stays DM-only.
   *
   * This check is the real boundary: the tracker and the map menu only decide
   * whether to *offer* the control, and neither is trustworthy on its own.
   */
  socket.on('initiative.roll', async (data: { tokenId: string; mapId: string; expression?: string; characterName?: string }) => {
    // `characterName` is what older clients sent along; the server names the token itself now.
    try {
      if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }

      const { tokenId, mapId, expression } = data;
      if (!tokenId || !mapId) { socket.emit('error', { message: 'tokenId and mapId required' }); return; }

      // A player's initiative roll is a dice roll: it writes the map, tells
      // the table and re-sends the order, and it used to bypass the ceiling
      // dice.roll applies. The DM rolls for a whole encounter at once and is
      // not counted; a spectator is refused below whatever the count.
      if (socket.role === 'PLAYER' && !diceRollLimiter.check(socket.userId!, 30, 60 * 1000)) {
        socket.emit('error', { message: 'Rate limit exceeded. Maximum 30 dice rolls per minute.' });
        return;
      }

      // `expression` is now only a fallback for combatants the server cannot
      // work initiative out for itself — see the resolution below. Validate it
      // when one is sent, since it still reaches the dice roller in that case.
      if (expression !== undefined) {
        try { parseDiceExpression(expression); } catch (err) {
          if (err instanceof DiceParserError) { socket.emit('error', { message: `Invalid expression: ${err.message}` }); return; }
          throw err;
        }
      }

      // Fetch token name from DB for logging
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) { socket.emit('error', { message: 'Map not found' }); return; }

      const tokens = readTokens(map.tokens);
      const tokenIndex = tokens.findIndex((t) => t.id === tokenId);
      if (tokenIndex === -1) { socket.emit('error', { message: 'Token not found' }); return; }

      const token = tokens[tokenIndex];
      const state = getCombatState(socket.campaignId);
      const existingIndex = state.combatants.findIndex((c) => c.tokenId === tokenId);

      // Authorize. `controlledBy` is the same ownership field that decides who
      // may move a token (see handlers/tokens.ts), so a player can roll for
      // exactly the tokens they can already move.
      if (socket.role !== 'DM') {
        // The same predicate that decides who may move the token: a spectator
        // never, even one `controlledBy` still names from before a demotion.
        if (!canControlToken(socket.role, token.controlledBy, socket.userId)) {
          socket.emit('error', {
            message: socket.role === 'SPECTATOR'
              ? 'Spectators cannot roll initiative'
              : 'You can only roll initiative for your own token',
          });
          return;
        }
        if (existingIndex === -1) {
          socket.emit('error', { message: 'That token is not in the initiative order yet' });
          return;
        }
        // Initiative is rolled to establish the order, not to renegotiate it
        // mid-fight. Re-rolling re-sorts the combatants, and the turn pointer
        // walks the list by position — so a player who rolls their way above the
        // current combatant ends the round early and skips whoever was between
        // them. It would also be spammable until a good number came up. A DM can
        // still re-roll anyone, which is the case where it is a deliberate call.
        if (state.active) {
          socket.emit('error', { message: 'Combat has started — ask your DM to change your initiative' });
          return;
        }
      }

      // Work out what initiative actually means for this combatant.
      //
      // The server decides, not the client. It has to: this is the only side
      // holding the character sheet, and Call of Cthulhu has no initiative roll
      // at all — combatants are ranked by Dexterity — which a client-supplied
      // dice expression cannot express. Deciding here also means the tracker's
      // die and the map menu produce the same number by construction rather
      // than by both remembering to compute it the same way.
      let resolution = null as ReturnType<typeof resolveCharacterInitiative>;
      if (token.characterId) {
        // Only a character of this campaign. Character ids are visible to
        // every member of any shared campaign, and anyone can be the DM of a
        // campaign they create, so a token bound to someone else's character
        // must not read that sheet.
        const character = await prisma.character.findFirst({
          where: { id: token.characterId, campaignId: socket.campaignId },
          select: { gameSystem: true, data: true },
        });
        if (character) {
          resolution = resolveCharacterInitiative(character.gameSystem, character.data);
        }
      }
      if (!resolution && token.statBlock) {
        const campaign = await prisma.campaign.findUnique({
          where: { id: socket.campaignId },
          select: { gameSystem: true },
        });
        resolution = resolveStatBlockInitiative(campaign?.gameSystem ?? null, token.statBlock);
      }

      // Nothing system-specific applies (a flexible sheet, a bare NPC token).
      //
      // A client-supplied expression is honoured only for the DM, who can set
      // any initiative value by hand anyway so gains nothing by lying. A player
      // always gets the default: they may control a token with no sheet and no
      // stat block (a DM can assign one to them), and without this they could
      // send `1d20+9999` and hand themselves the top of the order.
      const fallbackExpression =
        socket.role === 'DM' && expression ? expression : DEFAULT_INITIATIVE_EXPRESSION;

      let rolledValue: number;
      let rollResult: ReturnType<typeof rollDice> | null = null;
      let usedExpression = '';

      if (resolution && resolution.kind === 'fixed') {
        // No dice. The value *is* the answer.
        rolledValue = resolution.value;
      } else {
        usedExpression = resolution ? resolution.expression : fallbackExpression;
        try {
          parseDiceExpression(usedExpression);
        } catch {
          // A derived expression that will not parse is a bug on our side, not
          // the caller's — fall back rather than failing the player's roll.
          logger.warn('initiative.roll derived an unparseable expression', {
            usedExpression, campaignId: socket.campaignId,
          });
          usedExpression = DEFAULT_INITIATIVE_EXPRESSION;
        }
        rollResult = rollDice(usedExpression);
        rolledValue = rollResult.total;
      }

      // Persist to token.
      //
      // Re-read rather than writing back the copy fetched before the character
      // lookups above: those are awaits, and the whole token array is rewritten
      // in one field, so a token someone moved in the meantime would be silently
      // put back where it was.
      const freshMap = await prisma.map.findUnique({ where: { id: mapId }, select: { tokens: true } });
      const freshTokens = freshMap && Array.isArray(freshMap.tokens) ? readTokens(freshMap.tokens) : tokens;
      const freshIndex = freshTokens.findIndex((t) => t.id === tokenId);
      if (freshIndex !== -1) {
        freshTokens[freshIndex] = { ...freshTokens[freshIndex], initiative: rolledValue };
        await prisma.map.update({ where: { id: mapId }, data: { tokens: toJson(freshTokens) } });
      }

      // Update in-memory state — add to combatants if not already present.
      // Only reachable for a DM: a player's roll is rejected above unless the
      // token is already a combatant.
      //
      // Re-found rather than reusing the index taken before the awaits above:
      // a concurrent roll re-sorts this array and a concurrent remove shortens
      // it, so a stale index would write the value onto the wrong combatant.
      const combatantIndex = state.combatants.findIndex((c) => c.tokenId === tokenId);
      if (combatantIndex !== -1) {
        state.combatants[combatantIndex].initiative = rolledValue;
      } else {
        state.combatants.push({
          tokenId,
          mapId,
          name: token.name,
          imageUrl: token.imageUrl || '',
          initiative: rolledValue,
          hp: token.hp ?? null,
          type: token.type ?? 'npc',
          disposition: token.disposition ?? null,
        });
      }
      state.combatants = sortCombatants(state.combatants);
      setCombatState(socket.campaignId, state);

      // Announce the roll in the dice log — but only when dice were actually
      // thrown. A Call of Cthulhu investigator's initiative is simply their
      // Dexterity, and a dice-log entry claiming otherwise would be a lie. The
      // value still reaches everyone through the initiative broadcast below.
      if (rollResult) {
        const user = await prisma.user.findUnique({ where: { id: socket.userId }, select: { displayName: true } });
        // The server names the token; a name the client sends is not used.
        // An obscured token is not named in the dice log even to the DM, since
        // one entry reaches everyone who is sent the token.
        const publicName = token.obscured === true ? 'Unknown creature' : token.name;
        const rollData = {
          userId: socket.userId,
          userName: user?.displayName ?? 'DM',
          characterName: publicName,
          expression: usedExpression,
          result: rolledValue,
          breakdown: rollResult,
          purpose: `${publicName} Initiative`,
          timestamp: new Date().toISOString(),
          secret: false,
        };
        for (const r of await recipientsSentToken(io, socket.campaignId, token)) {
          r.emit('dice.rolled', rollData);
        }
      }

      await broadcastInitiativeState(socket.campaignId);
      logger.debug('initiative.roll', {
        rolled: !!rollResult, result: rolledValue, name: token.name, campaignId: socket.campaignId,
      });
    } catch (error) {
      logger.error('initiative.roll failed', { err: error });
      socket.emit('error', { message: 'Failed to roll initiative' });
    }
  });

  /**
   * INITIATIVE.REORDER — DM drags combatants into a custom order.
   */
  socket.on('initiative.reorder', async (data: { orderedTokenIds: string[] }) => {
    try {
      if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can reorder initiative' }); return; }

      const { orderedTokenIds } = data;
      if (!Array.isArray(orderedTokenIds)) { socket.emit('error', { message: 'orderedTokenIds must be an array' }); return; }

      const state = getCombatState(socket.campaignId);
      const combatantMap = new Map(state.combatants.map((c) => [c.tokenId, c]));
      const reordered: CombatantEntry[] = [];
      for (const id of orderedTokenIds) {
        const c = combatantMap.get(id);
        if (c) reordered.push(c);
      }
      // Keep any combatants not in the orderedTokenIds at the end
      for (const c of state.combatants) {
        if (!reordered.includes(c)) reordered.push(c);
      }
      state.combatants = reordered;
      setCombatState(socket.campaignId, state);
      await broadcastInitiativeState(socket.campaignId);
    } catch (error) {
      logger.error('initiative.reorder failed', { err: error });
      socket.emit('error', { message: 'Failed to reorder initiative' });
    }
  });

  /**
   * INITIATIVE.START — DM begins combat (round 1, first combatant active).
   */
  socket.on('initiative.start', async () => {
    try {
      if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can start combat' }); return; }

      const state = getCombatState(socket.campaignId);
      if (state.combatants.length === 0) { socket.emit('error', { message: 'Add combatants before starting combat' }); return; }

      state.active = true;
      state.round = 1;
      state.currentTokenId = state.combatants[0].tokenId;
      setCombatState(socket.campaignId, state);
      await broadcastInitiativeState(socket.campaignId);
      logger.info('initiative.start', { campaignId: socket.campaignId, first: state.combatants[0].name });
    } catch (error) {
      logger.error('initiative.start failed', { err: error });
      socket.emit('error', { message: 'Failed to start combat' });
    }
  });

  /**
   * INITIATIVE.NEXT — DM advances to the next combatant.
   */
  socket.on('initiative.next', async () => {
    try {
      if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can advance the turn' }); return; }

      const state = getCombatState(socket.campaignId);
      if (!state.active || state.combatants.length === 0) { socket.emit('error', { message: 'Combat is not active' }); return; }

      const currentIndex = state.combatants.findIndex((c) => c.tokenId === state.currentTokenId);
      const nextIndex = currentIndex + 1;

      if (nextIndex >= state.combatants.length) {
        // Wrap around — new round
        state.round += 1;
        state.currentTokenId = state.combatants[0].tokenId;
      } else {
        state.currentTokenId = state.combatants[nextIndex].tokenId;
      }

      setCombatState(socket.campaignId, state);
      await broadcastInitiativeState(socket.campaignId);
      logger.debug('initiative.next', { round: state.round, current: state.currentTokenId, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('initiative.next failed', { err: error });
      socket.emit('error', { message: 'Failed to advance initiative' });
    }
  });

  /**
   * INITIATIVE.END — DM ends combat and clears all state.
   */
  socket.on('initiative.end', async () => {
    try {
      if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can end combat' }); return; }

      clearCombatState(socket.campaignId);
      await broadcastInitiativeState(socket.campaignId);
      logger.info('initiative.end', { campaignId: socket.campaignId });
    } catch (error) {
      logger.error('initiative.end failed', { err: error });
      socket.emit('error', { message: 'Failed to end combat' });
    }
  });

  /**
   * INITIATIVE.REQUEST_STATE — Client requests current state on (re)connect.
   */
  socket.on('initiative.request_state', async () => {
    try {
      if (!socket.campaignId) return;
      if (!stateRequestAllowed(socket, 'initiative.request_state')) return;
      await sendInitiativeState(io, socket.campaignId, [socket as unknown as Recipient]);
    } catch (error) {
      logger.error('initiative.request_state failed', { err: error });
    }
  });
}
