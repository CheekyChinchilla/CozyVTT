// ============================================
// Initiative tracker handlers (DM-only controls; state broadcasts to all).
// initiative.add / remove / set / roll / reorder / start / next / end /
// request_state
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { rollDice, parseDiceExpression, DiceParserError } from '../../utils/dice-parser';
import {
  resolveCharacterInitiative,
  resolveStatBlockInitiative,
  DEFAULT_INITIATIVE_EXPRESSION,
} from '../../utils/rules/initiative';
import logger from '../../utils/logger';
import { readTokens, toJson } from '../../utils/prisma-json';
import {
  getState as getCombatState,
  setState as setCombatState,
  clearState as clearCombatState,
  sortCombatants,
  type CombatantEntry,
} from '../initiativeState';

export function registerInitiativeHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * Broadcast full initiative state to all campaign members. Called after
   * every mutation.
   */
  async function broadcastInitiativeState(campaignId: string) {
    const state = getCombatState(campaignId);
    io.to(campaignId).emit('initiative.state', state);
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
    try {
      if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }

      const { tokenId, mapId, expression, characterName } = data;
      if (!tokenId || !mapId) { socket.emit('error', { message: 'tokenId and mapId required' }); return; }

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
        // Spectators are watching, not playing. `controlledBy` survives a
        // demotion from PLAYER, so without this an ex-player would keep the
        // ability to roll — and reorder a fight — after losing the ability to
        // move the very same token. handlers/tokens.ts makes the same pair of
        // checks for movement.
        if (socket.role === 'SPECTATOR') {
          socket.emit('error', { message: 'Spectators cannot roll initiative' });
          return;
        }
        if (token.controlledBy !== socket.userId) {
          socket.emit('error', { message: 'You can only roll initiative for your own token' });
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
        const character = await prisma.character.findUnique({
          where: { id: token.characterId },
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
        const rollData = {
          userId: socket.userId,
          userName: user?.displayName ?? 'DM',
          characterName: characterName || token.name,
          expression: usedExpression,
          result: rolledValue,
          breakdown: rollResult,
          purpose: `${token.name} Initiative`,
          timestamp: new Date().toISOString(),
          secret: false,
        };
        io.to(socket.campaignId).emit('dice.rolled', rollData);
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
      io.to(socket.campaignId).emit('initiative.state', {
        active: false,
        round: 0,
        currentTokenId: null,
        combatants: [],
      });
      logger.info('initiative.end', { campaignId: socket.campaignId });
    } catch (error) {
      logger.error('initiative.end failed', { err: error });
      socket.emit('error', { message: 'Failed to end combat' });
    }
  });

  /**
   * INITIATIVE.REQUEST_STATE — Client requests current state on (re)connect.
   */
  socket.on('initiative.request_state', () => {
    if (!socket.campaignId) return;
    const state = getCombatState(socket.campaignId);
    socket.emit('initiative.state', state);
  });
}
