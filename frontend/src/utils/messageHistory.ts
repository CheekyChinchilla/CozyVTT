import type { Message, MessageHistoryPage } from '@/types';
import { MAX_CHAT_HISTORY_PAGE } from '@/constants/chatLimits';
import { compareMessages } from './messageMerge';

/** Reads a page of chat history, newest first, from where `cursor` says the last one stopped. */
export type ReadHistoryPage = (limit: number, cursor?: string) => Promise<MessageHistoryPage>;

/**
 * A cursor that reads the history from the first message older than
 * `message`: `{ cursor: undefined }` reads from the newest, and `null` means
 * nothing is older.
 *
 * For a chat panel that let its oldest messages go and so holds no cursor for
 * them. The server mints every cursor and the panel never builds one, so this
 * reads back from the newest message until a page reaches `message`; when the
 * page goes on past it, the same page is read again ending at it, and the
 * cursor after that starts just before it, whether or not the server still
 * has `message` itself. Each page is older than the one before, so the reads
 * end.
 */
export async function cursorBefore(read: ReadHistoryPage, message: Message): Promise<{ cursor?: string } | null> {
  let cursor: string | undefined;
  for (;;) {
    const page = await read(MAX_CHAT_HISTORY_PAGE, cursor);
    // Newest first, so the messages at or after `message` lead the page.
    const atOrAfter = page.messages.filter((m) => compareMessages(m, message) >= 0).length;
    if (atOrAfter === 0) return { cursor };
    if (atOrAfter < page.messages.length) {
      const ending = await read(atOrAfter, cursor);
      return ending.pagination.nextCursor ? { cursor: ending.pagination.nextCursor } : null;
    }
    if (!page.pagination.hasMore || !page.pagination.nextCursor) return null;
    cursor = page.pagination.nextCursor;
    if (page.messages[page.messages.length - 1].id === message.id) return { cursor };
  }
}
