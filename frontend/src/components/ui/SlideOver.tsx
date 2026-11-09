// ============================================
// SlideOver — the shared side panel dialog
//
// A panel that slides in from the right or left edge over a backdrop. Like
// <Modal> it portals to <body>, is a labelled modal dialog, keeps Tab inside
// and closes on Escape (only the top dialog acts on the key, so a dialog the
// panel opens closes alone). Each panel keeps its own header: put its heading
// in <SlideOverTitle>, which names the dialog, and its X in <SlideOverClose>.
//
// The backdrop is a layer below the panel (z-40 under z-50). On the campaign
// page's compact layout it is on the panel's layer, before the panel: the
// sheets there are z-50 (compact/BottomSheet.tsx), and a panel opened over
// one must dim and block it.
// ============================================

import { createContext, useContext, useId, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useIsPresent } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useCompactLayout } from '@/contexts/LayoutContext';
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
  const compact = useCompactLayout();

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
              className={cn(compact ? 'fixed inset-0 z-50 backdrop-blur-xs' : 'fixed inset-0 z-40 backdrop-blur-xs', backdropClassName)}
              onClick={onClose}
              aria-hidden="true"
            />
            <SlideOverPanel key="slide-over-panel" onClose={onClose} side={side} className={className} titleId={titleId}>
              {children}
            </SlideOverPanel>
          </>
        )}
      </AnimatePresence>
    </SlideOverContext.Provider>,
    document.body
  );
}

interface SlideOverPanelProps {
  onClose: () => void;
  side: 'right' | 'left';
  className: string | undefined;
  titleId: string;
  children: ReactNode;
}

function SlideOverPanel({ onClose, side, className, titleId, children }: SlideOverPanelProps) {
  // The panel stays on screen while it slides or fades out, whether it was
  // closed or a parent AnimatePresence removed it; the trap lets go as the
  // exit starts, so Escape then reaches what is under it and the panel is
  // not closed twice. Read here, under the AnimatePresence above: a hook in
  // SlideOver itself would re-render that AnimatePresence mid-exit, which
  // draws the exiting panel twice.
  const isPresent = useIsPresent();
  // Escape closes from inside a field. Leave the field first, as clicking
  // Close does, so a field that saves when it is left saves its value.
  const panelRef = useFocusTrap(isPresent, () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    onClose();
  });
  const offscreen = side === 'right' ? '100%' : '-100%';
  const panelExit = useMotionExit({ x: offscreen, opacity: 0 });

  return (
    <motion.div
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

/**
 * The panel's X button, named "Close". On a touch screen it is at least 44 by
 * 44 px with its icon centred, as <Button iconOnly> is; with a mouse it keeps
 * the size the panel's own look gives it.
 */
export function SlideOverClose({ className, iconClassName = 'w-5 h-5', title }: SlideOverCloseProps) {
  const { close } = useSlideOver('SlideOverClose');
  return (
    <button
      type="button"
      onClick={close}
      className={cn('touch-target pointer-coarse:[&>svg]:mx-auto', className)}
      title={title}
      aria-label="Close"
    >
      <X className={iconClassName} aria-hidden="true" />
    </button>
  );
}
