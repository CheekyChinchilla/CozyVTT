// ============================================
// Paint not saved, asked about before anything takes it off the screen.
//
// One question, asked the same way whatever is about to happen: Save my
// painting (saves, then lets it happen if the save landed), Discard my
// painting (drops the paint and its draft, then lets it happen), or Not now
// (nothing happens; Esc is Not now too). It is asked
// - by the campaign page before the map on screen changes or the table
//   moves (CampaignContext's viewed-map guard: Open to prepare, Back to the
//   table and the phone's Back while preparing, Set Active, Bring everyone
//   here, deleting the map), which also holds the map on screen while there
//   is paint not saved when the table is moved from elsewhere;
// - before the page is left (hooks/useLeaveGuard.ts): the headers' way to
//   the dashboard and the browser's Back; a reload or a closed tab gets the
//   browser's own question.
// Questions are asked one at a time. One asked while another is open, or
// while a save is under way, waits for it, then asks only if there is still
// paint not saved: an answer given once is not asked again.
//
// While there is paint not saved the session is kept alive and a lost
// sign-in keeps the page where it is (useUnsavedWorkGuard).
// ============================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewedMapChange, ViewedMapGuard } from '@/contexts/CampaignContext';
import { useUnsavedWorkGuard } from '@/hooks/useUnsavedWorkGuard';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import type { PaintSurface } from './usePaintSurface';

/** What is about to take the paint off the screen: a change of the map on screen, or leaving the page. */
export type PaintLeaving = ViewedMapChange['kind'] | 'leave';

/** The DM's answer. */
export type PaintLeaveAnswer = 'save' | 'discard' | 'later';

/** What the question says about what is about to happen, after "Your painting of <map> is not saved." */
export const LEAVING_WORDS: Record<PaintLeaving, string> = {
  'open-other': 'Save it before you open another map?',
  'back-to-table': 'Save it before you go back to the table?',
  'set-active': 'Save it before the table moves to another map?',
  'bring-everyone': 'Save it before you bring them here?',
  delete: 'Save it before the map is deleted?',
  leave: 'Save it before you leave this page?',
};

/** The question in full. */
export function leavingQuestion(mapName: string, leaving: PaintLeaving): string {
  return leaving === 'bring-everyone'
    ? `Your painting of ${mapName} is not saved, so your players would not see it. ${LEAVING_WORDS[leaving]}`
    : `Your painting of ${mapName} is not saved. ${LEAVING_WORDS[leaving]}`;
}

export interface PaintGuardsOptions {
  registerViewedMapGuard: (guard: ViewedMapGuard) => () => void;
  /**
   * The browser's Back is asked here. False where something else on the
   * page holds it and asks through the viewed-map guard: the phone's Back
   * while preparing a map goes back to the table.
   */
  holdBack: boolean;
}

export function usePaintGuards(paint: PaintSurface, { registerViewedMapGuard, holdBack }: PaintGuardsOptions) {
  const paintRef = useRef(paint);
  useEffect(() => {
    paintRef.current = paint;
  });
  const [question, setQuestion] = useState<{ leaving: PaintLeaving; resolve: (leave: boolean) => void } | null>(null);
  const questionRef = useRef(question);
  useEffect(() => {
    questionRef.current = question;
  }, [question]);
  const [answering, setAnswering] = useState(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  /** Ask about paint not saved before `leaving`: true to let it happen. */
  const ask = useCallback((leaving: PaintLeaving): Promise<boolean> => {
    const run = queue.current.then(async () => {
      await paintRef.current.whenSaved();
      if (!paintRef.current.isUnsaved()) return true;
      return new Promise<boolean>((resolve) => {
        const asked = { leaving, resolve };
        questionRef.current = asked;
        setQuestion(asked);
      });
    });
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  const answer = useCallback(async (choice: PaintLeaveAnswer) => {
    const asked = questionRef.current;
    if (!asked) return;
    let leave = false;
    if (choice === 'save') {
      setAnswering(true);
      leave = await paintRef.current.save();
      setAnswering(false);
    } else if (choice === 'discard') {
      paintRef.current.discard();
      leave = true;
    }
    questionRef.current = null;
    setQuestion(null);
    asked.resolve(leave);
  }, []);

  useEffect(() => registerViewedMapGuard({
    mayLeave: (change) => ask(change.kind),
    holds: () => paintRef.current.isUnsaved(),
  }), [registerViewedMapGuard, ask]);

  const signedOut = useUnsavedWorkGuard(paint.unsaved);
  const askToLeave = useCallback(() => ask('leave'), [ask]);
  useLeaveGuard(paint.unsaved, askToLeave, { holdBack });

  return {
    /** What the open question is about, or null. */
    leaving: question?.leaving ?? null,
    /** Save my painting is under way. */
    answering,
    answer,
    /** The browser was signed out while there was paint not saved: Save works once it signs in again. */
    signedOut,
  };
}
