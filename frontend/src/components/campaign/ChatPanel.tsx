// ============================================
// Chat Panel Component
// Real-time chat with message history and WebSocket integration
// ============================================

import { useState, useEffect, useLayoutEffect, useRef, useCallback, FormEvent, KeyboardEvent } from 'react';
import { MessageCircle, Send, Loader, AlertCircle, Eraser, X } from 'lucide-react';
import { useParams } from 'react-router';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useOnRejoin } from '@/hooks/useOnRejoin';
import { useAuth } from '@/contexts/AuthContext';
import { useCampaign } from '@/contexts/CampaignContext';
import { getMessages } from '@/services/message.service';
import { mergeMessages } from '@/utils/messageMerge';
import { api } from '@/services/api';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import ChatMessage from './ChatMessage';
import JumpToNewest from './JumpToNewest';
import ChatMessageSkeleton from '@/components/skeletons/ChatMessageSkeleton';
import { MessageType, PlatformRole } from '@/types';
import type { Message, ChatMessageBroadcast } from '@/types';
import Button from '@/components/ui/Button';
import { errorMessage } from '@/utils/errors';
import type { ChatSystemBroadcast } from '@/types';

/** Messages per page. The server caps this at 100. */
const PAGE_SIZE = 50;

/**
 * How many pages a rejoin reads back looking for a message already shown.
 * Past it, the list starts again from the newest pages.
 */
const MAX_RESYNC_PAGES = 10;

/** The longest message the server accepts, in characters. */
const MAX_MESSAGE_LENGTH = 2000;

/** Shown under the box once a message is this close to the limit. */
const LENGTH_WARNING_AT = MAX_MESSAGE_LENGTH - 200;

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

