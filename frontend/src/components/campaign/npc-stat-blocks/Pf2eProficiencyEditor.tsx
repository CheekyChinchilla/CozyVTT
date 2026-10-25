/**
 * Pf2eProficiencyEditor
 * Saves and skills for a Pathfinder 2e creature.
 *
 * Deliberately unlike the D&D 5e editor beside it: nothing here is derived.
 * PF2e stat blocks print final modifiers because Paizo builds creatures from
 * level benchmark tables rather than from "level + proficiency rank +
 * attribute", so the printed number is the rule and the DM enters it directly.
 *
 * What this does provide is the right *shape* — three saves rather than six
 * ability saves, the sixteen core skills with trained-or-better entries only —
 * and a warning when a value looks far outside what a creature of that level
 * would have, to catch typos without overriding the DM.
 */

import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';
import type { NpcStatBlock } from '@/types';
import { formatModifier } from '@/utils/rules/dnd5e';
import {
  PF2E_SAVES,
  PF2E_SKILLS,
  isPf2eImplausible,
  setPf2eBonus,
} from './pf2eStatBlock';

interface Pf2eProficiencyEditorProps {
  statBlock: NpcStatBlock;
  onChange: (updated: NpcStatBlock) => void;
}

const MIN_PF2E_BONUS = -20;
const MAX_PF2E_BONUS = 50;

export default function Pf2eProficiencyEditor({
  statBlock,
  onChange,
}: Pf2eProficiencyEditorProps) {
  const [newSkill, setNewSkill] = useState('');

  const saves = statBlock.savingThrows ?? {};
  const skills = statBlock.skills ?? {};
  const level = statBlock.level;

  const listedSkills = Object.keys(skills).sort((a, b) => a.localeCompare(b));
  const availableSkills = PF2E_SKILLS.filter((s) => !(s in skills));

  const bonusInput = (
    kind: 'savingThrows' | 'skills',
    key: string,
    label: string,
    value: number
  ) => {
    const implausible = isPf2eImplausible(value, level);
    return (
      <div key={key} className="flex items-center gap-1.5 py-0.5">
        <span className="flex-1 truncate text-[11px] text-ink">{label}</span>
        <input
          type="number"
          aria-label={`${label} modifier`}
          value={value}
          min={MIN_PF2E_BONUS}
          max={MAX_PF2E_BONUS}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10);
            onChange(setPf2eBonus(statBlock, kind, key, Number.isFinite(parsed) ? parsed : 0));
          }}
          title={
            implausible
              ? `Unusual for a level ${level} creature — check against the benchmark tables`
              : undefined
          }
          className={`input-cozy input-cozy-number w-14 text-center text-[11px] ${
            implausible ? 'border-warning text-warning-ink' : ''
          }`}
        />
        {implausible && (
          <AlertTriangle
            className="h-3 w-3 shrink-0 text-warning-ink"
            aria-label={`${label} looks unusual for this level`}
          />
        )}
        {kind === 'skills' && (
          <button
            type="button"
            onClick={() => onChange(setPf2eBonus(statBlock, 'skills', key, null))}
            title="Remove this skill (creatures are untrained in unlisted skills)"
            aria-label={`Remove ${label}`}
            className="rounded-sm p-1 text-ink-muted hover:bg-danger/10 hover:text-danger-ink"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3 pl-1">
      <p className="rounded-cozy border border-moss-green/20 bg-parchment/40 px-2 py-1.5 text-[9px] text-ink-muted">
        Pathfinder 2e stat blocks list final modifiers, so these are entered
        directly rather than derived. Compare against the creature-building
        benchmarks for the creature&apos;s level.
      </p>

      <section>
        <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-gray">
          Saving Throws
        </h4>
        {PF2E_SAVES.map((save) =>
          bonusInput('savingThrows', save.key, save.label, saves[save.key] ?? 0)
        )}
      </section>

      <section>
        <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-stone-gray">
          Skills
        </h4>
        {listedSkills.length === 0 && (
          <p className="py-1 text-[10px] text-ink-muted">
            No trained skills. Add one below — creatures are untrained in
            anything not listed.
          </p>
        )}
        {listedSkills.map((key) =>
          bonusInput('skills', key, key.charAt(0).toUpperCase() + key.slice(1), skills[key])
        )}

        <div className="mt-1 flex items-center gap-1">
          <select
            aria-label="Add a trained skill"
            value={newSkill}
            onChange={(e) => {
              const chosen = e.target.value;
              setNewSkill('');
              if (chosen) onChange(setPf2eBonus(statBlock, 'skills', chosen, 0));
            }}
            className="input-cozy flex-1 text-[11px]"
          >
            <option value="">Add a trained skill…</option>
            {availableSkills.map((skill) => (
              <option key={skill} value={skill}>
                {skill}
              </option>
            ))}
          </select>
        </div>
      </section>

      {typeof level !== 'number' && (
        <p className="text-[9px] text-ink-muted">
          Set a Level above to get plausibility checks on these modifiers.
        </p>
      )}

      {listedSkills.length > 0 && (
        <p className="text-[9px] text-ink-muted">
          Printed as: {listedSkills.map((k) => `${k} ${formatModifier(skills[k])}`).join(', ')}
        </p>
      )}
    </div>
  );
}
