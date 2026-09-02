/**
 * Personal Notes
 *
 * A player's own notes for this campaign, written in Markdown.
 *
 * Private: the server scopes every request by the signed-in user, so there is
 * nothing here that could show someone else's notes even if it tried. Nobody
 * else reads these — the DM included.
 *
 * Markdown is rendered with `react-markdown`, which does **not** process raw
 * HTML unless `rehype-raw` is added. It is not, so a note containing a
 * `<script>` tag renders as literal text rather than running. That is the whole
 * XSS story for this feature, and it stays true only while nothing adds that
 * plugin.
 *
 * Bodies are loaded one at a time. The list carries titles only, because a
 * campaign's notes can run to tens of thousands of characters each.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { NotebookPen, Plus, Trash2, Eye, Pencil, Loader2 } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import api from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import type { PersonalNoteSummary } from '@/types';
import '@/styles/note-markdown.css';

/** Matches the server's cap; the counter turns amber as it is approached. */
const MAX_CONTENT = 100_000;

/** How long to wait after the last keystroke before saving. */
const SAVE_DEBOUNCE_MS = 1200;

export default function PersonalNotes() {
  const { campaign } = useCampaign();
  const campaignId = campaign?.id;

  const [notes, setNotes] = useState<PersonalNoteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** Set while loading a note, so the load does not look like an edit. */
  const loadingBodyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadList = useCallback(async () => {
    if (!campaignId) return;
    try {
      const { notes: fetched } = await api.listNotes(campaignId);
      setNotes(fetched);
      return fetched;
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not load your notes.');
      return [];
    }
  }, [campaignId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  /** Open a note, fetching its body. */
  const openNote = useCallback(
    async (noteId: string) => {
      if (!campaignId) return;
      setLoading(true);
      setError(null);
      loadingBodyRef.current = true;
      try {
        const { note } = await api.getNote(campaignId, noteId);
        setSelectedId(note.id);
        setTitle(note.title);
        setContent(note.content);
      } catch (err) {
        setError(apiErrorMessage(err) ?? 'Could not open that note.');
      } finally {
        setLoading(false);
        // Cleared after the state above has been applied, so the effect that
        // watches `content` does not treat loading a note as a change to save.
        setTimeout(() => { loadingBodyRef.current = false; }, 0);
      }
    },
    [campaignId]
  );

  /** Save whatever is in the editor now. */
  const save = useCallback(async () => {
    if (!campaignId || !selectedId) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateNote(campaignId, selectedId, { content });
      setNotes((prev) =>
        prev.map((n) => (n.id === selectedId ? { ...n, updatedAt: new Date().toISOString() } : n))
      );
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not save. Your text is still here — try again.');
    } finally {
      setSaving(false);
    }
  }, [campaignId, selectedId, content]);

  // Autosave after a pause in typing. A note is long-form writing; making
  // someone press Save is how work gets lost.
  useEffect(() => {
    if (!selectedId || loadingBodyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void save(); }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [content, selectedId, save]);

  const handleCreate = async () => {
    if (!campaignId) return;
    setError(null);
    try {
      const { note } = await api.createNote(campaignId, 'Untitled note', '');
      await loadList();
      setSelectedId(note.id);
      setTitle(note.title);
      setContent('');
      setEditing(true);
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not create a note.');
    }
  };

  const handleRename = async (next: string) => {
    setTitle(next);
    if (!campaignId || !selectedId || !next.trim()) return;
    try {
      await api.updateNote(campaignId, selectedId, { title: next.trim() });
      setNotes((prev) => prev.map((n) => (n.id === selectedId ? { ...n, title: next.trim() } : n)));
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not rename that note.');
    }
  };

  const handleDelete = async () => {
    if (!campaignId || !selectedId) return;
    setConfirmDelete(false);
    try {
      await api.deleteNote(campaignId, selectedId);
      setSelectedId(null);
      setTitle('');
      setContent('');
      await loadList();
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not delete that note.');
    }
  };

  if (!campaignId) return null;

  const overLimit = content.length > MAX_CONTENT;

  return (
    <>
      <ConfirmDialog
        isOpen={confirmDelete}
        title="Delete note"
        message={`Delete "${title}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      <div className="h-full flex flex-col gap-2">
        {/* Picker */}
        <div className="flex items-center gap-2">
          <NotebookPen className="w-4 h-4 text-warm-amber shrink-0" />
          <select
            value={selectedId ?? ''}
            onChange={(e) => { void openNote(e.target.value); }}
            aria-label="Choose a note"
            className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-warm-amber/30 rounded-cozy bg-parchment/60 focus:outline-none focus:ring-2 focus:ring-warm-amber"
          >
            <option value="" disabled>
              {notes.length ? 'Choose a note…' : 'No notes yet'}
            </option>
            {notes.map((note) => (
              <option key={note.id} value={note.id}>
                {note.title}
              </option>
            ))}
          </select>
          <button
            onClick={handleCreate}
            title="New note"
            aria-label="New note"
            className="p-1.5 rounded-cozy border border-warm-amber/40 bg-warm-amber/10 text-warm-amber hover:bg-warm-amber/20 shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {error && <p className="text-xs text-danger-ink">{error}</p>}

        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <NotebookPen className="w-9 h-9 text-warm-gray/40 mb-2" />
            <p className="text-xs text-warm-gray">
              Notes only you can read. Write in Markdown — headings, lists, links — and
              switch to the preview to see it laid out.
            </p>
          </div>
        ) : (
          <>
            {/* Title + mode */}
            <div className="flex items-center gap-2">
              <input
                value={title}
                onChange={(e) => { void handleRename(e.target.value); }}
                maxLength={120}
                aria-label="Note title"
                className="flex-1 min-w-0 px-2 py-1 text-sm font-semibold border border-warm-amber/30 rounded-cozy bg-parchment/60 focus:outline-none focus:ring-2 focus:ring-warm-amber"
              />
              <button
                onClick={() => setEditing((on) => !on)}
                title={editing ? 'Preview' : 'Edit'}
                aria-label={editing ? 'Preview' : 'Edit'}
                className="p-1.5 rounded-cozy border border-warm-amber/30 bg-parchment/60 text-stone-gray hover:text-brand-ink shrink-0"
              >
                {editing ? <Eye className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete note"
                aria-label="Delete note"
                className="p-1.5 rounded-cozy border border-danger/30 bg-danger/10 text-danger-ink hover:bg-danger/20 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center text-warm-gray">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : editing ? (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={'# Heading\n\n- a list\n- of things\n\n[a link](https://example.com)'}
                aria-label="Note content"
                className="flex-1 min-h-0 w-full px-3 py-2 text-sm font-mono border border-warm-amber/30 rounded-cozy bg-parchment/60 resize-none focus:outline-none focus:ring-2 focus:ring-warm-amber"
              />
            ) : (
              /* Rendered preview. `react-markdown` ignores raw HTML unless
                 rehype-raw is added, which it deliberately is not. */
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 border border-warm-amber/30 rounded-cozy bg-parchment/60 prose-notes">
                {content.trim() ? (
                  <ReactMarkdown>{content}</ReactMarkdown>
                ) : (
                  <p className="text-xs text-warm-gray italic">Nothing written yet.</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-warm-gray">
              <span>
                {saving ? 'Saving…' : 'Saved automatically'}
              </span>
              <span className={overLimit ? 'text-danger-ink font-semibold' : ''}>
                {content.length.toLocaleString()} / {MAX_CONTENT.toLocaleString()}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
