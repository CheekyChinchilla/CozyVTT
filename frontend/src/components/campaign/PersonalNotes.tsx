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

/** A note at a point in time, tagged with which note it is. */
interface NoteSnapshot {
  noteId: string;
  title: string;
  content: string;
}

/** Whether a draft holds anything the server has not been told about. */
function isUnsaved(draft: NoteSnapshot | null, saved: NoteSnapshot | null): boolean {
  if (!draft) return false;
  return (
    saved?.noteId !== draft.noteId ||
    saved.content !== draft.content ||
    saved.title !== draft.title
  );
}

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

  /** A note's text at a moment in time — what is in the editor, or what the server has. */
  const [savedSnapshot, setSavedSnapshot] = useState<NoteSnapshot | null>(null);

  /** Set while loading a note, so the load does not look like an edit. */
  const loadingBodyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The autosave has to be readable from a cleanup function, which runs with the
  // values from the render it was created in. Refs give the cleanup the *latest*
  // text instead, which is the whole point: when the cleanup fires it is because
  // the component is going away, and the newest keystrokes are the ones at risk.
  const draftRef = useRef<NoteSnapshot | null>(null);
  const savedRef = useRef<NoteSnapshot | null>(null);
  savedRef.current = savedSnapshot;

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

  /**
   * Write one note's text to the server.
   *
   * Takes what to save rather than reading it from state, because the flush
   * below saves the note being *left behind* — by the time it runs, `selectedId`
   * may already point at a different note.
   */
  const save = useCallback(
    async (snapshot: NoteSnapshot) => {
      if (!campaignId) return;
      setSaving(true);
      setError(null);
      try {
        // A blank title is left out rather than sent: the server requires a
        // non-empty one, and refusing the whole save would take the body with
        // it. The title is restored from the server the next time the note is
        // opened.
        const trimmedTitle = snapshot.title.trim();
        await api.updateNote(campaignId, snapshot.noteId, {
          content: snapshot.content,
          ...(trimmedTitle && { title: trimmedTitle }),
        });
        setSavedSnapshot(snapshot);
        setNotes((prev) =>
          prev.map((n) =>
            n.id === snapshot.noteId
              ? {
                  ...n,
                  ...(trimmedTitle && { title: trimmedTitle }),
                  updatedAt: new Date().toISOString(),
                }
              : n
          )
        );
      } catch (err) {
        setError(apiErrorMessage(err) ?? 'Could not save. Your text is still here — try again.');
      } finally {
        setSaving(false);
      }
    },
    [campaignId]
  );

  /** Save now, if there is anything the server has not been told about. */
  const flush = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const draft = draftRef.current;
    if (!isUnsaved(draft, savedRef.current) || !draft) return;
    void save(draft);
  }, [save]);

  /** Open a note, fetching its body. */
  const openNote = useCallback(
    async (noteId: string) => {
      if (!campaignId) return;
      // Before anything else, because loading overwrites the draft. Relying on
      // the unmount cleanup alone was not enough: the new note's text landed in
      // `draftRef` first, and the outgoing note's edits were gone by the time
      // the cleanup looked for them.
      flush();
      setLoading(true);
      setError(null);
      loadingBodyRef.current = true;
      try {
        const { note } = await api.getNote(campaignId, noteId);
        setSelectedId(note.id);
        setTitle(note.title);
        setContent(note.content);
        // What was just loaded is, by definition, what the server has. Setting
        // both means a note opened and not typed in is never treated as unsaved.
        draftRef.current = { noteId: note.id, title: note.title, content: note.content };
        setSavedSnapshot({ noteId: note.id, title: note.title, content: note.content });
      } catch (err) {
        setError(apiErrorMessage(err) ?? 'Could not open that note.');
      } finally {
        setLoading(false);
        // Cleared after the state above has been applied, so the effect that
        // watches `content` does not treat loading a note as a change to save.
        setTimeout(() => { loadingBodyRef.current = false; }, 0);
      }
    },
    [campaignId, flush]
  );

  // Autosave after a pause in typing. A note is long-form writing; making
  // someone press Save is how work gets lost.
  useEffect(() => {
    if (!selectedId || loadingBodyRef.current) return;
    draftRef.current = { noteId: selectedId, title, content };
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [content, title, selectedId, flush]);

  /**
   * Write out the pending draft when the note is switched or the panel closes.
   *
   * Without this the cleanup above simply cancelled the timer, so anything typed
   * in the last 1.2 seconds before switching notes or navigating away was thrown
   * out — while the panel said "Saved automatically" the whole time. Depending on
   * `selectedId` alone means this cleanup runs when the note changes and on
   * unmount, and not on every keystroke.
   */
  useEffect(() => flush, [selectedId, flush]);

  // The one case a flush cannot cover: the tab closing takes the request with
  // it. Warn instead of pretending, and let the browser word the prompt.
  useEffect(() => {
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (!isUnsaved(draftRef.current, savedRef.current)) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnIfUnsaved);
    return () => window.removeEventListener('beforeunload', warnIfUnsaved);
  }, []);

  const handleCreate = async () => {
    if (!campaignId) return;
    // Same reason as openNote: this replaces the draft.
    flush();
    setError(null);
    try {
      const { note } = await api.createNote(campaignId, 'Untitled note', '');
      await loadList();
      setSelectedId(note.id);
      setTitle(note.title);
      setContent('');
      draftRef.current = { noteId: note.id, title: note.title, content: '' };
      setSavedSnapshot({ noteId: note.id, title: note.title, content: '' });
      setEditing(true);
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not create a note.');
    }
  };

  /**
   * Renaming is local; the autosave carries it to the server with the body.
   *
   * It used to PUT on every keystroke, so typing a title sent a request per
   * character — up to 120 of them for one rename, with no ordering guarantee
   * between the responses.
   */
  const handleRename = (next: string) => {
    setTitle(next);
    if (!selectedId) return;
    // The picker reads from `notes`, so it has to follow along as you type.
    const trimmed = next.trim();
    if (trimmed) {
      setNotes((prev) => prev.map((n) => (n.id === selectedId ? { ...n, title: trimmed } : n)));
    }
  };

  const handleDelete = async () => {
    if (!campaignId || !selectedId) return;
    setConfirmDelete(false);
    try {
      await api.deleteNote(campaignId, selectedId);
      // Drop the draft before clearing the selection, or the flush that runs on
      // the way out would recreate the text of the note just deleted.
      draftRef.current = null;
      setSavedSnapshot(null);
      setSelectedId(null);
      setTitle('');
      setContent('');
      await loadList();
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not delete that note.');
    }
  };

  if (!campaignId) return null;

  // Derived from state rather than the refs, so the label re-renders with it.
  const unsaved =
    selectedId !== null && isUnsaved({ noteId: selectedId, title, content }, savedSnapshot);
  const nearLimit = content.length > MAX_CONTENT * 0.9;

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
                onChange={(e) => handleRename(e.target.value)}
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
                // Matches the server's cap, so the editor cannot get into a
                // state where every autosave is refused.
                maxLength={MAX_CONTENT}
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
              <span aria-live="polite">
                {saving ? 'Saving…' : unsaved ? 'Unsaved changes…' : 'Saved'}
              </span>
              <span className={nearLimit ? 'text-danger-ink font-semibold' : ''}>
                {content.length.toLocaleString()} / {MAX_CONTENT.toLocaleString()}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
