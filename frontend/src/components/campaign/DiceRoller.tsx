import { useState, useEffect, useEffectEvent, useLayoutEffect, useRef, useCallback, useMemo, FormEvent, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dices, Send, AlertCircle, RotateCcw, Trash2, EyeOff, Eye, Plus } from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCampaign } from '@/contexts/CampaignContext';
import { getDiceRolls } from '@/services/dice.service';
import api from '@/services/api';
import { mayDisplayRoll, visibleRolls } from '@/utils/secretRolls';
import type { DiceRolledEvent, DiceRolledSecretEvent, DiceMacro } from '@/types';
import { rollDice as rollExpression, parseDiceExpression, DiceParserError } from '@/utils/dice-parser';
import { CampaignStatus } from '@/types';
import DiceResult from './DiceResult';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import DiceMacroManager from './DiceMacroManager';
import JumpToNewest from './JumpToNewest';
import { errorSummary } from '@/utils/errors';

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

/**
 * A roll worked out in the browser, for a paused table: no server, no
 * database, no DM visibility. It uses the server's own parser (the same
 * file, byte for byte), so it reads every expression as a running table
 * would. Call it with an expression `validateExpression` has passed.
 */
function rollLocally(
  expression: string,
  user: { id: string; displayName: string },
  characterName?: string,
  purpose?: string,
): DiceRolledEvent {
  const breakdown = rollExpression(expression);
  return {
    userId: user.id,
    userName: user.displayName,
    characterName: characterName?.trim() || null,
    expression,
    result: breakdown.total,
    breakdown,
    purpose: purpose?.trim() || null,
    timestamp: new Date().toISOString(),
    secret: false,
  };
}

