/**
 * The longest chat message, in characters, counted before the message is
 * trimmed.
 *
 * The server refuses a message over it and the chat box stops at it. This
 * file exists twice, as backend/src/validators/chatLimits.ts and
 * frontend/src/constants/chatLimits.ts, and a test keeps the two copies
 * identical, so the box never allows what the server refuses.
 */
export const MAX_CHAT_MESSAGE_LENGTH = 2000;
