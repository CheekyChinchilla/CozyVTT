// ============================================
// Chat handler: chat.message
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';
import { chatMessageLimiter, withinCeiling } from '../shared';
import { campaignSockets } from '../utils';
import { ackFrom, refuseRequest } from '../ack';

/** The longest message, in characters, before trimming. */
const MAX_CHAT_MESSAGE_LENGTH = 2000;

/** What a client may name a message with: a short id of its own making. */
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** How long a resent `clientId` is recognised. */
const CLIENT_ID_MEMORY_MS = 10 * 60 * 1000;
/** The most `clientId`s remembered at once, across every user. */
const CLIENT_ID_MEMORY_SIZE = 10_000;

/**
 * Messages sent with a `clientId`, by user and `clientId`, as the stored
 * message's id once it is written. A client that never heard the answer to
 * a message sends it again with the same `clientId`; this answers it with the
 * first message's id, so it is stored and sent once. The promise is kept
 * while the first is being written, so a resend arriving meanwhile waits for
 * it.
 */
const sentByClientId = new Map<string, { id: Promise<string>; at: number }>();

function forgetOldClientIds(now: number): void {
  for (const [key, entry] of sentByClientId) {
    if (now - entry.at < CLIENT_ID_MEMORY_MS && sentByClientId.size < CLIENT_ID_MEMORY_SIZE) break;
    sentByClientId.delete(key);
  }
}

export function registerChatHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * CHAT.MESSAGE - User sends chat message.
   * Validates content, saves to database, and sends it to each member who
   * may read it. The message type comes from the sender's role, never from
   * the payload. Always under the per-user flood ceiling; the campaign's chat
   * cooldown, when the DM turns it on, is the stricter rule on top.
   * Answered through the acknowledgement when one is passed (see ../ack.ts).
   * SECURITY: Uses server-authenticated socket.campaignId and socket.role only.
   */
  socket.on('chat.message', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    let rememberedKey: string | null = null;
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      const campaignId = socket.campaignId;

      if (!withinCeiling(socket, 'chat.message', ack)) return;

      const { content, type: askedType, clientId } = (data ?? {}) as { content?: unknown; type?: unknown; clientId?: unknown };

      // Validate content is provided
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        refuse('Message content required');
        return;
      }

      if (content.length > MAX_CHAT_MESSAGE_LENGTH) {
        refuse(`Message too long. Maximum ${MAX_CHAT_MESSAGE_LENGTH} characters.`);
        return;
      }

      // Validate the message type's shape, when one is given
      if (askedType !== undefined && askedType !== 'PLAYER' && askedType !== 'DM') {
        refuse('Invalid message type. Must be PLAYER or DM.');
        return;
      }

      if (clientId !== undefined && (typeof clientId !== 'string' || !CLIENT_ID_PATTERN.test(clientId))) {
        refuse('clientId must be 1 to 64 letters, digits, hyphens or underscores');
        return;
      }

      // A message already sent under this clientId is answered, not sent again.
      if (clientId !== undefined) {
        const key = `${socket.userId}:${clientId}`;
        const earlier = sentByClientId.get(key);
        if (earlier && Date.now() - earlier.at < CLIENT_ID_MEMORY_MS) {
          const id = await earlier.id.catch(() => null);
          if (id) {
            ack?.({ ok: true, id });
            return;
          }
        }
        rememberedKey = key;
      }

      // The type is decided by the sender's role on the session, not by the
      // payload: a player's message is always PLAYER. The DM's is DM unless
      // they ask to speak as a player (out of character).
      const type: 'PLAYER' | 'DM' = socket.role === 'DM' ? (askedType ?? 'DM') : 'PLAYER';

      // Rate limiting: respect campaign's chatCooldown settings
      const campaignSettings = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { chatCooldownEnabled: true, chatCooldownSeconds: true },
      });

      if (campaignSettings?.chatCooldownEnabled) {
        const windowMs = (campaignSettings.chatCooldownSeconds ?? 5) * 1000;
        if (!chatMessageLimiter.check(`${socket.userId}:${campaignId}`, 1, windowMs)) {
          refuse(`Rate limit: wait ${campaignSettings.chatCooldownSeconds}s between messages.`);
          return;
        }
      }

      const write = (async () => {
        const user = await prisma.user.findUnique({
          where: { id: socket.userId },
          select: { displayName: true },
        });
        if (!user) throw new UserGoneError();
        const message = await prisma.message.create({
          data: { campaignId, userId: socket.userId!, type, content: content.trim() },
        });
        return { user, message };
      })();
      if (rememberedKey) {
        const now = Date.now();
        forgetOldClientIds(now);
        sentByClientId.set(rememberedKey, { id: write.then(({ message }) => message.id), at: now });
      }

      let written: Awaited<typeof write>;
      try {
        written = await write;
      } catch (error) {
        if (rememberedKey) sentByClientId.delete(rememberedKey);
        if (error instanceof UserGoneError) {
          refuse('User not found');
          return;
        }
        throw error;
      }
      const { user, message } = written;

      const payload = {
        id: message.id,
        userId: socket.userId,
        userName: user.displayName,
        content: message.content,
        type,
        timestamp: message.createdAt.toISOString(),
      };

      // Who may read a message is decided for each member here, as it is for
      // a secret roll. Every member may read every message for now; whispers
      // will narrow this. The sender's own sockets also get the clientId, to
      // match the copy they are already showing.
      for (const s of await campaignSockets(io, campaignId)) {
        const reader = s as unknown as AuthenticatedSocket;
        s.emit('chat.message', reader.userId === socket.userId && clientId !== undefined ? { ...payload, clientId } : payload);
      }
      ack?.({ ok: true, id: message.id });

      logger.debug('chat.message', { type, userId: socket.userId, campaignId });
    } catch (error) {
      if (rememberedKey) sentByClientId.delete(rememberedKey);
      logger.error('chat.message failed', { err: error });
      refuse('Failed to send chat message');
    }
  });
}

/** The sender's account was deleted between authenticating and sending. */
class UserGoneError extends Error {}
