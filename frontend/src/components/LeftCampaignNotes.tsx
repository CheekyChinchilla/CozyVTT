/**
 * Notes and saved rolls from campaigns the player is no longer in.
 *
 * Removing a player from a campaign keeps their personal notes and saved
 * rolls for it, but the campaign page, where the notes panel is, is closed to
 * them. This dashboard section lets them read and download what they wrote.
 * It shows only when there is something to show. Deleting the campaign
 * deletes these too, so the section says so.
 *
 * The dialog fetches the text of the note being read, as the campaign's notes
 * panel does. Download asks for every note of the campaign in one request.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, NotebookPen } from 'lucide-react';
import Markdown from '@/components/common/Markdown';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { api } from '@/services/api';
import { leftCampaignNoteQuery, useLeftCampaignsQuery } from '@/hooks/queries';
import { apiErrorMessage } from '@/utils/errors';
import { downloadTextFile } from '@/utils/download';
import { leftCampaignFilename, leftCampaignMarkdown } from '@/utils/leftCampaignNotes';
import type { LeftCampaignDetail, LeftCampaignSummary, PersonalNoteSummary } from '@/types';
import '@/styles/note-markdown.css';

const count = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** The note being read, fetched when it is opened. */
function NoteText({ campaignId, note }: { campaignId: string; note: PersonalNoteSummary }) {
  const { data, error } = useQuery(leftCampaignNoteQuery(campaignId, note));
  return (
    <>
      <h3 className="text-base font-semibold text-brand-ink mb-2 wrap-break-word">{note.title}</h3>
      {error ? (
        <p role="alert" className="text-sm text-danger-ink">
          {apiErrorMessage(error) ?? 'Failed to load this note'}
        </p>
      ) : !data ? (
        <p className="flex items-center gap-2 text-sm text-warm-gray">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading the note
        </p>
      ) : data.content ? (
        <div className="prose-notes">
          <Markdown>{data.content}</Markdown>
        </div>
      ) : (
        <p className="text-warm-gray italic">This note is empty.</p>
      )}
    </>
  );
}

function LeftCampaignDialog({ campaign, onClose }: { campaign: LeftCampaignSummary | null; onClose: () => void }) {
  const [detail, setDetail] = useState<LeftCampaignDetail | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  // Bumped whenever the dialog opens or closes, so a download still fetching
  // for a dialog that has gone stops and saves nothing.
  const opening = useRef(0);

  useEffect(() => {
    opening.current += 1;
    setDownloading(false);
    setDownloadError('');
    if (!campaign) return;
    let cancelled = false;
    setDetail(null);
    setError('');
    setSelectedId(null);
    api
      .getLeftCampaign(campaign.id)
      .then((loaded) => {
        if (cancelled) return;
        setDetail(loaded);
        setSelectedId(loaded.notes[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err) ?? 'Failed to load your notes');
      });
    return () => {
      cancelled = true;
    };
  }, [campaign]);

  const selected = detail?.notes.find((n) => n.id === selectedId) ?? null;

  /** Fetch every note's text in one request, then save the file. */
  const downloadAll = async () => {
    if (!detail || downloading) return;
    const started = opening.current;
    setDownloadError('');
    setDownloading(true);
    try {
      // A campaign with no notes has nothing to ask for; its saved rolls are in the detail.
      const notes = detail.notes.length > 0 ? (await api.getLeftCampaignNotes(detail.campaign.id)).notes : [];
      if (opening.current !== started) return;
      downloadTextFile(
        leftCampaignFilename(detail.campaign.name),
        leftCampaignMarkdown({ campaign: detail.campaign, notes, macros: detail.macros }),
        'text/markdown'
      );
    } catch (err: unknown) {
      if (opening.current !== started) return;
      setDownloadError(apiErrorMessage(err) ?? 'Failed to fetch your notes');
    } finally {
      if (opening.current === started) setDownloading(false);
    }
  };

  return (
    <Modal
      open={campaign !== null}
      onClose={onClose}
      title={`Your Notes From ${campaign?.name ?? ''}`}
      icon={NotebookPen}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => void downloadAll()} disabled={!detail || downloading} className="flex items-center gap-2">
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="w-4 h-4" aria-hidden="true" />
            )}
            Download
          </Button>
        </>
      }
    >
      {(error || downloadError) && (
        <p role="alert" className="text-sm text-danger-ink bg-danger/10 border border-danger/30 rounded-lg p-3 mb-4">
          {error || downloadError}
        </p>
      )}
      {downloading && (
        <p role="status" className="flex items-center gap-2 text-sm text-warm-gray mb-4">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Fetching your notes for the download
        </p>
      )}
      {!detail && !error && (
        <p className="flex items-center gap-2 text-sm text-warm-gray">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading your notes
        </p>
      )}
      {detail && (
        <div className="space-y-5">
          {detail.notes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-4">
              <ul className="space-y-1" aria-label="Your notes">
                {detail.notes.map((note) => (
                  <li key={note.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(note.id)}
                      aria-pressed={note.id === selectedId}
                      className={`w-full text-left text-sm px-3 py-2 rounded-lg wrap-break-word transition-colors ${
                        note.id === selectedId ? 'bg-moss-green/15 text-brand-ink font-medium' : 'text-stone-gray hover:bg-moss-green/5'
                      }`}
                    >
                      {note.title}
                    </button>
                  </li>
                ))}
              </ul>
              <article className="min-w-0">
                {selected && <NoteText campaignId={detail.campaign.id} note={selected} />}
              </article>
            </div>
          ) : (
            <p className="text-sm text-warm-gray">You kept no notes in this campaign.</p>
          )}

          {detail.macros.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-brand-ink mb-2">Saved rolls</h3>
              <ul className="space-y-1 text-sm">
                {detail.macros.map((macro) => (
                  <li key={macro.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-stone-gray">{macro.name}</span>
                    <code className="font-mono text-xs text-warm-gray">{macro.expression}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function LeftCampaignNotes() {
  const { data: campaigns = [] } = useLeftCampaignsQuery();
  const [opened, setOpened] = useState<LeftCampaignSummary | null>(null);

  if (campaigns.length === 0) return null;

  return (
    <section className="glass-panel p-6" aria-labelledby="left-campaign-notes-heading">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-moss-green/10">
          <NotebookPen className="w-6 h-6 text-brand-ink" aria-hidden="true" />
        </div>
        <h2 id="left-campaign-notes-heading" className="text-xl font-semibold text-brand-ink font-heading">
          Notes From Campaigns You Have Left
        </h2>
      </div>
      <p className="text-sm text-warm-gray mb-4 max-w-3xl">
        You are no longer in these campaigns, but your personal notes and saved rolls from them are still yours to
        read and download. If a campaign is deleted, they are deleted with it, so download anything you want to keep.
      </p>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {campaigns.map((campaign) => (
          <li
            key={campaign.id}
            className="flex items-center justify-between gap-3 p-4 rounded-lg bg-parchment/50 border border-moss-green/20"
          >
            <div className="min-w-0">
              <p className="font-semibold text-brand-ink wrap-break-word">{campaign.name}</p>
              <p className="text-xs text-warm-gray">
                {count(campaign.notes.length, 'note', 'notes')}, {count(campaign.macros.length, 'saved roll', 'saved rolls')}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => setOpened(campaign)}
              aria-label={`Open your notes from ${campaign.name}`}
              className="shrink-0 text-sm py-1.5 px-3"
            >
              Open
            </Button>
          </li>
        ))}
      </ul>
      <LeftCampaignDialog campaign={opened} onClose={() => setOpened(null)} />
    </section>
  );
}
