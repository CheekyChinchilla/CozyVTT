// ============================================
// AssetInUseDialog
//
// The second question when deleting an asset the server says is still used:
// where it is used, and whether to delete it anyway. The first question, "delete
// this?", is each caller's own.
// ============================================

import ConfirmDialog from '@/components/common/ConfirmDialog';
import type { AssetUse } from '@/types';
import { describeAssetUse } from '@/utils/assetUse';

interface AssetInUseDialogProps {
  isOpen: boolean;
  assetName: string;
  usage: AssetUse[];
  /** Uses the server counted but did not list. */
  omitted: number;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function AssetInUseDialog({
  isOpen,
  assetName,
  usage,
  omitted,
  isLoading,
  onConfirm,
  onCancel,
}: AssetInUseDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      title="Asset is in use"
      message={`"${assetName}" is still in use. If you delete it anyway, the file is removed for good and each place listed below is left without it.`}
      confirmLabel="Delete anyway"
      variant="danger"
      isLoading={isLoading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <ul className="list-disc pl-5 space-y-0.5 text-sm text-ink max-h-48 overflow-y-auto">
        {usage.map((use, index) => (
          <li key={index}>{describeAssetUse(use)}</li>
        ))}
        {omitted > 0 && <li>and {omitted} more</li>}
      </ul>
    </ConfirmDialog>
  );
}
