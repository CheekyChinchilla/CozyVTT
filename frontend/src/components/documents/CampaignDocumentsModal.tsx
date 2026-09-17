/**
 * The documents shared with this campaign, from inside the campaign.
 *
 * Every member sees the same list and can read any of it; that is what sharing
 * means. The DM also shares and unshares here, choosing from documents they can
 * already read: their own uploads and anything global. The server checks that
 * again on its own, so this picker cannot offer a document the DM has no right
 * to hand out.
 *
 * The one place in a session a player can open a file at all. Every other asset
 * surface is the DM's, which is right for maps and tokens and wrong for a
 * rulebook the whole table is meant to read.
 */

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, ExternalLink, FilePlus, Link2, Loader2, Unlink, Upload } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import DocumentReader, { documentFormat, FORMAT_LABEL } from './DocumentReader';
import NewDocumentDialog from './NewDocumentDialog';
import AssetUploadModal from '@/components/assets/AssetUploadModal';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import { AssetType, AssetScope, PlatformRole, type Asset, type CampaignDocument } from '@/types';

interface CampaignDocumentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  /** Whether the viewer may share and unshare. The server decides for real. */
  isDM: boolean;
}

export default function CampaignDocumentsModal({ isOpen, onClose, campaignId, isDM }: CampaignDocumentsModalProps) {
  const [shared, setShared] = useState<CampaignDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reading, setReading] = useState<CampaignDocument | null>(null);
  const [toUnshare, setToUnshare] = useState<CampaignDocument | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // DM only: what could be shared.
  const [mine, setMine] = useState<Asset[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const { user } = useAuth();
  const isAdmin = user?.platformRole === PlatformRole.ADMIN;
  /** Edit rights: the uploader or an admin. The server decides for real. */
  const canEdit = (doc: CampaignDocument) => isAdmin || doc.uploadedBy.id === user?.id;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { documents } = await api.listCampaignDocuments(campaignId);
      setShared(documents);
      if (isDM) {
        const { assets } = await api.listAssets({ type: AssetType.DOCUMENT, limit: 100 });
        setMine(assets);
      }
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not load the documents.');
    } finally {
      setLoading(false);
    }
  }, [campaignId, isDM]);

  useEffect(() => {
    if (!isOpen) return;
    void load();
    setPickerOpen(false);
  }, [isOpen, load]);

  // The asset list includes documents from other campaigns the DM belongs to
  // and documents other people uploaded. The server only lets a DM share their
  // own or a global one, so only those are offered.
  const ownOrGlobal = mine.filter(
    (a) => isAdmin || a.scope === AssetScope.GLOBAL || a.uploadedById === user?.id
  );
  const sharedIds = new Set(shared.map((d) => d.id));
  const shareable = ownOrGlobal.filter((a) => !sharedIds.has(a.id));

  const handleShare = async (asset: Asset) => {
    setBusyId(asset.id);
    setError(null);
    try {
      await api.linkCampaignDocument(campaignId, asset.id);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not share that document.');
    } finally {
      setBusyId(null);
    }
  };

  const handleUnshare = async () => {
    if (!toUnshare) return;
    const doc = toUnshare;
    setToUnshare(null);
    setBusyId(doc.id);
    setError(null);
    try {
      await api.unlinkCampaignDocument(campaignId, doc.id);
      setShared((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not unshare that document.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Modal open={isOpen} onClose={onClose} title="Campaign documents" icon={BookOpen} size="lg">
        <div className="space-y-4">
          <p className="text-xs text-ink-secondary">
            {isDM
              ? 'Everyone in the campaign can read what is shared here. Share from your own documents or any global one.'
              : 'Rulebooks and handouts your DM has shared with this campaign.'}
          </p>

          {error && (
            <p className="text-xs text-danger-ink" role="alert">
              {error}
            </p>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-ink-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          ) : shared.length === 0 ? (
            <p className="text-xs text-ink-secondary italic">
              {isDM ? 'Nothing shared yet.' : 'Nothing has been shared with this campaign yet.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {shared.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center gap-2 p-2 rounded-lg border border-moss-green/20 bg-surface/40"
                >
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setReading(doc)}
                      className="text-sm text-ink hover:underline truncate block text-left max-w-full"
                    >
                      {doc.name}
                    </button>
                    <p className="text-[11px] text-ink-secondary truncate">
                      {FORMAT_LABEL[documentFormat(doc.originalName)]} · shared by {doc.linkedBy.displayName}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setReading(doc)}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Read
                  </Button>
                  <a
                    href={api.getDocumentUrl(doc.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-ink-secondary hover:bg-surface"
                    aria-label={`Open ${doc.name} in a new tab`}
                    title="Open in a new tab"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  {isDM && doc.shared && (
                    <button
                      type="button"
                      onClick={() => setToUnshare(doc)}
                      disabled={busyId === doc.id}
                      className="p-1.5 rounded-lg text-danger-ink hover:bg-danger/10 disabled:opacity-40"
                      aria-label={`Stop sharing ${doc.name}`}
                      title="Stop sharing"
                    >
                      {busyId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isDM && (
            <div className="pt-3 border-t border-moss-green/20 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-ink-secondary">Add to this campaign</span>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowNew(true)}
                    className="flex items-center gap-1.5 text-xs"
                    title="Write a text or Markdown document for this campaign"
                  >
                    <FilePlus className="w-3.5 h-3.5" />
                    Write
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowUpload(true)}
                    className="flex items-center gap-1.5 text-xs"
                    title="Upload a file for this campaign"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setPickerOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-xs"
                    title="Share one of your existing documents"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    {pickerOpen ? 'Hide' : 'Share existing'}
                  </Button>
                </div>
              </div>
              {pickerOpen &&
                (shareable.length === 0 ? (
                  <p className="text-xs text-ink-secondary italic">
                    {ownOrGlobal.length === 0
                      ? 'You have no documents yet. Upload one from Documents on your dashboard.'
                      : 'Everything you can share is already shared.'}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {shareable.map((asset) => (
                      <li
                        key={asset.id}
                        className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-moss-green/30"
                      >
                        <span className="flex-1 min-w-0 truncate text-sm text-ink">{asset.name}</span>
                        <span className="text-[11px] text-ink-secondary flex-shrink-0">
                          {FORMAT_LABEL[documentFormat(asset.originalName)]}
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => handleShare(asset)}
                          disabled={busyId === asset.id}
                          className="text-xs"
                        >
                          {busyId === asset.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Share'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          )}
        </div>
      </Modal>

      <DocumentReader
        isOpen={reading !== null}
        onClose={() => setReading(null)}
        documentId={reading?.id ?? null}
        name={reading?.name ?? ''}
        originalName={reading?.originalName ?? ''}
        layer="overlay"
        canEdit={reading !== null && canEdit(reading)}
        onSaved={(id, fileSize) => setShared((prev) => prev.map((d) => (d.id === id ? { ...d, fileSize } : d)))}
      />

      {isDM && (
        <>
          <AssetUploadModal
            isOpen={showUpload}
            onClose={() => setShowUpload(false)}
            onSuccess={() => {
              // Uploaded at CAMPAIGN scope, so it is the campaign's own and
              // appears in the list with no share step.
              void load();
            }}
            defaultType={AssetType.DOCUMENT}
            defaultScope={AssetScope.CAMPAIGN}
            defaultCampaignId={campaignId}
          />
          <NewDocumentDialog
            isOpen={showNew}
            onClose={() => setShowNew(false)}
            onCreated={() => void load()}
            lockedScope={AssetScope.CAMPAIGN}
            campaignId={campaignId}
          />
        </>
      )}

      <ConfirmDialog
        isOpen={toUnshare !== null}
        title="Stop sharing"
        message={`Stop sharing "${toUnshare?.name ?? ''}" with this campaign? Players will no longer be able to read it. The document itself is not deleted.`}
        confirmLabel="Stop sharing"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={handleUnshare}
        onCancel={() => setToUnshare(null)}
      />
    </>
  );
}
