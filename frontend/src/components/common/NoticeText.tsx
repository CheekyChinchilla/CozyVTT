// ============================================
// NoticeText: one credit line, its web addresses made links
// ============================================
//
// A line from constants/gameContentNotices.ts, as a paragraph whose text is
// the line exactly, so what is shown is the wording its licence asks for.
// Each address written out in full (https://...) is a link that opens in a
// new tab; a full stop, comma or bracket after it stays text.

import { cn } from '@/utils/cn';

/** A web address, ending before any punctuation that closes the sentence around it. */
const ADDRESS = /(https?:\/\/[^\s()]*[^\s().,;:])/;

interface NoticeTextProps {
  text: string;
  className?: string;
}

export default function NoticeText({ text, className }: NoticeTextProps) {
  // Splitting on a pattern with one group puts each address at an odd index.
  const parts = text.split(ADDRESS);
  return (
    <p className={cn('wrap-anywhere', className)}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-brand-ink focus:outline-hidden focus:ring-2 focus:ring-brand rounded-xs"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </p>
  );
}
