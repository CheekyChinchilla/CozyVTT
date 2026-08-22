// ============================================
// ConfirmDialog — accessible replacement for window.confirm()
// Confirmation dialog with destructive/warning/info variants, rendered on
// the shared <Modal> primitive (overlay layer so it stacks above other
// modals). Public API unchanged from the original hand-rolled version.
// ============================================

import { useCallback } from 'react';
import { AlertTriangle, AlertCircle, HelpCircle, Loader2 } from 'lucide-react';
import { Button, Modal } from '@/components/ui';

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
    icon: <AlertTriangle className="w-6 h-6 text-danger" aria-hidden="true" />,
    iconBg: 'bg-danger/10',
    confirmClass: 'bg-danger hover:bg-danger/85 focus:ring-danger text-white',
  },
  warning: {
    icon: <AlertCircle className="w-6 h-6 text-warm-amber" aria-hidden="true" />,
    iconBg: 'bg-warm-amber/10',
    confirmClass: 'bg-warm-amber hover:bg-sunset-orange focus:ring-warm-amber text-white',
  },
  info: {
    icon: <HelpCircle className="w-6 h-6 text-brand-ink" aria-hidden="true" />,
    iconBg: 'bg-brand/10',
    confirmClass: 'bg-brand hover:bg-brand-dark focus:ring-brand text-white',
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

  const { icon, iconBg, confirmClass } = VARIANT_CONFIG[variant];

  return (
    <Modal
      open={isOpen}
      onClose={handleCancel}
      title={title}
      size="sm"
      layer="overlay"
      closeDisabled={isLoading}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={handleCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
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
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div className={`p-2.5 rounded-full ${iconBg} flex-shrink-0`} aria-hidden="true">
          {icon}
        </div>
        <p className="text-sm text-ink-secondary pt-2">{message}</p>
      </div>
    </Modal>
  );
}
