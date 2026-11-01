// ============================================
// Chat Message Component
// Displays individual chat messages with styling
// ============================================

import { memo } from 'react';
import { useMinuteClock } from '@/hooks/useMinuteClock';
import { useCompactLayout } from '@/contexts/LayoutContext';
import { Bot, Lock, Shield } from 'lucide-react';
import type { Message, MessageType } from '@/types';
import { formatRelativeTime } from '@/utils/format';

interface ChatMessageProps {
  message: Message;
  isCurrentUser?: boolean;
  /** True while the message is optimistically displayed before server confirmation */
  isPending?: boolean;
  /** Why the server did not take this message, when it did not. */
  notSentReason?: string;
  onRetry?: (message: Message) => void;
  onDiscard?: (message: Message) => void;
  /** On a whisper: "Whisper to Mara" or "Whisper from Mara". */
  whisperLabel?: string;
  /** On a whisper: the other person's name, for "Only you and Mara can see this". */
  whisperPeer?: string;
  /** The campaign's DM sent it: a DM's whisper keeps the DM's shield. */
  sentByDM?: boolean;
  /** Choosing a whisper's name whispers back to the other person, while they are a member. */
  onWhisperBack?: (message: Message) => void;
}

/**
 * How long ago a message was sent ("2 minutes ago"), or the date past a week.
 */
function messageAge(timestamp: string, now: number): string {
  // Handle undefined, null, or empty timestamps
  if (!timestamp) {
    return 'unknown time';
  }

  // Check if date is invalid
  if (isNaN(new Date(timestamp).getTime())) {
    console.warn('[ChatMessage] Invalid timestamp:', timestamp);
    return 'unknown time';
  }

  return formatRelativeTime(timestamp, { now, words: true, dateAfterDays: 7 });
}

/**
 * Get message styling based on type
 */
function getMessageStyle(type: MessageType): { bg: string; textColor: string; borderColor: string } {
  switch (type) {
    case 'DM':
      return {
        bg: 'bg-warning/10',
        textColor: 'text-warning-ink',
        borderColor: 'border-warning/30',
      };
    case 'SYSTEM':
      return {
        bg: 'bg-moss-green/10',
        textColor: 'text-brand-ink',
        borderColor: 'border-moss-green/20',
      };
    case 'DICE_ROLL':
      return {
        bg: 'bg-info/10',
        textColor: 'text-info-ink',
        borderColor: 'border-info/30',
      };
    case 'CHARACTER_ACTION':
      return {
        bg: 'bg-spirit/10',
        textColor: 'text-spirit-ink',
        borderColor: 'border-spirit/30',
      };
    default: // PLAYER
      return {
        bg: 'bg-parchment/40',
        textColor: 'text-stone-gray',
        borderColor: 'border-stone-gray/20',
      };
  }
}

/** A whisper's tint, whoever sent it. */
const WHISPER_STYLE = { bg: 'bg-accent/10', textColor: 'text-stone-gray', borderColor: 'border-accent/30' };

