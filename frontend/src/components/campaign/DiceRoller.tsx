import { useState, useEffect, useRef, useCallback, useMemo, FormEvent, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dices, Send, AlertCircle, RotateCcw, Trash2, EyeOff, Eye, X } from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCampaign } from '@/contexts/CampaignContext';
import { getDiceRolls } from '@/services/dice.service';
import { mayDisplayRoll, visibleRolls } from '@/utils/secretRolls';
import type { DiceRolledEvent, DiceRolledSecretEvent, DiceRollDetail } from '@/types';
import { CampaignStatus } from '@/types';
import DiceResult from './DiceResult';
import ConfirmDialog from '@/components/common/ConfirmDialog';

/**
 * Stable identity for a roll, used to dedupe the live socket stream against
 * history replayed from the server.
 *
 * Stored rolls carry their database id. A roll made while the session is paused
 * never reaches the server and has none, so it falls back to the roller and
 * timestamp — which is what the whole list keyed on before rolls had ids at all.
 */
function rollKey(roll: DiceRolledEvent): string {
  return roll.id ?? `${roll.userId}-${roll.timestamp}`;
}

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
  { label: 'd4', expression: '1d4', color: 'bg-warning/15 dark:bg-warning/30 border-warning/50 hover:bg-warning/80 dark:hover:bg-warning/40' },
  { label: 'd6', expression: '1d6', color: 'bg-success/15 dark:bg-success/30 border-success/50 hover:bg-success/80 dark:hover:bg-success/40' },
  { label: 'd8', expression: '1d8', color: 'bg-spirit/15 dark:bg-spirit/30 border-spirit/50 hover:bg-spirit/80 dark:hover:bg-spirit/40' },
  { label: 'd10', expression: '1d10', color: 'bg-warning/15 dark:bg-warning/30 border-warning/50 hover:bg-warning/80 dark:hover:bg-warning/40' },
  { label: 'd12', expression: '1d12', color: 'bg-teal-100/80 dark:bg-teal-900/30 border-teal-300/50 hover:bg-teal-200/80 dark:hover:bg-teal-900/40' },
  { label: 'd20', expression: '1d20', color: 'bg-danger/15 dark:bg-danger/30 border-danger/50 hover:bg-danger/80 dark:hover:bg-danger/40' },
  { label: 'd100', expression: '1d100', color: 'bg-info/15 dark:bg-info/30 border-info/50 hover:bg-info/80 dark:hover:bg-info/40' },
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
  const { socket, reconnectCount, status } = useWebSocket();
  const { user } = useAuth();
  const { userRole, campaign } = useCampaign();
  const isPaused = campaign?.status === CampaignStatus.PAUSED && userRole !== 'DM';

  /**
   * Which campaign members are DMs, so a roll made on someone else's behalf can
   * say so. Taken from the campaign's membership list rather than sent with the
   * roll — the roller does not get to assert their own role.
   */
  const dmUserIds = useMemo(
    () => new Set((campaign?.memberships ?? []).filter((m) => m.role === 'DM').map((m) => m.userId)),
    [campaign?.memberships]
  );

  // Form state
  const [expression, setExpression] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [isSecret, setIsSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Roll history state
  const [rolls, setRolls] = useState<DiceRolledEvent[]>([]);
  const [isRolling, setIsRolling] = useState(false);

  /**
   * Whether this viewer wants their own secret rolls in the list.
   *
   * A preference, not a permission — it only hides rolls this viewer is already
   * entitled to see, and turning it on cannot reveal anybody else's. Local to
   * the browser and to this person: nothing about it is sent anywhere or
   * affects what another player sees.
   */
  const [showSecretRolls, setShowSecretRolls] = useState(true);

  /** Scroll anchor, so a new roll brings the list to the bottom. */
  const rollsEndRef = useRef<HTMLDivElement>(null);
  const rollsContainerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  /**
   * Safety net for the "Rolling…" state.
   *
   * A roll is only ever ended by a message coming back from the server, so
   * anything that loses that message leaves the button disabled until the user
   * reloads. The listener bug that caused this in practice is fixed in the
   * socket client, but a roll can still be lost if the connection drops between
   * the emit and the reply — and a control that can wedge with no way out
   * should always have one.
   */
  const rollTimeoutRef = useRef<number | null>(null);
  const ROLL_TIMEOUT_MS = 10000;

  const clearPendingRoll = useCallback(() => {
    if (rollTimeoutRef.current !== null) {
      clearTimeout(rollTimeoutRef.current);
      rollTimeoutRef.current = null;
    }
    setIsRolling(false);
  }, []);

  // A pending roll cannot be answered while the socket is down, and drop the
  // timer on unmount so it cannot fire against a gone component.
  useEffect(() => {
    if (status !== 'connected') clearPendingRoll();
  }, [status, clearPendingRoll]);

  useEffect(() => () => {
    if (rollTimeoutRef.current !== null) clearTimeout(rollTimeoutRef.current);
  }, []);

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

  /**
   * Load roll history from the server on mount, and again after a reconnect.
   *
   * Rolls have always been stored server-side; nothing read them back, so this
   * panel started empty after every refresh even though the rolls still
   * existed. Mirrors ChatPanel's load-then-resync pattern.
   *
   * Secret rolls are kept: the server has already scoped them — a DM gets every
   * one, anyone else gets only their own — so a roll that arrives here is one
   * this viewer is entitled to. `mayDisplayRoll` re-checks rather than trusting
   * that blindly, because a display bug here would be indistinguishable from a
   * leak. They used to be dropped for everyone but the DM, which meant a player
   * lost sight of their own secret rolls the moment they refreshed.
   */
  useEffect(() => {
    if (!campaign?.id) return;
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const fetched = await getDiceRolls(campaign.id, 50);
        if (cancelled) return;
        const visible = fetched.filter((r) => mayDisplayRoll(r, user?.id, userRole === 'DM'));

        setRolls((prev) => {
          // Merge rather than replace: a roll can land live between mount and
          // this response, and it must not be lost or duplicated.
          const seen = new Set(prev.map(rollKey));
          const merged = [...prev, ...visible.filter((r) => !seen.has(rollKey(r)))];
          merged.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          return merged.slice(0, 50);
        });
      } catch (err) {
        console.error('[DiceRoller] Failed to load roll history:', err);
        // Non-fatal — live rolls still arrive over the socket.
      }
    };

    loadHistory();
    return () => { cancelled = true; };
  }, [campaign?.id, userRole, reconnectCount]);

  useEffect(() => {
    if (!socket) return;

    console.log('[DiceRoller] Setting up dice.rolled listener');

    const handleDiceRolled = (data: DiceRolledEvent) => {
      console.log('[DiceRoller] Received dice.rolled event:', data);

      const isMine = !!user && data.userId === user.id;

      // Any reply to my own roll ends the pending state, whatever kind of roll
      // it was. Deciding this once up front closes a hole in the old branching:
      // a secret roll arriving while `user` was momentarily unset matched none
      // of the three branches, so the flag was never cleared and the button
      // stayed on "Rolling…".
      if (isMine) {
        clearPendingRoll();
      }

      // My own secret roll still gets its popup — a secret roll is deliberately
      // undramatic in the shared list, and the popup is the confirmation that it
      // landed. It now also joins the list, so it survives being dismissed.
      if (data.secret && isMine) {
        setSecretRollResult(data);
      }

      // Someone else's secret roll is not mine to see. The server does not send
      // them, so reaching this is already wrong; drop it rather than draw it.
      if (!mayDisplayRoll(data, user?.id, userRole === 'DM')) return;

      // Newest first in state; the list renders oldest-first, chat style.
      setRolls((prev) => {
        const updated = [data, ...prev];
        // Keep only last 50 rolls
        return updated.length > 50 ? updated.slice(0, 50) : updated;
      });
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
        clearPendingRoll();
        // Only set cooldown if not already in cooldown (prevent reset)
        if (!isInCooldown.current) {
          isInCooldown.current = true;
          setRateLimitCooldown(20); // 20 seconds cooldown
        }
      } else {
        setError(data.message);
        clearPendingRoll();
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
      } else {
        setError('Could not evaluate expression locally');
      }
      clearPendingRoll();
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

    // The roll is fire-and-forget, so nothing but a reply ends this state. If
    // the connection drops in between, release the button rather than leaving
    // it disabled until the user works out that a reload is the only way on.
    if (rollTimeoutRef.current !== null) clearTimeout(rollTimeoutRef.current);
    rollTimeoutRef.current = window.setTimeout(() => {
      rollTimeoutRef.current = null;
      setIsRolling(false);
      setError("That roll didn't come back — check your connection and try again.");
    }, ROLL_TIMEOUT_MS);

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

  /**
   * The rolls actually drawn: what this viewer is entitled to, minus anything
   * their own "show secret rolls" preference hides.
   */
  const shownRolls = visibleRolls(rolls, user?.id, userRole === 'DM', showSecretRolls);

  /** Any secret roll this viewer could see — decides whether to offer the toggle. */
  const hasSecretRolls = rolls.some(
    (roll) => roll.secret && mayDisplayRoll(roll, user?.id, userRole === 'DM')
  );

  /**
   * Follow new rolls to the bottom, unless the reader has scrolled up to look
   * at something. Scrolls the container rather than using scrollIntoView, which
   * would drag the whole sidebar with it — same reason the chat panel does.
   */
  useEffect(() => {
    const container = rollsContainerRef.current;
    if (!container || !wasAtBottomRef.current) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [shownRolls.length]);

  const handleRollsScroll = () => {
    const container = rollsContainerRef.current;
    if (!container) return;
    wasAtBottomRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < 50;
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
            <Dices className="w-4 h-4 text-brand-ink dark:text-brand-ink" />
            <h2 className="text-base font-semibold text-ink">
              Dice Roller
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
          {/* Only worth offering once there is a secret roll to hide. Purely a
              view preference over rolls this person may already see. */}
          {hasSecretRolls && (
            <button
              onClick={() => setShowSecretRolls((show) => !show)}
              aria-pressed={showSecretRolls}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-all ${
                showSecretRolls
                  ? 'border-ink-muted/30 bg-paper/50 text-ink hover:bg-paper/70'
                  : 'border-warm-amber/40 bg-warm-amber/10 text-warm-amber'
              }`}
              title={
                showSecretRolls
                  ? 'Hide secret rolls in this list (only affects your view)'
                  : 'Show secret rolls in this list (only affects your view)'
              }
            >
              {showSecretRolls ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span>Secret</span>
            </button>
          )}
          {/* DM Only: Clear History Button */}
          {userRole === 'DM' && rolls.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-danger/30 bg-danger/10 dark:bg-danger/20 text-danger-ink dark:text-danger-ink hover:bg-danger/15 dark:hover:bg-danger/30 transition-all"
              title="Clear all roll history"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
          </div>
        </div>
      </div>

      {/* Roll list — a running log, oldest first, like the chat beside it */}
      <div
        ref={rollsContainerRef}
        onScroll={handleRollsScroll}
        className="flex-1 overflow-y-auto p-3 min-h-0"
      >
        {rolls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Dices className="w-10 h-10 text-ink-muted/40 mb-2" />
            <p className="text-ink-secondary text-xs">
              No rolls yet. Roll some dice to get started!
            </p>
          </div>
        ) : (
          // Oldest at the top, newest at the bottom, like the chat panel beside
          // it. `shownRolls` is newest-first in state, so this reverses a copy
          // rather than mutating it.
          <div className="space-y-2">
            {[...shownRolls].reverse().map((roll) => (
              <DiceResult
                key={rollKey(roll)}
                roll={roll}
                isCurrentUser={user?.id === roll.userId}
                rollerIsDM={dmUserIds.has(roll.userId)}
              />
            ))}
            {shownRolls.length === 0 && (
              <p className="text-xs text-ink-secondary text-center py-6">
                Secret rolls are hidden. Use the eye button to show them.
              </p>
            )}
            <div ref={rollsEndRef} />
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
              className="mb-2 flex items-center gap-2 text-danger-ink dark:text-danger-ink text-xs"
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
              className="w-3 h-3 rounded border-ink-muted/30 text-brand-ink focus:ring-brand/50 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <label
              htmlFor="secretRoll"
              className="flex items-center gap-1 text-xs text-ink-secondary cursor-pointer"
            >
              <EyeOff className="w-3 h-3" />
              {/* Not "only you": the server sends every secret roll to the DM
                  as well, deliberately, for audit and dispute resolution.
                  Saying otherwise promises a privacy the app does not provide. */}
              <span>Secret Roll (hidden from other players)</span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-1.5">
            <button
              type="submit"
              disabled={isRolling || !expression.trim() || rateLimitCooldown > 0}
              className="
                flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md
                bg-success hover:bg-success text-white font-semibold text-xs shadow-sm
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-success/50
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
          <div className="mt-1.5 text-xs text-danger-ink dark:text-danger-ink text-center font-medium">
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
                  <EyeOff className="w-5 h-5 text-brand-ink" />
                  <h3 className="text-lg font-semibold text-ink">
                    Secret Roll
                  </h3>
                </div>
                <p className="text-xs text-ink-muted mt-1">
                  Hidden from other players — your DM can still see it
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
