/**
 * StatBlockEditor
 * DM inline editor for NPC stat blocks. Provides a compact form to edit
 * all stat block fields. Used inside the NpcQuickEditor panel.
 */

import { useState, useCallback } from 'react';
import { Plus, X, ChevronDown, ChevronRight } from 'lucide-react';
import type { NpcStatBlock } from '@/types';
import { ABILITY_KEYS, CHALLENGE_RATINGS } from '@/utils/rules/dnd5e';
import ProficiencyEditor from './ProficiencyEditor';
import Pf2eProficiencyEditor from './Pf2eProficiencyEditor';
import { changeAbilitiesOrRating } from './statBlockProficiency';
import { readAttributeModifiers, setAttributeModifier } from './pf2eStatBlock';
import { STAT_BLOCK_LIMITS } from '@/constants/statBlockLimits';

interface StatBlockEditorProps {
  statBlock: NpcStatBlock;
  onChange: (updated: NpcStatBlock) => void;
  /**
   * The campaign's game system. Decides how this stat block is interpreted:
   * D&D 5e derives saves and skills from ability scores and Challenge Rating,
   * while Pathfinder 2e stores printed modifiers against a creature Level.
   * Defaults to 5e, which is the shape the stat block was designed around.
   */
  gameSystem?: string | null;
}

type ActionEntry = { name: string; description: string };

