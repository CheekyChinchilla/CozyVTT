/**
 * PaintQuestions
 * What Paint asks the DM about paint not saved: before something takes it
 * off the screen (Save my painting, Discard my painting, or Not now, which
 * Esc is too; before the map is deleted, Discard or Not now), and, when its
 * map left the screen without asking, what to do with the painting left
 * behind (Download my painting, where the keyboard starts, or Discard my
 * painting: a choice must be made, so Esc does nothing there).
 */

import { Download } from 'lucide-react';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Button, Modal } from '@/components/ui';
import { leavingQuestion, type PaintLeaveAnswer, type PaintLeaving } from './map/paint/usePaintGuards';
import type { PaintLeftover } from './map/paint/usePaintSurface';

const DISCARD_LINK = 'touch-target text-sm text-danger-ink underline underline-offset-2 hover:no-underline disabled:opacity-50';

export function PaintLeaveQuestion({ leaving, mapName, answering, onAnswer }: {
  leaving: PaintLeaving | null;
  mapName: string;
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
      message={leaving ? leavingQuestion(mapName, leaving) : ''}
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