export default function ChatPanel() {
  const { id: campaignId } = useParams<{ id: string }>();
  const { socket, joinedEpoch } = useWebSocket();
  const { user } = useAuth();
  const { userRole, campaign } = useCampaign();

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
      console.error('[ChatPanel] Failed to clear join/leave messages:', err);
    } finally {
      setClearingJoins(false);
    }
  };

  // State
  const [messages, setMessages] = useState<Message[]>([]);
  /** Why a message was not sent, by its pending id, for those that were not. */
  const [notSent, setNotSent] = useState<Record<string, string>>({});
  // The messages as last shown, for a send's answer that arrives later.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [messageInput, setMessageInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  /** Where the last page stopped. Minted by the server; passed back untouched. */
  const [cursor, setCursor] = useState<string | null>(null);
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
  /** Distance from the bottom to restore once an older page has been added. */
  const restoreScrollRef = useRef<number | null>(null);
  const wasAtBottomRef = useRef(true);
  /** Something arrived below while the reader was scrolled up. */
  const [newBelow, setNewBelow] = useState(false);

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
    const offsetFromBottom = restoreScrollRef.current;
    if (offsetFromBottom === null) return;
    restoreScrollRef.current = null;

    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight - offsetFromBottom;
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
        setMessages((prev) => mergeMessages(prev, page.messages));
        setHasMore(page.pagination.hasMore);
        setCursor(page.pagination.nextCursor);

        // Scroll to bottom after initial load (without smooth)
        setTimeout(() => scrollToBottom(false), 100);
      } catch (err) {
        console.error('[ChatPanel] Failed to load messages:', err);
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
        const shown = new Set(messagesRef.current.filter((m) => !m.id.startsWith('temp-')).map((m) => m.id));
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
          setMessages((prev) => mergeMessages(prev, fresh));
        } else {
          // Too much was missed to join up: keep only messages still being
          // sent, and page back from what was read.
          setMessages((prev) => mergeMessages(prev.filter((m) => m.id.startsWith('temp-')), fresh));
          setHasMore(page.pagination.hasMore);
          setCursor(page.pagination.nextCursor);
        }
      } catch (err) {
        console.error('[ChatPanel] Failed to resync messages after reconnect:', err);
        // Non-fatal — user will still see new messages going forward
      }
    };

    void quietly(resync);
  });

  /**
   * Load more messages (pagination)
   */
  const loadMoreMessages = () => quietly(async () => {
    if (!campaignId || isLoadingMore || !hasMore) return;

    try {
      setIsLoadingMore(true);

      // Hand back exactly what the server gave us. It decides what a position
      // in the history is; the panel does not construct one.
      const page = await getMessages(campaignId, PAGE_SIZE, cursor ?? undefined);

      // Older messages are added above what is on screen, which would otherwise
      // push the reader's place down by the height of the new page and make a
      // second Load More impossible to aim at. Remember where the bottom was,
      // now that the page is here: taken before the request, a failed one left
      // it set for whatever message came next, which then jumped the list.
      const container = messagesContainerRef.current;
      restoreScrollRef.current = container
        ? container.scrollHeight - container.scrollTop
        : null;
      setError(null);

      // Merged rather than prepended: a page that overlaps what is on screen
      // would otherwise show its messages twice, duplicate keys and all.
      setMessages((prev) => mergeMessages(prev, page.messages));
      setHasMore(page.pagination.hasMore);
      setCursor(page.pagination.nextCursor);
    } catch (err) {
      console.error('[ChatPanel] Failed to load more messages:', err);
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
        user: {
          id: data.userId,
          displayName: data.userName,
          email: '',
          platformRole: PlatformRole.USER,
          globalAssetManager: false,
          templateEditor: false,
          mfaEnabled: false,
          avatarUrl: null,
          bio: null,
          createdAt: data.timestamp,
          updatedAt: data.timestamp,
          lastLoginAt: null,
        },
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
      setMessages((prev) => {
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

      setMessages((prev) => mergeMessages(prev, [systemMessage]));

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
  }, [socket, campaignId]);

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
  const deliver = async (clientId: string, content: string, type: MessageType) => {
    if (!socket) return;
    const id = pendingId(clientId);
    setNotSent((prev) => withoutKey(prev, id));
    const answer = await socket.sendChatMessage({ content, type, clientId });
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

  /** Send a message marked Not sent again, under the name it had. */
  const retry = (message: Message) => {
    void deliver(message.id.slice('temp-'.length), message.content, message.type);
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
    if (!messageInput.trim() || !canSend || !socket || !campaignId || !user) return;

    const content = messageInput.trim();
    const clientId = newClientId();

    const messageType: MessageType = userRole === 'DM' ? MessageType.DM : MessageType.PLAYER;

    const optimisticMessage: Message = {
      id: pendingId(clientId),
      campaignId,
      userId: user.id,
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        platformRole: user.platformRole,
        globalAssetManager: user.globalAssetManager,
        templateEditor: user.templateEditor,
        mfaEnabled: user.mfaEnabled,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
      },
      type: messageType,
      content,
      metadata: null,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    // Clear input and scroll
    setMessageInput('');
    setTimeout(() => scrollToBottom(true), 50);

    // Start rate limit cooldown
    startCooldown();

    void deliver(clientId, content, messageType);
  };

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
      <div className="flex items-center gap-2 p-4 border-b border-moss-green/20">
        <MessageCircle className="w-5 h-5 text-brand-ink" />
        <h3 className="text-lg font-semibold text-brand-ink">Chat</h3>
        {messages.length > 0 && (
          <span className="text-xs text-stone-gray/70 ml-auto">
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
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
            }`}
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
        {hasMore && messages.length > 0 && (
          <div className="text-center pb-2">
            <Button
              onClick={loadMoreMessages}
              disabled={isLoadingMore}
              variant="secondary" className="text-sm px-4 py-2"
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
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                isCurrentUser={message.userId === user?.id}
                isPending={message.id.startsWith('temp-') && !(message.id in notSent)}
                notSentReason={notSent[message.id]}
                onRetry={retry}
                onDiscard={discard}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
      {newBelow && <JumpToNewest onClick={jumpToNewest} />}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-moss-green/20">
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex gap-2">
            <textarea
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
              aria-label="Chat message"
              aria-describedby="chat-hint"
              className={`input-cozy flex-1 text-sm resize-none min-h-[60px] max-h-[120px] ${canSend ? '' : 'opacity-50 cursor-not-allowed'}`}
              rows={2}
              maxLength={MAX_MESSAGE_LENGTH}
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

          {/* Rate Limiting Feedback */}
          {!canSend && cooldownSeconds > 0 && (
            <p className="text-xs text-warning-ink text-center">
              Wait {cooldownSeconds}s before sending another message
            </p>
          )}
          {canSend && messageInput.length >= LENGTH_WARNING_AT && (
            <p className="text-xs text-warning-ink text-center" aria-live="polite">
              {messageInput.length} of {MAX_MESSAGE_LENGTH} characters
            </p>
          )}
          {canSend && messageInput.length < LENGTH_WARNING_AT && (
            <p id="chat-hint" className="text-xs text-stone-gray/70 text-center">
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
