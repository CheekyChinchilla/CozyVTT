/**
 * Read a document without leaving CozyVTT.
 *
 * A full-screen overlay with the document inside it, and a way to open the same
 * file in a new tab for anyone who would rather read on a second monitor while
 * play carries on. Both were asked for.
 *
 * How each format is shown decides what the browser is trusted with:
 *
 * - **PDF** goes in an <iframe> pointing at the document route, and the browser's
 *   own viewer renders it. The route serves it with a sandbox policy and
 *   sniffing disabled, so the frame has no origin to act in.
 * - **Markdown** is fetched as text and rendered with the app's one Markdown
 *   component, which keeps raw HTML off and strips unsafe links. The server
 *   serves Markdown as text/plain on purpose, so even opened in a new tab it is
 *   shown as text.
 * - **Plain text** is fetched and shown in a <pre>.
 *
 * Nothing here interprets a PDF, and nothing asks the browser to render a
 * document as a page.
 */

import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Loader2, Pencil, Save, X } from 'lucide-react';
import Markdown from '@/components/common/Markdown';
import { Modal, Button, Textarea } from '@/components/ui';
import { apiErrorMessage } from '@/utils/errors';
import api from '@/services/api';

export type DocumentFormat = 'pdf' | 'markdown' | 'text';

/**
 * The format from the original filename's extension. This mirrors the server,
 * which decides the served content type the same way and never from the
 * declared MIME type.
 */
export function documentFormat(originalName: string): DocumentFormat {
  const lower = originalName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.md')) return 'markdown';
  return 'text';
}

/** What each format is called wherever a document is listed. */
export const FORMAT_LABEL: Record<DocumentFormat, string> = {
  pdf: 'PDF',
  markdown: 'Markdown',
  text: 'Text',
};

interface DocumentReaderProps {
  isOpen: boolean;
  onClose: () => void;
  /** The asset id. */
  documentId: string | null;
  name: string;
  originalName: string;
  /** 'overlay' when opened from inside another modal, so it stacks above it. */
  layer?: 'base' | 'overlay';
  /**
   * Whether to offer editing. Only text and Markdown can be edited, and only
   * by the uploader or an admin; the server decides for real, this only avoids
   * offering a button that would be refused.
   */
  canEdit?: boolean;
  /** Called after a save, with the new size, so a list can update. */
  onSaved?: (assetId: string, fileSize: number) => void;
}

export default function DocumentReader({
  isOpen,
  onClose,
  documentId,
  name,
  originalName,
  layer = 'base',
  canEdit = false,
  onSaved,
}: DocumentReaderProps) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const format = documentFormat(originalName);
  const url = documentId ? api.getDocumentUrl(documentId) : '';

  // Text formats are fetched and rendered here. A PDF is left to the iframe.
  useEffect(() => {
    setEditing(false);
    if (!isOpen || !documentId || format === 'pdf') {
      setText(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    // no-cache: always check with the server before showing a cached copy.
    // Text documents can be edited in place, and the server answers 304 when
    // nothing changed, so this costs one small request and never shows stale
    // text.
    fetch(url, { credentials: 'include', cache: 'no-cache' })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 404 ? 'This document is not available to you.' : 'Could not load the document.'
          );
        }
        return res.text();
      })
      .then((body) => {
        if (!cancelled) setText(body);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the document.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, documentId, format, url]);

  const editable = canEdit && format !== 'pdf';

  const startEditing = () => {
    setDraft(text ?? '');
    setEditing(true);
    setError(null);
  };

  const handleSave = async () => {
    if (!documentId) return;
    setSaving(true);
    setError(null);
    try {
      const { asset } = await api.updateDocumentContent(documentId, draft);
      setText(draft);
      setEditing(false);
      onSaved?.(asset.id, asset.fileSize);
    } catch (err) {
      // The server's own wording, which says what was wrong with the text.
      setError(apiErrorMessage(err) ?? 'Could not save the document. Your text is still here.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={name}
      icon={FileText}
      size="xl"
      layer={layer}
      fitViewport
      closeDisabled={saving}
      footer={
        <>
          {editable && !editing && (
            <Button type="button" variant="secondary" onClick={startEditing} className="flex items-center gap-2">
              <Pencil className="w-4 h-4" />
              Edit
            </Button>
          )}
          {editing && (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </Button>
            </>
          )}
          {!editing && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
              className="flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open in a new tab
            </Button>
          )}
        </>
      }
    >
      {/* Fills the space the modal leaves between its header and footer, so
          the controls stay in view and only the document scrolls. */}
      <div className="flex-1 min-h-0 flex flex-col">
        {editing ? (
          /* Stored as typed. The server checks it is text and bounds its size;
             what makes it harmless is how it is rendered and served, not what
             is stripped here. A refused save keeps the text and shows why. */
          <>
            {error && (
              <p className="text-xs text-danger-ink mb-2" role="alert">
                {error}
              </p>
            )}
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={`Edit ${name}`}
              className="flex-1 min-h-0 w-full font-mono text-sm resize-none"
              disabled={saving}
            />
          </>
        ) : format === 'pdf' ? (
          /* The browser's own PDF viewer, in a sandboxed frame.

             The sandbox attribute is what actually contains it. It gives the
             frame a null origin, and the session cookie is SameSite=Lax, so a
             null-origin frame cannot send it: even if something inside the
             viewer ran script, it would have no session and no origin. A
             sandbox directive on the response itself does not do this for a
             PDF, because CSP governs documents the browser parses and a PDF is
             not one; that was checked, not assumed.

             allow-scripts is needed because the viewers themselves are script.
             allow-same-origin is deliberately absent. */
          <>
            {/* Some browsers show nothing at all for a PDF inside a page, and
                the frame is white, so there is no way to tell that from a
                slow load. Safari is the one reported. Opening it as a page of
                its own always works, so say so where it will be read. */}
            <p className="mb-2 text-xs text-ink-secondary">
              Not showing?{' '}
              <button
                type="button"
                onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                className="underline underline-offset-2 hover:text-brand-ink"
              >
                Open this PDF in a new tab
              </button>
            </p>
            <iframe
              src={url}
              title={name}
              sandbox="allow-scripts"
              className="flex-1 w-full rounded-lg border border-moss-green/20 bg-white"
            />
          </>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-sm text-ink-secondary">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <p className="text-sm text-danger-ink" role="alert">
            {error}
          </p>
        ) : format === 'markdown' ? (
          /* The shared renderer: raw HTML off, unsafe links stripped, tables and
             single-newline breaks on. See components/common/Markdown. */
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 rounded-lg border border-moss-green/20 bg-parchment/60 prose-notes">
            <Markdown>{text ?? ''}</Markdown>
          </div>
        ) : (
          <pre className="flex-1 min-h-0 overflow-auto px-4 py-3 rounded-lg border border-moss-green/20 bg-parchment/60 text-sm whitespace-pre-wrap font-mono text-ink">
            {text ?? ''}
          </pre>
        )}
      </div>
    </Modal>
  );
}
