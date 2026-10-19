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
import { formatSaveList, formatSkillList } from './statBlockProficiency';
import { PF2E_ATTRIBUTE_LABELS, PF2E_SAVES, formatPf2eSaves, readAttributeModifiers } from './pf2eStatBlock';
import { ABILITY_KEYS, formatModifier } from '@/utils/rules/dnd5e';

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
// As a Pathfinder stat block prints it: the creature's level, its attribute
// modifiers (there is no score behind them) and Fort, Ref and Will. A D&D
// creature borrowed into the campaign keeps its challenge rating, called CR.
function Pf2eStatBlock({ statBlock, tokenName }: { statBlock: NpcStatBlock; tokenName: string }) {
  const modifiers = readAttributeModifiers(statBlock);

  return (
    <div className="space-y-2 text-xs">
      {/* Header */}
      <div className="border-b-2 border-danger/40 pb-1.5">
        <h3 className="text-sm font-bold text-danger-ink">{tokenName}</h3>
        <div className="flex gap-3 text-ink-secondary">
          {statBlock.creatureType && <span>{statBlock.creatureType}</span>}
          {statBlock.alignment && <span className="italic">{statBlock.alignment}</span>}
        </div>
      </div>

      {/* Key stats */}
      <div className="flex gap-4 flex-wrap text-ink">
        {typeof statBlock.level === 'number' ? (
          <div><span className="font-semibold text-danger-ink">Level</span> {statBlock.level}</div>
        ) : statBlock.challengeRating ? (
          <div><span className="font-semibold text-danger-ink">CR</span> {statBlock.challengeRating}</div>
        ) : null}
        <div><span className="font-semibold text-danger-ink">AC</span> {statBlock.ac}</div>
        {statBlock.hpMax != null && (
          <div>
            <span className="font-semibold text-danger-ink">HP</span> {statBlock.hpMax}
            {statBlock.hitDice && ` (${statBlock.hitDice})`}
          </div>
        )}
        <div><span className="font-semibold text-danger-ink">Speed</span> {statBlock.speed}</div>
      </div>

      {/* Attribute modifiers */}
      <div className="grid grid-cols-6 gap-1 text-center bg-danger/10 rounded-sm p-1.5">
        {ABILITY_KEYS.map((ab) => (
          <div key={ab}>
            <div className="text-[9px] font-bold text-danger-ink uppercase">{PF2E_ATTRIBUTE_LABELS[ab]}</div>
            <div className="text-ink">{formatModifier(modifiers[ab])}</div>
          </div>
        ))}
      </div>

      {/* Defenses & senses */}
      <StatBlockDetailLines statBlock={statBlock} accentColor="danger" pf2e />

      {/* Abilities and actions */}
      <StatBlockActionSections statBlock={statBlock} accentColor="danger" />
    </div>
  );
}

