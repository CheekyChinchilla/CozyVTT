/**
 * StatBlockEditor
 * DM inline editor for NPC stat blocks. Provides a compact form to edit
 * all stat block fields. Used inside the NpcQuickEditor panel.
 */

import { useState, useCallback } from 'react';
import { Plus, X, ChevronDown, ChevronRight } from 'lucide-react';
import type { NpcStatBlock } from '@/types';

interface StatBlockEditorProps {
  statBlock: NpcStatBlock;
  onChange: (updated: NpcStatBlock) => void;
}

type ActionEntry = { name: string; description: string };

export default function StatBlockEditor({ statBlock, onChange }: StatBlockEditorProps) {
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

  const updateAbility = useCallback(
    (ab: keyof NpcStatBlock['abilities'], value: number) => {
      update({ abilities: { ...statBlock.abilities, [ab]: value } });
    },
    [statBlock.abilities, update]
  );

  const updateSave = useCallback(
    (key: string, value: number | null) => {
      const saves = { ...(statBlock.savingThrows || {}) };
      if (value === null) delete saves[key];
      else saves[key] = value;
      update({ savingThrows: saves });
    },
    [statBlock.savingThrows, update]
  );

  const updateSkill = useCallback(
    (key: string, value: number | null) => {
      const skills = { ...(statBlock.skills || {}) };
      if (value === null) delete skills[key];
      else skills[key] = value;
      update({ skills });
    },
    [statBlock.skills, update]
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
            <div>
              <label className="text-[10px] text-ink-muted block mb-0.5">CR</label>
              <input
                type="text"
                value={statBlock.challengeRating || ''}
                onChange={(e) => update({ challengeRating: e.target.value })}
                placeholder="1/4"
                className="input-cozy w-full text-xs"
              />
            </div>
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
              className="input-cozy w-full text-xs"
            />
          </div>
        </div>
      )}

      {/* ── Ability Scores ── */}
      <SectionHeader title="Ability Scores" section="abilities" expanded={isExpanded('abilities')} toggle={toggleSection} />
      {isExpanded('abilities') && (
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
      {isExpanded('saves') && (
        <div className="pl-1 space-y-2">
          <KeyValueEditor
            label="Saving Throws"
            entries={statBlock.savingThrows || {}}
            onUpdate={(k, v) => updateSave(k, v)}
            placeholder="e.g. dex"
          />
          <KeyValueEditor
            label="Skills"
            entries={statBlock.skills || {}}
            onUpdate={(k, v) => updateSkill(k, v)}
            placeholder="e.g. perception"
          />
        </div>
      )}

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

function KeyValueEditor({
  label,
  entries,
  onUpdate,
  placeholder,
}: {
  label: string;
  entries: Record<string, number>;
  onUpdate: (key: string, value: number | null) => void;
  placeholder: string;
}) {
  const [newKey, setNewKey] = useState('');

  const handleAdd = () => {
    const k = newKey.trim().toLowerCase();
    if (k && !(k in entries)) {
      onUpdate(k, 0);
      setNewKey('');
    }
  };

  return (
    <div>
      <label className="text-[10px] text-ink-muted block mb-0.5">{label}</label>
      {Object.entries(entries).map(([key, val]) => (
        <div key={key} className="flex items-center gap-1 mb-0.5">
          <span className="text-[10px] text-ink-secondary w-20 capitalize">{key}</span>
          <input
            type="number"
            value={val}
            onChange={(e) => onUpdate(key, parseInt(e.target.value, 10) || 0)}
            className="input-cozy input-cozy-number w-14 text-xs text-center"
          />
          <button
            type="button"
            onClick={() => onUpdate(key, null)}
            className="p-0.5 text-ink-muted hover:text-danger-ink transition-colors"
            title="Remove"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1 mt-0.5">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={placeholder}
          className="input-cozy flex-1 text-xs"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="p-1 text-brand-ink hover:text-brand-ink/80 transition-colors"
          title="Add"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
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
              className="input-cozy w-full text-xs font-semibold"
            />
            <textarea
              value={item.description}
              onChange={(e) => updateItem(i, { description: e.target.value })}
              placeholder="Description..."
              rows={2}
              className="input-cozy w-full text-xs resize-none"
            />
          </div>
          <button
            type="button"
            onClick={() => removeItem(i)}
            className="p-1 mt-1 text-ink-muted hover:text-danger-ink transition-colors flex-shrink-0"
            title="Remove"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-1 text-[10px] text-brand-ink hover:text-brand-ink/80 transition-colors"
      >
        <Plus className="w-3 h-3" /> Add entry
      </button>
    </div>
  );
}
