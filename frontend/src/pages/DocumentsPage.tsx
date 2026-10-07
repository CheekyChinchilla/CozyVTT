/**
 * Your documents: rulebooks, house rules, handouts.
 *
 * Kept apart from the Asset Library on purpose. That page is maps and tokens,
 * things you look at as pictures; a rulebook among them is the clutter this
 * page exists to avoid, and the asset list leaves documents out unless asked
 * for them by type.
 *
 * What you see here is what you may read: your own uploads, anything global,
 * and campaign documents you belong to. Sharing one with a campaign happens
 * from that campaign's settings, where the DM decides.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, ExternalLink, FilePlus, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import AssetUploadModal from '@/components/assets/AssetUploadModal';
import DocumentReader, { documentFormat, FORMAT_LABEL } from '@/components/documents/DocumentReader';
import NewDocumentDialog from '@/components/documents/NewDocumentDialog';
import { useAssetsQuery } from '@/hooks/queries';
import { useAssetDelete } from '@/hooks/useAssetDelete';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import api from '@/services/api';
import { AssetType, PlatformRole, type Asset } from '@/types';
import { assetScopeLabel } from '@/utils/assetUrl';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [reading, setReading] = useState<Asset | null>(null);
  const [toDelete, setToDelete] = useState<Asset | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const query = useAssetsQuery({ page, limit: 24, type: AssetType.DOCUMENT });
  const documents = query.data?.assets ?? [];
  const pagination = query.data?.pagination;

  const isAdmin = user?.platformRole === PlatformRole.ADMIN;

  /**
   * Whether the delete control is offered. The server decides for real; this
   * only avoids showing a button that would be refused. Mirrors the asset
   * delete rules: your own, or anything if you are an admin.
   */
  const canDelete = (doc: Asset) => isAdmin || doc.uploadedById === user?.id;

  // The page asks "delete this?" itself; if the server then says something still
  // uses the document, this shows where and asks again.
  const documentDelete = useAssetDelete({
    onDeleted: (doc) => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      showToast(`"${doc.name}" deleted`, 'success');
    },
    onError: (message) => showToast(message, 'error'),
    failureMessage: 'Could not delete that document.',
  });

  const handleDelete = async () => {
    if (!toDelete) return;
    const doomed = toDelete;
    setToDelete(null);
    setDeletingId(doomed.id);
    try {
      await documentDelete.deleteAsset(doomed);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="p-2 rounded-lg hover:bg-surface transition-colors"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="w-5 h-5 text-ink" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-moss-green/10">
                <BookOpen className="w-6 h-6 text-moss-green" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-brand-ink font-heading">Documents</h1>
                <p className="text-sm text-warm-gray">Rulebooks, house rules and handouts, readable here</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowNew(true)}
              className="flex items-center gap-2"
            >
              <FilePlus className="w-4 h-4" />
              <span className="hidden sm:inline">Write one</span>
            </Button>
            <Button type="button" onClick={() => setShowUpload(true)} className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload a document
            </Button>
          </div>
        </div>

        <p className="text-sm text-ink-secondary">
          PDF, plain text and Markdown, up to the size limit your instance allows. Who can read one
          depends on where you put it: <strong>Personal</strong> is yours alone until a DM shares it
          with a campaign; <strong>Campaign</strong> belongs to that table and its members can read
          it; <strong>Global</strong> is readable by everyone on this instance. Text and Markdown
          can be written here and edited later; a PDF is a file you upload.
        </p>

        {/* List */}
        {query.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-ink-secondary py-12 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading your documents…
          </div>
        ) : query.isError ? (
          <p className="text-sm text-danger-ink" role="alert">
            Could not load your documents.
          </p>
        ) : documents.length === 0 ? (
          <div className="glass-panel p-10 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-moss-green/50" />
            <p className="text-sm font-medium text-brand-ink mb-1">No documents yet</p>
            <p className="text-xs text-warm-gray">
              Upload a rulebook or a page of house rules and it will be readable from here and from any
              campaign it is shared with.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => {
              const format = documentFormat(doc.originalName);
              return (
                <li
                  key={doc.id}
                  className="glass-panel p-4 flex items-center gap-4"
                >
                  <div className="p-2 rounded-lg bg-moss-green/10 flex-shrink-0">
                    <FileText className="w-6 h-6 text-moss-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setReading(doc)}
                      className="text-sm font-medium text-brand-ink hover:underline truncate block text-left max-w-full"
                    >
                      {doc.name}
                    </button>
                    <p className="text-xs text-warm-gray truncate">
                      {FORMAT_LABEL[format]} · {formatSize(doc.fileSize)} · {assetScopeLabel(doc.scope)}
                      {doc.description ? ` · ${doc.description}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setReading(doc)}
                      className="flex items-center gap-2 text-sm"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span className="hidden sm:inline">Read</span>
                    </Button>
                    <a
                      href={api.getDocumentUrl(doc.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-ink-secondary hover:bg-surface transition-colors"
                      aria-label={`Open ${doc.name} in a new tab`}
                      title="Open in a new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    {canDelete(doc) && (
                      <button
                        type="button"
                        onClick={() => setToDelete(doc)}
                        disabled={deletingId === doc.id}
                        className="p-2 rounded-lg text-danger-ink hover:bg-danger/10 transition-colors disabled:opacity-40"
                        aria-label={`Delete ${doc.name}`}
                        title="Delete"
                      >
                        {deletingId === doc.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {pagination && pagination.total > pagination.limit && (
          <div className="flex items-center justify-center gap-3 text-sm">
            <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-ink-secondary">
              Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={page * pagination.limit >= pagination.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      <AssetUploadModal
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['assets'] });
          showToast('Document uploaded', 'success');
        }}
        defaultType={AssetType.DOCUMENT}
      />

      <DocumentReader
        isOpen={reading !== null}
        onClose={() => setReading(null)}
        documentId={reading?.id ?? null}
        name={reading?.name ?? ''}
        originalName={reading?.originalName ?? ''}
        canEdit={reading !== null && canDelete(reading)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['assets'] })}
      />

      <NewDocumentDialog
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(asset) => {
          queryClient.invalidateQueries({ queryKey: ['assets'] });
          showToast(`"${asset.name}" created`, 'success');
        }}
      />

      <ConfirmDialog
        isOpen={toDelete !== null}
        title="Delete document"
        message={`Delete "${toDelete?.name ?? ''}"? Any campaign it was shared with loses it. This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
      />
      {documentDelete.inUseDialog}
    </div>
  );
}
