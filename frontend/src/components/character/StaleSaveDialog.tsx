/**
 * What happens when a character save is refused because the character changed
 * after the editor opened it.
 *
 * The editor stays open with everything typed. The newest version is fetched,
 * the user's own changes are carried onto it (utils/reapplyEdits), and this
 * dialog shows what was carried over. Where a field changed both in the editor
 * and in the newest version, it shows both values and the user picks one.
 * Nothing is saved until they press Save my changes; Keep editing leaves the
 * editor as it was, still unsaved.
 *
 * Both the editor that opens over a sheet and the full-page Character Editor
 * use `useStaleSaveReapply`, so the two behave the same way.
 */

import { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import type { Character, CharacterData } from '@/types';
import {
  reapplyEdits,
  withChoices,
  describePath,
  describeValue,
  type Reapplied,
} from '@/utils/reapplyEdits';
import { isStaleCharacterSave } from '@/utils/staleCharacter';

interface StaleSaveDialogProps {
  result: Reapplied<CharacterData>;
  /** A new token picture goes with the save. */
  withNewPicture: boolean;
  onSave: (keepMine: boolean[]) => void;
  onKeepEditing: () => void;
}

export function StaleSaveDialog({ result, withNewPicture, onSave, onKeepEditing }: StaleSaveDialogProps) {
  const { applied, conflicts, merged } = result;
  // Nothing is picked for the user: each field changed in both places waits
  // for a choice before Save is offered.
  const [choices, setChoices] = useState<(boolean | null)[]>(() => conflicts.map(() => null));
  const allChosen = choices.every((choice) => choice !== null);
  const nothingToCarry = applied.length === 0 && conflicts.length === 0 && !withNewPicture;

  return (
    <Modal
      open
      onClose={onKeepEditing}
      title="This character has changed"
      icon={RefreshCw}
      size="md"
      layer="overlay"
      closeOnBackdrop={false}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onKeepEditing}>
            Keep editing
          </Button>
          <Button
            type="button"
            onClick={() => onSave(choices.map((choice) => choice === true))}
            disabled={!allChosen}
          >
            Save my changes
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-ink-secondary">
        <p>
          It was changed somewhere else after you opened it, at the table or in another window.
          Nothing you typed has been saved yet. Your changes have been put onto the newest
          version, and nothing is saved until you press <strong>Save my changes</strong>.
        </p>

        {nothingToCarry && <p>Everything you changed is already in the newest version.</p>}

        {(applied.length > 0 || withNewPicture) && (
          <section aria-labelledby="stale-save-applied">
            <h3 id="stale-save-applied" className="font-semibold text-ink mb-1">
              Your changes
            </h3>
            <ul className="max-h-48 overflow-y-auto space-y-1 rounded-cozy border border-ink/10 p-2">
              {applied.map((edit) => (
                <li key={edit.path.join('.')}>
                  <span className="font-medium text-ink">{describePath(edit.path, merged)}:</span>{' '}
                  {describeValue(edit.mine)}
                </li>
              ))}
              {withNewPicture && (
                <li>
                  <span className="font-medium text-ink">Token picture:</span> the new one you chose
                </li>
              )}
            </ul>
          </section>
        )}

        {conflicts.length > 0 && (
          <section aria-labelledby="stale-save-conflicts" className="space-y-2">
            <h3 id="stale-save-conflicts" className="font-semibold text-ink">
              Changed in both places
            </h3>
            <p>These were changed by you and in the newest version. Choose which to keep.</p>
            {conflicts.map((conflict, i) => {
              const key = conflict.path.join('.');
              return (
                <fieldset key={key} className="rounded-cozy border border-ink/10 p-2">
                  <legend className="px-1 font-medium text-ink">{describePath(conflict.path, merged)}</legend>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name={`stale-save-${key}`}
                      checked={choices[i] === true}
                      onChange={() => setChoices((prev) => prev.map((c, j) => (j === i ? true : c)))}
                    />
                    <span>Yours: {describeValue(conflict.mine)}</span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name={`stale-save-${key}`}
                      checked={choices[i] === false}
                      onChange={() => setChoices((prev) => prev.map((c, j) => (j === i ? false : c)))}
                    />
                    <span>Newest version: {describeValue(conflict.theirs)}</span>
                  </label>
                </fieldset>
              );
            })}
          </section>
        )}
      </div>
    </Modal>
  );
}

export interface StaleSaveRequest {
  /** The sheet as the editor opened it: what the user's changes are measured from. */
  opened: CharacterData;
  /** What the refused save sent. */
  edited: CharacterData;
  /** A new token picture goes with the save. */
  withNewPicture: boolean;
  fetchLatest: () => Promise<Character>;
  /** Told about each newer version fetched, so the host can show it elsewhere. */
  onLatest?: (latest: Character) => void;
  /** Saves `data` as made from the version stored at `updatedAt`. */
  save: (data: CharacterData, updatedAt: string) => Promise<Character>;
}

interface Question {
  result: Reapplied<CharacterData>;
  withNewPicture: boolean;
  answer: (keepMine: boolean[] | null) => void;
}

/**
 * Handles a stale save for an editor host. `reapply` resolves with the stored
 * character once the user has confirmed and the save has gone through, or with
 * null when they chose to keep editing. A save refused as stale again, because
 * the character changed once more meanwhile, starts over from the version that
 * was just shown. Any other failure is thrown, for the host to report.
 */
export function useStaleSaveReapply() {
  const [question, setQuestion] = useState<Question | null>(null);

  const reapply = useCallback(async (request: StaleSaveRequest): Promise<Character | null> => {
    let opened = request.opened;
    let edited = request.edited;
    for (;;) {
      const latest = await request.fetchLatest();
      request.onLatest?.(latest);
      const result = reapplyEdits(opened, edited, latest.data);
      const keepMine = await new Promise<boolean[] | null>((resolve) => {
        setQuestion({
          result,
          withNewPicture: request.withNewPicture,
          answer: (choice) => {
            setQuestion(null);
            resolve(choice);
          },
        });
      });
      if (!keepMine) return null;

      const merged = withChoices(result, keepMine);
      try {
        return await request.save(merged, latest.updatedAt);
      } catch (error) {
        if (!isStaleCharacterSave(error)) throw error;
        opened = latest.data;
        edited = merged;
      }
    }
  }, []);

  const dialog = question ? (
    <StaleSaveDialog
      result={question.result}
      withNewPicture={question.withNewPicture}
      onSave={(keepMine) => question.answer(keepMine)}
      onKeepEditing={() => question.answer(null)}
    />
  ) : null;

  return { reapply, dialog, asking: question !== null };
}
