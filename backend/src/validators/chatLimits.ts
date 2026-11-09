/**
 * Chat limits the browser and the server share.
 *
 * This file exists twice, as backend/src/validators/chatLimits.ts and
 * frontend/src/constants/chatLimits.ts, and a test keeps the two copies
 * identical, so the browser never asks for what the server refuses.
 */

/**
 * The longest chat message, in characters, counted before the message is
 * trimmed. The server refuses a message over it and the chat box stops at it.
 */
export const MAX_CHAT_MESSAGE_LENGTH = 2000;

/**
 * The most messages one page of chat history holds. The server refuses a
 * longer page, and the chat reads pages this long when it looks back for
 * where its history begins.
 */
export const MAX_CHAT_HISTORY_PAGE = 100;
