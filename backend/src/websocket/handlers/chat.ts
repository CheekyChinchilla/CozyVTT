// ============================================
// Chat handler: chat.message
// ============================================

import { Server } from 'socket.io';
import type { MessageType } from '@prisma/client';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';
import { foreignKeyConstraint } from '../../utils/errors';
import { chatMessageLimiter, withinCeiling } from '../shared';
import { campaignSockets } from '../utils';
import { ackFrom, refuseRequest } from '../ack';
import { ChatMessageSchema, CHAT_CONTENT_REFUSAL, WHISPER_RECIPIENT_REFUSAL, WHISPER_SELF_REFUSAL } from '../../validators/chat';
import { whisperRecipient } from '../../services/permissions';

/**
 * The `chat.message` the server sends each member who may read the message.
 * The frontend declares the same fields (keepInStep.test.ts).
 */
export interface ChatMessageBroadcast {
  id: string;
  userId: string;
  userName: string;
  content: string;
  type: MessageType;
  timestamp: string;
  /** On a whisper: the one member it is for, beside its sender, and their name. */
  recipientId?: string;
  recipientName?: string;
  /** On the sender's own copy only: the `clientId` it was sent with. */
  clientId?: string;
}

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
   * With a `recipientId` it is a WHISPER to that member (whisperRecipient in
   * services/permissions.ts), sent to the sender's and the recipient's
   * sockets in this campaign and to no one else, the DM included.
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

      // The content arrives trimmed, its length counted before (validators/chat.ts).
      const parsed = ChatMessageSchema.safeParse(data);
      if (!parsed.success) {
        refuse(parsed.error.issues[0]?.message ?? CHAT_CONTENT_REFUSAL);
        return;
      }
      const { content, type: askedType, clientId, recipientId } = parsed.data;

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

      // Who a whisper is for, asked after the clientId memory, so a resend of
      // one that reached its recipient before they left is answered with the
      // first id, and before the cooldown, so a refused whisper does not use
      // it up.
      let whisperTo: { id: string; displayName: string } | null = null;
      if (recipientId !== undefined) {
        if (recipientId === socket.userId) {
          refuse(WHISPER_SELF_REFUSAL);
          return;
        }
        whisperTo = await whisperRecipient(campaignId, socket.userId!, recipientId);
        if (!whisperTo) {
          refuse(WHISPER_RECIPIENT_REFUSAL);
          return;
        }
      }

      // The type is decided by the sender's role on the session, not by the
      // payload: a player's message is always PLAYER. The DM's is DM unless
      // they ask to speak as a player (out of character). A whisper is a
      // WHISPER whoever sends it.
      const type: 'PLAYER' | 'DM' | 'WHISPER' = whisperTo ? 'WHISPER' : socket.role === 'DM' ? (askedType ?? 'DM') : 'PLAYER';

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
          data: { campaignId, userId: socket.userId!, type, content, recipientId: whisperTo?.id ?? null },
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
        // The recipient's account was deleted after they were looked up. Any
        // other missing row, such as the campaign deleted meanwhile, is a
        // failure to send.
        if (whisperTo && foreignKeyConstraint(error) === 'Message_recipientId_fkey') {
          refuse(WHISPER_RECIPIENT_REFUSAL);
          return;
        }
        throw error;
      }
      const { user, message } = written;

      const payload: ChatMessageBroadcast = {
        id: message.id,
        userId: socket.userId!,
        userName: user.displayName,
        content: message.content,
        type,
        timestamp: message.createdAt.toISOString(),
        ...(whisperTo ? { recipientId: whisperTo.id, recipientName: whisperTo.displayName } : {}),
      };

      // Who may read a message is decided for each member here, as it is for
      // a secret roll: every member a message to everyone, and only the
      // sender's and the recipient's sockets in this campaign a whisper.
      // Never the user's own room, which spans every campaign they have open.
      // Nothing is awaited between fetching the sockets and the emits. The
      // sender's own sockets also get the clientId, to match the copy they
      // are already showing.
      for (const s of await campaignSockets(io, campaignId)) {
        const reader = s as unknown as AuthenticatedSocket;
        if (whisperTo && reader.userId !== socket.userId && reader.userId !== whisperTo.id) continue;
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
