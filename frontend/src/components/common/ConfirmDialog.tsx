// ============================================
// ConfirmDialog — accessible replacement for window.confirm()
// Glassmorphism-styled confirmation modal with destructive/warning/info variants.
// ============================================

import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, AlertCircle, HelpCircle, Loader2, X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export type ConfirmVariant = 'danger' | 'warning' | 'info';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  /** Label for the confirm action button (default: "Confirm") */
  confirmLabel?: string;
  /** Label for the cancel button (default: "Cancel") */
  cancelLabel?: string;
  /** Visual style of the confirm button (default: "danger") */
  variant?: ConfirmVariant;
  /** Show spinner and disable buttons while action is in progress */
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_CONFIG: Record<ConfirmVariant, {
  icon: React.ReactNode;
  iconBg: string;
  confirmClass: string;
}> = {
  danger: {
    icon: <AlertTriangle className="w-6 h-6 text-red-600" aria-hidden="true" />,
    iconBg: 'bg-red-100',
    confirmClass: 'bg-red-500 hover:bg-red-600 focus:ring-red-500 text-white',
  },
  warning: {
    icon: <AlertCircle className="w-6 h-6 text-amber-600" aria-hidden="true" />,
    iconBg: 'bg-amber-100',
    confirmClass: 'bg-warm-amber hover:bg-sunset-orange focus:ring-warm-amber text-white',
  },
  info: {
    icon: <HelpCircle className="w-6 h-6 text-moss-green" aria-hidden="true" />,
    iconBg: 'bg-moss-green/10',
    confirmClass: 'bg-moss-green hover:bg-forest-shadow focus:ring-moss-green text-white',
  },
};

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const handleCancel = useCallback(() => {
    if (!isLoading) onCancel();
  }, [isLoading, onCancel]);

  const modalRef = useFocusTrap(isOpen, handleCancel);
  const { icon, iconBg, confirmClass } = VARIANT_CONFIG[variant];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
            onClick={handleCancel}
            aria-hidden="true"
          />

          {/* Dialog */}
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              ref={modalRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              aria-describedby="confirm-dialog-message"
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-sm p-6 relative rounded-xl border border-moss-green/20 shadow-2xl"
              style={{
                background: 'rgba(254, 243, 199, 0.98)',
                backdropFilter: 'blur(12px)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                type="button"
                onClick={handleCancel}
                disabled={isLoading}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-warm-gray/10 transition-colors
                           disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-moss-green"
                aria-label="Cancel and close"
              >
                <X className="w-4 h-4 text-stone-gray" aria-hidden="true" />
              </button>

              {/* Icon + Title */}
              <div className="flex items-start gap-4 mb-4 pr-8">
                <div className={`p-2.5 rounded-full ${iconBg} flex-shrink-0`}>
                  {icon}
                </div>
                <div>
                  <h2
                    id="confirm-dialog-title"
                    className="text-lg font-semibold text-moss-green font-heading"
                  >
                    {title}
                  </h2>
                  <p
                    id="confirm-dialog-message"
                    className="mt-1 text-sm text-warm-gray"
                  >
                    {message}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-end mt-6">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isLoading}
                  className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cancelLabel}
                </button>

                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={isLoading}
                  aria-busy={isLoading}
                  className={`px-4 py-2 rounded-cozy font-medium transition-colors duration-200
                              focus:outline-none focus:ring-2 focus:ring-offset-2
                              disabled:opacity-50 disabled:cursor-not-allowed
                              flex items-center gap-2 ${confirmClass}`}
                >
                  {isLoading && (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  )}
                  {confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
