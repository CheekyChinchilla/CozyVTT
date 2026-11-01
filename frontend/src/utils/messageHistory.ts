import type { Message, MessageHistoryPage } from '@/types';
import { MAX_CHAT_HISTORY_PAGE } from '@/constants/chatLimits';
import { compareMessages } from './messageMerge';

/** Reads a page of chat history, newest first, from where `cursor` says the last one stopped. */
export type ReadHistoryPage = (limit: number, cursor?: string) => Promise<MessageHistoryPage>;

/**
 * The most times a page that goes on past `message` is read again to end it
 * there. Every such page needs one; each after that follows a deletion
 * between two reads.
 */
const MAX_REREADS = 3;

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
 * has `message` itself.
 *
 * That read goes by count, and the history can change in between. A message
 * at or after `message` deleted meanwhile (the DM clearing join and leave
 * notices, say) ends the read one message older, past `message`, and the
 * cursor after it would skip that one for good; so such a read is read again
 * in turn, asking for the messages it had at or after `message`. A message
 * sent meanwhile can only shift a page read from the newest, ending it a
 * message sooner; the read that follows then starts with a message at or
 * after `message` again, and mergeMessages keeps one copy. Past MAX_REREADS
 * this settles for the cursor the page started from, which repeats the page's
 * messages at or after `message` and skips none.
 *
 * Each page walked is older than the one before, and each read again asks for
 * fewer, so the reads end.
 */
export async function cursorBefore(read: ReadHistoryPage, message: Message): Promise<{ cursor?: string } | null> {
  let cursor: string | undefined;
  let limit = MAX_CHAT_HISTORY_PAGE;
  let rereads = 0;
  for (;;) {
    const page = await read(limit, cursor);
    // Newest first, so the messages at or after `message` lead the page.
    const atOrAfter = page.messages.filter((m) => compareMessages(m, message) >= 0).length;
    if (atOrAfter === 0) return { cursor };
    if (atOrAfter < page.messages.length) {
      // The page goes on past `message`: read it again, ending at the oldest
      // message at or after it.
      if (rereads === MAX_REREADS) return { cursor };
      rereads += 1;
      limit = atOrAfter;
      continue;
    }
    if (!page.pagination.hasMore || !page.pagination.nextCursor) return null;
    cursor = page.pagination.nextCursor;
    // A page read again ends at or after `message` here, so the cursor after
    // it skips nothing older.
    if (rereads > 0 || page.messages[page.messages.length - 1].id === message.id) return { cursor };
  }
}
