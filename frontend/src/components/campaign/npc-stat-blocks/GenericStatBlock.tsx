/**
 * GenericStatBlock
 * System-agnostic stat block renderer used for Flexible/Shadowrun/unknown game systems.
 * Shows all available data in a clean, neutral layout.
 */

import type { NpcStatBlock } from '@/types';

interface Props {
  statBlock: NpcStatBlock;
  tokenName: string;
}

function abilityMod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

export default function GenericStatBlock({ statBlock, tokenName }: Props) {
  return (
    <div className="space-y-2 text-xs text-ink">
      {/* Header */}
      <div className="border-b-2 border-moss-green/40 pb-1.5">
        <h3 className="text-sm font-bold text-brand-ink">{tokenName}</h3>
        <div className="italic text-ink-muted">
          {statBlock.creatureType || 'Creature'}
          {statBlock.alignment && `, ${statBlock.alignment}`}
        </div>
      </div>

      {/* Core stats */}
      <div className="flex gap-4 flex-wrap">
        <div><span className="font-semibold text-brand-ink">AC</span> {statBlock.ac}</div>
        {statBlock.hpMax != null && (
          <div>
            <span className="font-semibold text-brand-ink">HP</span> {statBlock.hpMax}
            {statBlock.hitDice && ` (${statBlock.hitDice})`}
          </div>
        )}
        <div><span className="font-semibold text-brand-ink">Speed</span> {statBlock.speed}</div>
        {statBlock.challengeRating && (
          <div>
            <span className="font-semibold text-brand-ink">CR</span> {statBlock.challengeRating}
            {statBlock.xp != null && ` (${statBlock.xp.toLocaleString()} XP)`}
          </div>
        )}
      </div>

      {/* Abilities */}
      <div className="grid grid-cols-6 gap-1 text-center bg-moss-green/5 rounded p-1.5">
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ab) => (
          <div key={ab}>
            <div className="text-[9px] font-bold text-brand-ink uppercase">{ab}</div>
            <div className="font-semibold">{statBlock.abilities[ab]}</div>
            <div className="text-[10px] text-ink-muted">({abilityMod(statBlock.abilities[ab])})</div>
          </div>
        ))}
      </div>

      {/* Detail lines */}
      <DetailLines statBlock={statBlock} />

      {/* Action sections */}
      {statBlock.traits?.length ? <ActionList title="Traits" items={statBlock.traits} /> : null}
      {statBlock.actions?.length ? <ActionList title="Actions" items={statBlock.actions} /> : null}
      {statBlock.bonusActions?.length ? <ActionList title="Bonus Actions" items={statBlock.bonusActions} /> : null}
      {statBlock.reactions?.length ? <ActionList title="Reactions" items={statBlock.reactions} /> : null}
      {statBlock.legendaryActions?.length ? <ActionList title="Legendary Actions" items={statBlock.legendaryActions} /> : null}

      {statBlock.notes && (
        <div className="text-[10px] text-ink-muted italic border-t border-moss-green/20 pt-1.5">
          {statBlock.notes}
        </div>
      )}
    </div>
  );
}

function DetailLines({ statBlock }: { statBlock: NpcStatBlock }) {
  const entries: Array<[string, string]> = [];

  if (statBlock.savingThrows && Object.keys(statBlock.savingThrows).length > 0) {
    entries.push(['Saves', Object.entries(statBlock.savingThrows).map(([k, v]) => `${k} +${v}`).join(', ')]);
  }
  if (statBlock.skills && Object.keys(statBlock.skills).length > 0) {
    entries.push(['Skills', Object.entries(statBlock.skills).map(([k, v]) => `${k} +${v}`).join(', ')]);
  }
  if (statBlock.damageVulnerabilities) entries.push(['Vulnerabilities', statBlock.damageVulnerabilities]);
  if (statBlock.damageResistances) entries.push(['Resistances', statBlock.damageResistances]);
  if (statBlock.damageImmunities) entries.push(['Immunities', statBlock.damageImmunities]);
  if (statBlock.conditionImmunities) entries.push(['Cond. Immunities', statBlock.conditionImmunities]);
  if (statBlock.senses) entries.push(['Senses', statBlock.senses]);
  if (statBlock.languages) entries.push(['Languages', statBlock.languages]);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-0.5 border-y border-moss-green/20 py-1.5">
      {entries.map(([label, value]) => (
        <div key={label}>
          <span className="font-semibold text-brand-ink">{label}</span> {value}
        </div>
      ))}
    </div>
  );
}

function ActionList({ title, items }: { title: string; items: Array<{ name: string; description: string }> }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-brand-ink uppercase tracking-wide border-b border-moss-green/20 pb-0.5 mb-1">
        {title}
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="leading-snug">
            <span className="font-semibold italic text-ink">{item.name}.</span>{' '}
            <span className="text-ink-secondary">{item.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
