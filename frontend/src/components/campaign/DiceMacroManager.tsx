/**
 * Add, rename, correct and delete your saved dice rolls, and give each one a
 * character and a purpose of its own.
 *
 * The macros themselves are one-click buttons in the dice panel; this is where
 * the list is managed, so the panel keeps a single row of buttons and nothing
 * else. Opening it pre-fills the expression box with whatever is currently typed
 * in the dice panel, so "I have typed this three times now" becomes a macro
 * without retyping it.
 *
 * Expressions are checked by the server against the code that actually rolls
 * them, and its message is what gets shown — the client cannot tell a good
 * expression from a bad one on its own, and pretending otherwise here would let
 * someone save a button that fails every time they press it.
 */

import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { Dices, Plus, Pencil, Trash2, Loader2, Check, X } from 'lucide-react';
import { Button, Modal, Input } from '@/components/ui';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import api from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import { savedRollDetail } from '@/utils/savedRolls';
import { MAX_MACRO_CHARACTER_NAME_LENGTH, MAX_MACRO_PURPOSE_LENGTH } from '@/constants/diceLimits';
import type { DiceMacro } from '@/types';

interface DiceMacroManagerProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  /** Whatever is currently in the dice panel's expression box. */
  initialExpression?: string;
  /** Tell the panel the list changed, so its buttons refresh. */
  onMacrosChanged: (macros: DiceMacro[]) => void;
}

