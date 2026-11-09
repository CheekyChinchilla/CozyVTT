// ============================================
// Modal — the shared dialog primitive
//
// Lifts the scaffold every hand-rolled modal previously duplicated
// (AnimatePresence + backdrop + focus trap + labelled dialog + X button),
// styled with theme tokens so all 28 themes recolor it — NOT the old
// hardcoded parchment rgba() that broke non-default themes.
// ============================================

import { useId } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useMotionExit } from '@/utils/motion';
import { X, type LucideIcon } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/utils/cn';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  open: boolean;
  /**
   * Called on Escape and the X button. A click beside the window never closes
   * it, so typed input survives a stray click.
   */
  onClose: () => void;
  /** Dialog heading — wired to aria-labelledby. */
  title: string;
  /** Optional lucide icon shown beside the title in a soft brand chip. */
  icon?: LucideIcon;
  size?: ModalSize;
  /** Right-aligned action row rendered below the body. */
  footer?: React.ReactNode;
  /** Disables closing (X/Escape) while an operation is in flight. */
  closeDisabled?: boolean;
  /** z-index tier — 'overlay' sits above other modals (confirm-on-modal). */
  layer?: 'base' | 'overlay';
  /**
   * Pin the dialog to the viewport and let only the body scroll. Header and
   * footer stay in view whatever the body holds. By default the whole dialog
   * scrolls, which suits a long form; a reader with a footer of controls wants
   * this instead, or the controls end up below the fold. The body's children
   * should size themselves with flex-1 and min-h-0.
   */
  fitViewport?: boolean;
  children: React.ReactNode;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export default function Modal({
  open,
  onClose,
  title,
  icon: Icon,
  size = 'md',
  footer,
  closeDisabled = false,
  layer = 'base',
  children,
  fitViewport = false,
}: ModalProps) {
  const titleId = useId();
  const dialogExit = useMotionExit({ opacity: 0, scale: 0.95, y: 20 });

  const handleClose = () => {
    if (!closeDisabled) onClose();
  };

  const modalRef = useFocusTrap(open, handleClose);
  // The backdrop shares the dialog's layer, so a window opened from a side
  // panel (z-50, see SlideOver) dims the panel too; it comes later in the
  // page, so it is drawn over it.
  const zBackdrop = layer === 'overlay' ? 'z-60' : 'z-50';
  const zDialog = layer === 'overlay' ? 'z-60' : 'z-50';

  // Portal to <body>: ancestors with transform/filter/backdrop-filter (e.g.
  // .glass-panel) create containing blocks that would trap position:fixed
  // children and clip the dialog inside scrollable panels.
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn('fixed inset-0 bg-black/50 backdrop-blur-xs', zBackdrop)}
            aria-hidden="true"
          />

          {/* Dialog. On a phone (below sm) its margin is 8 px where it was
              16, its padding 16 px where it was 24, and its footer's buttons
              wrap; from sm up it is laid out as it always was.
              Its height is a share of what the browser shows (dvh), so a
              phone's toolbar never covers its foot. */}
          <div className={cn('fixed inset-0 flex items-center justify-center p-2 sm:p-4', zDialog)}>
            <motion.div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={dialogExit}
              transition={{ duration: 0.2 }}
              className={cn(
                'w-full p-4 sm:p-6 relative rounded-cozy-lg border border-brand/20 shadow-2xl',
                'bg-surface-light/95 backdrop-blur-cozy',
                fitViewport ? 'h-[90dvh] flex flex-col overflow-hidden' : 'max-h-[90dvh] overflow-y-auto',
                SIZE_CLASSES[size]
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6 shrink-0">
                <div className="flex items-center gap-3">
                  {Icon && (
                    <div className="p-2 rounded-lg bg-brand/10" aria-hidden="true">
                      <Icon className="w-6 h-6 text-brand-ink" />
                    </div>
                  )}
                  <h2 id={titleId} className="text-2xl font-semibold text-brand-ink font-heading">
                    {title}
                  </h2>
                </div>

                {/* 44 by 44 for a finger on a touch screen, as <Button iconOnly> is. */}
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={closeDisabled}
                  className="p-2 rounded-lg hover:bg-ink/10 transition-colors touch-target pointer-coarse:[&>svg]:mx-auto
                             disabled:opacity-50 disabled:cursor-not-allowed
                             focus:outline-hidden focus:ring-2 focus:ring-brand"
                  aria-label="Close dialog"
                >
                  <X className="w-5 h-5 text-ink-muted" aria-hidden="true" />
                </button>
              </div>

              {/* Body */}
              {fitViewport ? <div className="flex-1 min-h-0 flex flex-col">{children}</div> : children}

              {/* Footer */}
              {footer && <div className="flex flex-wrap sm:flex-nowrap gap-3 justify-end pt-4 shrink-0">{footer}</div>}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
