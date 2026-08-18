/**
 * StatBlockViewer
 * Renders an NPC stat block in a cozy, parchment-styled panel.
 * Automatically delegates to the correct game-system renderer
 * based on the campaign's gameSystem setting.
 */

import type { NpcStatBlock } from '@/types';
import { GameSystem } from '@/types';
import Dnd5eStatBlock from './Dnd5eStatBlock';
import GenericStatBlock from './GenericStatBlock';

interface StatBlockViewerProps {
  statBlock: NpcStatBlock;
  tokenName: string;
  gameSystem: GameSystem | null;
}

export default function StatBlockViewer({ statBlock, tokenName, gameSystem }: StatBlockViewerProps) {
  switch (gameSystem) {
    case GameSystem.DND_5E:
      return <Dnd5eStatBlock statBlock={statBlock} tokenName={tokenName} />;
    case GameSystem.PATHFINDER_2E:
      return <Pf2eStatBlock statBlock={statBlock} tokenName={tokenName} />;
    case GameSystem.CALL_OF_CTHULHU_7E:
      return <CoCStatBlock statBlock={statBlock} tokenName={tokenName} />;
    default:
      return <GenericStatBlock statBlock={statBlock} tokenName={tokenName} />;
  }
}

// ─── Pathfinder 2e ───────────────────────────────────────────────
function Pf2eStatBlock({ statBlock, tokenName }: { statBlock: NpcStatBlock; tokenName: string }) {
  const mod = (score: number) => {
    const m = Math.floor((score - 10) / 2);
    return m >= 0 ? `+${m}` : `${m}`;
  };

  return (
    <div className="space-y-2 text-xs">
      {/* Header */}
      <div className="border-b-2 border-red-700/40 pb-1.5">
        <h3 className="text-sm font-bold text-red-800">{tokenName}</h3>
        <div className="flex gap-3 text-stone-600">
          {statBlock.creatureType && <span>{statBlock.creatureType}</span>}
          {statBlock.alignment && <span className="italic">{statBlock.alignment}</span>}
        </div>
      </div>

      {/* Key stats */}
      <div className="flex gap-4 flex-wrap text-stone-700">
        {statBlock.challengeRating && (
          <div><span className="font-semibold text-red-800">Level</span> {statBlock.challengeRating}</div>
        )}
        <div><span className="font-semibold text-red-800">AC</span> {statBlock.ac}</div>
        {statBlock.hpMax != null && (
          <div>
            <span className="font-semibold text-red-800">HP</span> {statBlock.hpMax}
            {statBlock.hitDice && ` (${statBlock.hitDice})`}
          </div>
        )}
        <div><span className="font-semibold text-red-800">Speed</span> {statBlock.speed}</div>
      </div>

      {/* Abilities */}
      <div className="grid grid-cols-6 gap-1 text-center bg-red-50/50 rounded p-1.5">
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ab) => (
          <div key={ab}>
            <div className="text-[9px] font-bold text-red-800 uppercase">{ab}</div>
            <div className="text-stone-700">{statBlock.abilities[ab]}</div>
            <div className="text-[10px] text-stone-500">{mod(statBlock.abilities[ab])}</div>
          </div>
        ))}
      </div>

      {/* Defenses & senses */}
      <StatBlockDetailLines statBlock={statBlock} accentColor="red" />

      {/* Abilities and actions */}
      <StatBlockActionSections statBlock={statBlock} accentColor="red" />
    </div>
  );
}

