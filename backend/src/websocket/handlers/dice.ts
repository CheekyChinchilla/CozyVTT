// ============================================
// Dice handlers: dice.roll, dice.clearHistory
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { rollDice, parseDiceExpression, DiceParserError } from '../../utils/dice-parser';
import logger from '../../utils/logger';
import { diceRollLimiter } from '../shared';

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
          breakdown: rollResult as any, // Store full RollResult
          characterName: characterName || null,
          purpose: purpose || null,
          secret: secret || false, // Mark as secret for visibility filtering
        },
      });

      // Create system message for dice roll
      // Secret rolls are marked differently in chat
      await prisma.message.create({
        data: {
          campaignId: socket.campaignId,
          userId: socket.userId,
          type: 'DICE_ROLL',
          content: `${user.displayName}${characterName ? ` (${characterName})` : ''} rolled ${expression}${purpose ? ` for ${purpose}` : ''}${secret ? ' (SECRET)' : ''}`,
          metadata: {
            diceRollId: diceRoll.id,
            expression,
            result: rollResult.total,
            breakdown: JSON.parse(JSON.stringify(rollResult)),
            characterName: characterName || null,
            purpose: purpose || null,
            secret: secret || false, // Mark in metadata for client filtering
          } as any,
        },
      });

      // Broadcast result with role-based filtering
      const rollData = {
        userId: socket.userId,
        userName: user.displayName,
        characterName: characterName || null,
        expression,
        result: rollResult.total,
        breakdown: rollResult,
        purpose: purpose || null,
        timestamp: new Date().toISOString(),
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

      // Verify user is DM
      const campaign = await prisma.campaign.findUnique({
        where: { id: socket.campaignId },
        select: { ownerId: true },
      });

      if (!campaign || campaign.ownerId !== socket.userId) {
        socket.emit('error', { message: 'Only the DM can clear roll history' });
        return;
      }

      // Broadcast to all campaign members (including DM)
      io.to(socket.campaignId).emit('dice.historyCleared');

      logger.info('dice.clearHistory', { campaignId: socket.campaignId, userId: socket.userId });
    } catch (error) {
      logger.error('dice.clearHistory failed', { err: error });
      socket.emit('error', { message: 'Failed to clear dice history' });
    }
  });
}
