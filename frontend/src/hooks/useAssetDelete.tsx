// ============================================
// useAssetDelete
//
// Deleting an asset in two steps, for every screen that offers it. The caller
// asks its own "delete this?" and then calls `deleteAsset`. If the server says
// the asset is still in use, nothing has been deleted and `inUseDialog` shows
// where it is used; only confirming that sends the delete again with `force`.
// Every other failure goes to `onError`, so a refusal is never silent.
// ============================================

import { useCallback, useState, type ReactNode } from 'react';
import { api } from '@/services/api';
import AssetInUseDialog from '@/components/assets/AssetInUseDialog';
import type { AssetUse } from '@/types';
import { apiAssetInUse, apiErrorMessage } from '@/utils/errors';

interface AssetRef {
  id: string;
  name: string;
}

interface Options {
  /** The asset is gone, whether on the first request or after being forced. */
  onDeleted: (asset: AssetRef) => void;
  /** The server refused for any reason other than the asset being in use. */
  onError: (message: string) => void;
  /** What to say when the server's refusal carries no message of its own. */
  failureMessage?: string;
}

interface Pending {
  asset: AssetRef;
  usage: AssetUse[];
  omitted: number;
}

export function useAssetDelete({ onDeleted, onError, failureMessage = 'Failed to delete the asset.' }: Options): {
  /** Resolves once the first request is answered; a forced delete finishes in the dialog. */
  deleteAsset: (asset: AssetRef) => Promise<void>;
  /** Render this once, anywhere in the screen. */
  inUseDialog: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const [forcing, setForcing] = useState(false);

  const deleteAsset = useCallback(
    async (asset: AssetRef) => {
      try {
        await api.deleteAsset(asset.id);
        onDeleted(asset);
      } catch (err) {
        const inUse = apiAssetInUse(err);
        if (inUse) setPending({ asset, ...inUse });
        else onError(apiErrorMessage(err) ?? failureMessage);
      }
    },
    [onDeleted, onError, failureMessage]
  );

  const forceDelete = useCallback(async () => {
    if (!pending) return;
    setForcing(true);
    try {
      await api.deleteAsset(pending.asset.id, { force: true });
      setPending(null);
      onDeleted(pending.asset);
    } catch (err) {
      setPending(null);
      onError(apiErrorMessage(err) ?? failureMessage);
    } finally {
      setForcing(false);
    }
  }, [pending, onDeleted, onError, failureMessage]);

  const inUseDialog = (
    <AssetInUseDialog
      isOpen={pending !== null}
      assetName={pending?.asset.name ?? ''}
      usage={pending?.usage ?? []}
      omitted={pending?.omitted ?? 0}
      isLoading={forcing}
      onConfirm={forceDelete}
      onCancel={() => setPending(null)}
    />
  );

  return { deleteAsset, inUseDialog };
}
