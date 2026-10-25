// ============================================
// Jump to newest: the way back down a log that has moved on
// ============================================

import { ArrowDown } from 'lucide-react';

interface JumpToNewestProps {
  onClick: () => void;
}

/**
 * Shown over the bottom of the chat or the dice log while the reader is
 * scrolled up and something new has arrived below, which the log does not
 * scroll to on its own then. A click goes to the newest.
 */
export default function JumpToNewest({ onClick }: JumpToNewestProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ink text-canvas text-xs font-medium shadow-lg hover:opacity-90 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
    >
      <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
      Jump to newest
    </button>
  );
}
