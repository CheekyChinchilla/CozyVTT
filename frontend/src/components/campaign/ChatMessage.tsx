// ============================================
// Chat Message Component
// Displays individual chat messages with styling
// ============================================

import { memo } from 'react';
import { Bot, Shield } from 'lucide-react';
import type { Message, MessageType } from '@/types';

interface ChatMessageProps {
  message: Message;
  isCurrentUser?: boolean;
  /** True while the message is optimistically displayed before server confirmation */
  isPending?: boolean;
}

/**
 * Format timestamp as relative time (e.g., "2 minutes ago")
 */
function formatRelativeTime(timestamp: string): string {
  // Handle undefined, null, or empty timestamps
  if (!timestamp) {
    return 'unknown time';
  }

  const date = new Date(timestamp);

  // Check if date is invalid
  if (isNaN(date.getTime())) {
    console.warn('[ChatMessage] Invalid timestamp:', timestamp);
    return 'unknown time';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
  if (diffHour < 24) return `${diffHour} ${diffHour === 1 ? 'hour' : 'hours'} ago`;
  if (diffDay < 7) return `${diffDay} ${diffDay === 1 ? 'day' : 'days'} ago`;

  // If older than a week, show the date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

function ChatMessageInner({ message, isCurrentUser = false, isPending = false }: ChatMessageProps) {
  const { bg, textColor, borderColor } = getMessageStyle(message.type);
  const isSystem = message.type === 'SYSTEM';
  const isDM = message.type === 'DM';

  // Get display name
  const displayName = isSystem
    ? 'System'
    : message.user?.displayName || 'Unknown User';

  return (
    <div
      className={`p-3 rounded-lg border ${bg} ${borderColor} transition-all hover:shadow-sm ${
        isPending ? 'opacity-60' : ''
      }`}
    >
      {/* Message Header */}
      <div className="flex items-center gap-2 mb-1">
        {/* Icon for special message types */}
        {isSystem && <Bot className="w-3.5 h-3.5 text-brand-ink" />}
        {isDM && <Shield className="w-3.5 h-3.5 text-warning-ink" />}

        {/* Username */}
        <span
          className={`text-xs font-semibold ${
            isDM
              ? 'text-warning-ink'
              : isSystem
              ? 'text-brand-ink'
              : isCurrentUser
              ? 'text-brand-ink'
              : 'text-stone-gray'
          }`}
        >
          {displayName}
          {isCurrentUser && !isSystem && ' (You)'}
        </span>

        {/* Timestamp / pending indicator */}
        {isPending ? (
          <span className="text-xs text-stone-gray/50 italic">sending…</span>
        ) : (
          <span className="text-xs text-stone-gray/70" title={message.createdAt ? new Date(message.createdAt).toLocaleString() : 'Unknown time'}>
            {formatRelativeTime(message.createdAt)}
          </span>
        )}
      </div>

      {/* Message Content */}
      <p className={`text-sm ${textColor} whitespace-pre-wrap break-words`}>
        {message.content}
      </p>

      {/* Metadata (e.g., dice roll results) - hide for internal system actions */}
      {message.metadata &&
       Object.keys(message.metadata).length > 0 &&
       message.metadata.action !== 'user.joined' &&
       message.metadata.action !== 'user.left' &&
       message.metadata.action !== 'spirit_layer.toggle' &&
       message.metadata.action !== 'vibe.update' &&
       message.metadata.action !== 'session.started' &&
       message.metadata.action !== 'session.paused' &&
       message.metadata.action !== 'session.ended' &&
       message.metadata.action !== 'session.resumed' && (
        <div className="mt-2 pt-2 border-t border-current/10">
          <pre className="text-xs opacity-70 font-mono">
            {JSON.stringify(message.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// Memoised — chat panels can hold dozens of messages; without memo every new
// message causes the entire list to re-render. With memo only the new message
// and any that changed (e.g. pending → confirmed) re-render.
const ChatMessage = memo(ChatMessageInner);
export default ChatMessage;
