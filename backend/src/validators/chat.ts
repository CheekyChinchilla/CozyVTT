/**
 * What a `chat.message` over the socket may carry.
 *
 * Each refusal is worded as the handler worded it when it checked the payload
 * field by field: clients, the WebSocket guide and the tests match them. A
 * payload that is not an object, and a message that is blank once trimmed,
 * are both "Message content required". The length is counted before the
 * message is trimmed, and the message is stored trimmed. The first thing
 * wrong is the one reported, in the order of the fields below.
 *
 * `recipientId` makes the message a whisper to that member. One that is not
 * a user id is answered as one who is not in the campaign is, so the answer
 * says nothing more about the one than the other.
 */

import { z } from 'zod';
import { MAX_CHAT_MESSAGE_LENGTH } from './chatLimits';

export const CHAT_CONTENT_REFUSAL = 'Message content required';
export const CHAT_TOO_LONG_REFUSAL = `Message too long. Maximum ${MAX_CHAT_MESSAGE_LENGTH} characters.`;
export const CHAT_TYPE_REFUSAL = 'Invalid message type. Must be PLAYER or DM.';
export const CHAT_CLIENT_ID_REFUSAL = 'clientId must be 1 to 64 letters, digits, hyphens or underscores';

/** What a whisper to its own sender is answered. */
export const WHISPER_SELF_REFUSAL = 'You cannot whisper to yourself';
/**
 * What a whisper to anyone but a current member is answered: someone outside
 * the campaign, someone removed from it, an id that names nobody or is not
 * an id at all. One answer for all of them, so it tells a script nothing
 * about who has an account.
 */
export const WHISPER_RECIPIENT_REFUSAL = 'That person is not in this campaign';

/** What a client may name a message with: a short id of its own making. */
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const ChatMessageSchema = z.object(
  {
    content: z
      .string({ error: CHAT_CONTENT_REFUSAL })
      .refine((text) => text.trim().length > 0, { error: CHAT_CONTENT_REFUSAL })
      .max(MAX_CHAT_MESSAGE_LENGTH, { error: CHAT_TOO_LONG_REFUSAL })
      .transform((text) => text.trim()),
    type: z.enum(['PLAYER', 'DM'], { error: CHAT_TYPE_REFUSAL }).optional(),
    clientId: z
      .string({ error: CHAT_CLIENT_ID_REFUSAL })
      .regex(CLIENT_ID_PATTERN, { error: CHAT_CLIENT_ID_REFUSAL })
      .optional(),
    recipientId: z
      .string({ error: WHISPER_RECIPIENT_REFUSAL })
      .uuid({ error: WHISPER_RECIPIENT_REFUSAL })
      .optional(),
  },
  { error: CHAT_CONTENT_REFUSAL }
);
