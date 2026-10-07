/**
 * CharacterTemplateEditorModal
 * Edits a template's sheet using the same editor a character uses.
 *
 * A template holds the same `data` blob a Character does for the same game
 * system, so rather than build a second set of per-system forms, this wraps the
 * template in a Character-shaped object and hands it to CharacterSheetRouter.
 * The sheet cannot tell the difference, and every system is supported for free.
 */

import { useState } from 'react';
import { FileText } from 'lucide-react';
import api from '@/services/api';
import { useToast } from '@/contexts/ToastContext';
import type { Character, CharacterData, CharacterTemplate } from '@/types';

/** Said when a sheet save from here came with a token picture, which a template cannot use. */
export const TEMPLATE_PICTURE_NOT_USED =
  "Template sheet saved, without the token picture you chose: a template's picture has to be a global asset, so that everyone who copies the template can see it.";
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { CharacterSheetRouter } from '@/components/character-sheets/CharacterSheetRouter';

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
    try {
      const updated = await api.updateCharacterTemplate(template.id, {
        name: name.trim(),
        description: description.trim() || null,
      });
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
    try {
      setTemplate(await api.updateCharacterTemplate(template.id, { data }));
    } catch (err) {
      showToast(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
          'Failed to save the sheet',
        'error'
      );
      throw err;
    }
    // TODO(ui): the sheet's token picker uploads the picture as the user's own
    // asset, and a template's picture must be a global one, so the server
    // refuses it; sending it would fail every save until the editor was
    // cancelled. The picker should be hidden here, or offer global assets.
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
      onClose={confirmClose ? () => {} : requestClose}
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
    </>
  );
}
