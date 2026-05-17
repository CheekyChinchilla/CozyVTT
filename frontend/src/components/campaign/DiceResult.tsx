import { motion } from 'framer-motion';
import { Dices, User, Target } from 'lucide-react';
import type { DiceRolledEvent } from '@/types';

interface DiceResultProps {
  roll: DiceRolledEvent;
  isCurrentUser: boolean;
}

/**
 * Display a single dice roll result with breakdown and animations
 */
export default function DiceResult({ roll, isCurrentUser }: DiceResultProps) {
  const { userName, characterName, expression, result, breakdown, purpose, timestamp, secret } = roll;

  // Determine if critical success or fail (for d20 rolls)
  const isCriticalSuccess = breakdown.rolls.some(
    (r) => r.notation === '1d20' && r.results?.includes(20)
  );
  const isCriticalFail = breakdown.rolls.some(
    (r) => r.notation === '1d20' && r.results?.includes(1)
  );

  // Color scheme based on result type
  const getResultColor = () => {
    if (isCriticalSuccess) return 'text-green-700 dark:text-green-600';
    if (isCriticalFail) return 'text-red-600 dark:text-red-400';
    return 'text-ink';
  };

  const getBorderColor = () => {
    if (isCriticalSuccess) return 'border-green-500/30';
    if (isCriticalFail) return 'border-red-500/30';
    return 'border-ink-muted/20';
  };

  const getBgColor = () => {
    if (isCriticalSuccess) return 'bg-green-50/50 dark:bg-green-900/20';
    if (isCriticalFail) return 'bg-red-50/50 dark:bg-red-900/20';
    return isCurrentUser
      ? 'bg-moss-green/10'
      : 'bg-surface/30';
  };

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
            <User className="w-4 h-4 flex-shrink-0 text-ink-secondary" />
            <span className="font-medium text-sm text-ink truncate">
              {userName}
              {isCurrentUser && <span className="ml-1 text-xs opacity-60">(You)</span>}
              {secret && !isCurrentUser && (
                <span className="ml-2 text-xs bg-gray-500/20 text-gray-700 dark:text-gray-400 px-2 py-0.5 rounded">
                  🔒 Secret (DM View)
                </span>
              )}
            </span>
            {characterName && (
              <span className="text-xs text-ink-secondary truncate">
                as {characterName}
              </span>
            )}
          </div>

          {purpose && (
            <div className="flex items-center gap-1 text-xs text-ink-secondary">
              <Target className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{purpose}</span>
            </div>
          )}
        </div>

        <span className="text-xs text-ink-muted ml-2 flex-shrink-0">
          {formatTimestamp(timestamp)}
        </span>
      </div>

      {/* Expression and Result */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Dices className="w-5 h-5 text-moss-green" />
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
      <div className="mt-2 pt-2 border-t border-current/10">
        <div className="text-xs text-ink-secondary space-y-1">
          {/* Formula */}
          <div className="font-mono">
            <span className="opacity-60">Formula: </span>
            {breakdown.formula}
          </div>

          {/* Individual dice rolls */}
          <div className="flex flex-wrap gap-2 mt-2">
            {breakdown.rolls.map((roll, idx) => (
              <div key={idx} className="flex items-center gap-1">
                {roll.type === 'dice' && roll.notation && (
                  <div className="inline-flex items-center gap-1 bg-ink/5 px-2 py-1 rounded">
                    <span className="font-mono text-xs opacity-80">{roll.notation}:</span>
                    <div className="flex gap-1">
                      {roll.results?.map((r, rIdx) => {
                        const isKept = roll.kept ? roll.kept.includes(r) : true;
                        const isCrit20 = r === 20 && roll.sides === 20;
                        const isCrit1 = r === 1 && roll.sides === 20;

                        return (
                          <span
                            key={rIdx}
                            className={`
                              font-mono text-xs px-1 rounded
                              ${!isKept ? 'line-through opacity-40' : ''}
                              ${isCrit20 ? 'bg-green-500/20 text-green-800 dark:text-green-500 font-bold' : ''}
                              ${isCrit1 ? 'bg-red-500/20 text-red-700 dark:text-red-300 font-bold' : ''}
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
                  <div className="inline-flex items-center gap-1 bg-warm-amber/10 px-2 py-1 rounded">
                    <span className="font-mono text-xs opacity-80">
                      {roll.value >= 0 ? '+' : ''}{roll.value}
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
            ${isCriticalSuccess ? 'text-green-700 dark:text-green-600 border-green-500/20' : ''}
            ${isCriticalFail ? 'text-red-600 dark:text-red-400 border-red-500/20' : ''}
          `}
        >
          {isCriticalSuccess && '🎉 CRITICAL SUCCESS!'}
          {isCriticalFail && '💥 CRITICAL FAIL!'}
        </motion.div>
      )}
    </motion.div>
  );
}
