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
import { X, type LucideIcon } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/utils/cn';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  open: boolean;
  /** Called on backdrop click, Escape, and the X button. */
  onClose: () => void;
  /** Dialog heading — wired to aria-labelledby. */
  title: string;
  /** Optional lucide icon shown beside the title in a soft brand chip. */
  icon?: LucideIcon;
  size?: ModalSize;
  /** Right-aligned action row rendered below the body. */
  footer?: React.ReactNode;
  /** Disables closing (backdrop/X/Escape) while an operation is in flight. */
  closeDisabled?: boolean;
  /** Set false for confirm-style dialogs that must not close on backdrop click. */
  closeOnBackdrop?: boolean;
  /** z-index tier — 'overlay' sits above other modals (confirm-on-modal). */
  layer?: 'base' | 'overlay';
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
  closeOnBackdrop = true,
  layer = 'base',
  children,
}: ModalProps) {
  const titleId = useId();

  const handleClose = () => {
    if (!closeDisabled) onClose();
  };

  const modalRef = useFocusTrap(open, handleClose);
  const zBackdrop = layer === 'overlay' ? 'z-[60]' : 'z-40';
  const zDialog = layer === 'overlay' ? 'z-[60]' : 'z-50';

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
            className={cn('fixed inset-0 bg-black/50 backdrop-blur-sm', zBackdrop)}
            onClick={closeOnBackdrop ? handleClose : undefined}
            aria-hidden="true"
          />

          {/* Dialog */}
          <div className={cn('fixed inset-0 flex items-center justify-center p-4', zDialog)}>
            <motion.div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'w-full p-6 relative rounded-cozy-lg border border-brand/20 shadow-2xl',
                'bg-surface-light/95 backdrop-blur-cozy',
                'max-h-[90vh] overflow-y-auto',
                SIZE_CLASSES[size]
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
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

                <button
                  type="button"
                  onClick={handleClose}
                  disabled={closeDisabled}
                  className="p-2 rounded-lg hover:bg-ink/10 transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed
                             focus:outline-none focus:ring-2 focus:ring-brand"
                  aria-label="Close dialog"
                >
                  <X className="w-5 h-5 text-ink-muted" aria-hidden="true" />
                </button>
              </div>

              {/* Body */}
              {children}

              {/* Footer */}
              {footer && <div className="flex gap-3 justify-end pt-4">{footer}</div>}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
