/**
 * ProficiencyEditor
 * Saves and skills for a D&D 5e creature, derived rather than typed.
 *
 * Replaces a free-text key/number editor in which a DM had to know how to spell
 * "sleightOfHand", nothing tied a bonus to the ability score two fields above
 * it, and any number at all was accepted — a commoner could be given a +30
 * Wisdom save. Here every standard save and skill is listed, ticking a box
 * derives the bonus from the ability modifier and the creature's proficiency
 * bonus, and an explicit override stays available for homebrew.
 */

import { AlertTriangle, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import type { NpcStatBlock, ProficiencyLevel } from '@/types';
import { MAX_BONUS_OVERRIDE, MIN_BONUS_OVERRIDE, formatModifier } from '@/utils/rules/dnd5e';
import {
  getProficiencyBonus,
  hasProficiencyOverride,
  readSaveRows,
  readSkillRows,
  removeCustomSkill,
  setBonusOverride,
  setProficiencyBonusOverride,
  setProficiencyLevel,
  type ProficiencyKind,
  type ProficiencyRow,
} from './statBlockProficiency';

interface ProficiencyEditorProps {
  statBlock: NpcStatBlock;
  onChange: (updated: NpcStatBlock) => void;
}

interface RowProps {
  row: ProficiencyRow;
  kind: ProficiencyKind;
  onSetLevel: (kind: ProficiencyKind, key: string, level: ProficiencyLevel) => void;
  onSetOverride: (kind: ProficiencyKind, key: string, bonus: number) => void;
  onRemoveCustom?: (key: string) => void;
}

function ProficiencyRowItem({ row, kind, onSetLevel, onSetOverride, onRemoveCustom }: RowProps) {
  const isCustom = row.level === 'custom';
  const isProficient = row.level === 'proficient' || row.level === 'expertise';
  const rowId = `${kind}-${row.key}`;

  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span className="flex-1 truncate text-[11px] text-ink" title={row.label}>
        {row.label}
        {row.ability && (
          <span className="ml-1 text-[9px] uppercase text-ink-muted">{row.ability}</span>
        )}
      </span>

      {isCustom ? (
        <>
          <input
            type="number"
            aria-label={`${row.label} bonus`}
            value={row.bonus}
            min={MIN_BONUS_OVERRIDE}
            max={MAX_BONUS_OVERRIDE}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              onSetOverride(kind, row.key, Number.isFinite(parsed) ? parsed : 0);
            }}
            title={
              row.implausible
                ? `Far outside what this creature's ability scores and CR support — derived would be ${formatModifier(row.derived)}`
                : undefined
            }
            className={`input-cozy input-cozy-number w-14 text-center text-[11px] ${
              row.implausible ? 'border-warning text-warning-ink' : ''
            }`}
          />
          {row.implausible && (
            <AlertTriangle
              className="h-3 w-3 shrink-0 text-warning-ink"
              aria-label={`${row.label} bonus looks too high for this creature`}
            />
          )}
          {row.isCustomSkill ? (
            <button
              type="button"
              onClick={() => onRemoveCustom?.(row.key)}
              title="Remove this custom skill"
              aria-label={`Remove ${row.label}`}
              className="rounded-sm p-1 text-ink-muted hover:bg-danger/10 hover:text-danger-ink"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSetLevel(kind, row.key, 'none')}
              title={`Back to the derived value (${formatModifier(row.derived)} if proficient)`}
              aria-label={`Reset ${row.label} to derived`}
              className="rounded-sm p-1 text-ink-muted hover:bg-moss-green/10 hover:text-brand-ink"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </>
      ) : (
        <>
          <label
            className="flex cursor-pointer items-center gap-1 text-[9px] uppercase text-ink-muted"
            htmlFor={`${rowId}-prof`}
            title={`Proficient in ${row.label}`}
          >
            <input
              id={`${rowId}-prof`}
              type="checkbox"
              checked={isProficient}
              onChange={(e) => onSetLevel(kind, row.key, e.target.checked ? 'proficient' : 'none')}
              className="h-3 w-3 accent-moss-green"
            />
            P
          </label>

          <label
            className={`flex items-center gap-1 text-[9px] uppercase ${
              isProficient ? 'cursor-pointer text-ink-muted' : 'cursor-not-allowed text-ink-muted/40'
            }`}
            htmlFor={`${rowId}-exp`}
            title={
              isProficient
                ? `Expertise in ${row.label} — doubles the proficiency bonus`
                : 'Requires proficiency first'
            }
          >
            <input
              id={`${rowId}-exp`}
              type="checkbox"
              checked={row.level === 'expertise'}
              disabled={!isProficient}
              onChange={(e) =>
                onSetLevel(kind, row.key, e.target.checked ? 'expertise' : 'proficient')
              }
              className="h-3 w-3 accent-moss-green disabled:opacity-40"
            />
            E
          </label>

          <span
            className={`w-8 text-right text-[11px] tabular-nums ${
              isProficient ? 'font-semibold text-brand-ink' : 'text-ink-muted'
            }`}
          >
            {formatModifier(row.bonus)}
          </span>

          <button
            type="button"
            onClick={() => onSetLevel(kind, row.key, 'custom')}
            title="Set this bonus by hand instead of deriving it"
            aria-label={`Override ${row.label}`}
            className="rounded-sm p-1 text-ink-muted hover:bg-moss-green/10 hover:text-brand-ink"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
}

export default function ProficiencyEditor({ statBlock, onChange }: ProficiencyEditorProps) {
  const proficiencyBonus = getProficiencyBonus(statBlock);
  const isOverridden = hasProficiencyOverride(statBlock);

  const saveRows = readSaveRows(statBlock);
  const skillRows = readSkillRows(statBlock);

  const handleSetLevel = (kind: ProficiencyKind, key: string, level: ProficiencyLevel) =>
    onChange(setProficiencyLevel(statBlock, kind, key, level));

  const handleSetOverride = (kind: ProficiencyKind, key: string, bonus: number) =>
    onChange(setBonusOverride(statBlock, kind, key, bonus));

  const handleRemoveCustom = (key: string) => onChange(removeCustomSkill(statBlock, key));

  return (
    <div className="space-y-3 pl-1">
      {/* Proficiency bonus — shown with its source so the derived numbers below
          are never a mystery. */}
      <div className="rounded-cozy border border-moss-green/20 bg-parchment/40 px-2 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-ink-muted">Proficiency Bonus</span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              aria-label="Proficiency bonus"
              value={proficiencyBonus}
              min={0}
              max={9}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                onChange(
                  setProficiencyBonusOverride(statBlock, Number.isFinite(parsed) ? parsed : 0)
                );
              }}
              className="input-cozy input-cozy-number w-12 text-center text-[11px]"
            />
            {isOverridden && (
              <button
                type="button"
                onClick={() => onChange(setProficiencyBonusOverride(statBlock, null))}
                title="Go back to the value derived from Challenge Rating"
                aria-label="Reset proficiency bonus"
                className="rounded-sm p-1 text-ink-muted hover:bg-moss-green/10 hover:text-brand-ink"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        <p className="mt-0.5 text-[9px] text-ink-muted">
          {isOverridden
            ? 'Set by hand — reset to follow Challenge Rating.'
            : `From CR ${statBlock.challengeRating || '0'}.`}
        </p>
      </div>

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-stone-gray">
            Saving Throws
          </h4>
          <span className="text-[9px] uppercase text-ink-muted">P / E</span>
        </div>
        {saveRows.map((row) => (
          <ProficiencyRowItem
            key={row.key}
            row={row}
            kind="saves"
            onSetLevel={handleSetLevel}
            onSetOverride={handleSetOverride}
          />
        ))}
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-stone-gray">
            Skills
          </h4>
          <span className="text-[9px] uppercase text-ink-muted">P / E</span>
        </div>
        {skillRows.map((row) => (
          <ProficiencyRowItem
            key={row.key}
            row={row}
            kind="skills"
            onSetLevel={handleSetLevel}
            onSetOverride={handleSetOverride}
            onRemoveCustom={handleRemoveCustom}
          />
        ))}
      </section>
    </div>
  );
}
