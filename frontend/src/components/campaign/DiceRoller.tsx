import { useState, useEffect, useRef, FormEvent, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dices, Send, AlertCircle, RotateCcw, ChevronLeft, ChevronRight, Trash2, EyeOff, X } from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCampaign } from '@/contexts/CampaignContext';
import type { DiceRolledEvent, DiceRolledSecretEvent, DiceRollDetail } from '@/types';
import { CampaignStatus } from '@/types';
import DiceResult from './DiceResult';
import ConfirmDialog from '@/components/common/ConfirmDialog';

// ============================================
// Local (offline) dice evaluator
// Used when session is paused — no server, no DB, no DM visibility
// Handles: NdS, NdSkh/klN, modifiers (+/-N), chained groups (2d6+1d4+3)
// ============================================

function localRoll(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function evaluateLocalRoll(
  expression: string,
  user: { id: string; displayName: string },
  characterName?: string,
  purpose?: string,
): DiceRolledEvent | null {
  try {
    const expr = expression.trim().replace(/\s+/g, '');

    // Tokenise by splitting on + / - boundaries (keeping signs)
    const tokens = expr.match(/[+-]?[^+-]+/g);
    if (!tokens || tokens.length === 0) return null;

    const detailRolls: DiceRollDetail[] = [];
    const formulaParts: string[] = [];
    let total = 0;

    for (const token of tokens) {
      const negative = token.startsWith('-');
      const sign = negative ? -1 : 1;
      const part = token.replace(/^[+-]/, '');

      // Dice group: NdS or NdSkh/klK
      const diceMatch = part.match(/^(\d+)d(\d+)(?:(kh|kl)(\d+))?$/i);
      if (diceMatch) {
        const count = Math.min(parseInt(diceMatch[1]), 100);
        const sides = Math.min(parseInt(diceMatch[2]), 1000);
        const keepMode = diceMatch[3]?.toLowerCase() as 'kh' | 'kl' | undefined;
        const keepCount = diceMatch[4] ? Math.min(parseInt(diceMatch[4]), count) : undefined;

        const results = Array.from({ length: count }, () => localRoll(sides));

        let kept: number[] | undefined;
        let groupTotal: number;

        if (keepMode && keepCount) {
          const sorted = [...results].sort((a, b) => b - a);
          kept = keepMode === 'kh' ? sorted.slice(0, keepCount) : sorted.slice(count - keepCount);
          groupTotal = kept.reduce((s, v) => s + v, 0);
        } else {
          groupTotal = results.reduce((s, v) => s + v, 0);
        }

        const effectiveTotal = sign * groupTotal;
        total += effectiveTotal;
        formulaParts.push(negative && formulaParts.length > 0 ? `- ${groupTotal}` : String(groupTotal));
        detailRolls.push({ type: 'dice', notation: part.toLowerCase(), count, sides, results, total: groupTotal, kept });
      } else {
        // Plain modifier
        const modValue = parseInt(part, 10);
        if (isNaN(modValue)) return null;
        const effectiveMod = sign * modValue;
        total += effectiveMod;
        formulaParts.push(
          negative && formulaParts.length > 0 ? `- ${modValue}` : (sign < 0 ? String(effectiveMod) : `+${modValue}`),
        );
        detailRolls.push({ type: 'modifier', value: effectiveMod });
      }
    }

    if (detailRolls.length === 0) return null;

    const formula = formulaParts.join(' + ').replace(/\+ \+/g, '+').replace(/\+ -/g, '- ') + ` = ${total}`;

    return {
      userId: user.id,
      userName: user.displayName,
      characterName: characterName?.trim() || null,
      expression,
      result: total,
      breakdown: { expression, rolls: detailRolls, total, formula },
      purpose: purpose?.trim() || null,
      timestamp: new Date().toISOString(),
      secret: false,
    };
  } catch {
    return null;
  }
}

// Quick roll button configurations with whimsical forest colors
const QUICK_ROLLS = [
  { label: 'd4', expression: '1d4', color: 'bg-amber-100/80 dark:bg-amber-900/30 border-amber-300/50 hover:bg-amber-200/80 dark:hover:bg-amber-900/40' },
  { label: 'd6', expression: '1d6', color: 'bg-green-100/80 dark:bg-green-900/30 border-green-300/50 hover:bg-green-200/80 dark:hover:bg-green-900/40' },
  { label: 'd8', expression: '1d8', color: 'bg-purple-100/80 dark:bg-purple-900/30 border-purple-300/50 hover:bg-purple-200/80 dark:hover:bg-purple-900/40' },
  { label: 'd10', expression: '1d10', color: 'bg-orange-100/80 dark:bg-orange-900/30 border-orange-300/50 hover:bg-orange-200/80 dark:hover:bg-orange-900/40' },
  { label: 'd12', expression: '1d12', color: 'bg-teal-100/80 dark:bg-teal-900/30 border-teal-300/50 hover:bg-teal-200/80 dark:hover:bg-teal-900/40' },
  { label: 'd20', expression: '1d20', color: 'bg-rose-100/80 dark:bg-rose-900/30 border-rose-300/50 hover:bg-rose-200/80 dark:hover:bg-rose-900/40' },
  { label: 'd100', expression: '1d100', color: 'bg-indigo-100/80 dark:bg-indigo-900/30 border-indigo-300/50 hover:bg-indigo-200/80 dark:hover:bg-indigo-900/40' },
];

const SPECIAL_ROLLS = [
  { label: 'Adv', expression: '2d20kh1' },
  { label: 'Dis', expression: '2d20kl1' },
  { label: '4d6kh3', expression: '4d6kh3' },
];

/**
 * Dice roller component with carousel navigation and secret rolls
 */
export default function DiceRoller() {
  const { socket } = useWebSocket();
  const { user } = useAuth();
  const { userRole, campaign } = useCampaign();
  const isPaused = campaign?.status === CampaignStatus.PAUSED && userRole !== 'DM';

  // Form state
  const [expression, setExpression] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [isSecret, setIsSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Roll history state
  const [rolls, setRolls] = useState<DiceRolledEvent[]>([]);
  const [currentRollIndex, setCurrentRollIndex] = useState(0);
  const [isRolling, setIsRolling] = useState(false);

  // Confirm clear history
  const [confirmClear, setConfirmClear] = useState(false);

  // Secret roll popup state
  const [secretRollResult, setSecretRollResult] = useState<DiceRolledEvent | null>(null);

  // Rate limit state
  const [rateLimitCooldown, setRateLimitCooldown] = useState(0);
  const isInCooldown = useRef(false);

  // ============================================
  // WebSocket Event Handlers
  // ============================================

  useEffect(() => {
    if (!socket) return;

    console.log('[DiceRoller] Setting up dice.rolled listener');

    const handleDiceRolled = (data: DiceRolledEvent) => {
      console.log('[DiceRoller] Received dice.rolled event:', data);

      // Secret rolls only visible to the roller
      if (data.secret && user && data.userId !== user.id) {
        console.log('[DiceRoller] Secret roll from another user, ignoring');
        return;
      }

      // Handle secret rolls - show in popup, don't add to history
      if (data.secret && user && data.userId === user.id) {
        setSecretRollResult(data);
        setIsRolling(false);
        return;
      }

      // Add normal rolls to FRONT of array (newest first)
      if (!data.secret) {
        setRolls((prev) => {
          const updated = [data, ...prev];
          // Keep only last 50 rolls
          if (updated.length > 50) {
            return updated.slice(0, 50);
          }
          return updated;
        });

        // Stop rolling animation and jump to latest roll (index 0)
        if (user && data.userId === user.id) {
          setIsRolling(false);
          setCurrentRollIndex(0);
        }
      }
    };

    socket.onDiceRolled(handleDiceRolled);

    return () => {
      console.log('[DiceRoller] Cleaning up dice.rolled listener');
      socket.off('dice.rolled', handleDiceRolled);
    };
  }, [socket, user]);

  // DM Audit: Listen for secret rolls by other players
  useEffect(() => {
    if (!socket || userRole !== 'DM') return;

    console.log('[DiceRoller] Setting up dice.rolled.secret listener for DM audit');

    const handleSecretRollAudit = (data: DiceRolledSecretEvent) => {
      console.log('[DiceRoller] DM received secret roll audit:', data);

      // Add to history with audit marker (convert to DiceRolledEvent format)
      const auditRoll: DiceRolledEvent = {
        ...data,
        secret: true, // Keep secret flag for styling
      };

      setRolls((prev) => {
        const updated = [auditRoll, ...prev];
        if (updated.length > 50) {
          return updated.slice(0, 50);
        }
        return updated;
      });
    };

    socket.onDiceRolledSecret(handleSecretRollAudit);

    return () => {
      console.log('[DiceRoller] Cleaning up dice.rolled.secret listener');
      socket.off('dice.rolled.secret', handleSecretRollAudit);
    };
  }, [socket, userRole]);

  // Handle WebSocket errors (rate limiting)
  useEffect(() => {
    if (!socket) return;

    const handleError = (data: { message: string }) => {
      console.log('[DiceRoller] Received error event:', data);

      // Check if it's a rate limit error
      if (data.message.includes('Rate limit exceeded')) {
        setError(data.message);
        setIsRolling(false);
        // Only set cooldown if not already in cooldown (prevent reset)
        if (!isInCooldown.current) {
          isInCooldown.current = true;
          setRateLimitCooldown(20); // 20 seconds cooldown
        }
      } else {
        setError(data.message);
        setIsRolling(false);
      }
    };

    socket.on('error', handleError);

    return () => {
      socket.off('error', handleError);
    };
  }, [socket]);

  // Countdown timer for rate limit cooldown
  useEffect(() => {
    if (rateLimitCooldown <= 0) {
      isInCooldown.current = false;
      return;
    }

    const timer = setInterval(() => {
      setRateLimitCooldown((prev) => {
        if (prev <= 1) {
          setError(null);
          isInCooldown.current = false;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [rateLimitCooldown]);

  // Listen for dice history cleared event
  useEffect(() => {
    if (!socket) return;

    const handleHistoryCleared = () => {
      console.log('[DiceRoller] Dice history cleared by DM');
      setRolls([]);
      setCurrentRollIndex(0);
    };

    socket.onDiceHistoryCleared(handleHistoryCleared);

    return () => {
      socket.off('dice.historyCleared', handleHistoryCleared);
    };
  }, [socket]);

  // ============================================
  // Input Validation
  // ============================================

  const validateExpression = (expr: string): string | null => {
    if (!expr.trim()) {
      return 'Expression cannot be empty';
    }

    // Check length limit (200 characters)
    if (expr.length > 200) {
      return 'Expression too long (max 200 characters)';
    }

    // Basic validation for dice notation
    const dicePattern = /^[\dd+\-*/khldisavw\s]+$/i;
    if (!dicePattern.test(expr)) {
      return 'Invalid characters in expression';
    }

    // Check for maximum dice count (100)
    const diceMatches = expr.match(/(\d+)d/gi);
    if (diceMatches) {
      const totalDice = diceMatches.reduce((sum, match) => {
        const count = parseInt(match.replace(/d/i, ''));
        return sum + count;
      }, 0);

      if (totalDice > 100) {
        return 'Too many dice (max 100 per roll)';
      }
    }

    return null;
  };

  // ============================================
  // Roll Handlers
  // ============================================

  const rollDice = (expr: string) => {
    // When session is paused, roll entirely client-side — no server, no DB, no DM visibility
    if (isPaused) {
      if (!user) return;
      const validationError = validateExpression(expr);
      if (validationError) { setError(validationError); return; }
      setError(null);
      setIsRolling(true);
      const localResult = evaluateLocalRoll(expr, user, characterName.trim(), purpose.trim());
      if (localResult) {
        setRolls((prev) => [localResult, ...prev]);
        setCurrentRollIndex(0);
      } else {
        setError('Could not evaluate expression locally');
      }
      setIsRolling(false);
      return;
    }

    // Normal online roll via WebSocket
    if (rateLimitCooldown > 0) {
      return;
    }

    if (!socket?.isConnected()) {
      setError('Not connected to server');
      return;
    }

    const validationError = validateExpression(expr);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsRolling(true);

    console.log('[DiceRoller] Rolling dice:', expr, 'secret:', isSecret);

    socket.emitDiceRoll({
      expression: expr.trim(),
      characterName: characterName.trim() || undefined,
      purpose: purpose.trim() || undefined,
      secret: isSecret,
    });

    // Reset secret roll checkbox after rolling
    if (isSecret) {
      setIsSecret(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    rollDice(expression);
  };

  const handleQuickRoll = (expr: string) => {
    setExpression(expr);
    rollDice(expr);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      rollDice(expression);
    }
  };

  const handleClear = () => {
    setExpression('');
    setCharacterName('');
    setPurpose('');
    setError(null);
  };

  const handlePrevRoll = () => {
    // Left arrow = go to older rolls (higher index)
    setCurrentRollIndex((prev) => Math.min(prev + 1, rolls.length - 1));
  };

  const handleNextRoll = () => {
    // Right arrow = go to newer rolls (lower index)
    setCurrentRollIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleClearHistory = () => {
    setConfirmClear(true);
  };

  const handleConfirmClear = () => {
    socket?.emitClearDiceHistory();
    setConfirmClear(false);
  };

  // ============================================
  // Render
  // ============================================

  // Get current roll for carousel
  const currentRoll = rolls.length > 0 ? rolls[currentRollIndex] : null;

  return (
    <>
    <ConfirmDialog
      isOpen={confirmClear}
      title="Clear Roll History"
      message="Clear all roll history for everyone? This cannot be undone."
      confirmLabel="Clear History"
      variant="danger"
      onConfirm={handleConfirmClear}
      onCancel={() => setConfirmClear(false)}
    />
    <div className="h-full flex flex-col bg-surface/50 backdrop-blur-sm rounded-lg border border-ink-muted/20 relative">
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-ink-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dices className="w-4 h-4 text-moss-green dark:text-moss-green" />
            <h2 className="text-base font-semibold text-ink">
              Dice Roller
            </h2>
          </div>
          {/* DM Only: Clear History Button */}
          {userRole === 'DM' && rolls.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-red-500/30 bg-red-50/50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100/50 dark:hover:bg-red-900/30 transition-all"
              title="Clear all roll history"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Roll History Carousel */}
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {rolls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Dices className="w-10 h-10 text-ink-muted/40 mb-2" />
            <p className="text-ink-secondary text-xs">
              No rolls yet. Roll some dice to get started!
            </p>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* Carousel Navigation */}
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={handlePrevRoll}
                disabled={currentRollIndex >= rolls.length - 1}
                className="p-1 rounded-md border border-ink-muted/30 bg-paper/50 hover:bg-paper/70 text-ink disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="Older rolls"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-ink-secondary">
                Roll {rolls.length - currentRollIndex} of {rolls.length}
              </span>
              <button
                onClick={handleNextRoll}
                disabled={currentRollIndex <= 0}
                className="p-1 rounded-md border border-ink-muted/30 bg-paper/50 hover:bg-paper/70 text-ink disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="Newer rolls"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Current Roll Display */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                {currentRoll && (
                  <DiceResult
                    key={`${currentRoll.userId}-${currentRoll.timestamp}`}
                    roll={currentRoll}
                    isCurrentUser={user?.id === currentRoll.userId}
                  />
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-ink-muted/20 p-3 bg-surface/80 backdrop-blur-sm">
        {/* Paused notice for players — rolls still work but are forced secret */}
        {isPaused && (
          <p className="text-xs text-warm-amber text-center mb-2 italic">
            Session paused — rolls are automatically secret.
          </p>
        )}
        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 flex items-center gap-2 text-red-600 dark:text-red-400 text-xs"
            >
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick Roll Buttons */}
        <div className="mb-2">
          <div className="text-xs text-ink-secondary mb-1">
            Quick Roll:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ROLLS.map((btn) => (
              <button
                key={btn.label}
                onClick={() => handleQuickRoll(btn.expression)}
                disabled={isRolling}
                className={`
                  px-2 py-1 rounded-md text-xs font-medium transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed
                  text-ink
                  ${btn.color}
                `}
              >
                {btn.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {SPECIAL_ROLLS.map((btn) => (
              <button
                key={btn.label}
                onClick={() => handleQuickRoll(btn.expression)}
                disabled={isRolling}
                className="
                  px-2 py-1 rounded-md border border-warm-amber/30 text-xs font-medium
                  bg-warm-amber/10 hover:bg-warm-amber/20 transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed
                  text-ink
                "
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Expression Input */}
        <form onSubmit={handleSubmit} className="space-y-1.5">
          <div>
            <input
              id="expression"
              type="text"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., 2d6+3, 1d20+5, 4d6kh3"
              disabled={isRolling}
              className="input-cozy px-2 py-1.5 font-mono text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <input
              id="characterName"
              type="text"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              placeholder="Character"
              disabled={isRolling}
              className="input-cozy px-2 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            />

            <input
              id="purpose"
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Purpose"
              disabled={isRolling}
              className="input-cozy px-2 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Secret Roll Checkbox */}
          <div className="flex items-center gap-2">
            <input
              id="secretRoll"
              type="checkbox"
              checked={isSecret}
              onChange={(e) => setIsSecret(e.target.checked)}
              disabled={isRolling}
              className="w-3 h-3 rounded border-ink-muted/30 text-moss-green focus:ring-brand/50 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <label
              htmlFor="secretRoll"
              className="flex items-center gap-1 text-xs text-ink-secondary cursor-pointer"
            >
              <EyeOff className="w-3 h-3" />
              <span>Secret Roll (only you can see)</span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-1.5">
            <button
              type="submit"
              disabled={isRolling || !expression.trim() || rateLimitCooldown > 0}
              className="
                flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md
                bg-green-700 hover:bg-green-600 text-white font-semibold text-xs shadow-sm
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-green-500/50
              "
            >
              {isRolling ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Dices className="w-4 h-4" />
                  </motion.div>
                  <span>Rolling...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Roll</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleClear}
              disabled={isRolling}
              className="
                px-2 py-1.5 rounded-md border border-ink-muted/30
                bg-paper/50 hover:bg-paper/70
                text-ink
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-brand/50
              "
              title="Clear all fields"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Hint / Rate Limit Countdown */}
        {rateLimitCooldown > 0 ? (
          <div className="mt-1.5 text-xs text-red-600 dark:text-red-400 text-center font-medium">
            You may roll again in: {rateLimitCooldown} second{rateLimitCooldown !== 1 ? 's' : ''}
          </div>
        ) : (
          <div className="mt-1.5 text-xs text-ink-muted text-center">
            Press Enter to roll
          </div>
        )}
      </div>

      {/* Secret Roll Popup Overlay */}
      <AnimatePresence>
        {secretRollResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setSecretRollResult(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-light rounded-lg border-2 border-brand/50 shadow-2xl max-w-md w-full relative"
            >
              {/* Close Button */}
              <button
                onClick={() => setSecretRollResult(null)}
                className="absolute top-2 right-2 p-1 rounded-md bg-surface hover:bg-surface-dark transition-all"
                title="Close"
              >
                <X className="w-4 h-4 text-ink" />
              </button>

              {/* Header */}
              <div className="p-4 border-b border-ink/10">
                <div className="flex items-center gap-2">
                  <EyeOff className="w-5 h-5 text-brand" />
                  <h3 className="text-lg font-semibold text-ink">
                    Secret Roll
                  </h3>
                </div>
                <p className="text-xs text-ink-muted mt-1">
                  Only you can see this result
                </p>
              </div>

              {/* Roll Result */}
              <div className="p-4 bg-paper">
                <div className="bg-paper rounded-lg p-3 shadow-inner">
                  <DiceResult
                    roll={secretRollResult}
                    isCurrentUser={true}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-ink/10 bg-surface rounded-b-lg">
                <button
                  onClick={() => setSecretRollResult(null)}
                  className="w-full px-3 py-2 rounded-md bg-brand hover:bg-brand-dark text-white font-semibold text-sm shadow-sm transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}
