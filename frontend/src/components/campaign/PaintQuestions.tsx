/**
 * PaintQuestions
 * What Paint asks the DM: before Save writes over the map's picture (Save
 * over it, or Not now, which Esc is too), naming the other maps using it;
 * about paint not saved, before something takes it off the screen (Save my
 * painting, Discard my painting, or Not now, which Esc is too; before the
 * map is deleted, Discard or Not now), and, when its map left the screen
 * without asking, what to do with the painting left behind (Download my
 * painting, where the keyboard starts, or Discard my painting: a choice
 * must be made, so Esc does nothing there).
 */

import { Download } from 'lucide-react';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Button, Modal } from '@/components/ui';
import { leavingQuestion, type PaintLeaveAnswer, type PaintLeaving } from './map/paint/usePaintGuards';
import type { PaintLeftover } from './map/paint/usePaintSurface';

const DISCARD_LINK = 'touch-target text-sm text-danger-ink underline underline-offset-2 hover:no-underline disabled:opacity-50';

/** Names as a sentence lists them: "A", "A and B", "A, B and C". */
function listed(names: readonly string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** What Save asks before it writes over the picture of `mapName`. */
export function saveQuestion(mapName: string): string {
  return `Saving will overwrite the current picture of ${mapName}, and no earlier version is kept. Are you sure you want to continue?`;
}

/** What the question adds of the other maps using the picture, by name, or null for none. */
export function sharingWords(sharing: readonly string[]): string | null {
  if (sharing.length === 0) return null;
  return `${listed(sharing)} ${sharing.length === 1 ? 'uses' : 'use'} the same picture and will change too.`;
}

export function PaintSaveQuestion({ open, mapName, sharing, onSave, onCancel }: {
  open: boolean;
  mapName: string;
  /** The names of the other maps of the campaign using the picture. */
  sharing: readonly string[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const alsoChanging = sharingWords(sharing);
  return (
    <ConfirmDialog
      isOpen={open}
      title="Overwrite the map's picture?"
      message={saveQuestion(mapName)}
      confirmLabel="Save over it"
      cancelLabel="Not now"
      variant="warning"
      onConfirm={onSave}
      onCancel={onCancel}
    >
      {alsoChanging && <p className="text-sm text-ink-secondary">{alsoChanging}</p>}
    </ConfirmDialog>
  );
}

export function PaintLeaveQuestion({ leaving, mapName, overwrites, answering, onAnswer }: {
  leaving: PaintLeaving | null;
  mapName: string;
  /** A save would write over the map's picture. */
  overwrites: boolean;
  answering: boolean;
  onAnswer: (answer: PaintLeaveAnswer) => void;
}) {
  if (leaving === 'delete') {
    return (
      <ConfirmDialog
        isOpen
        title="Discard your painting?"
        message={leavingQuestion(mapName, leaving)}
        confirmLabel="Discard my painting"
        cancelLabel="Not now"
        variant="danger"
        onConfirm={() => onAnswer('discard')}
        onCancel={() => onAnswer('later')}
      />
    );
  }
  return (
    <ConfirmDialog
      isOpen={leaving !== null}
      title="Save your painting?"
      message={leaving ? leavingQuestion(mapName, leaving, overwrites) : ''}
      confirmLabel="Save my painting"
      cancelLabel="Not now"
      variant="warning"
      isLoading={answering}
      onConfirm={() => onAnswer('save')}
      onCancel={() => onAnswer('later')}
    >
      <button type="button" onClick={() => onAnswer('discard')} disabled={answering} className={DISCARD_LINK}>
        Discard my painting
      </button>
    </ConfirmDialog>
  );
}

/** Why the painting was left behind, as the DM is told. */
export function leftoverWords(leftover: PaintLeftover): string {
  return leftover.reason === 'not-dm'
    ? `You are no longer the DM, so your painting of ${leftover.mapName} cannot be saved. Download it to keep it as a picture; a draft also stays in this browser until you sign out, offered back if you are the DM again.`
    : `${leftover.mapName} is no longer on your screen, so your painting of it was not saved. Download it to keep it as a picture.`;
}

export function PaintLeftoverQuestion({ leftover, onDownload, onDiscard }: {
  leftover: PaintLeftover | null;
  onDownload: () => void;
  onDiscard: () => void;
}) {
  return (
    <Modal
      open={leftover !== null}
      onClose={() => undefined}
      closeDisabled
      title="Your painting was not saved"
      size="sm"
      layer="overlay"
      footer={
        <>
          <button type="button" onClick={onDiscard} className={DISCARD_LINK}>
            Discard my painting
          </button>
          <Button type="button" icon={Download} onClick={onDownload} data-autofocus="">
            Download my painting
          </Button>
        </>
      }
    >
      {leftover && <p className="text-sm text-ink-secondary">{leftoverWords(leftover)}</p>}
    </Modal>
  );
}
