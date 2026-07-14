// ============================================
// Tooltip — lightweight hover/focus label
//
// CSS-positioned (no floating-ui dependency): shows a small themed bubble
// above the wrapped element on hover or keyboard focus, after a short
// delay. Honors prefers-reduced-motion (fade is a transition, and framer
// isn't involved). Intended for icon-only toolbar buttons — pair with
// <Button iconOnly aria-label>.
// ============================================

import { useId, useRef, useState } from 'react';
import { cn } from '@/utils/cn';

export interface TooltipProps {
  /** Tooltip text. Keep it short — this is a label, not documentation. */
  content: string;
  /** Delay before showing, ms. */
  delay?: number;
  /** Placement relative to the wrapped element. */
  side?: 'top' | 'bottom';
  children: React.ReactNode;
}

export default function Tooltip({ content, delay = 400, side = 'top', children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(false);
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={visible ? id : undefined}
    >
      {children}
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 -translate-x-1/2 z-[70]',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          'whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium',
          'bg-ink text-canvas shadow-lg',
          'transition-opacity duration-150',
          visible ? 'opacity-100' : 'opacity-0'
        )}
      >
        {content}
      </span>
    </span>
  );
}