export default function DiceMacroManager({
  isOpen,
  onClose,
  campaignId,
  initialExpression = '',
  onMacrosChanged,
}: DiceMacroManagerProps) {
  const [macros, setMacros] = useState<DiceMacro[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newExpression, setNewExpression] = useState('');
  const [newCharacter, setNewCharacter] = useState('');
  const [newPurpose, setNewPurpose] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editExpression, setEditExpression] = useState('');
  const [editCharacter, setEditCharacter] = useState('');
  const [editPurpose, setEditPurpose] = useState('');

  const [macroToDelete, setMacroToDelete] = useState<DiceMacro | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const publish = useCallback(
    (next: DiceMacro[]) => {
      setMacros(next);
      onMacrosChanged(next);
    },
    [onMacrosChanged]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { macros: fetched } = await api.listDiceMacros(campaignId);
      publish(fetched);
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not load your macros.');
    } finally {
      setLoading(false);
    }
  }, [campaignId, publish]);

  // Reload each time it opens: another tab may have changed the list, and the
  // panel behind is about to render whatever this returns.
  useEffect(() => {
    if (!isOpen) return;
    void load();
    setNewName('');
    setNewExpression(initialExpression.trim());
    setNewCharacter('');
    setNewPurpose('');
    setEditingId(null);
    setError(null);
  }, [isOpen, load, initialExpression]);

  const handleAdd = async () => {
    setSaving(true);
    setError(null);
    try {
      const characterName = newCharacter.trim();
      const purpose = newPurpose.trim();
      const { macro } = await api.createDiceMacro(campaignId, {
        name: newName.trim(),
        expression: newExpression.trim(),
        ...(characterName ? { characterName } : {}),
        ...(purpose ? { purpose } : {}),
      });
      publish([...macros, macro]);
      setNewName('');
      setNewExpression('');
      setNewCharacter('');
      setNewPurpose('');
    } catch (err) {
      // The server's wording explains itself — "Too many dice. Maximum 100 per
      // expression." — so it is shown rather than replaced with something vague.
      setError(apiErrorMessage(err) ?? 'Could not save that macro.');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (macro: DiceMacro) => {
    setEditingId(macro.id);
    setEditName(macro.name);
    setEditExpression(macro.expression);
    setEditCharacter(macro.characterName ?? '');
    setEditPurpose(macro.purpose ?? '');
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      // An empty character or purpose is sent as it is, which clears it.
      const { macro } = await api.updateDiceMacro(campaignId, editingId, {
        name: editName.trim(),
        expression: editExpression.trim(),
        characterName: editCharacter.trim(),
        purpose: editPurpose.trim(),
      });
      // Replaced in place: the order is the order of the buttons, and an edit
      // must not move one.
      publish(macros.map((m) => (m.id === macro.id ? macro : m)));
      setEditingId(null);
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not save that change.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!macroToDelete) return;
    const doomed = macroToDelete;
    setMacroToDelete(null);
    setDeletingId(doomed.id);
    setError(null);
    try {
      await api.deleteDiceMacro(campaignId, doomed.id);
      publish(macros.filter((m) => m.id !== doomed.id));
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not delete that macro.');
    } finally {
      setDeletingId(null);
    }
  };

  const canAdd = newName.trim().length > 0 && newExpression.trim().length > 0 && !saving;

  const addOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && canAdd && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleAdd();
    }
  };

  return (
    <>
      <Modal open={isOpen} onClose={onClose} title="Saved rolls" icon={Dices} size="md">
        <div className="space-y-4">
          <p className="text-xs text-ink-secondary">
            Rolls you save here become buttons in the dice panel. They are yours alone
            and stay with this campaign. A roll with a character of its own is made as
            that character while the panel's Character box is empty, and a roll goes out
            with its purpose, or its name when it has none.
          </p>

          {error && (
            <p className="text-xs text-danger-ink" role="alert">
              {error}
            </p>
          )}

          {/* Existing macros */}
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-ink-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading your macros…
            </div>
          ) : macros.length === 0 ? (
            <p className="text-xs text-ink-secondary italic">
              Nothing saved yet. Add a roll below and it will appear in the dice panel.
            </p>
          ) : (
            // TODO(ui): the Edit, Delete, Save and Cancel buttons are p-1.5 around a
            // 16 px icon, so 28 by 28 px on a phone too. On a touch screen they
            // should be 44 by 44 (touch-target), as the compact layout's controls are.
            <ul className="space-y-1.5">
              {macros.map((macro) => (
                <li
                  key={macro.id}
                  className="flex items-center gap-2 p-2 rounded-lg border border-moss-green/20 bg-surface/40"
                >
                  {editingId === macro.id ? (
                    <>
                      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          aria-label={`Name for ${macro.name}`}
                          className="min-w-0"
                        />
                        <Input
                          value={editExpression}
                          onChange={(e) => setEditExpression(e.target.value)}
                          aria-label={`Expression for ${macro.name}`}
                          className="min-w-0 font-mono"
                        />
                        <Input
                          value={editCharacter}
                          onChange={(e) => setEditCharacter(e.target.value)}
                          placeholder="Character (optional)"
                          aria-label={`Character for ${macro.name}`}
                          maxLength={MAX_MACRO_CHARACTER_NAME_LENGTH}
                          className="min-w-0"
                        />
                        <Input
                          value={editPurpose}
                          onChange={(e) => setEditPurpose(e.target.value)}
                          placeholder="Purpose (optional)"
                          aria-label={`Purpose for ${macro.name}`}
                          maxLength={MAX_MACRO_PURPOSE_LENGTH}
                          className="min-w-0"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={saving}
                        aria-label={`Save changes to ${macro.name}`}
                        className="p-1.5 rounded-lg text-success-ink hover:bg-success/10 disabled:opacity-40"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel editing"
                        className="p-1.5 rounded-lg text-ink-secondary hover:bg-surface"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm text-ink">{macro.name}</span>
                        {savedRollDetail(macro) && (
                          <span className="block truncate text-xs text-ink-secondary">{savedRollDetail(macro)}</span>
                        )}
                      </span>
                      <span className="font-mono text-xs text-ink-secondary shrink-0">
                        {macro.expression}
                      </span>
                      <button
                        type="button"
                        onClick={() => startEditing(macro)}
                        aria-label={`Edit ${macro.name}`}
                        className="p-1.5 rounded-lg text-ink-secondary hover:bg-surface"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setMacroToDelete(macro)}
                        disabled={deletingId === macro.id}
                        aria-label={`Delete ${macro.name}`}
                        className="p-1.5 rounded-lg text-danger-ink hover:bg-danger/10 disabled:opacity-40"
                      >
                        {deletingId === macro.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Add a new one */}
          <div className="pt-3 border-t border-moss-green/20 space-y-2">
            <div className="text-xs text-ink-secondary">Add a roll</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name, e.g. Wild magic"
                aria-label="Macro name"
                className="min-w-0"
                onKeyDown={addOnEnter}
              />
              <Input
                value={newExpression}
                onChange={(e) => setNewExpression(e.target.value)}
                placeholder="e.g. 4d6kh3"
                aria-label="Macro expression"
                className="min-w-0 font-mono"
                onKeyDown={addOnEnter}
              />
              <Input
                value={newCharacter}
                onChange={(e) => setNewCharacter(e.target.value)}
                placeholder="Character (optional)"
                aria-label="Macro character"
                maxLength={MAX_MACRO_CHARACTER_NAME_LENGTH}
                className="min-w-0"
                onKeyDown={addOnEnter}
              />
              <Input
                value={newPurpose}
                onChange={(e) => setNewPurpose(e.target.value)}
                placeholder="Purpose (optional)"
                aria-label="Macro purpose"
                maxLength={MAX_MACRO_PURPOSE_LENGTH}
                className="min-w-0"
                onKeyDown={addOnEnter}
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleAdd}
                disabled={!canAdd}
                variant="secondary"
                className="flex items-center gap-2 shrink-0"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!macroToDelete}
        title="Delete saved roll"
        message={`Delete "${macroToDelete?.name ?? 'this roll'}"? Its button disappears from the dice panel. Nothing you have already rolled is affected.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setMacroToDelete(null)}
      />
    </>
  );
}
