// ============================================
// ChatMessageSkeleton
// Pulse skeleton matching ChatMessage layout
// ============================================

interface ChatMessageSkeletonProps {
  /** Vary line widths so adjacent skeletons don't look identical */
  variant?: 'short' | 'medium' | 'long';
}

export default function ChatMessageSkeleton({ variant = 'medium' }: ChatMessageSkeletonProps) {
  const bodyWidth = variant === 'short' ? 'w-2/3' : variant === 'long' ? 'w-full' : 'w-4/5';

  return (
    <div className="p-3 rounded-lg border border-stone-gray/10 bg-parchment/20 animate-pulse">
      {/* Header: username + timestamp */}
      <div className="flex items-center gap-2 mb-2">
        <div className="h-3 w-20 bg-stone-gray/20 rounded" />
        <div className="h-3 w-12 bg-stone-gray/10 rounded" />
      </div>

      {/* Message body */}
      <div className="space-y-1.5">
        <div className={`h-4 bg-stone-gray/10 rounded ${bodyWidth}`} />
        {variant !== 'short' && (
          <div className="h-4 bg-stone-gray/10 rounded w-3/5" />
        )}
      </div>
    </div>
  );
}
