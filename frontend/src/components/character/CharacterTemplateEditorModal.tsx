/**
 * CharacterTemplateEditorModal
 * Edits a template's sheet using the same editor a character uses.
 *
 * A template holds the same `data` blob a Character does for the same game
 * system, so rather than build a second set of per-system forms, this wraps the
 * template in a Character-shaped object and hands it to CharacterSheetRouter.
 * The sheet cannot tell the difference, and every system is supported for free.
 */

import { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import api from '@/services/api';
import { useToast } from '@/contexts/ToastContext';
import { apiErrorMessage, apiValidationIssues } from '@/utils/errors';
import { refusedSaveMessage } from '@/utils/sheetSaveRefusal';
import type { Character, CharacterData, CharacterTemplate } from '@/types';
import { TEMPLATE_PICTURE_NOT_USED } from '@/utils/templatePicture';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { CharacterSheetRouter } from '@/components/character-sheets/CharacterSheetRouter';
import { isStaleCharacterSave } from '@/utils/staleCharacter';
import { useStaleSaveReapply } from './StaleSaveDialog';

interface CharacterTemplateEditorModalProps {
  template: CharacterTemplate;
  onClose: () => void;
  onSaved: () => void;
}

export default function CharacterTemplateEditorModal({
  template: opened,
  onClose,
  onSaved,
}: CharacterTemplateEditorModalProps) {
  const { showToast } = useToast();
  // The template as last saved from here. The dialog stays open after a save,
  // and its sheet shows what was saved, not the version it opened with.
  const [template, setTemplate] = useState(opened);

  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? '');
  const [savingDetails, setSavingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the sheet holds edits not saved yet, as the sheet reports it.
  const [sheetDirty, setSheetDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // The version the sheet's form was made from, sent with each save so that
  // a save over someone else's newer one is refused, and the sheet as it was
  // then, what a refused save's changes are measured from. As in the
  // character editor, they move on only with a save made from them.
  const [loadedAt, setLoadedAt] = useState(opened.updatedAt);
  const openedSheetRef = useRef(opened.data as CharacterData);
  // The name and description as last loaded or saved: a refused details save
  // goes ahead over a newer version only when these are still what it holds.
  const detailsBaseRef = useRef({ name: opened.name, description: opened.description ?? null });
  const staleSave = useStaleSaveReapply();

  // Ask before closing only when sheet edits would be lost.
  const requestClose = () => {
    if (sheetDirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  /**
   * The template dressed as a Character so the existing sheets can render it.
   * Ids are the template's own — nothing here is ever persisted as a character.
   */
  const asCharacter: Character = {
    id: template.id,
    userId: template.createdById ?? '',
    campaignId: null,
    gameSystem: template.gameSystem,
    name: template.name,
    data: template.data as CharacterData,
    tokenImageUrl: template.tokenImageUrl,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };

  const handleSaveDetails = async () => {
    if (!name.trim()) {
      setError('A template name is required');
      return;
    }
    setSavingDetails(true);
    setError(null);
    const details = { name: name.trim(), description: description.trim() || null };
    try {
      let updated: CharacterTemplate;
      try {
        updated = await api.updateCharacterTemplate(template.id, { ...details, updatedAt: loadedAt });
        // Made from the sheet's version, so the stored sheet is still the one
        // the form was made from.
        setLoadedAt(updated.updatedAt);
      } catch (err) {
        if (!isStaleCharacterSave(err)) throw err;
        // Saved meanwhile by someone else. Only a change to the name or
        // description is theirs to lose; a sheet change is left alone.
        const latest = await api.getCharacterTemplate(template.id);
        const base = detailsBaseRef.current;
        if (latest.name !== base.name || (latest.description ?? null) !== base.description) {
          detailsBaseRef.current = { name: latest.name, description: latest.description ?? null };
          setError(
            `Someone else changed this template's name or description after you opened it. It is now named "${latest.name}". Press Save Details again to save yours in its place.`
          );
          return;
        }
        updated = await api.updateCharacterTemplate(template.id, { ...details, updatedAt: latest.updatedAt });
      }
      detailsBaseRef.current = { name: updated.name, description: updated.description ?? null };
      setTemplate(updated);
      showToast('Template updated', 'success');
      onSaved();
      // Closing now would drop sheet edits not saved yet, so the dialog stays
      // open for them.
      if (!sheetDirty) onClose();
    } catch (err) {
      setError(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          'Failed to update the template'
      );
    } finally {
      setSavingDetails(false);
    }
  };

  /**
   * Sheet edits save straight through to the template's data blob.
   *
   * A refused save is thrown on, so the sheet stays in its editor with the
   * edits; caught here, the sheet took it as saved, went back to its view of
   * the unchanged template and lost them.
   */
  const handleSheetSave = async (data: CharacterData, _showToast?: boolean, tokenImageUrl?: string) => {
    let saved: CharacterTemplate;
    let carriedOver = false;
    try {
      try {
        saved = await api.updateCharacterTemplate(template.id, { data, updatedAt: loadedAt });
      } catch (error) {
        // Saving over someone else's newer version would undo it. The sheet
        // stays in its editor, the changes are carried onto the newest
        // version, and that is saved once the user says so.
        if (!isStaleCharacterSave(error)) throw error;
        const stored = await staleSave.reapply({
          opened: openedSheetRef.current,
          edited: data,
          withNewPicture: false,
          subject: 'template',
          fetchLatest: () => api.getCharacterTemplate(template.id),
          save: (merged, updatedAt) => api.updateCharacterTemplate(template.id, { data: merged, updatedAt }),
        });
        if (!stored) throw error;
        saved = stored;
        carriedOver = true;
      }
    } catch (err) {
      // The user chose to keep editing; the dialog has said why.
      if (isStaleCharacterSave(err)) throw err;
      // Name each box the server refused, as the character editors do, so
      // whoever is over a limit knows what to shorten.
      showToast(
        refusedSaveMessage(apiValidationIssues(err) ?? [], apiErrorMessage(err), 'Failed to save the sheet'),
        'error'
      );
      throw err;
    }
    setTemplate(saved);
    // After changes were carried over, the form is still the older version's,
    // so its next save is refused and carried over in turn.
    if (!carriedOver) {
      setLoadedAt(saved.updatedAt);
      openedSheetRef.current = saved.data as CharacterData;
    }
    // The sheet here has no token picker: it uploads the picture as the user's
    // own asset, and a template's picture must be a global one. Should a
    // picture come anyway, it is not sent, and the toast says so.
    if (tokenImageUrl !== undefined) {
      showToast(TEMPLATE_PICTURE_NOT_USED, 'warning');
    } else {
      showToast('Template sheet saved', 'success');
    }
    onSaved();
  };

  return (
    <>
    <Modal
      open
      onClose={confirmClose || staleSave.asking ? () => {} : requestClose}
      title="Edit Template"
      icon={FileText}
      size="xl"
      closeDisabled={savingDetails}
    >
      <div className="space-y-6">
        <div className="space-y-4">
          <Field label="Template name" required error={error}>
            {(props) => (
              <Input
                {...props}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
              />
            )}
          </Field>

          <Field label="Description">
            {(props) => (
              <Textarea
                {...props}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={2000}
              />
            )}
          </Field>

          <div className="flex justify-end">
            <Button onClick={handleSaveDetails} loading={savingDetails}>
              Save Details
            </Button>
          </div>
        </div>

        <div className="border-t border-ink/10 pt-4">
          <h3 className="text-sm font-semibold text-brand-ink mb-3">Sheet</h3>
          <CharacterSheetRouter
            character={asCharacter}
            mode="edit"
            onSave={handleSheetSave}
            onCancel={requestClose}
            onDirtyChange={setSheetDirty}
            allowTokenPicture={false}
          />
        </div>
      </div>
    </Modal>
    <ConfirmDialog
      isOpen={confirmClose}
      title="Discard Changes?"
      message="The sheet has changes you haven't saved. Close it and lose them?"
      confirmLabel="Discard"
      cancelLabel="Keep Editing"
      variant="warning"
      onConfirm={onClose}
      onCancel={() => setConfirmClose(false)}
    />
    {staleSave.dialog}
    </>
  );
}
