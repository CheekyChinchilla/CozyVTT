/**
 * NewCharacterTemplateModal
 * Publishes a new shareable starter sheet.
 *
 * The sheet itself starts from the same blank the character-creation flow uses,
 * fetched from the backend so it arrives with every field its game system
 * requires. The author then fills it in through the normal sheet editor.
 */

import { useState } from 'react';
import { FileText } from 'lucide-react';
import api from '@/services/api';
import { useToast } from '@/contexts/ToastContext';
import { GAME_SYSTEM_OPTIONS } from '@/constants/game-systems';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import { Input, Textarea, Select } from '@/components/ui/Input';

interface NewCharacterTemplateModalProps {
  onClose: () => void;
  onCreated: () => void;
  /** Prefill from an existing sheet — used by "Save as Template". */
  initial?: {
    name?: string;
    gameSystem?: string | null;
    data?: unknown;
    tokenImageUrl?: string | null;
  };
}

export default function NewCharacterTemplateModal({
  onClose,
  onCreated,
  initial,
}: NewCharacterTemplateModalProps) {
  const { showToast } = useToast();

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState('');
  const [gameSystem, setGameSystem] = useState(initial?.gameSystem ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When prefilled from an existing sheet the system is fixed — the data only
  // makes sense against the system it was written for.
  const systemLocked = initial?.data !== undefined;

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('A template name is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let data = initial?.data;

      // No sheet supplied: start from the backend's blank for this system so
      // every required field is present, exactly as character creation does.
      if (data === undefined) {
        const systemParam = gameSystem || 'null';
        const starter = await api.getStarterSheet(systemParam, 'blank');
        data = starter.data ?? {};
      }

      await api.createCharacterTemplate({
        name: name.trim(),
        description: description.trim() || null,
        gameSystem: gameSystem || null,
        tokenImageUrl: initial?.tokenImageUrl ?? null,
        data,
      });

      showToast('Template published', 'success');
      onCreated();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Failed to create the template';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial?.data !== undefined ? 'Save as Template' : 'New Character Template'}
      icon={FileText}
      closeDisabled={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            Publish Template
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-secondary">
          Templates are visible to everyone on this instance. Anyone can copy one into a character
          of their own; only you can edit or remove it.
        </p>

        <Field label="Template name" required error={error}>
          {(props) => (
            <Input
              {...props}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Novice Fighter"
              maxLength={200}
            />
          )}
        </Field>

        <Field
          label="Description"
          hint="What this template is for, and who it suits — shown on the card."
        >
          {(props) => (
            <Textarea
              {...props}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="A straightforward melee character, good for a first session."
            />
          )}
        </Field>

        <Field
          label="Game system"
          hint={
            systemLocked
              ? 'Taken from the sheet this template was made from.'
              : 'Fixed once published, the same way a character works.'
          }
        >
          {(props) => (
            <Select
              {...props}
              value={gameSystem ?? ''}
              disabled={systemLocked}
              onChange={(e) => setGameSystem(e.target.value)}
            >
              <option value="">Flexible (No System)</option>
              {GAME_SYSTEM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Modal>
  );
}
