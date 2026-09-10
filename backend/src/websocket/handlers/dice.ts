// ============================================
// Dice handlers: dice.roll, dice.clearHistory
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { rollDice, parseDiceExpression, DiceParserError } from '../../utils/dice-parser';
import logger from '../../utils/logger';
import { diceRollLimiter } from '../shared';
import { toJson } from '../../utils/prisma-json';

export function registerDiceHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * DICE.ROLL - User rolls dice
   * Validates expression, calculates result, saves to database, and broadcasts.
   * Rate limited to 30 rolls per minute per user.
   * SECURITY: Uses server-authenticated socket.campaignId only.
   */
  socket.on('dice.roll', async (data: { expression: string; characterName?: string; purpose?: string; secret?: boolean }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      const { expression, characterName, purpose, secret } = data;

      // Validate expression is provided
      if (!expression || typeof expression !== 'string') {
        socket.emit('error', { message: 'Dice expression required' });
        return;
      }

      // Rate limiting: 30 rolls per minute per user
      if (!diceRollLimiter.check(socket.userId!, 30, 60 * 1000)) {
        socket.emit('error', { message: 'Rate limit exceeded. Maximum 30 dice rolls per minute.' });
        return;
      }

      // Validate expression syntax (without rolling)
      try {
        parseDiceExpression(expression);
      } catch (error) {
        if (error instanceof DiceParserError) {
          socket.emit('error', { message: `Invalid dice expression: ${error.message}` });
          return;
        }
        throw error;
      }

      // Roll the dice
      const rollResult = rollDice(expression);

      // Get user information
      const user = await prisma.user.findUnique({
        where: { id: socket.userId },
        select: { displayName: true },
      });

      if (!user) {
        socket.emit('error', { message: 'User not found' });
        return;
      }

      // SECURITY: Save ALL rolls to database (including secret rolls for audit)
      // Secret rolls are marked but still saved for DM oversight and dispute resolution
      const diceRoll = await prisma.diceRoll.create({
        data: {
          campaignId: socket.campaignId,
          userId: socket.userId!,
          expression,
          result: rollResult.total,
          breakdown: toJson(rollResult), // Store full RollResult
          characterName: characterName || null,
          purpose: purpose || null,
          secret: secret || false, // Mark as secret for visibility filtering
        },
      });

      // A roll is not a chat message, and no second row is written for it.
      //
      // One used to be: a Message of type DICE_ROLL whose metadata repeated the
      // expression, result, breakdown, character name, purpose and secret flag
      // that the DiceRoll row above already holds. Nothing ever read it — the
      // chat panel does not listen for rolls, and the history endpoint filters
      // the type out — so the rows accumulated with no way to reach or clear
      // them, and their presence starved the chat page they were filtered from.
      //
      // The copy was also the unsafe one: `secret` lived only inside unindexed
      // metadata, where the chat query does not filter on it. The DiceRoll table
      // is the record, with `secret` as a real column and a clear-history
      // watermark. Rolls are read from there, by the Dice panel.

      // Broadcast result with role-based filtering.
      //
      // `id` and the stored `rolledAt` are sent rather than a freshly generated
      // timestamp so that a roll arriving live and the same roll replayed from
      // history identify as one entry. Without the id the client keyed rolls by
      // user and broadcast time, which no stored roll could ever match.
      const rollData = {
        id: diceRoll.id,
        userId: socket.userId,
        userName: user.displayName,
        characterName: characterName || null,
        expression,
        result: rollResult.total,
        breakdown: rollResult,
        purpose: purpose || null,
        timestamp: diceRoll.rolledAt.toISOString(),
        secret: secret || false,
      };

      if (secret) {
        // Secret roll - send to roller (always)
        socket.emit('dice.rolled', rollData);

        // SECURITY: Also send to DM(s) for audit/oversight
        // Follows Spirit Layer pattern: DMs see everything, players see filtered
        const campaignSockets = await io.in(socket.campaignId).fetchSockets();
        for (const s of campaignSockets) {
          const authedSocket = s as unknown as AuthenticatedSocket;
          // Send to DMs only (excluding the original roller if they're DM)
          if (authedSocket.role === 'DM' && authedSocket.userId !== socket.userId) {
            s.emit('dice.rolled.secret', {
              ...rollData,
              originalRoller: socket.userId,
              isAuditView: true, // Flag so DM UI can style differently
            });
          }
        }
      } else {
        // Normal roll - broadcast to all campaign members
        io.to(socket.campaignId).emit('dice.rolled', rollData);
      }

      logger.debug('dice.roll', { expression, result: rollResult.total, userId: socket.userId, secret: secret || false, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('dice.roll failed', { err: error });
      if (error instanceof DiceParserError) {
        socket.emit('error', { message: `Dice roll failed: ${error.message}` });
      } else {
        socket.emit('error', { message: 'Failed to roll dice' });
      }
    }
  });

  /**
   * DICE.CLEAR_HISTORY - DM clears dice roll history (DM-only).
   */
  socket.on('dice.clearHistory', async () => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      // Who is running the game, not who owns the campaign. These are separate
      // facts — `Campaign.ownerId` never moves, while the DM seat can — and they
      // only coincide in a campaign whose creator still runs it. Reading
      // ownership here refused the actual DM after a handover and let the former
      // DM, now a player, keep clearing the panel for everyone.
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only the DM can clear roll history' });
        return;
      }

      // Record the clear so it survives a reload. This used to be broadcast
      // only, which was invisible while history lived in browser memory — but
      // now that the panel loads from the database, a clear that changed
      // nothing server-side would undo itself on the next refresh.
      //
      // A watermark, not a delete: secret rolls are stored deliberately for
      // audit, and clearing the panel should not destroy that record.
      await prisma.campaign.update({
        where: { id: socket.campaignId },
        data: { rollHistoryClearedAt: new Date() },
      });

      // Broadcast to all campaign members (including DM)
      io.to(socket.campaignId).emit('dice.historyCleared');

      logger.info('dice.clearHistory', { campaignId: socket.campaignId, userId: socket.userId });
    } catch (error) {
      logger.error('dice.clearHistory failed', { err: error });
      socket.emit('error', { message: 'Failed to clear dice history' });
    }
  });
}
