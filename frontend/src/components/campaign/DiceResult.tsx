import { Fragment, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Dices, User, Target } from 'lucide-react';
import type { DiceRollDetail, DiceRolledEvent } from '@/types';
import { cn } from '@/utils/cn';

interface DiceResultProps {
  roll: DiceRolledEvent;
  isCurrentUser: boolean;
  /**
   * Whether the person who rolled is a GM of this campaign. Read from the
   * campaign's own membership list rather than sent with the roll, so it
   * cannot be claimed by whoever is rolling.
   */
  rollerIsGM?: boolean;
  /** Two lines, as the compact layout's log draws a roll; the full card otherwise. */
  dense?: boolean;
}

/**
 * Display a single dice roll result with breakdown and animations
 */
export default function DiceResult({ roll, isCurrentUser, rollerIsGM, dense = false }: DiceResultProps) {
  const { userName, characterName, expression, result, breakdown, purpose, timestamp, secret } = roll;

  /**
   * A roll is about a character or a creature; the person who pressed the
   * button is context for it. Heading every entry with the roller meant a GM
   * covering for an absent player, or working through a room of NPCs, produced
   * a list that read as though the GM had rolled for themselves throughout.
   *
   * Whoever rolled is still named — the point is to show both, in the order
   * that answers "who is this roll for?" first.
   */
  // A deleted account's rolls stay in the history with no one attached.
  const roller = userName ?? 'a deleted account';
  const subject = characterName || userName || 'A deleted account';
  const attribution = characterName
    // Once the heading is a character, "(You)" would read as *being* them, so
    // the tag names the action instead: who pressed the button, not who it is.
    ? isCurrentUser
      ? '(you rolled)'
      : rollerIsGM
        ? '(GM rolled)'
        : `(rolled by ${roller})`
    // A plain dice-panel roll still heads with the person, where "(You)" is
    // about identity and reads correctly.
    : isCurrentUser
      ? '(You)'
      : null;

  /**
   * `breakdown` is a JSON column, so its type is a promise rather than a
   * guarantee — it is erased before the value is ever read. A row written by an
   * older version, restored from another instance, or imported can arrive
   * without `rolls`, and this component used to throw on it. Because the error
   * boundary sits at the page level, one such row took down the whole campaign:
   * no map, no roster, no chat.
   *
   * A roll that cannot be drawn in full still shows its expression and total,
   * which is the part anyone actually reads.
   */
  const detail = Array.isArray(breakdown?.rolls) ? breakdown.rolls : [];
  const operators = operatorsOf(breakdown?.formula, detail);

  // A critical is a single d20 kept, however it was written: `1d20`, `d20`,
  // advantage (`2d20kh1`) or disadvantage (`2d20kl1`). Looking only for a
  // group written `1d20` missed the commonest of them.
  const keptD20 = detail
    .filter((r) => r.type === 'dice' && r.sides === 20)
    .map((r) => r.kept ?? r.results ?? [])
    .filter((kept) => kept.length === 1)
    .map((kept) => kept[0]);
  const isCriticalSuccess = keptD20.includes(20);
  const isCriticalFail = keptD20.includes(1);

  // Color scheme based on result type
  const getResultColor = () => {
    if (isCriticalSuccess) return 'text-success-ink';
    if (isCriticalFail) return 'text-danger-ink';
    return 'text-ink';
  };

  const getBorderColor = () => {
    if (isCriticalSuccess) return 'border-success/30';
    if (isCriticalFail) return 'border-danger/30';
    return 'border-ink-muted/20';
  };

  const getBgColor = () => {
    if (isCriticalSuccess) return 'bg-success/10';
    if (isCriticalFail) return 'bg-danger/10';
    return isCurrentUser
      ? 'bg-moss-green/10'
      : 'bg-surface/30';
  };

  // A secret roll's mark. The wording differs because the cases mean
  // different things: yours is hidden from the other players (from the
  // players, when you are the GM, who has no GM to see it), and the one you
  // are reading as GM is somebody else's.
  const secretTitle = isCurrentUser
    ? rollerIsGM ? 'Hidden from the players' : 'Hidden from the other players — your GM can still see it'
    : 'A player rolled this secretly; you see it as GM';
  const secretWhose = isCurrentUser ? '' : ' (GM view)';

  // Format timestamp
  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);

    if (diffSecs < 10) return 'just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  /**
   * The compact layout's log, where a sheet half a phone's height should show
   * several rolls: two lines a roll. The first says whose it is, what for and
   * when; the second the expression and its working, the dice as plain text
   * with a dropped die struck through. The total stands beside both, large.
   * Long lines are cut short on the screen and read in full.
   */
  if (dense) {
    const crits = [
      ...(isCriticalSuccess ? [{ shown: '🎉 Crit!', said: 'Critical success!', ink: 'text-success-ink' }] : []),
      ...(isCriticalFail ? [{ shown: '💥 Fumble!', said: 'Critical fail!', ink: 'text-danger-ink' }] : []),
    ];
    return (
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={`flex items-center gap-2 rounded-md border ${getBorderColor()} ${getBgColor()} px-2 py-px`}
      >
        <div className="min-w-0 flex-1 text-xs leading-4">
          <div className="flex items-center gap-1">
            {/* Who keeps its width up to two thirds of the line, so it is
                cut only when it is that long, from its end, another's
                "(rolled by …)" going before the name does. Your own roll's
                tag is read out and not shown: the line says whose it is
                already. */}
            <span className="min-w-0 max-w-[65%] shrink-0 truncate text-ink-secondary">
              <span className="font-medium text-ink">{subject}</span>
              {attribution && <span className={isCurrentUser ? 'sr-only' : 'opacity-70'}> {attribution}</span>}
            </span>
            {secret && (
              <span className="shrink-0 rounded-sm bg-ink/10 px-1 text-ink-muted" title={secretTitle}>
                🔒 Secret
                {secretWhose && <span className="sr-only">{secretWhose}</span>}
              </span>
            )}
            {/* What for gives way on a narrow line; the name, the Secret mark
                and the time keep their width. */}
            {purpose && (
              <span className="min-w-0 shrink truncate text-ink-secondary">
                <span aria-hidden="true">· </span>
                {purpose}
              </span>
            )}
            <span className="ml-auto shrink-0 pl-1 text-ink-muted">{formatTimestamp(timestamp)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 font-mono text-ink/90">{expression}</span>
            <span className="min-w-0 truncate font-mono text-ink-secondary">{workingOf(breakdown?.formula, detail)}</span>
            {crits.map((crit) => (
              <span key={crit.said} className={`shrink-0 font-bold ${crit.ink}`}>
                <span aria-hidden="true">{crit.shown}</span>
                <span className="sr-only">{crit.said}</span>
              </span>
            ))}
          </div>
        </div>
        <span className={`shrink-0 text-xl leading-7 font-bold ${getResultColor()}`}>
          <span className="sr-only">= </span>
          {result}
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`rounded-lg border ${getBorderColor()} ${getBgColor()} p-3 mb-2`}
    >
      {/* Header: User, Character, Purpose */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-4 h-4 shrink-0 text-ink-secondary" />
            <span className="font-medium text-sm text-ink truncate">
              {subject}
              {/* Every secret roll in the list is labelled, whoever is looking.
                  It used to be marked only on someone *else's* roll — the GM's
                  audit view — which left your own secret rolls indistinguishable
                  from open ones now that they appear in the list at all. */}
              {secret && (
                <span
                  className="ml-2 text-xs bg-ink/10 text-ink-muted px-2 py-0.5 rounded-sm"
                  title={secretTitle}
                >
                  🔒 Secret{secretWhose}
                </span>
              )}
            </span>
            {attribution && (
              <span className="text-xs text-ink-secondary truncate opacity-70">
                {attribution}
              </span>
            )}
          </div>

          {purpose && (
            <div className="flex items-center gap-1 text-xs text-ink-secondary">
              <Target className="w-3 h-3 shrink-0" />
              <span className="truncate">{purpose}</span>
            </div>
          )}
        </div>

        <span className="text-xs text-ink-muted ml-2 shrink-0">
          {formatTimestamp(timestamp)}
        </span>
      </div>

      {/* Expression and Result */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Dices className="w-5 h-5 text-brand-ink" />
          <span className="text-sm font-mono text-ink/90">
            {expression}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-muted">=</span>
          <motion.span
            initial={{ scale: 1.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className={`text-2xl font-bold ${getResultColor()}`}
          >
            {result}
          </motion.span>
        </div>
      </div>

      {/* Breakdown */}
      <div className="mt-2 pt-2 border-t">
        <div className="text-xs text-ink-secondary space-y-1">
          {/* Formula */}
          {breakdown?.formula && (
            <div className="font-mono">
              <span className="opacity-60">Formula: </span>
              {breakdown.formula}
            </div>
          )}

          {/* Individual dice rolls */}
          <div className="flex flex-wrap gap-2">
            {detail.map((roll, idx) => (
              <div key={idx} className="flex items-center gap-1">
                {roll.type === 'dice' && roll.notation && (
                  <div className="inline-flex items-center gap-1 bg-ink/5 px-2 py-1 rounded-sm">
                    <span className="font-mono text-xs opacity-80">{roll.notation}:</span>
                    <div className="flex gap-1">
                      {roll.results?.map((r, rIdx) => {
                        const isKept = keptMarks(roll)[rIdx];
                        const isCrit20 = r === 20 && roll.sides === 20;
                        const isCrit1 = r === 1 && roll.sides === 20;

                        return (
                          <span
                            key={rIdx}
                            className={`
                              font-mono text-xs px-1 rounded
                              ${!isKept ? 'line-through opacity-40' : ''}
                              ${isCrit20 ? 'bg-success/15 text-success-ink font-bold' : ''}
                              ${isCrit1 ? 'bg-danger/15 text-danger-ink font-bold' : ''}
                            `}
                          >
                            {r}
                          </span>
                        );
                      })}
                    </div>
                    {roll.total !== undefined && (
                      <span className="font-mono text-xs opacity-60">
                        = {roll.total}
                      </span>
                    )}
                  </div>
                )}

                {roll.type === 'modifier' && roll.value !== undefined && (
                  <div data-modifier className="inline-flex items-center gap-1 bg-warm-amber/10 px-2 py-1 rounded-sm">
                    <span className="font-mono text-xs opacity-80">
                      {modifierText(roll.value, operators[idx])}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Critical indicator */}
      {(isCriticalSuccess || isCriticalFail) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className={`
            mt-2 pt-2 border-t text-center text-sm font-bold
            ${isCriticalSuccess ? 'text-success-ink border-success/20' : ''}
            ${isCriticalFail ? 'text-danger-ink border-danger/20' : ''}
          `}
        >
          {isCriticalSuccess && '🎉 CRITICAL SUCCESS!'}
          {isCriticalFail && '💥 CRITICAL FAIL!'}
        </motion.div>
      )}
    </motion.div>
  );
}

/** A number in a roll's formula: a group of dice's total or a modifier. */
const FORMULA_NUMBER = /^\d+$/;

/**
 * A roll's working as its formula reads, each group of dice written as its
 * faces in brackets: "[9 20]" for 2d20kh1, "[13] + 5" for 1d20+5. A roll
 * whose formula does not name its groups one for one, as an imported or old
 * one may not, lists the groups in order.
 */
function workingOf(formula: string | undefined, detail: DiceRollDetail[]): ReactNode {
  const tokens = typeof formula === 'string' ? formula.split(' ').filter(Boolean) : [];
  const byFormula = tokens.filter((token) => FORMULA_NUMBER.test(token)).length === detail.length;
  let next = 0;
  const parts: ReactNode[] = byFormula
    ? tokens.map((token) => (FORMULA_NUMBER.test(token) ? groupText(detail[next++], false) : token))
    : detail.map((group) => groupText(group, true));
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && ' '}
      {part}
    </Fragment>
  ));
}

/**
 * The operator the formula writes before each group of a roll, in the
 * groups' order ('' for the first, or after a bracket), or an empty list
 * where the formula does not name the groups one for one. The server stores
 * a modifier as the number written, and what was done with it only here:
 * `1d20-1` is the groups 1d20 and 1, with the formula "13 - 1".
 */
function operatorsOf(formula: string | undefined, detail: DiceRollDetail[]): string[] {
  const tokens = typeof formula === 'string' ? formula.split(' ').filter(Boolean) : [];
  const numbers = tokens.flatMap((token, at) => (FORMULA_NUMBER.test(token) ? [at] : []));
  if (numbers.length !== detail.length) return [];
  return numbers.map((at) => (at > 0 && /^[-+*/]$/.test(tokens[at - 1]) ? tokens[at - 1] : ''));
}

/** A modifier's chip: the number with what the roll did with it, "+2", "-1", "×2" or "÷2". */
function modifierText(value: number, operator: string | undefined): string {
  if (operator === '-') return `-${value}`;
  if (operator === '*') return `×${value}`;
  if (operator === '/') return `÷${value}`;
  return `${value >= 0 ? '+' : ''}${value}`;
}

/** A group of a roll as text: its dice's faces, or a modifier, signed where no formula gives the sign. */
function groupText(group: DiceRollDetail, signed: boolean): ReactNode {
  if (group.type === 'modifier') {
    if (group.value === undefined) return null;
    return `${signed && group.value >= 0 ? '+' : ''}${group.value}`;
  }
  const faces = group.results ?? [];
  if (faces.length === 0) return group.total === undefined ? null : `[${group.total}]`;
  const kept = keptMarks(group);
  return (
    <>
      [
      {faces.map((face, i) => (
        <Fragment key={i}>
          {i > 0 && ' '}
          <span
            className={cn(
              !kept[i] && 'line-through opacity-60',
              group.sides === 20 && face === 20 && 'font-bold text-success-ink',
              group.sides === 20 && face === 1 && 'font-bold text-danger-ink'
            )}
          >
            {face}
          </span>
          {!kept[i] && <span className="sr-only"> dropped</span>}
        </Fragment>
      ))}
      ]
    </>
  );
}

/**
 * Which of a group's dice it kept, by position. Counted, not looked up by
 * value: with equal values, as [14, 14] keeping one, looking each up marked
 * every one kept and struck none through.
 */
function keptMarks(roll: { results?: number[]; kept?: number[] }): boolean[] {
  const results = roll.results ?? [];
  if (!roll.kept) return results.map(() => true);
  const left = new Map<number, number>();
  for (const value of roll.kept) left.set(value, (left.get(value) ?? 0) + 1);
  return results.map((value) => {
    const remaining = left.get(value) ?? 0;
    if (remaining === 0) return false;
    left.set(value, remaining - 1);
    return true;
  });
}
