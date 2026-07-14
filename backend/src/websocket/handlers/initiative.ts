// ============================================
// Initiative tracker handlers (DM-only controls; state broadcasts to all).
// initiative.add / remove / set / roll / reorder / start / next / end /
// request_state
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { rollDice, parseDiceExpression, DiceParserError } from '../../utils/dice-parser';
import logger from '../../utils/logger';
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

      const tokens = (Array.isArray(map.tokens) ? map.tokens : []) as any[];
      const token = tokens.find((t: any) => t.id === tokenId);
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
        initiative: token.initiative ?? null,
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

      const tokens = (Array.isArray(map.tokens) ? map.tokens : []) as any[];
      const tokenIndex = tokens.findIndex((t: any) => t.id === tokenId);
      if (tokenIndex !== -1) {
        tokens[tokenIndex] = { ...tokens[tokenIndex], initiative: value };
        await prisma.map.update({ where: { id: mapId }, data: { tokens: tokens as any } });
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
   * INITIATIVE.ROLL — DM rolls initiative for a token using a dice expression.
   */
  socket.on('initiative.roll', async (data: { tokenId: string; mapId: string; expression: string; characterName?: string }) => {
    try {
      if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
      if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can roll initiative' }); return; }

      const { tokenId, mapId, expression, characterName } = data;
      if (!tokenId || !mapId || !expression) { socket.emit('error', { message: 'tokenId, mapId, and expression required' }); return; }

      // Validate expression
      try { parseDiceExpression(expression); } catch (err) {
        if (err instanceof DiceParserError) { socket.emit('error', { message: `Invalid expression: ${err.message}` }); return; }
        throw err;
      }

      // Fetch token name from DB for logging
      const map = await prisma.map.findUnique({ where: { id: mapId } });
      if (!map || map.campaignId !== socket.campaignId) { socket.emit('error', { message: 'Map not found' }); return; }

      const tokens = (Array.isArray(map.tokens) ? map.tokens : []) as any[];
      const tokenIndex = tokens.findIndex((t: any) => t.id === tokenId);
      if (tokenIndex === -1) { socket.emit('error', { message: 'Token not found' }); return; }

      const token = tokens[tokenIndex];
      const rollResult = rollDice(expression);
      const rolledValue = rollResult.total;

      // Persist to token
      tokens[tokenIndex] = { ...token, initiative: rolledValue };
      await prisma.map.update({ where: { id: mapId }, data: { tokens: tokens as any } });

      // Update in-memory state — add to combatants if not already present
      const state = getCombatState(socket.campaignId);
      const existingIndex = state.combatants.findIndex((c) => c.tokenId === tokenId);
      if (existingIndex !== -1) {
        state.combatants[existingIndex].initiative = rolledValue;
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

      // Get user info for roll broadcast
      const user = await prisma.user.findUnique({ where: { id: socket.userId }, select: { displayName: true } });

      // Broadcast the roll result so it appears in the dice log
      const rollData = {
        userId: socket.userId,
        userName: user?.displayName ?? 'DM',
        characterName: characterName || token.name,
        expression,
        result: rolledValue,
        breakdown: rollResult,
        purpose: `${token.name} Initiative`,
        timestamp: new Date().toISOString(),
        secret: false,
      };
      io.to(socket.campaignId).emit('dice.rolled', rollData);

      await broadcastInitiativeState(socket.campaignId);
      logger.debug('initiative.roll', { expression, result: rolledValue, name: token.name, campaignId: socket.campaignId });
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
