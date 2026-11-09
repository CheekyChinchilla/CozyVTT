/**
 * A library's create and edit form as a step of its own on a narrow screen.
 *
 * The Creature Library and Token Templates open their form under their list.
 * On a narrow screen that left the list next to no room, so there the form
 * takes the list's place instead: the panel hides the list while `asStep`,
 * shows <BackToList> above the form, and calls `opened` and `closed` as the
 * form opens and closes. Focus then moves to the form's heading as it opens,
 * and back to the control that opened it as it closes, whichever way it
 * closes; when that control has gone, as an Edit button does when its row
 * folds or the panel is closed and opened again, to the list's own create
 * button (`createButtonRef`). The width is the campaign page's (COMPACT_LAYOUT_QUERY). On a wider
 * screen nothing here acts and the form opens under the list.
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { COMPACT_LAYOUT_QUERY } from '@/constants/layout';

export interface LibraryFormStep {
  /** The form is open as a step of its own: hide the list and let the form fill the panel. */
  asStep: boolean;
  /** The screen is narrow, so a form opened now is a step of its own. */
  compact: boolean;
  /** For the form's heading, which takes focus as the step opens. Give it tabIndex -1. */
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** For the list's create button, which takes focus when the control that opened the form has gone. */
  createButtonRef: RefObject<HTMLButtonElement | null>;
  /** Call as the form opens, with the control that opened it. */
  opened: (opener: HTMLElement) => void;
  /** Call as the form closes: by Back, Cancel or a save. */
  closed: () => void;
}

/** `formOpen` is whether the panel's form is open, at any width. */
export function useLibraryFormStep(formOpen: boolean): LibraryFormStep {
  const compact = useMediaQuery(COMPACT_LAYOUT_QUERY);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Where focus goes once the form has opened or closed, asked for by
  // `opened` and `closed` on a narrow screen; a screen crossing the width
  // while the form is open moves nothing.
  const focusNext = useRef<'heading' | 'opener' | null>(null);

  useEffect(() => {
    const target = focusNext.current;
    focusNext.current = null;
    if (target === 'heading') headingRef.current?.focus();
    if (target === 'opener') {
      (opener.current?.isConnected ? opener.current : createButtonRef.current)?.focus();
      opener.current = null;
    }
  }, [formOpen]);

  const opened = useCallback((control: HTMLElement) => {
    opener.current = control;
    if (compact) focusNext.current = 'heading';
  }, [compact]);

  const closed = useCallback(() => {
    if (compact) focusNext.current = 'opener';
  }, [compact]);

  return { asStep: compact && formOpen, compact, headingRef, createButtonRef, opened, closed };
}

/** The way back from a form's step to the list, above the form. */
export function BackToList({ onClick }: { onClick: () => void }) {
  return (
    <div className="px-4 py-2 border-b border-moss-green/10 shrink-0">
      <button
        type="button"
        onClick={onClick}
        className="touch-target inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink hover:text-brand-ink/80 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to the list
      </button>
    </div>
  );
}
