/**
 * PrintedSkillsEditor
 * Skills for a creature whose system prints its numbers and has nothing to
 * work them out from: Call of Cthulhu's percentages, Shadowrun 6e's dice
 * pools. Each skill is a name and the number the DM types, stored as given.
 */

import { X } from 'lucide-react';
import { useState } from 'react';
import type { NpcStatBlock } from '@/types';
import { STAT_BLOCK_LIMITS, statBlockNumberBounds } from '@/constants/statBlockLimits';

interface PrintedSkillsEditorProps {
  statBlock: NpcStatBlock;
  onChange: (updated: NpcStatBlock) => void;
  /** The campaign's game system, which sets the highest skill the server keeps. */
  gameSystem: string | null;
}

export default function PrintedSkillsEditor({ statBlock, onChange, gameSystem }: PrintedSkillsEditorProps) {
  const [newSkill, setNewSkill] = useState('');
  const { minSkill, maxSkill } = statBlockNumberBounds(gameSystem);
  const clampSkill = (value: number) => Math.max(minSkill, Math.min(maxSkill, value));

  const skills = statBlock.skills ?? {};
  const names = Object.keys(skills).sort((a, b) => a.localeCompare(b));
  const full = names.length >= STAT_BLOCK_LIMITS.maxBonusEntries;
  const setSkills = (next: Record<string, number>) => onChange({ ...statBlock, skills: next });

  const add = () => {
    const name = newSkill.trim();
    if (!name || full || Object.prototype.hasOwnProperty.call(skills, name)) return;
    setSkills({ ...skills, [name]: 0 });
    setNewSkill('');
  };

  return (
    <div className="space-y-1 pl-1">
      <p className="text-[9px] text-ink-muted">
        Enter each skill as the creature&apos;s stat block prints it; nothing is worked out from the scores.
      </p>
      {names.length === 0 && <p className="py-1 text-[10px] text-ink-muted">No skills yet.</p>}
      {names.map((name) => (
        <div key={name} className="flex items-center gap-1.5 py-0.5">
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{name}</span>
          <input
            type="number"
            aria-label={name}
            value={skills[name]}
            min={minSkill}
            max={maxSkill}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              setSkills({ ...skills, [name]: clampSkill(Number.isFinite(parsed) ? parsed : 0) });
            }}
            className="input-cozy input-cozy-number w-14 text-center text-[11px]"
          />
          <button
            type="button"
            onClick={() => {
              const { [name]: _removed, ...rest } = skills;
              setSkills(rest);
            }}
            aria-label={`Remove ${name}`}
            className="touch-target inline-flex items-center justify-center rounded-sm p-1 text-ink-muted hover:bg-danger/10 hover:text-danger-ink"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <div className="mt-1 flex items-center gap-1">
        <input
          type="text"
          aria-label="New skill"
          value={newSkill}
          maxLength={STAT_BLOCK_LIMITS.maxBonusKeyLength}
          disabled={full}
          placeholder="Add a skill…"
          onChange={(e) => setNewSkill(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className="input-cozy min-w-0 flex-1 text-[11px]"
        />
        <button
          type="button"
          onClick={add}
          disabled={full || !newSkill.trim()}
          className="rounded-sm px-2 py-1 text-[11px] text-brand-ink hover:bg-brand/10 disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {full && <p className="text-[9px] text-ink-muted">A creature can have at most {STAT_BLOCK_LIMITS.maxBonusEntries} skills.</p>}
    </div>
  );
}
