// ============================================
// Chat Panel Component
// Real-time chat with message history and WebSocket integration
// ============================================

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import { MessageCircle, Send, Loader, AlertCircle, Eraser, X, Lock, Shield } from 'lucide-react';
import { useParams } from 'react-router';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useOnRejoin } from '@/hooks/useOnRejoin';
import { useAuth } from '@/contexts/AuthContext';
import { useCampaign } from '@/contexts/CampaignContext';
import { useCompactLayout } from '@/contexts/LayoutContext';
import { getMessages } from '@/services/message.service';
import { mergeMessages } from '@/utils/messageMerge';
import { cursorBefore } from '@/utils/messageHistory';
import { api } from '@/services/api';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import ChatMessage from './ChatMessage';
import JumpToNewest from './JumpToNewest';
import ChatMessageSkeleton from '@/components/skeletons/ChatMessageSkeleton';
import { MessageType } from '@/types';
import type { Message, ChatMessageBroadcast, ChatMessageEvent, MessageHistoryPage } from '@/types';
import Button from '@/components/ui/Button';
import { errorMessage, errorSummary } from '@/utils/errors';
import type { ChatSystemBroadcast } from '@/types';
import { MAX_CHAT_MESSAGE_LENGTH } from '@/constants/chatLimits';
import { DISPLAY_NAME_MAX_LENGTH } from '@/constants/accountLimits';
import { useOnlineUserIds } from '@/stores/gameStore';
import { whisperTargets, readSlashWhisper, isSlashWhisper, slashWhisperRefusal, byLabel } from '@/utils/chatWhisper';

/** Messages per page. The server caps this at MAX_CHAT_HISTORY_PAGE (constants/chatLimits.ts). */
const PAGE_SIZE = 50;

/**
 * The most messages the panel holds, in memory and on screen, in every
 * layout. While the reader is at the newest message, the oldest leave as new
 * ones arrive, and Load More brings them back from the server.
 */
export const MAX_HELD_MESSAGES = 400;

/**
 * The most the panel holds while the reader is scrolled up, unless their own
 * Load More took it further (see withinCap). What they are reading stays put
 * until then; past it the oldest leave even so, since a chat left scrolled up
 * all evening would otherwise hold every message.
 */
const MAX_HELD_SCROLLED_UP = 2 * MAX_HELD_MESSAGES;

/**
 * How many pages a rejoin reads back looking for a message already shown.
 * Past it, the list starts again from the newest pages.
 */
const MAX_RESYNC_PAGES = 10;

/** Shown under the box once a message is this close to the limit. */
const LENGTH_WARNING_AT = MAX_CHAT_MESSAGE_LENGTH - 200;

/**
 * Room in the box for `/whisper <name> ` (or `/w`) ahead of a whisper's
 * message, since the server counts the message alone.
 */
const WHISPER_PREFIX_ROOM = '/whisper '.length + DISPLAY_NAME_MAX_LENGTH + 1;

/**
 * A name for a message being sent, which the server gives back on the
 * sender's copy and uses to post a resent message once. Not
 * crypto.randomUUID, which a page served over plain http does not have.
 */
function newClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The id a message being sent is shown under until the server names it. */
const pendingId = (clientId: string) => `temp-${clientId}`;

/** A message still being sent, or not sent: the server has not named it. */
const isPending = (message: Message) => message.id.startsWith('temp-');

/**
 * What comes before the oldest message held, and how Load More reaches it:
 * the server's cursor from the last page read; `find`, when older messages
 * may exist but no cursor starts where the list does (the oldest were let go,
 * or no page has been read), so Load More first finds one; or `none`, when
 * the oldest held is the campaign's first.
 */
type Earlier = { kind: 'cursor'; cursor: string } | { kind: 'find' } | { kind: 'none' };

/** The messages held, oldest first, and what comes before them. */
interface Held {
  messages: Message[];
  earlier: Earlier;
  /**
   * How many the reader's last Load More left the list holding, or 0 once
   * they are back at the newest message; see withinCap.
   */
  afterLoadMore: number;
}

/** What comes before a page just read. */
const earlierThan = (page: MessageHistoryPage): Earlier =>
  page.pagination.hasMore && page.pagination.nextCursor ? { kind: 'cursor', cursor: page.pagination.nextCursor } : { kind: 'none' };

/**
 * `held` with its oldest messages let go until MAX_HELD_MESSAGES remain. While
 * the reader is scrolled up the most is MAX_HELD_SCROLLED_UP, or what their
 * last Load More left plus MAX_HELD_MESSAGES when that is more, so what they
 * are reading, or brought back to read, stays while the table talks. Back at
 * the newest, that is forgotten. A message still being sent, or not sent,
 * stays too, since it holds what someone typed.
 */
