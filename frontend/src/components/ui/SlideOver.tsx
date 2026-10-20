// ============================================
// SlideOver — the shared side panel dialog
//
// A panel that slides in from the right or left edge over a backdrop. Like
// <Modal> it portals to <body>, is a labelled modal dialog, keeps Tab inside
// and closes on Escape (only the top dialog acts on the key, so a dialog the
// panel opens closes alone). Each panel keeps its own header: put its heading
// in <SlideOverTitle>, which names the dialog, and its X in <SlideOverClose>.
// ============================================

import { createContext, useContext, useId, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useMotionExit } from '@/utils/motion';
import { cn } from '@/utils/cn';

export interface SlideOverProps {
  open: boolean;
  /** Called on backdrop click, Escape, and the Close button. */
  onClose: () => void;
  /** The edge the panel slides in from. Default 'right'. */
  side?: 'right' | 'left';
  /** Width, surface, shadow, scrolling and layout of the panel. */
  className?: string;
  /** The backdrop's tint. Default 'bg-black/50'. */
  backdropClassName?: string;
  children: ReactNode;
}

interface SlideOverContextValue {
  titleId: string;
  close: () => void;
}

const SlideOverContext = createContext<SlideOverContextValue | null>(null);

function useSlideOver(part: string): SlideOverContextValue {
  const value = useContext(SlideOverContext);
  if (!value) throw new Error(`${part} must be inside a SlideOver`);
  return value;
}

export default function SlideOver({
  open,
  onClose,
  side = 'right',
  className,
  backdropClassName = 'bg-black/50',
  children,
}: SlideOverProps) {
  const titleId = useId();
  const panelRef = useFocusTrap(open, onClose);
  const offscreen = side === 'right' ? '100%' : '-100%';
  const panelExit = useMotionExit({ x: offscreen, opacity: 0 });

  // Portal to <body>: ancestors with transform/filter/backdrop-filter create
  // containing blocks that would trap position:fixed children. `propagate`
  // plays the exit when a parent AnimatePresence removes the whole panel.
  return createPortal(
    <SlideOverContext.Provider value={{ titleId, close: onClose }}>
      <AnimatePresence propagate>
        {open && (
          <>
            <motion.div
              key="slide-over-backdrop"
              data-testid="slide-over-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn('fixed inset-0 z-40 backdrop-blur-xs', backdropClassName)}
              onClick={onClose}
              aria-hidden="true"
            />
            <motion.div
              key="slide-over-panel"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ x: offscreen, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={panelExit}
              transition={{ type: 'spring', damping: 30, stiffness: 300, opacity: { duration: 0.2 } }}
              className={cn('fixed top-0 z-50 h-full w-full', side === 'right' ? 'right-0' : 'left-0', className)}
            >
              {children}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </SlideOverContext.Provider>,
    document.body
  );
}

/** The panel's heading, which names the dialog. Renders an h2. */
export function SlideOverTitle({ children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  const { titleId } = useSlideOver('SlideOverTitle');
  return (
    <h2 {...rest} id={titleId}>
      {children}
    </h2>
  );
}

export interface SlideOverCloseProps {
  /** The button's look; each panel keeps the one it had. */
  className?: string;
  /** The X icon's size and colour. Default 'w-5 h-5'. */
  iconClassName?: string;
  /** Hover text. */
  title?: string;
}

/** The panel's X button, named "Close". */
export function SlideOverClose({ className, iconClassName = 'w-5 h-5', title }: SlideOverCloseProps) {
  const { close } = useSlideOver('SlideOverClose');
  return (
    <button type="button" onClick={close} className={className} title={title} aria-label="Close">
      <X className={iconClassName} aria-hidden="true" />
    </button>
  );
}