// ─── Call of Cthulhu 7e ──────────────────────────────────────────
function CoCStatBlock({ statBlock, tokenName }: { statBlock: NpcStatBlock; tokenName: string }) {
  return (
    <div className="space-y-2 text-xs">
      {/* Header */}
      <div className="border-b-2 border-emerald-700/40 pb-1.5">
        <h3 className="text-sm font-bold text-emerald-800">{tokenName}</h3>
        {statBlock.creatureType && (
          <div className="text-stone-600 italic">{statBlock.creatureType}</div>
        )}
      </div>

      {/* Characteristics — CoC uses STR/CON/SIZ/DEX/INT/POW/APP/EDU */}
      <div className="grid grid-cols-6 gap-1 text-center bg-emerald-50/50 rounded p-1.5">
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ab) => {
          // Map D&D ability names to CoC equivalents for display
          const cocLabel = ab === 'wis' ? 'POW' : ab === 'cha' ? 'APP' : ab.toUpperCase();
          return (
            <div key={ab}>
              <div className="text-[9px] font-bold text-emerald-800 uppercase">{cocLabel}</div>
              <div className="text-stone-700">{statBlock.abilities[ab]}</div>
            </div>
          );
        })}
      </div>

      {/* Combat stats */}
      <div className="flex gap-4 flex-wrap text-stone-700">
        <div><span className="font-semibold text-emerald-800">Armor</span> {statBlock.ac}</div>
        {statBlock.hpMax != null && (
          <div><span className="font-semibold text-emerald-800">HP</span> {statBlock.hpMax}</div>
        )}
        <div><span className="font-semibold text-emerald-800">Move</span> {statBlock.speed}</div>
      </div>

      <StatBlockDetailLines statBlock={statBlock} accentColor="emerald" />
      <StatBlockActionSections statBlock={statBlock} accentColor="emerald" />
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────

function StatBlockDetailLines({ statBlock, accentColor }: { statBlock: NpcStatBlock; accentColor: string }) {
  const accent = `text-${accentColor}-800`;
  const lines: Array<{ label: string; value: string }> = [];

  if (statBlock.savingThrows && Object.keys(statBlock.savingThrows).length > 0) {
    lines.push({
      label: 'Saving Throws',
      value: Object.entries(statBlock.savingThrows)
        .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} +${v}`)
        .join(', '),
    });
  }
  if (statBlock.skills && Object.keys(statBlock.skills).length > 0) {
    lines.push({
      label: 'Skills',
      value: Object.entries(statBlock.skills)
        .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} +${v}`)
        .join(', '),
    });
  }
  if (statBlock.damageVulnerabilities) lines.push({ label: 'Vulnerabilities', value: statBlock.damageVulnerabilities });
  if (statBlock.damageResistances) lines.push({ label: 'Resistances', value: statBlock.damageResistances });
  if (statBlock.damageImmunities) lines.push({ label: 'Immunities', value: statBlock.damageImmunities });
  if (statBlock.conditionImmunities) lines.push({ label: 'Condition Immunities', value: statBlock.conditionImmunities });
  if (statBlock.senses) lines.push({ label: 'Senses', value: statBlock.senses });
  if (statBlock.languages) lines.push({ label: 'Languages', value: statBlock.languages });

  if (lines.length === 0) return null;

  return (
    <div className="space-y-0.5 text-stone-700">
      {lines.map(({ label, value }) => (
        <div key={label}>
          <span className={`font-semibold ${accent}`}>{label}</span> {value}
        </div>
      ))}
    </div>
  );
}

function StatBlockActionSections({ statBlock, accentColor }: { statBlock: NpcStatBlock; accentColor: string }) {
  const sections: Array<{ title: string; items: Array<{ name: string; description: string }> }> = [];

  if (statBlock.traits?.length) sections.push({ title: 'Traits', items: statBlock.traits });
  if (statBlock.actions?.length) sections.push({ title: 'Actions', items: statBlock.actions });
  if (statBlock.bonusActions?.length) sections.push({ title: 'Bonus Actions', items: statBlock.bonusActions });
  if (statBlock.reactions?.length) sections.push({ title: 'Reactions', items: statBlock.reactions });
  if (statBlock.legendaryActions?.length) sections.push({ title: 'Legendary Actions', items: statBlock.legendaryActions });

  if (sections.length === 0) return null;

  return (
    <>
      {sections.map(({ title, items }) => (
        <div key={title}>
          <div className={`text-[10px] font-bold text-${accentColor}-800 uppercase tracking-wide border-b border-${accentColor}-700/20 pb-0.5 mb-1`}>
            {title}
          </div>
          <div className="space-y-1">
            {items.map((item, i) => (
              <div key={i}>
                <span className="font-semibold italic text-stone-800">{item.name}.</span>{' '}
                <span className="text-stone-600">{item.description}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