function withinCap(held: Held, atNewest: boolean): Held {
  const most = atNewest ? MAX_HELD_MESSAGES : Math.max(MAX_HELD_SCROLLED_UP, held.afterLoadMore + MAX_HELD_MESSAGES);
  const now = atNewest && held.afterLoadMore !== 0 ? { ...held, afterLoadMore: 0 } : held;
  let excess = now.messages.length - most;
  if (excess <= 0) return now;
  const kept = now.messages.filter((message) => {
    if (excess === 0 || isPending(message)) return true;
    excess -= 1;
    return false;
  });
  return kept.length === now.messages.length ? now : { ...now, messages: kept, earlier: { kind: 'find' } };
}

export default function ChatPanel() {
  const { id: campaignId } = useParams<{ id: string }>();
  const { socket, joinedEpoch } = useWebSocket();
  const { user } = useAuth();
  const { userRole, campaign } = useCampaign();
  // In the compact layout's Chat sheet, about 330 px tall on a phone, the
  // sheet's heading names the chat, so the panel keeps its own heading for
  // screen readers only, the box starts at one line and the hint about the
  // keys is read out but not shown: the log gets the room.
  const compact = useCompactLayout();
  const onlineUserIds = useOnlineUserIds();

  // Everyone in the campaign, by user id, with the name the chat shows for
  // them; the To list offers everyone but this user, those in session first.
  const targets = useMemo(
    () => whisperTargets(campaign?.memberships ?? [], campaign?.characters ?? []),
    [campaign?.memberships, campaign?.characters]
  );
  const others = useMemo(() => [...targets.values()].filter((t) => t.userId !== user?.id).sort(byLabel), [targets, user?.id]);
  const dmUserId = campaign?.memberships?.find((m) => m.role === 'DM')?.userId;

  /**
   * Who the next message goes to, or null for everyone. Kept with the name it
   * was chosen under: a member who leaves stays chosen, marked as gone, and
   * is never swapped for everyone.
   */
  const [recipient, setRecipient] = useState<{ id: string; name: string } | null>(null);
  const recipientGone = recipient !== null && !targets.has(recipient.id);
  const recipientName = recipient ? (targets.get(recipient.id)?.label ?? recipient.name) : null;
  /** Why the panel itself did not send what is in the box (a `/w` it could not read). */
  const [boxRefusal, setBoxRefusal] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Older versions wrote a chat message every time someone connected or
  // dropped, which on a flaky connection buried the actual conversation. They
  // are no longer written, but existing campaigns still carry the backlog —
  // this lets the DM clear it when they choose rather than a migration doing it
  // silently on upgrade.
  const [confirmClearJoins, setConfirmClearJoins] = useState(false);
  const [clearingJoins, setClearingJoins] = useState(false);

  const handleClearJoinLeave = async () => {
    if (!campaign?.id) return;
    setConfirmClearJoins(false);
    setClearingJoins(true);
    try {
      const { deleted } = await api.clearJoinLeaveMessages(campaign.id);
      if (deleted > 0) {
        setMessages((prev) =>
          prev.filter((m) => {
            const action = (m.metadata as { action?: string } | null)?.action;
            return action !== 'user.joined' && action !== 'user.left';
          })
        );
      }
    } catch (err) {
      console.error('[ChatPanel] Failed to clear join/leave messages:', errorSummary(err));
    } finally {
      setClearingJoins(false);
    }
  };

  // State
  const [held, setHeld] = useState<Held>({ messages: [], earlier: { kind: 'find' }, afterLoadMore: 0 });
  const { messages, earlier } = held;
  /** Why a message was not sent, by its pending id, for those that were not. */
  const [notSent, setNotSent] = useState<Record<string, string>>({});
  // The messages as last shown, for a send's answer that arrives later.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [messageInput, setMessageInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // History read while the log is on screen (Load More, a rejoin) arrives a
  // page at a time, which the live region would read out in full; it is
  // quiet until a frame after each read.
  const [historyReads, setHistoryReads] = useState(0);
  const quietly = useCallback(async (read: () => Promise<void>) => {
    setHistoryReads((n) => n + 1);
    try {
      await read();
    } finally {
      requestAnimationFrame(() => setHistoryReads((n) => n - 1));
    }
  }, []);

  // Rate limiting state (10 messages per minute = 1 per 6 seconds)
  const [canSend, setCanSend] = useState(true);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  /**
   * Distance from the bottom to restore once an older page has been added,
   * with the page's oldest message, which names the page it belongs to.
   */
  const restoreScrollRef = useRef<{ offsetFromBottom: number; pageOldestId: string } | null>(null);
  const wasAtBottomRef = useRef(true);
  /** Something arrived below while the reader was scrolled up. */
  const [newBelow, setNewBelow] = useState(false);

  /** Change the messages held, adding none newer, and keep what comes before them. */
  const setMessages = useCallback((update: (prev: Message[]) => Message[]) => {
    setHeld((h) => {
      const next = update(h.messages);
      return next === h.messages ? h : { ...h, messages: next };
    });
  }, []);

  /** Add messages at the newest end, then hold the list within MAX_HELD_MESSAGES. */
  const addMessages = useCallback((update: (prev: Message[]) => Message[]) => {
    setHeld((h) => {
      const next = update(h.messages);
      return next === h.messages ? h : withinCap({ ...h, messages: next }, wasAtBottomRef.current);
    });
  }, []);

  // ============================================
  // Scroll Management
  // ============================================

  /**
   * Check if user is scrolled to bottom
   */
  const isAtBottom = (): boolean => {
    const container = messagesContainerRef.current;
    if (!container) return true;

    const threshold = 50; // pixels from bottom
    const isBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    return isBottom;
  };

  /**
   * Scroll to bottom of messages.
   * Uses scrollTo on the container directly to avoid scrollIntoView
   * propagating up to parent scrollable elements (e.g. the sidebar).
   */
  /**
   * Put the reader back where they were after older messages are added above.
   *
   * Laid out before paint rather than after, so the list does not visibly jump.
   * Measured from the bottom because that distance is what the new content does
   * not change.
   */
  useLayoutEffect(() => {
    const restore = restoreScrollRef.current;
    if (restore === null) return;
    restoreScrollRef.current = null;
    // A page the list did not take (see Load More) moved nothing.
    if (messages.find((m) => !isPending(m))?.id !== restore.pageOldestId) return;

    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight - restore.offsetFromBottom;
    }
  }, [messages]);

  const scrollToBottom = (smooth = true) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  /**
   * Update wasAtBottom ref when user scrolls
   */
  const handleScroll = () => {
    wasAtBottomRef.current = isAtBottom();
    if (wasAtBottomRef.current) setNewBelow(false);
  };

  const jumpToNewest = () => {
    wasAtBottomRef.current = true;
    setNewBelow(false);
    scrollToBottom(true);
  };

  /**
   * Keep a reader at the newest message there when the log's box changes
   * size: the log keeps its scroll position as its box shrinks, which would
   * leave the newest messages below it (a sheet made half height again, the
   * panel moved from the desktop's rail into the compact layout's sheet, a
   * window made shorter).
   */
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (wasAtBottomRef.current) container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
    });
    observer.observe(container);
    return () => observer.disconnect();
    // The log is drawn once the history has loaded.
  }, [isLoading]);

  // ============================================
  // Load Messages
  // ============================================

  /**
   * Load initial messages
   */
  useEffect(() => {
    if (!campaignId) return;

    const loadInitialMessages = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const page = await getMessages(campaignId, PAGE_SIZE);

        // The server sends newest first; the panel reads oldest first.
        // Merged with what is already shown: a message can arrive live
        // before the history does.
        setHeld((h) => withinCap({ ...h, messages: mergeMessages(h.messages, page.messages), earlier: earlierThan(page) }, wasAtBottomRef.current));

        // Scroll to bottom after initial load (without smooth)
        setTimeout(() => scrollToBottom(false), 100);
      } catch (err) {
        console.error('[ChatPanel] Failed to load messages:', errorSummary(err));
        setError(errorMessage(err) || 'Failed to load messages');
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialMessages();
  }, [campaignId]);

  /**
   * Resync chat history after a WebSocket reconnect.
   *
   * The realtime stream may have missed messages while we were disconnected
   * (the backend stores every message in Postgres, but only live subscribers
   * see them in real time). On reconnect, read back from the newest message
   * until a page holds one already shown, and merge, deduping by id: reading
   * only the newest page left a lasting gap after a busy absence, behind
   * which Load More cannot reach. When MAX_RESYNC_PAGES do not get back to
   * what is shown, the list starts again from what was read, and Load More
   * carries on from there.
   *
   * Driven by `joinedEpoch`, which counts joins of the campaign: every join
   * after the first is a rejoin. The transport's own reconnect comes before
   * the socket is back in the campaign's room, and a message sent in that
   * gap would be missed by a read made then.
   */
  useOnRejoin(joinedEpoch, () => {
    if (!campaignId) return;

    const resync = async () => {
      try {
        const shown = new Set(messagesRef.current.filter((m) => !isPending(m)).map((m) => m.id));
        const joinsUp = (page: Message[]) => shown.size === 0 || page.some((m) => shown.has(m.id));
        let page = await getMessages(campaignId, PAGE_SIZE);
        const fresh = [...page.messages];
        let joined = joinsUp(page.messages);
        for (let read = 1; !joined && read < MAX_RESYNC_PAGES && page.pagination.hasMore && page.pagination.nextCursor; read++) {
          page = await getMessages(campaignId, PAGE_SIZE, page.pagination.nextCursor);
          fresh.push(...page.messages);
          joined = joinsUp(page.messages);
        }

        // mergeMessages already orders and dedupes; sorting again here on the
        // timestamp alone would undo the id tiebreak it applies.
        if (joined || !page.pagination.hasMore) {
          setHeld((h) => withinCap({ ...h, messages: mergeMessages(h.messages, fresh) }, wasAtBottomRef.current));
        } else {
          // Too much was missed to join up: keep only messages still being
          // sent, and page back from what was read.
          setHeld((h) => withinCap({ messages: mergeMessages(h.messages.filter(isPending), fresh), earlier: earlierThan(page), afterLoadMore: 0 }, wasAtBottomRef.current));
        }
      } catch (err) {
        console.error('[ChatPanel] Failed to resync messages after reconnect:', errorSummary(err));
        // Non-fatal — user will still see new messages going forward
      }
    };

    void quietly(resync);
  });

  /**
   * Load more messages (pagination)
   */
  const loadMoreMessages = () => quietly(async () => {
    if (!campaignId || isLoadingMore || earlier.kind === 'none') return;
    // What is read goes above the oldest message held.
    const oldest = messagesRef.current.find((m) => !isPending(m));

    try {
      setIsLoadingMore(true);

      // Hand back exactly what the server gave us. It decides what a position
      // in the history is; the panel does not construct one. When no cursor
      // it gave starts where the list does, one is found first.
      const from = earlier.kind === 'cursor'
        ? { cursor: earlier.cursor }
        : oldest
          ? await cursorBefore((limit, cursor) => getMessages(campaignId, limit, cursor), oldest)
          : {};
      const page = from && (await getMessages(campaignId, PAGE_SIZE, from.cursor));
      setError(null);

      // What was read joins up with the list only while its oldest message is
      // the one it was read for. Let go meanwhile, or replaced by a rejoin's
      // fresh start, the page is dropped, and another Load More reads from the
      // list as it is. Checked in the update itself, which sees every change
      // made before it, drawn yet or not.
      const readFor = (h: Held) => h.messages.find((m) => !isPending(m))?.id === oldest?.id;
      if (!page) {
        setHeld((h) => (readFor(h) ? { ...h, earlier: { kind: 'none' } } : h));
        return;
      }

      // Older messages are added above what is on screen, which would otherwise
      // push the reader's place down by the height of the new page and make a
      // second Load More impossible to aim at. Remember where the bottom was,
      // now that the page is here: taken before the request, a failed one left
      // it set for whatever message came next, which then jumped the list.
      const container = messagesContainerRef.current;
      const pageOldest = page.messages[page.messages.length - 1];
      restoreScrollRef.current = container && pageOldest
        ? { offsetFromBottom: container.scrollHeight - container.scrollTop, pageOldestId: pageOldest.id }
        : null;

      // Merged rather than prepended: a page that overlaps what is on screen
      // would otherwise show its messages twice, duplicate keys and all. Not
      // held within MAX_HELD_MESSAGES: the reader asked for these.
      setHeld((h) => {
        if (!readFor(h)) return h;
        const messages = mergeMessages(h.messages, page.messages);
        return { messages, earlier: earlierThan(page), afterLoadMore: messages.length };
      });
    } catch (err) {
      console.error('[ChatPanel] Failed to load more messages:', errorSummary(err));
      setError(errorMessage(err) || 'Failed to load more messages');
    } finally {
      setIsLoadingMore(false);
    }
  });

  // ============================================
  // WebSocket Integration
  // ============================================

  /**
   * Listen for incoming chat messages
   */
  useEffect(() => {
    if (!socket) return;

    const handleChatMessage = (data: ChatMessageBroadcast) => {
      console.log('[ChatPanel] Received chat message:', data);

      // Convert broadcast format to Message format
      const newMessage: Message = {
        id: data.id,
        campaignId: campaignId!,
        userId: data.userId,
        user: { id: data.userId, displayName: data.userName },
        recipientId: data.recipientId ?? null,
        recipient: data.recipientId ? { id: data.recipientId, displayName: data.recipientName ?? '' } : null,
        type: data.type,
        content: data.content,
        metadata: null,
        createdAt: data.timestamp,
      };

      // Our own message comes back with the name it was sent under, and
      // takes the place of the copy shown while it was sending (or marked
      // Not sent, when the answer was lost but the message went through).
      // Anything already shown under its id is not added again.
      const ownPendingId = data.clientId ? pendingId(data.clientId) : null;
      addMessages((prev) => {
        const pendingIndex = ownPendingId ? prev.findIndex((msg) => msg.id === ownPendingId) : -1;
        if (pendingIndex !== -1) {
          const updated = [...prev];
          updated[pendingIndex] = newMessage;
          return prev.some((msg) => msg.id === data.id) ? updated.filter((msg, i) => i === pendingIndex || msg.id !== data.id) : updated;
        }
        return prev.some((msg) => msg.id === data.id) ? prev : [...prev, newMessage];
      });
      if (ownPendingId) setNotSent((prev) => withoutKey(prev, ownPendingId));

      // Auto-scroll if user was at bottom; otherwise say something arrived.
      if (wasAtBottomRef.current) {
        setTimeout(() => scrollToBottom(true), 50);
      } else if (!ownPendingId) {
        setNewBelow(true);
      }
    };

    const handleSystemMessage = (data: ChatSystemBroadcast) => {
      console.log('[ChatPanel] Received system message:', data);

      const systemMessage: Message = {
        // The server's own id, not one made up here. A fabricated id can never
        // match the row when history replays it, so the notice appeared twice.
        id: data.id,
        campaignId: campaignId!,
        userId: null,
        type: MessageType.SYSTEM,
        content: data.content,
        metadata: data.metadata || null,
        createdAt: data.timestamp,
      };

      addMessages((prev) => mergeMessages(prev, [systemMessage]));

      if (wasAtBottomRef.current) {
        setTimeout(() => scrollToBottom(true), 50);
      } else {
        setNewBelow(true);
      }
    };

    socket.onChatMessage(handleChatMessage);
    socket.onChatSystem(handleSystemMessage);

    return () => {
      socket.off('chat.message', handleChatMessage);
      socket.off('chat.system', handleSystemMessage);
    };
  }, [socket, campaignId, addMessages]);

  // ============================================
  // Rate Limiting
  // ============================================

  /**
   * Cooldown timer
   */
  useEffect(() => {
    if (cooldownSeconds > 0) {
      const timer = setTimeout(() => {
        setCooldownSeconds((prev) => prev - 1);
      }, 1000);

      return () => clearTimeout(timer);
    } else if (cooldownSeconds === 0 && !canSend) {
      setCanSend(true);
    }

    return undefined;
  }, [cooldownSeconds, canSend]);

  /**
   * Start rate limit cooldown (only if the DM has enabled it for this campaign)
   */
  const startCooldown = () => {
    if (!campaign?.chatCooldownEnabled) return;
    setCanSend(false);
    setCooldownSeconds(campaign.chatCooldownSeconds ?? 5);
  };

  // ============================================
  // Send Message
  // ============================================

  /**
   * Handle message submission
   */
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  /**
   * Handle Enter key (submit) and Shift+Enter (newline)
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter while an input method is composing confirms the candidate.
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * Send one message and wait for the server's answer. Confirmed, the copy
   * shown takes the stored id; refused or unanswered, it is marked Not sent
   * with the reason, for Retry or Discard.
   */
  const deliver = async (clientId: string, content: string, type: ChatMessageEvent['type'], recipientId?: string) => {
    if (!socket) return;
    const id = pendingId(clientId);
    setNotSent((prev) => withoutKey(prev, id));
    const answer = await socket.sendChatMessage({ content, type, clientId, ...(recipientId ? { recipientId } : {}) });
    if (answer.ok) {
      // Usually the message itself has come back first and taken its place.
      setMessages((prev) => {
        if (!prev.some((msg) => msg.id === id)) return prev;
        return prev.some((msg) => msg.id === answer.id)
          ? prev.filter((msg) => msg.id !== id)
          : prev.map((msg) => (msg.id === id ? { ...msg, id: answer.id } : msg));
      });
    } else if (messagesRef.current.some((msg) => msg.id === id)) {
      // Still showing as sending: the message itself has not come back.
      setNotSent((reasons) => ({ ...reasons, [id]: answer.error }));
    }
  };

  /** Send a message marked Not sent again, under the name it had, to whoever it was for. */
  const retry = (message: Message) => {
    // A copy still being sent holds the type that was asked for, PLAYER or DM.
    const asked = message.type === MessageType.DM ? MessageType.DM : MessageType.PLAYER;
    void deliver(message.id.slice('temp-'.length), message.content, asked, message.recipientId ?? undefined);
  };

  /** Drop a message marked Not sent. */
  const discard = (message: Message) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== message.id));
    setNotSent((prev) => withoutKey(prev, message.id));
  };

  /**
   * Send the message in the box: shown at once as sending, then confirmed or
   * marked Not sent when the server answers.
   */
  const sendMessage = (): void => {
    const text = messageInput.trim();
    if (!text || !canSend || !socket || !campaignId || !user) return;

    // `/w <name> <message>` whispers this one message; anything it cannot
    // read as that is kept in the box with the reason, and sent to no one.
    let to = recipient;
    let content = text;
    const slash = readSlashWhisper(text, others);
    if (slash.kind === 'to' && slash.content) {
      to = { id: slash.userId, name: targets.get(slash.userId)?.label ?? '' };
      content = slash.content;
    } else if (slash.kind !== 'none') {
      setBoxRefusal(slashWhisperRefusal(slash));
      return;
    }

    const clientId = newClientId();

    // The type asked for, PLAYER or DM, also on a whisper: the server makes
    // it a WHISPER, and Retry sends what was asked.
    const messageType: ChatMessageEvent['type'] = userRole === 'DM' ? MessageType.DM : MessageType.PLAYER;

    const optimisticMessage: Message = {
      id: pendingId(clientId),
      campaignId,
      userId: user.id,
      user: { id: user.id, displayName: user.displayName },
      recipientId: to?.id ?? null,
      recipient: to ? { id: to.id, displayName: targets.get(to.id)?.displayName ?? to.name } : null,
      type: messageType,
      content,
      metadata: null,
      createdAt: new Date().toISOString(),
    };

    addMessages((prev) => [...prev, optimisticMessage]);

    // Clear input and scroll
    setMessageInput('');
    setTimeout(() => scrollToBottom(true), 50);

    // Start rate limit cooldown
    startCooldown();

    void deliver(clientId, content, messageType, to?.id);
  };

  const chooseRecipient = (e: ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setBoxRefusal(null);
    const target = targets.get(id);
    setRecipient(target ? { id, name: target.label } : id && id === recipient?.id ? recipient : null);
  };

  /** Choosing a whisper's name sets the To list to the other person in it. */
  const whisperBack = useCallback((message: Message) => {
    const peerId = message.userId === user?.id ? message.recipientId : message.userId;
    const target = peerId ? targets.get(peerId) : undefined;
    if (!target) return;
    setRecipient({ id: target.userId, name: target.label });
    setBoxRefusal(null);
    textareaRef.current?.focus();
  }, [targets, user?.id]);

  /** How a whisper is labelled in the list, or null for a message to everyone. */
  const whisperView = (message: Message): { label: string; peer: string; canReply: boolean } | null => {
    if (message.type !== MessageType.WHISPER && !message.recipientId) return null;
    const mine = message.userId === user?.id;
    const peerId = mine ? message.recipientId : message.userId;
    const fallback = mine ? message.recipient?.displayName : message.user?.displayName;
    const peer = (peerId ? targets.get(peerId)?.label : undefined) || fallback || 'Unknown User';
    return { label: mine ? `Whisper to ${peer}` : `Whisper from ${peer}`, peer, canReply: !!peerId && targets.has(peerId) && peerId !== user?.id };
  };

  // A whisper typed as `/w <name> ` has its message counted alone, as the
  // server counts it.
  const slashInBox = isSlashWhisper(messageInput);
  const typedWhisper = slashInBox ? readSlashWhisper(messageInput.trim(), others) : null;
  const countedLength = typedWhisper?.kind === 'to' ? typedWhisper.content.length : messageInput.length;

  // The line under the box names who the message will reach: whoever a
  // typed `/w` names, whatever the To list says, or else the To list's
  // choice. A `/w` that fits nobody, or several, says so as it is typed, in
  // a line that is not announced; the same words are announced if it is sent.
  const typedTarget = typedWhisper?.kind === 'to' ? targets.get(typedWhisper.userId) : undefined;
  const typingRefusal = typedWhisper && (typedWhisper.kind === 'several' || typedWhisper.kind === 'nobody') ? slashWhisperRefusal(typedWhisper) : null;
  const goesTo: { id: string; name: string; gone: boolean } | null = typedTarget
    ? { id: typedTarget.userId, name: typedTarget.label, gone: false }
    : typingRefusal
      ? null
      : recipient && { id: recipient.id, name: recipientName ?? recipient.name, gone: recipientGone };
  const dmTarget = others.find((t) => t.userId === dmUserId);
  const players = others.filter((t) => t.userId !== dmUserId);

  // ============================================
  // Render
  // ============================================

  if (isLoading) {
    return (
      <div className="glass-panel h-full flex flex-col">
        {/* Header skeleton */}
        <div className="flex items-center gap-2 p-4 border-b border-moss-green/20">
          <MessageCircle className="w-5 h-5 text-brand-ink/40" />
          <div className="h-5 w-10 bg-moss-green/15 rounded-sm animate-pulse" />
        </div>
        {/* Message skeletons */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <ChatMessageSkeleton variant="long" />
          <ChatMessageSkeleton variant="short" />
          <ChatMessageSkeleton variant="medium" />
          <ChatMessageSkeleton variant="long" />
          <ChatMessageSkeleton variant="short" />
        </div>
        {/* Input placeholder */}
        <div className="p-4 border-t border-moss-green/20 animate-pulse">
          <div className="h-16 bg-moss-green/5 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel h-full flex flex-col">
      {/* Chat Header */}
      <div className={`flex items-center gap-2 border-b border-moss-green/20 ${compact ? 'px-3 py-1 min-h-9' : 'p-4'}`}>
        {!compact && <MessageCircle className="w-5 h-5 text-brand-ink" />}
        <h3 className={compact ? 'sr-only' : 'text-lg font-semibold text-brand-ink'}>Chat</h3>
        {/* What the panel holds, which in a long session is not all there is. */}
        {messages.length > 0 && (
          <span className="text-xs text-stone-gray/70 ml-auto">
            {messages.length} shown
          </span>
        )}
        {userRole === 'DM' && (
          <button
            onClick={() => setConfirmClearJoins(true)}
            disabled={clearingJoins}
            aria-label="Clear old join and leave messages"
            title="Clear old join and leave messages"
            className={`p-1.5 rounded-lg text-stone-gray hover:text-brand-ink hover:bg-moss-green/10 transition-colors disabled:opacity-50 ${
              messages.length > 0 ? '' : 'ml-auto'
            }${compact ? ' touch-target inline-flex items-center justify-center' : ''}`}
          >
            <Eraser className="w-4 h-4" />
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmClearJoins}
        title="Clear join and leave messages?"
        message="Removes the old “has joined” and “has left” notices from this campaign's chat for everyone. The rest of the conversation is untouched, and no new ones are created."
        confirmLabel="Clear"
        cancelLabel="Keep"
        variant="warning"
        onConfirm={handleClearJoinLeave}
        onCancel={() => setConfirmClearJoins(false)}
      />

      {/* Error Display */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-danger/10 border border-danger/30 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-danger-ink shrink-0" />
          <p className="text-sm text-danger-ink flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            className="p-1 rounded-sm text-danger-ink hover:bg-danger/10"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Messages Area */}
      <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        role="log"
        aria-live={historyReads > 0 ? 'off' : 'polite'}
        aria-label="Chat messages"
        aria-relevant="additions"
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {/* Load More Button */}
        {earlier.kind !== 'none' && messages.length > 0 && (
          <div className="text-center pb-2">
            <Button
              onClick={loadMoreMessages}
              disabled={isLoadingMore}
              variant="secondary" className={`text-sm px-4 py-2${compact ? ' min-h-11' : ''}`}
            >
              {isLoadingMore ? (
                <>
                  <Loader className="w-3 h-3 animate-spin mr-2" />
                  Loading...
                </>
              ) : (
                'Load More'
              )}
            </Button>
          </div>
        )}

        {/* Messages List */}
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="w-12 h-12 text-brand-ink/30 mx-auto mb-3" />
            <p className="text-sm text-warm-gray mb-2">No messages yet</p>
            <p className="text-xs text-stone-gray/70">
              Start a conversation with your party
            </p>
          </div>
        ) : (
          <>
            {messages.map((message) => {
              const whisper = whisperView(message);
              return (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isCurrentUser={message.userId === user?.id}
                  isPending={isPending(message) && !(message.id in notSent)}
                  notSentReason={notSent[message.id]}
                  onRetry={retry}
                  onDiscard={discard}
                  whisperLabel={whisper?.label}
                  whisperPeer={whisper?.peer}
                  sentByDM={!!dmUserId && message.userId === dmUserId}
                  onWhisperBack={whisper?.canReply ? whisperBack : undefined}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      {newBelow && <JumpToNewest onClick={jumpToNewest} />}
      </div>

      {/* Input Area */}
      <div className={`${compact ? 'px-3 py-2' : 'p-4'} border-t border-moss-green/20`}>
        <form onSubmit={handleSubmit} className="space-y-2">
          {/* Who the message goes to. Keyed by user id: display names are not unique. */}
          <div className="flex items-center gap-2">
            <label htmlFor="chat-recipient" className="text-xs font-medium text-stone-gray">To</label>
            <select
              id="chat-recipient"
              value={recipient?.id ?? ''}
              onChange={chooseRecipient}
              className={`input-cozy flex-1 min-w-0 text-sm py-1${compact ? ' min-h-11' : ''}`}
            >
              <option value="">Everyone</option>
              {recipientGone && recipient && <option value={recipient.id}>{recipient.name} (no longer in the campaign)</option>}
              {/* The DM in a group the app names, which nothing a member writes can copy. */}
              {dmTarget && (
                <optgroup label={onlineUserIds.has(dmTarget.userId) ? 'DM' : 'DM, not in session'}>
                  <option value={dmTarget.userId}>{dmTarget.label}</option>
                </optgroup>
              )}
              {players.some((t) => onlineUserIds.has(t.userId)) && (
                <optgroup label="In session">
                  {players.filter((t) => onlineUserIds.has(t.userId)).map((t) => <option key={t.userId} value={t.userId}>{t.label}</option>)}
                </optgroup>
              )}
              {players.some((t) => !onlineUserIds.has(t.userId)) && (
                <optgroup label="Not in session">
                  {players.filter((t) => !onlineUserIds.has(t.userId)).map((t) => <option key={t.userId} value={t.userId}>{t.label}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              value={messageInput}
              onChange={(e) => {
                setMessageInput(e.target.value);
                setBoxRefusal(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder={compact ? (recipient ? 'Type a whisper…' : 'Type a message…') : recipient ? 'Type a whisper... (Enter to send)' : 'Type a message... (Enter to send, Shift+Enter for new line)'}
              aria-label="Chat message"
              aria-describedby="chat-hint"
              className={`input-cozy flex-1 text-sm resize-none ${compact ? 'min-h-11' : 'min-h-[60px]'} max-h-[120px] ${canSend ? '' : 'opacity-50 cursor-not-allowed'}`}
              rows={compact ? 1 : 2}
              maxLength={slashInBox ? MAX_CHAT_MESSAGE_LENGTH + WHISPER_PREFIX_ROOM : MAX_CHAT_MESSAGE_LENGTH}
              // Read-only through the cooldown, not disabled: disabling the
              // box threw keyboard focus to the page after every message.
              readOnly={!canSend}
              aria-disabled={!canSend}
            />
            <Button
              type="submit"
              className="px-4 py-2 flex items-center gap-2"
              disabled={!messageInput.trim() || !canSend}
              aria-label={!canSend ? `Rate limited — wait ${cooldownSeconds} seconds` : 'Send message'}
            >
              {!canSend && cooldownSeconds > 0 ? (
                <span className="text-sm font-mono" aria-hidden="true">{cooldownSeconds}s</span>
              ) : (
                <Send className="w-4 h-4" aria-hidden="true" />
              )}
            </Button>
          </div>

          {goesTo && (
            <p className={`text-xs text-center flex items-center justify-center gap-1 ${goesTo.gone ? 'text-warning-ink' : 'text-accent-ink'}`}>
              <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />
              {/* The shield the log shows beside a DM's message, for the campaign's DM by user id. */}
              {goesTo.id === dmUserId && <Shield className="w-3 h-3 shrink-0 text-warning-ink" aria-hidden="true" />}
              <span>{goesTo.gone ? `${goesTo.name} is no longer in the campaign.` : `Only you and ${goesTo.name} can see this.`}</span>
              {goesTo.id === dmUserId && <span className="sr-only">{goesTo.name} is the DM.</span>}
            </p>
          )}
          {boxRefusal ? (
            <p role="alert" className="text-xs text-danger-ink text-center">{boxRefusal}</p>
          ) : (
            typingRefusal && <p className="text-xs text-warning-ink text-center">{typingRefusal}</p>
          )}

          {/* Rate Limiting Feedback */}
          {!canSend && cooldownSeconds > 0 && (
            <p className="text-xs text-warning-ink text-center">
              Wait {cooldownSeconds}s before sending another message
            </p>
          )}
          {canSend && countedLength >= LENGTH_WARNING_AT && (
            <p className="text-xs text-warning-ink text-center" aria-live="polite">
              {countedLength} of {MAX_CHAT_MESSAGE_LENGTH} characters
            </p>
          )}
          {canSend && countedLength < LENGTH_WARNING_AT && (
            <p id="chat-hint" className={compact ? 'sr-only' : 'text-xs text-stone-gray/70 text-center'}>
              Press Enter to send, Shift+Enter for new line
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

/** The same record without `key`. */
function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}