export default function StatBlockEditor({
  statBlock,
  onChange,
  gameSystem = 'DND_5E',
}: StatBlockEditorProps) {
  const isPf2e = gameSystem === 'PATHFINDER_2E';
  const pf2eModifiers = readAttributeModifiers(statBlock);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['core', 'abilities']));

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const update = useCallback(
    (changes: Partial<NpcStatBlock>) => {
      onChange({ ...statBlock, ...changes });
    },
    [statBlock, onChange]
  );

  // Ability scores and CR both feed every derived save and skill, so changing
  // one has to move the others — raising Wisdom must raise Perception.
  // Bonuses marked as overrides keep their value.
  const updateAbility = useCallback(
    (ab: keyof NpcStatBlock['abilities'], value: number) => {
      onChange(changeAbilitiesOrRating(statBlock, { abilities: { ...statBlock.abilities, [ab]: value } }));
    },
    [statBlock, onChange]
  );

  const updateChallengeRating = useCallback(
    (cr: string) => {
      onChange(changeAbilitiesOrRating(statBlock, { challengeRating: cr || undefined }));
    },
    [statBlock, onChange]
  );

  const updateActionList = useCallback(
    (field: 'traits' | 'actions' | 'bonusActions' | 'reactions' | 'legendaryActions', items: ActionEntry[]) => {
      update({ [field]: items });
    },
    [update]
  );

  const isExpanded = (s: string) => expandedSections.has(s);

  return (
    <div className="space-y-1 text-xs">
      {/* ── Core Stats ── */}
      <SectionHeader title="Core Stats" section="core" expanded={isExpanded('core')} toggle={toggleSection} />
      {isExpanded('core') && (
        <div className="space-y-2 pl-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-ink-muted block mb-0.5">Creature Type</label>
              <input
                type="text"
                value={statBlock.creatureType || ''}
                onChange={(e) => update({ creatureType: e.target.value })}
                placeholder="Medium humanoid"
                maxLength={STAT_BLOCK_LIMITS.maxCreatureTypeLength}
                className="input-cozy w-full text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-ink-muted block mb-0.5">Alignment</label>
              <input
                type="text"
                value={statBlock.alignment || ''}
                onChange={(e) => update({ alignment: e.target.value })}
                placeholder="neutral evil"
                maxLength={STAT_BLOCK_LIMITS.maxAlignmentLength}
                className="input-cozy w-full text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-ink-muted block mb-0.5">AC</label>
              <input
                type="number"
                value={statBlock.ac}
                onChange={(e) => update({ ac: parseInt(e.target.value, 10) || 0 })}
                className="input-cozy input-cozy-number w-full text-xs text-center"
              />
            </div>
            {isPf2e ? (
              <div>
                {/* PF2e rates creatures by Level, not Challenge Rating. */}
                <label className="text-[10px] text-ink-muted block mb-0.5" htmlFor="statblock-level">Level</label>
                <input
                  id="statblock-level"
                  type="number"
                  min={-1}
                  max={30}
                  value={statBlock.level ?? ''}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    update({ level: Number.isFinite(parsed) ? parsed : undefined });
                  }}
                  placeholder="5"
                  className="input-cozy input-cozy-number w-full text-xs text-center"
                />
              </div>
            ) : (
              <div>
                <label className="text-[10px] text-ink-muted block mb-0.5" htmlFor="statblock-cr">CR</label>
                {/* A select, not free text: CR drives the proficiency bonus, so a
                    typo would silently change every derived save and skill. */}
                <select
                  id="statblock-cr"
                  value={statBlock.challengeRating || ''}
                  onChange={(e) => updateChallengeRating(e.target.value)}
                  className="input-cozy w-full text-xs"
                >
                  <option value="">—</option>
                  {CHALLENGE_RATINGS.map((cr) => (
                    <option key={cr} value={cr}>{cr}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-[10px] text-ink-muted block mb-0.5">XP</label>
              <input
                type="number"
                value={statBlock.xp ?? ''}
                onChange={(e) => update({ xp: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                className="input-cozy input-cozy-number w-full text-xs text-center"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-ink-muted block mb-0.5">Speed</label>
            <input
              type="text"
              value={statBlock.speed}
              onChange={(e) => update({ speed: e.target.value })}
              placeholder="30 ft., fly 60 ft."
              maxLength={STAT_BLOCK_LIMITS.maxSpeedLength}
              className="input-cozy w-full text-xs"
            />
          </div>
        </div>
      )}

      {/* ── Ability Scores ── */}
      <SectionHeader
        title={isPf2e ? 'Attribute Modifiers' : 'Ability Scores'}
        section="abilities"
        expanded={isExpanded('abilities')}
        toggle={toggleSection}
      />
      {isExpanded('abilities') && isPf2e && (
        // PF2e stat blocks print modifiers ("Str +4") with no score behind
        // them, so these are entered directly rather than derived from a score.
        <div className="grid grid-cols-6 gap-1.5 pl-1">
          {ABILITY_KEYS.map((ab) => (
            <div key={ab} className="text-center">
              <label className="text-[9px] font-bold text-brand-ink uppercase block mb-0.5">{ab}</label>
              <input
                type="number"
                aria-label={`${ab} modifier`}
                min={-10}
                max={20}
                value={pf2eModifiers[ab]}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  onChange(setAttributeModifier(statBlock, ab, Number.isFinite(parsed) ? parsed : 0));
                }}
                className="input-cozy input-cozy-number w-full text-xs text-center"
              />
            </div>
          ))}
        </div>
      )}
      {isExpanded('abilities') && !isPf2e && (
        <div className="grid grid-cols-6 gap-1.5 pl-1">
          {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ab) => (
            <div key={ab} className="text-center">
              <label className="text-[9px] font-bold text-brand-ink uppercase block mb-0.5">{ab}</label>
              <input
                type="number"
                value={statBlock.abilities[ab]}
                onChange={(e) => updateAbility(ab, parseInt(e.target.value, 10) || 10)}
                className="input-cozy input-cozy-number w-full text-xs text-center"
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Saves & Skills ── */}
      <SectionHeader title="Saves & Skills" section="saves" expanded={isExpanded('saves')} toggle={toggleSection} />
      {isExpanded('saves') &&
        (isPf2e ? (
          <Pf2eProficiencyEditor statBlock={statBlock} onChange={onChange} />
        ) : (
          <ProficiencyEditor statBlock={statBlock} onChange={onChange} />
        ))}

      {/* ── Defenses ── */}
      <SectionHeader title="Defenses & Senses" section="defenses" expanded={isExpanded('defenses')} toggle={toggleSection} />
      {isExpanded('defenses') && (
        <div className="pl-1 space-y-1.5">
          {([
            ['damageVulnerabilities', 'Damage Vulnerabilities'],
            ['damageResistances', 'Damage Resistances'],
            ['damageImmunities', 'Damage Immunities'],
            ['conditionImmunities', 'Condition Immunities'],
            ['senses', 'Senses'],
            ['languages', 'Languages'],
          ] as const).map(([field, label]) => (
            <div key={field}>
              <label className="text-[10px] text-ink-muted block mb-0.5">{label}</label>
              <input
                type="text"
                value={(statBlock[field] as string) || ''}
                onChange={(e) => update({ [field]: e.target.value || undefined })}
                maxLength={STAT_BLOCK_LIMITS.maxDetailLength}
                className="input-cozy w-full text-xs"
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Action Sections ── */}
      {(['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions'] as const).map((field) => {
        const titles: Record<string, string> = {
          traits: 'Traits',
          actions: 'Actions',
          bonusActions: 'Bonus Actions',
          reactions: 'Reactions',
          legendaryActions: 'Legendary Actions',
        };
        const items = statBlock[field] || [];
        return (
          <div key={field}>
            <SectionHeader title={titles[field]} section={field} expanded={isExpanded(field)} toggle={toggleSection} />
            {isExpanded(field) && (
              <ActionListEditor
                items={items}
                onChange={(updated) => updateActionList(field, updated)}
              />
            )}
          </div>
        );
      })}

      {/* ── Notes ── */}
      <SectionHeader title="Notes" section="notes" expanded={isExpanded('notes')} toggle={toggleSection} />
      {isExpanded('notes') && (
        <div className="pl-1">
          <textarea
            value={statBlock.notes || ''}
            onChange={(e) => update({ notes: e.target.value || undefined })}
            placeholder="Additional notes..."
            maxLength={STAT_BLOCK_LIMITS.maxNotesLength}
            rows={2}
            className="input-cozy w-full text-xs resize-none"
          />
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function SectionHeader({
  title,
  section,
  expanded,
  toggle,
}: {
  title: string;
  section: string;
  expanded: boolean;
  toggle: (s: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => toggle(section)}
      className="flex items-center gap-1 w-full text-left py-1 text-[10px] font-semibold text-brand-ink uppercase tracking-wide hover:text-brand-ink/80 transition-colors"
    >
      {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      {title}
    </button>
  );
}


function ActionListEditor({
  items,
  onChange,
}: {
  items: ActionEntry[];
  onChange: (updated: ActionEntry[]) => void;
}) {
  const addItem = () => onChange([...items, { name: '', description: '' }]);

  const updateItem = (idx: number, changes: Partial<ActionEntry>) => {
    const updated = items.map((item, i) => (i === idx ? { ...item, ...changes } : item));
    onChange(updated);
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="pl-1 space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex gap-1 items-start">
          <div className="flex-1 space-y-0.5">
            <input
              type="text"
              value={item.name}
              onChange={(e) => updateItem(i, { name: e.target.value })}
              placeholder="Ability name"
              maxLength={STAT_BLOCK_LIMITS.maxEntryNameLength}
              className="input-cozy w-full text-xs font-semibold"
            />
            <textarea
              value={item.description}
              onChange={(e) => updateItem(i, { description: e.target.value })}
              placeholder="Description..."
              maxLength={STAT_BLOCK_LIMITS.maxEntryDescriptionLength}
              rows={2}
              className="input-cozy w-full text-xs resize-none"
            />
          </div>
          <button
            type="button"
            onClick={() => removeItem(i)}
            className="p-1 mt-1 text-ink-muted hover:text-danger-ink transition-colors shrink-0"
            title="Remove"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        disabled={items.length >= STAT_BLOCK_LIMITS.maxListEntries}
        className="flex items-center gap-1 text-[10px] text-brand-ink hover:text-brand-ink/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="w-3 h-3" /> Add entry
      </button>
    </div>
  );
}