// Quick roll button configurations with whimsical forest colors
const QUICK_ROLLS = [
  { label: 'd4', expression: '1d4', color: 'bg-warning/15 dark:bg-warning/30 border-warning/50 hover:bg-warning/80 dark:hover:bg-warning/40' },
  { label: 'd6', expression: '1d6', color: 'bg-success/15 dark:bg-success/30 border-success/50 hover:bg-success/80 dark:hover:bg-success/40' },
  { label: 'd8', expression: '1d8', color: 'bg-spirit/15 dark:bg-spirit/30 border-spirit/50 hover:bg-spirit/80 dark:hover:bg-spirit/40' },
  { label: 'd10', expression: '1d10', color: 'bg-warning/15 dark:bg-warning/30 border-warning/50 hover:bg-warning/80 dark:hover:bg-warning/40' },
  { label: 'd12', expression: '1d12', color: 'bg-token-friendly/15 dark:bg-token-friendly/30 border-token-friendly/50 hover:bg-token-friendly/80 dark:hover:bg-token-friendly/40' },
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
  const { socket, joinedEpoch, status } = useWebSocket();
  // Joins after the first; see the history load below.
  const rejoins = Math.max(0, joinedEpoch - 1);
  const { user } = useAuth();
  const { userRole, campaign } = useCampaign();
  const isPaused = campaign?.status === CampaignStatus.PAUSED && userRole !== 'DM';
  // A spectator watches the dice; the server refuses their rolls, and so does this.
  const isSpectator = userRole === 'SPECTATOR';

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
  /** Rolls that arrived live while the history was being read, by key. */
  const liveDuringRead = useRef<Set<string> | null>(null);
  /** A roll arrived below while the reader was scrolled up. */
  const [newBelow, setNewBelow] = useState(false);

  /**
   * End the "Rolling…" state. The roll coming back as `dice.rolled` ends it,
   * and so does the server's answer to the roll, which also comes when the
   * roll was refused or never answered (see `rollDice` in the socket client),
   * so the button cannot stay disabled.
   */
  const clearPendingRoll = useCallback(() => {
    setIsRolling(false);
  }, []);

  // A pending roll cannot be answered while the socket is down.
  useEffect(() => {
    if (status !== 'connected') clearPendingRoll();
  }, [status, clearPendingRoll]);

  // Confirm clear history
  const [confirmClear, setConfirmClear] = useState(false);

  /**
   * Saved rolls, shown as a third row of buttons.
   *
   * Held in the order the server returns them — oldest first — because that is
   * the order of the buttons, and people aim at these without looking. Loaded
   * once when the campaign is known; the dice tab stays mounted, so this does
   * not refetch on tab switches.
   */
  const [macros, setMacros] = useState<DiceMacro[]>([]);
  const [isMacroManagerOpen, setIsMacroManagerOpen] = useState(false);

  // Secret roll popup state
  const [secretRollResult, setSecretRollResult] = useState<DiceRolledEvent | null>(null);
  // The roll list announces new rolls only once the history is in: it
  // arrives as up to 50 rolls at once, which a live region would read out.
  const [historyIn, setHistoryIn] = useState(false);

  // Rate limit state
  const [rateLimitCooldown, setRateLimitCooldown] = useState(0);
  const isInCooldown = useRef(false);

  // ============================================
  // WebSocket Event Handlers
  // ============================================

  /**
   * Load roll history from the server on mount, and again after the page
   * rejoins the campaign: not on the transport's reconnect, which comes
   * before the socket is back in the room, so a roll sent in that gap would
   * be missed by a read made then.
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
    const isRejoin = rejoins > 0;
    liveDuringRead.current = new Set();

    const loadHistory = async () => {
      setHistoryIn(false);
      try {
        const fetched = await getDiceRolls(campaign.id, 50);
        if (cancelled) return;
        const visible = fetched.filter((r) => mayDisplayRoll(r, user?.id, userRole === 'DM'));
        const arrivedLive = liveDuringRead.current ?? new Set<string>();
        liveDuringRead.current = null;

        setRolls((prev) => {
          // Merged, not replaced, on the first load: a roll can land live
          // between mount and this response, and it must not be lost or
          // duplicated. On a rejoin the server's list is the history: a clear
          // made while this page was away reached only the pages online, and
          // merging kept every cleared roll. Kept beside it are the rolls that
          // arrived while it was being read, and rolls made in this browser
          // during a pause, which the server never had.
          const held = isRejoin ? prev.filter((r) => !r.id || arrivedLive.has(rollKey(r))) : prev;
          const seen = new Set(held.map(rollKey));
          const merged = [...held, ...visible.filter((r) => !seen.has(rollKey(r)))];
          merged.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          return merged.slice(0, 50);
        });
      } catch (err) {
        console.error('[DiceRoller] Failed to load roll history:', errorSummary(err));
        // Non-fatal — live rolls still arrive over the socket.
      } finally {
        // A frame later, so the history is drawn before the list goes live.
        requestAnimationFrame(() => { if (!cancelled) setHistoryIn(true); });
      }
    };

    loadHistory();
    return () => { cancelled = true; };
  }, [campaign?.id, userRole, rejoins, user?.id]);

  // Saved rolls for this campaign. Failure is quiet on purpose: macros are a
  // convenience on top of a dice panel that works without them, and an error
  // banner over the roll history would be louder than the problem.
  useEffect(() => {
    if (!campaign?.id) return;
    let cancelled = false;
    api
      .listDiceMacros(campaign.id)
      .then(({ macros: fetched }) => {
        if (!cancelled) setMacros(fetched);
      })
      .catch(() => {
        /* leave the row empty; the manager reports the error when opened */
      });
    return () => {
      cancelled = true;
    };
  }, [campaign?.id]);

  // The role at the moment a roll arrives, which a DM handover can change
  // while the listener below stays bound.
  const viewerIsDm = useEffectEvent(() => userRole === 'DM');

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
      if (!mayDisplayRoll(data, user?.id, viewerIsDm())) return;
      liveDuringRead.current?.add(rollKey(data));

      // Newest first in state; the list renders oldest-first, chat style.
      // A roll already listed (sent twice, or loaded with the history while
      // it was on its way) is not added again.
      setRolls((prev) => (prev.some((r) => rollKey(r) === rollKey(data)) ? prev : [data, ...prev].slice(0, 50)));
    };

    socket.onDiceRolled(handleDiceRolled);

    return () => {
      console.log('[DiceRoller] Cleaning up dice.rolled listener');
      socket.off('dice.rolled', handleDiceRolled);
    };
  }, [socket, user, clearPendingRoll]);

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
      liveDuringRead.current?.add(rollKey(auditRoll));

      setRolls((prev) => (prev.some((r) => rollKey(r) === rollKey(auditRoll)) ? prev : [auditRoll, ...prev].slice(0, 50)));
    };

    socket.onDiceRolledSecret(handleSecretRollAudit);

    return () => {
      console.log('[DiceRoller] Cleaning up dice.rolled.secret listener');
      socket.off('dice.rolled.secret', handleSecretRollAudit);
    };
  }, [socket, userRole]);

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

  /** Why the server would refuse this expression, in its words, or null. */
  const validateExpression = (expr: string): string | null => {
    try {
      parseDiceExpression(expr);
      return null;
    } catch (err) {
      return err instanceof DiceParserError ? `Invalid dice expression: ${err.message}` : 'Invalid dice expression';
    }
  };

  // ============================================
  // Roll Handlers
  // ============================================

  /** `named` is a saved roll's name, sent as the roll's purpose in place of the Purpose box. */
  const rollDice = (expr: string, named?: string) => {
    const rollPurpose = (named ?? purpose).trim();
    if (isSpectator) {
      setError('Spectators watch the dice; they cannot roll.');
      return;
    }
    // When session is paused, roll entirely client-side — no server, no DB, no DM visibility
    if (isPaused) {
      if (!user) return;
      const validationError = validateExpression(expr);
      if (validationError) { setError(validationError); return; }
      setError(null);
      setIsRolling(true);
      const localResult = rollLocally(expr, user, characterName.trim(), rollPurpose);
      setRolls((prev) => [localResult, ...prev]);
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

    console.log('[DiceRoller] Rolling dice:', expr, 'secret:', isSecret);

    // Only the answer to this roll is this panel's to show: it used to take
    // every `error` on the socket as a refused roll, chat and token refusals
    // included.
    void socket
      .rollDice({
        expression: expr.trim(),
        characterName: characterName.trim() || undefined,
        purpose: rollPurpose || undefined,
        secret: isSecret,
      })
      .then((answer) => {
        clearPendingRoll();
        if (answer.ok) return;
        setError(answer.error);
        // The server's flood ceiling: wait it out before rolling again.
        if (answer.error.startsWith('Rate limit exceeded') && !isInCooldown.current) {
          isInCooldown.current = true;
          setRateLimitCooldown(20);
        }
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

  const handleQuickRoll = (expr: string, named?: string) => {
    setExpression(expr);
    rollDice(expr, named);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter while an input method is composing confirms the candidate.
    if (e.nativeEvent.isComposing) return;
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
   * at something; a roll of their own brings them down anyway, as the chat
   * panel does for a message they send. Keyed on the newest roll, not the
   * count: the list keeps 50, so once full its length no longer changes.
   *
   * The jump is instant and made before the browser paints. A smooth scroll
   * passes through positions short of the bottom, and while the oldest roll
   * drops off the top the browser shifts the view to hold the reader's place;
   * either looked like the reader scrolling up, so two rolls arriving together
   * left the list one roll short. Scrolls the container rather than using
   * scrollIntoView, which would drag the whole sidebar with it — same reason
   * the chat panel does.
   */
  const newestRoll = shownRolls[0];
  const newestRollKey = newestRoll ? rollKey(newestRoll) : null;
  const newestIsMine = newestRoll !== undefined && newestRoll.userId === user?.id;
  useLayoutEffect(() => {
    const container = rollsContainerRef.current;
    if (!container || newestRollKey === null) return;
    if (!wasAtBottomRef.current && !newestIsMine) {
      setNewBelow(true);
      return;
    }
    container.scrollTo({ top: container.scrollHeight });
    wasAtBottomRef.current = true;
    setNewBelow(false);
  }, [newestRollKey, newestIsMine]);

  const jumpToNewest = () => {
    rollsContainerRef.current?.scrollTo({ top: rollsContainerRef.current.scrollHeight });
    wasAtBottomRef.current = true;
    setNewBelow(false);
  };

  /**
   * Only scrolling up leaves the bottom, so a position short of it that the
   * reader did not scroll up to (the list growing under them) keeps them there.
   */
  const lastScrollTopRef = useRef(0);
  const handleRollsScroll = () => {
    const container = rollsContainerRef.current;
    if (!container) return;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    if (atBottom) {
      wasAtBottomRef.current = true;
      setNewBelow(false);
    } else if (container.scrollTop < lastScrollTopRef.current) {
      wasAtBottomRef.current = false;
    }
    lastScrollTopRef.current = container.scrollTop;
  };

  const handleClearHistory = () => {
    setConfirmClear(true);
  };

  const handleConfirmClear = () => {
    setConfirmClear(false);
    void socket?.clearDiceHistory().then((answer) => {
      if (!answer.ok) setError(answer.error);
    });
  };

  // ============================================
  // Render
  // ============================================

  return (
    <>
    {campaign?.id && (
      <DiceMacroManager
        isOpen={isMacroManagerOpen}
        onClose={() => setIsMacroManagerOpen(false)}
        campaignId={campaign.id}
        initialExpression={expression}
        onMacrosChanged={setMacros}
      />
    )}

    <ConfirmDialog
      isOpen={confirmClear}
      title="Clear Roll History"
      message="Clear all roll history for everyone? This cannot be undone."
      confirmLabel="Clear History"
      variant="danger"
      onConfirm={handleConfirmClear}
      onCancel={() => setConfirmClear(false)}
    />
    <div className="h-full flex flex-col bg-surface/50 backdrop-blur-xs rounded-lg border border-ink-muted/20 relative">
      {/* Header */}
      <div className="shrink-0 p-3 border-b border-ink-muted/20">
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
                  : 'border-warm-amber/40 bg-warm-amber/10 text-accent-ink'
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
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-danger/30 bg-danger/10 dark:bg-danger/15 text-danger-ink dark:text-danger-ink hover:bg-danger/15 dark:hover:bg-danger/30 transition-all"
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
      <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={rollsContainerRef}
        onScroll={handleRollsScroll}
        role="log"
        aria-live={historyIn ? 'polite' : 'off'}
        aria-label="Dice rolls"
        aria-relevant="additions"
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
                rollerIsDM={roll.userId !== null && dmUserIds.has(roll.userId)}
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
      {newBelow && <JumpToNewest onClick={jumpToNewest} />}
      </div>

      {/* Input Area */}
      <div className="shrink-0 border-t border-ink-muted/20 p-3 bg-surface/80 backdrop-blur-xs">
        {/* Paused notice: rolls still work, but only in this browser */}
        {isPaused && (
          <p className="text-xs text-accent-ink text-center mb-2 italic">
            Session paused: rolls from this tab stay on your own screen.
          </p>
        )}
        {isSpectator && (
          <p className="text-xs text-stone-gray text-center mb-2 italic">
            You are watching this campaign: the dice are the players' to roll.
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
              <AlertCircle className="w-3 h-3 shrink-0" />
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

          {/* Saved rolls — the player's own, in the order they were saved so a
              button does not move when one is edited. The row wraps; the panel
              is a 300px rail at its narrowest and this block never scrolls. */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {macros.map((macro) => (
              <button
                key={macro.id}
                onClick={() => handleQuickRoll(macro.expression, macro.name)}
                disabled={isRolling}
                title={`${macro.name} — ${macro.expression}`}
                className="
                  px-2 py-1 rounded-md border border-spirit-purple/30 text-xs font-medium
                  bg-spirit-purple/10 hover:bg-spirit-purple/20 transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed
                  text-ink max-w-40 truncate
                "
              >
                {macro.name}
              </button>
            ))}
            <button
              onClick={() => setIsMacroManagerOpen(true)}
              title="Saved rolls — add, edit or delete"
              aria-label="Manage saved rolls"
              className="
                px-2 py-1 rounded-md border border-dashed border-ink-muted/40 text-xs
                hover:bg-surface transition-all text-ink-secondary
                flex items-center gap-1
              "
            >
              <Plus className="w-3 h-3" />
              Saved
            </button>
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
              aria-label="Dice expression"
              // Read-only while a roll is on its way: disabled, it threw keyboard
              // focus to the page after every roll.
              readOnly={isRolling}
              aria-disabled={isRolling}
              className="input-cozy px-2 py-1.5 font-mono text-xs read-only:opacity-50 read-only:cursor-not-allowed"
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <input
              id="characterName"
              type="text"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              placeholder="Character"
              aria-label="Character name"
              // The longest name and purpose the server stores with a roll.
              maxLength={200}
              // Read-only while a roll is on its way: disabled, it threw keyboard
              // focus to the page after every roll.
              readOnly={isRolling}
              aria-disabled={isRolling}
              className="input-cozy px-2 py-1.5 text-xs read-only:opacity-50 read-only:cursor-not-allowed"
            />

            <input
              id="purpose"
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Purpose"
              aria-label="Purpose"
              maxLength={300}
              // Read-only while a roll is on its way: disabled, it threw keyboard
              // focus to the page after every roll.
              readOnly={isRolling}
              aria-disabled={isRolling}
              className="input-cozy px-2 py-1.5 text-xs read-only:opacity-50 read-only:cursor-not-allowed"
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
              className="w-3 h-3 rounded-sm border-ink-muted/30 text-brand-ink focus:ring-brand/50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                bg-success/15 hover:bg-success/25 border border-success/30 text-success-ink font-semibold text-xs shadow-xs
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200
                focus:outline-hidden focus:ring-2 focus:ring-success/50
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
                focus:outline-hidden focus:ring-2 focus:ring-brand/50
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

      {/* Secret roll popup: the confirmation that my own secret roll landed */}
      <Modal
        open={secretRollResult !== null}
        onClose={() => setSecretRollResult(null)}
        title="Secret Roll"
        icon={EyeOff}
        size="sm"
        footer={
          <button
            type="button"
            onClick={() => setSecretRollResult(null)}
            className="w-full px-3 py-2 rounded-md bg-brand hover:bg-brand-hover text-brand-text font-semibold text-sm shadow-xs transition-all"
          >
            Close
          </button>
        }
      >
        <p className="text-xs text-ink-muted -mt-4 mb-4">
          Hidden from other players — your DM can still see it
        </p>
        {secretRollResult && (
          <div className="bg-paper rounded-lg p-3 shadow-inner">
            <DiceResult
              roll={secretRollResult}
              isCurrentUser={true}
            />
          </div>
        )}
      </Modal>
    </div>
    </>
  );
}