function ChatMessageInner({ message, isCurrentUser = false, isPending = false, notSentReason, onRetry, onDiscard, whisperLabel, whisperPeer, sentByDM = false, onWhisperBack }: ChatMessageProps) {
  // The row is memoised, so without this its "just now" never moved on.
  const now = useMinuteClock();
  const isWhisper = whisperLabel !== undefined;
  const { bg, textColor, borderColor } = isWhisper ? WHISPER_STYLE : getMessageStyle(message.type);
  const isSystem = message.type === 'SYSTEM';
  const isDM = message.type === 'DM';
  const showShield = isDM || (isWhisper && sentByDM);

  // Get display name
  const displayName = isSystem
    ? 'System'
    : message.user?.displayName || 'Unknown User';

  const compact = useCompactLayout();

  const nameColor = isDM ? 'text-warning-ink' : isSystem || isCurrentUser ? 'text-brand-ink' : 'text-stone-gray';
  const onlyYou = `Only you and ${whisperPeer} can see this.`;
  const sentAt = message.createdAt ? new Date(message.createdAt).toLocaleString() : 'Unknown time';

  const notSentRow = notSentReason && (
    <div className={`${compact ? 'mt-1' : 'mt-2'} flex flex-wrap items-center gap-2 text-xs`} role="status">
      <span className="text-danger-ink">Not sent: {notSentReason}</span>
      <button type="button" onClick={() => onRetry?.(message)} className="font-medium text-brand-ink underline hover:no-underline">
        Retry
      </button>
      <button type="button" onClick={() => onDiscard?.(message)} className="font-medium text-stone-gray underline hover:no-underline">
        Discard
      </button>
    </div>
  );

  // Metadata (e.g., dice roll results) - hide for internal system actions
  const metadataBlock = message.metadata &&
    Object.keys(message.metadata).length > 0 &&
    message.metadata.action !== 'user.joined' &&
    message.metadata.action !== 'user.left' &&
    message.metadata.action !== 'spirit_layer.toggle' &&
    message.metadata.action !== 'vibe.update' &&
    message.metadata.action !== 'session.started' &&
    message.metadata.action !== 'session.paused' &&
    message.metadata.action !== 'session.ended' &&
    message.metadata.action !== 'session.resumed' && (
      <div className="mt-2 pt-2 border-t">
        <pre className="text-xs opacity-70 font-mono">
          {JSON.stringify(message.metadata, null, 2)}
        </pre>
      </div>
    );

  /**
   * The compact layout's chat, where a sheet half a phone's height should
   * show several messages: the sender and the time start the message's own
   * line, at the size they have on the desktop, and the padding is slimmer.
   * The icons, the colours, a whisper's way to whisper back and Not sent are
   * the desktop's.
   */
  if (compact) {
    const icon = 'mr-1 inline h-3.5 w-3.5 align-[-0.15em]';
    return (
      <div
        data-message-id={message.id}
        className={`rounded-lg border px-2.5 py-1 ${bg} ${borderColor} ${isPending ? 'opacity-60' : ''} ${notSentReason ? 'border-danger/40' : ''}`}
      >
        <p className={`text-sm ${textColor} whitespace-pre-wrap wrap-break-word`}>
          {isSystem && <Bot className={`${icon} text-brand-ink`} />}
          {isWhisper && (
            <span title={onlyYou} className="inline">
              <Lock className={`${icon} text-accent-ink`} aria-hidden="true" />
            </span>
          )}
          {showShield && <Shield className={`${icon} text-warning-ink`} />}
          {isWhisper ? (
            <>
              {onWhisperBack ? (
                // A finger's height, without making the line taller.
                <button
                  type="button"
                  onClick={() => onWhisperBack(message)}
                  title={`Whisper to ${whisperPeer}`}
                  className="-my-3 inline-flex items-center align-middle text-xs font-semibold text-accent-ink underline-offset-2 hover:underline"
                >
                  {whisperLabel}
                </button>
              ) : (
                <span className="text-xs font-semibold text-accent-ink">{whisperLabel}</span>
              )}
              <span className="sr-only">{onlyYou}</span>
            </>
          ) : (
            <span className={`text-xs font-semibold ${nameColor}`}>
              {displayName}
              {isCurrentUser && !isSystem && ' (You)'}
            </span>
          )}
          {/* The text keeps its own spaces and line breaks, so one space each. */}
          {notSentReason ? null : isPending ? (
            <>
              {' '}
              <span className="whitespace-nowrap text-xs text-stone-gray/50 italic">sending…</span>
            </>
          ) : (
            <>
              {' '}
              <span className="whitespace-nowrap text-xs text-stone-gray/70" title={sentAt}>
                {messageAge(message.createdAt, now)}
              </span>
            </>
          )}{' '}
          {message.content}
        </p>
        {notSentRow}
        {metadataBlock}
      </div>
    );
  }

  return (
    <div
      data-message-id={message.id}
      className={`p-3 rounded-lg border ${bg} ${borderColor} transition-all hover:shadow-xs ${
        isPending ? 'opacity-60' : ''
      } ${notSentReason ? 'border-danger/40' : ''}`}
    >
      {/* Message Header */}
      <div className="flex items-center gap-2 mb-1">
        {/* Icon for special message types */}
        {isSystem && <Bot className="w-3.5 h-3.5 text-brand-ink" />}
        {isWhisper && (
          <span title={onlyYou} className="inline-flex shrink-0">
            <Lock className="w-3.5 h-3.5 text-accent-ink" aria-hidden="true" />
          </span>
        )}
        {showShield && <Shield className="w-3.5 h-3.5 shrink-0 text-warning-ink" />}

        {isWhisper ? (
          <>
            {onWhisperBack ? (
              <button
                type="button"
                onClick={() => onWhisperBack(message)}
                title={`Whisper to ${whisperPeer}`}
                className="min-w-0 text-left text-xs font-semibold text-accent-ink underline-offset-2 hover:underline"
              >
                {whisperLabel}
              </button>
            ) : (
              <span className="min-w-0 text-left text-xs font-semibold text-accent-ink">{whisperLabel}</span>
            )}
            <span className="sr-only">{onlyYou}</span>
          </>
        ) : (
        /* Username */
        <span className={`text-xs font-semibold ${nameColor}`}>
          {displayName}
          {isCurrentUser && !isSystem && ' (You)'}
        </span>
        )}

        {/* Timestamp / pending indicator */}
        {notSentReason ? null : isPending ? (
          <span className="shrink-0 whitespace-nowrap text-xs text-stone-gray/50 italic">sending…</span>
        ) : (
          <span className="shrink-0 whitespace-nowrap text-xs text-stone-gray/70" title={sentAt}>
            {messageAge(message.createdAt, now)}
          </span>
        )}
      </div>

      {/* Message Content */}
      <p className={`text-sm ${textColor} whitespace-pre-wrap wrap-break-word`}>
        {message.content}
      </p>

      {notSentRow}

      {metadataBlock}
    </div>
  );
}

// Memoised — chat panels can hold dozens of messages; without memo every new
// message causes the entire list to re-render. With memo only the new message
// and any that changed (e.g. pending → confirmed) re-render.
const ChatMessage = memo(ChatMessageInner);
export default ChatMessage;
