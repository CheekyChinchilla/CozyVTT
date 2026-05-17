/**
 * Dnd5eStatBlock
 * D&D 5e-styled NPC stat block with the classic parchment/red-accent look,
 * adapted to fit CozyVTT's warm aesthetic.
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

export default function Dnd5eStatBlock({ statBlock, tokenName }: Props) {
  return (
    <div className="space-y-2 text-xs text-stone-700">
      {/* ── Header ── */}
      <div className="border-b-2 border-amber-700/40 pb-1.5">
        <h3 className="text-sm font-bold text-amber-900">{tokenName}</h3>
        <div className="italic text-stone-500">
          {statBlock.creatureType || 'Creature'}
          {statBlock.alignment && `, ${statBlock.alignment}`}
        </div>
      </div>

      {/* ── Core stats ── */}
      <div className="border-b border-amber-700/20 pb-1.5 space-y-0.5">
        <div><span className="font-semibold text-amber-900">Armor Class</span> {statBlock.ac}</div>
        <div><span className="font-semibold text-amber-900">Speed</span> {statBlock.speed}</div>
        {statBlock.challengeRating && (
          <div>
            <span className="font-semibold text-amber-900">Challenge</span> {statBlock.challengeRating}
            {statBlock.xp != null && ` (${statBlock.xp.toLocaleString()} XP)`}
          </div>
        )}
      </div>

      {/* ── Ability Scores ── */}
      <div className="grid grid-cols-6 gap-1 text-center bg-amber-50/60 rounded p-1.5 border border-amber-700/10">
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ab) => (
          <div key={ab}>
            <div className="text-[9px] font-bold text-amber-900 uppercase">{ab}</div>
            <div className="font-semibold">{statBlock.abilities[ab]}</div>
            <div className="text-[10px] text-stone-500">({abilityMod(statBlock.abilities[ab])})</div>
          </div>
        ))}
      </div>

      {/* ── Detail lines ── */}
      <div className="border-b border-amber-700/20 pb-1.5 space-y-0.5">
        {statBlock.savingThrows && Object.keys(statBlock.savingThrows).length > 0 && (
          <div>
            <span className="font-semibold text-amber-900">Saving Throws</span>{' '}
            {Object.entries(statBlock.savingThrows)
              .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} +${v}`)
              .join(', ')}
          </div>
        )}
        {statBlock.skills && Object.keys(statBlock.skills).length > 0 && (
          <div>
            <span className="font-semibold text-amber-900">Skills</span>{' '}
            {Object.entries(statBlock.skills)
              .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} +${v}`)
              .join(', ')}
          </div>
        )}
        {statBlock.damageVulnerabilities && (
          <div><span className="font-semibold text-amber-900">Damage Vulnerabilities</span> {statBlock.damageVulnerabilities}</div>
        )}
        {statBlock.damageResistances && (
          <div><span className="font-semibold text-amber-900">Damage Resistances</span> {statBlock.damageResistances}</div>
        )}
        {statBlock.damageImmunities && (
          <div><span className="font-semibold text-amber-900">Damage Immunities</span> {statBlock.damageImmunities}</div>
        )}
        {statBlock.conditionImmunities && (
          <div><span className="font-semibold text-amber-900">Condition Immunities</span> {statBlock.conditionImmunities}</div>
        )}
        {statBlock.senses && (
          <div><span className="font-semibold text-amber-900">Senses</span> {statBlock.senses}</div>
        )}
        {statBlock.languages && (
          <div><span className="font-semibold text-amber-900">Languages</span> {statBlock.languages}</div>
        )}
      </div>

      {/* ── Traits ── */}
      {statBlock.traits && statBlock.traits.length > 0 && (
        <ActionSection title="Traits" items={statBlock.traits} />
      )}

      {/* ── Actions ── */}
      {statBlock.actions && statBlock.actions.length > 0 && (
        <ActionSection title="Actions" items={statBlock.actions} />
      )}

      {/* ── Bonus Actions ── */}
      {statBlock.bonusActions && statBlock.bonusActions.length > 0 && (
        <ActionSection title="Bonus Actions" items={statBlock.bonusActions} />
      )}

      {/* ── Reactions ── */}
      {statBlock.reactions && statBlock.reactions.length > 0 && (
        <ActionSection title="Reactions" items={statBlock.reactions} />
      )}

      {/* ── Legendary Actions ── */}
      {statBlock.legendaryActions && statBlock.legendaryActions.length > 0 && (
        <ActionSection title="Legendary Actions" items={statBlock.legendaryActions} />
      )}

      {/* ── Notes ── */}
      {statBlock.notes && (
        <div className="text-[10px] text-stone-500 italic border-t border-amber-700/20 pt-1.5">
          {statBlock.notes}
        </div>
      )}
    </div>
  );
}

function ActionSection({ title, items }: { title: string; items: Array<{ name: string; description: string }> }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-amber-900 uppercase tracking-wide border-b border-amber-700/20 pb-0.5 mb-1">
        {title}
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="leading-snug">
            <span className="font-semibold italic text-stone-800">{item.name}.</span>{' '}
            <span className="text-stone-600">{item.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
