// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * ArmorList Component
 *
 * The armor a Horror d100 character wears: each piece with its armor value,
 * which is taken off the damage of a blow, and notes.
 */

import React from 'react';
import { Shield, Plus, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import NumberField from '../../../ui/NumberField';
import ListLimitNote, { listIsFull } from '../../ListLimitNote';
import { LIMIT_NOTE_CLASS } from '../limitNoteClass';
import { HORROR_D100_VALUE_MAX, SHEET_LONG_TEXT_MAX, SHEET_SHORT_TEXT_MAX } from '@/constants/sheetLimits';
import type { HorrorD100SheetArmor } from '@/types/game-systems/horrorD100Sheet';

interface ArmorListProps {
  /** The pieces of armor from character data */
  armor: readonly HorrorD100SheetArmor[];

  /** Edit mode */
  editable?: boolean;

  /** Edit mode: replaces the list. */
  onChange?: (armor: HorrorD100SheetArmor[]) => void;

  /** Edit mode: what is wrong with a piece, by its place in the list. */
  nameErrors?: Readonly<Record<number, string>>;
}

/**
 * ArmorList - the armor a character wears
 */
export const ArmorList: React.FC<ArmorListProps> = ({ armor, editable = false, onChange, nameErrors = {} }) => {
  const set = <K extends keyof HorrorD100SheetArmor>(index: number, field: K, value: HorrorD100SheetArmor[K]) =>
    onChange?.(armor.map((piece, i) => (i === index ? { ...piece, [field]: value } : piece)));

  const full = listIsFull(armor);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <Shield className="w-5 h-5 text-ink-secondary" />
          <h3 className="text-lg font-bold text-ink">Armor</h3>
        </div>
        {editable && (
          <Button
            onClick={() => onChange?.([...armor, { name: 'New Armor', armorValue: 0, notes: '' }])}
            disabled={full}
            variant="secondary" className="text-sm py-1 px-3 flex items-center space-x-1"
          >
            <Plus className="w-4 h-4" />
            <span>Add Armor</span>
          </Button>
        )}
      </div>
      {editable && <ListLimitNote full={full} className={LIMIT_NOTE_CLASS} />}

      {armor.length === 0 ? (
        <p className="text-sm text-ink-secondary italic">No armor worn</p>
      ) : (
        <div className="space-y-2">
          {armor.map((piece, index) =>
            editable ? (
              <div key={index} className="bg-paper border border-ink/20 rounded-md p-3 space-y-2">
                {/* Below sm the armor value takes a line of its own under
                    the name and the remove button. */}
                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <input
                    type="text"
                    value={piece.name}
                    onChange={(e) => set(index, 'name', e.target.value)}
                    aria-label={`Name of armor ${index + 1}`}
                    aria-invalid={nameErrors[index] ? true : undefined}
                    placeholder="Name"
                    maxLength={SHEET_SHORT_TEXT_MAX}
                    className={`min-w-0 flex-1 px-2 py-1 rounded-sm text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-brand ${nameErrors[index] ? 'border-2 border-danger' : 'border border-ink/20'}`}
                  />
                  <label className="order-last w-full sm:order-none sm:w-auto flex items-center gap-2 text-xs text-ink-secondary uppercase">
                    Armor value
                    <NumberField
                      value={piece.armorValue}
                      onChange={(v: number) => set(index, 'armorValue', v)}
                      aria-label={`Armor value of armor ${index + 1}`}
                      min={0}
                      max={HORROR_D100_VALUE_MAX}
                      fallback={piece.armorValue === undefined ? null : 0}
                      className="w-16 px-2 py-1 border border-ink/20 rounded-sm text-sm text-center text-ink bg-paper focus:outline-hidden focus:ring-2 focus:ring-brand"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => onChange?.(armor.filter((_, i) => i !== index))}
                    aria-label={`Remove ${piece.name || `armor ${index + 1}`}`}
                    title="Remove"
                    className="touch-target inline-flex items-center justify-center p-1 rounded-sm text-danger-ink hover:bg-danger/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={piece.notes ?? ''}
                  onChange={(e) => set(index, 'notes', e.target.value)}
                  aria-label={`Notes on armor ${index + 1}`}
                  placeholder="Notes"
                  rows={2}
                  maxLength={SHEET_LONG_TEXT_MAX}
                  className="w-full px-2 py-1 border border-ink/20 rounded-sm text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
                />
              </div>
            ) : (
              <div key={index} className="bg-paper border border-ink/20 rounded-md p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-ink">{piece.name}</div>
                  {piece.armorValue !== undefined && (
                    <div className="shrink-0 text-sm text-ink-secondary">
                      Armor value <span className="font-semibold text-ink">{piece.armorValue}</span>
                    </div>
                  )}
                </div>
                {piece.notes && <p className="text-sm text-ink-secondary mt-1 whitespace-pre-wrap">{piece.notes}</p>}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default ArmorList;