// ─── Call of Cthulhu 7e ──────────────────────────────────────────
function CoCStatBlock({ statBlock, tokenName }: { statBlock: NpcStatBlock; tokenName: string }) {
  return (
    <div className="space-y-2 text-xs">
      {/* Header */}
      <div className="border-b-2 border-success/40 pb-1.5">
        <h3 className="text-sm font-bold text-success-ink">{tokenName}</h3>
        {statBlock.creatureType && (
          <div className="text-ink-secondary italic">{statBlock.creatureType}</div>
        )}
      </div>

      {/* Characteristics — CoC uses STR/CON/SIZ/DEX/INT/POW/APP/EDU */}
      <div className="grid grid-cols-6 gap-1 text-center bg-success/10 rounded-sm p-1.5">
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((ab) => {
          // Map D&D ability names to CoC equivalents for display
          const cocLabel = ab === 'wis' ? 'POW' : ab === 'cha' ? 'APP' : ab.toUpperCase();
          return (
            <div key={ab}>
              <div className="text-[9px] font-bold text-success-ink uppercase">{cocLabel}</div>
              <div className="text-ink">{statBlock.abilities[ab]}</div>
            </div>
          );
        })}
      </div>

      {/* Combat stats */}
      <div className="flex gap-4 flex-wrap text-ink">
        <div><span className="font-semibold text-success-ink">Armor</span> {statBlock.ac}</div>
        {statBlock.hpMax != null && (
          <div><span className="font-semibold text-success-ink">HP</span> {statBlock.hpMax}</div>
        )}
        <div><span className="font-semibold text-success-ink">Move</span> {statBlock.speed}</div>
      </div>

      <StatBlockDetailLines statBlock={statBlock} accentColor="success" />
      <StatBlockActionSections statBlock={statBlock} accentColor="success" />
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────

/**
 * Per-system accent classes.
 *
 * Written out in full because Tailwind only ships classes it can find as
 * literal strings — a template joining `text-` to the accent's name at runtime
 * produced class names that were never generated, so the accent did nothing.
 */
const ACCENTS = {
  danger: { text: 'text-danger-ink', border: 'border-danger/20' },
  success: { text: 'text-success-ink', border: 'border-success/20' },
  warning: { text: 'text-warning-ink', border: 'border-warning/20' },
  brand: { text: 'text-brand-ink', border: 'border-brand/20' },
} as const;

type AccentName = keyof typeof ACCENTS;

function StatBlockDetailLines({ statBlock, accentColor, pf2e = false }: { statBlock: NpcStatBlock; accentColor: AccentName; pf2e?: boolean }) {
  const accent = ACCENTS[accentColor].text;
  const lines: Array<{ label: string; value: string }> = [];

  if (statBlock.savingThrows && Object.keys(statBlock.savingThrows).length > 0) {
    // Pathfinder's three saves as it prints them; anything else (a D&D
    // creature's six) as written.
    const saves = statBlock.savingThrows;
    const pf2eKeys: string[] = PF2E_SAVES.map((save) => save.key);
    const others = Object.fromEntries(Object.entries(saves).filter(([key]) => !pf2e || !pf2eKeys.includes(key)));
    const value = [pf2e ? formatPf2eSaves(saves) : '', formatSaveList(others)].filter(Boolean).join(', ');
    if (value) lines.push({ label: 'Saving Throws', value });
  }
  if (statBlock.skills && Object.keys(statBlock.skills).length > 0) {
    lines.push({ label: 'Skills', value: formatSkillList(statBlock.skills) });
  }
  if (statBlock.damageVulnerabilities) lines.push({ label: 'Vulnerabilities', value: statBlock.damageVulnerabilities });
  if (statBlock.damageResistances) lines.push({ label: 'Resistances', value: statBlock.damageResistances });
  if (statBlock.damageImmunities) lines.push({ label: 'Immunities', value: statBlock.damageImmunities });
  if (statBlock.conditionImmunities) lines.push({ label: 'Condition Immunities', value: statBlock.conditionImmunities });
  if (statBlock.senses) lines.push({ label: 'Senses', value: statBlock.senses });
  if (statBlock.languages) lines.push({ label: 'Languages', value: statBlock.languages });

  if (lines.length === 0) return null;

  return (
    <div className="space-y-0.5 text-ink">
      {lines.map(({ label, value }) => (
        <div key={label}>
          <span className={`font-semibold ${accent}`}>{label}</span> {value}
        </div>
      ))}
    </div>
  );
}

function StatBlockActionSections({ statBlock, accentColor }: { statBlock: NpcStatBlock; accentColor: AccentName }) {
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
          <div className={`text-[10px] font-bold ${ACCENTS[accentColor].text} uppercase tracking-wide border-b ${ACCENTS[accentColor].border} pb-0.5 mb-1`}>
            {title}
          </div>
          <div className="space-y-1">
            {items.map((item, i) => (
              <div key={i}>
                <span className="font-semibold italic text-ink">{item.name}.</span>{' '}
                <span className="text-ink-secondary">{item.description}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
