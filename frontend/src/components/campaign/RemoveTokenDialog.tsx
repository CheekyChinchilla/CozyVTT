// ============================================
// RemoveTokenDialog
//
// Removing a token from the map deletes it: its hit points, conditions and
// notes go with it, and there is no undo. Every place that offers the action
// asks through this one dialog so the wording cannot drift.
// ============================================

import ConfirmDialog from '@/components/common/ConfirmDialog';

interface RemoveTokenDialogProps {
  /** The token about to be removed, or null while the dialog is closed. */
  token: { name: string } | null;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function RemoveTokenDialog({ token, isLoading = false, onConfirm, onCancel }: RemoveTokenDialogProps) {
  return (
    <ConfirmDialog
      isOpen={token !== null}
      title="Remove token"
      message={`Remove "${token?.name ?? ''}" from this map? The token is deleted along with its hit points, conditions and notes, and this cannot be undone.`}
      confirmLabel="Remove"
      variant="danger"
      isLoading={isLoading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
