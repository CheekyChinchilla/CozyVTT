/**
 * Session Controls
 * Session State Management
 *
 * DM-only panel for starting, pausing, ending, and resuming sessions.
 * Shows session timer and session number.
 * Players see a read-only session status indicator instead.
 */

import { useState, useEffect, useCallback } from 'react';
import { Play, Pause, Square, RotateCcw, Clock, Hash } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import Toast, { useToast } from '@/components/Toast';
import api from '@/services/api';
import { CampaignStatus } from '@/types';
import EndSessionModal from '@/components/campaign/EndSessionModal';
import Button from '@/components/ui/Button';

// ============================================
// Session timer hook
// ============================================

function useSessionTimer(startedAt: string | null): string {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!startedAt) {
      setElapsed('');
      return;
    }

    const update = () => {
      const start = new Date(startedAt).getTime();
      const now = Date.now();
      const diffMs = Math.max(0, now - start);
      const totalSec = Math.floor(diffMs / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      setElapsed(
        h > 0
          ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : `${m}:${String(s).padStart(2, '0')}`,
      );
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return elapsed;
}

// ============================================
// Main Component
// ============================================

export default function SessionControls() {
  const { campaign, userRole, activeSession, setActiveSession, updateCampaignStatus } = useCampaign();
  const { toast, showToast, hideToast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);

  const status = campaign?.status ?? CampaignStatus.PREPARATION;
  const elapsed = useSessionTimer(
    status === CampaignStatus.ACTIVE ? (activeSession?.startedAt ?? null) : null,
  );

  // ============================================
  // Session Actions
  // ============================================

  const handleStart = useCallback(async () => {
    if (!campaign || isLoading) return;
    setIsLoading(true);
    try {
      const result = await api.startSession(campaign.id);
      // REST broadcast handles WebSocket; also update local state immediately for DM
      updateCampaignStatus(CampaignStatus.ACTIVE);
      setActiveSession({
        id: result.session.id,
        sessionNumber: result.session.sessionNumber,
        startedAt: result.session.startedAt,
      });
      showToast(`Session ${result.session.sessionNumber} started!`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to start session', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [campaign, isLoading, updateCampaignStatus, setActiveSession, showToast]);

  const handlePause = useCallback(async () => {
    if (!campaign || !activeSession || isLoading) return;
    setIsLoading(true);
    try {
      await api.pauseSession(campaign.id, activeSession.id);
      updateCampaignStatus(CampaignStatus.PAUSED);
      showToast('Session paused. Game state saved.', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to pause session', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [campaign, activeSession, isLoading, updateCampaignStatus, showToast]);

  const handleResume = useCallback(async () => {
    if (!campaign || isLoading) return;
    setIsLoading(true);
    try {
      const result = await api.resumeSession(campaign.id);
      updateCampaignStatus(CampaignStatus.ACTIVE);
      setActiveSession({
        id: result.session.id,
        sessionNumber: result.session.sessionNumber,
        startedAt: new Date().toISOString(), // Resume resets timer display to now
      });
      showToast(`Session ${result.session.sessionNumber} resumed!`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to resume session', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [campaign, isLoading, updateCampaignStatus, setActiveSession, showToast]);

  // End session goes through the modal
  const handleEndConfirm = useCallback(async (saveState: boolean, notes: string) => {
    if (!campaign || !activeSession || isLoading) return;
    setIsLoading(true);
    try {
      await api.endSession(campaign.id, activeSession.id, saveState, notes || undefined);
      updateCampaignStatus(CampaignStatus.INACTIVE);
      setActiveSession(null);
      setIsEndModalOpen(false);
      showToast(`Session ${activeSession.sessionNumber} ended.${saveState ? ' State saved.' : ''}`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to end session', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [campaign, activeSession, isLoading, updateCampaignStatus, setActiveSession, showToast]);

  // ============================================
  // Render
  // ============================================

  if (userRole !== 'DM') return null;

  const isActive = status === CampaignStatus.ACTIVE;
  const isPaused = status === CampaignStatus.PAUSED;
  const isInactive = status === CampaignStatus.INACTIVE;
  const isPrep = status === CampaignStatus.PREPARATION;

  return (
    <>
      <div className="glass-panel p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-warm-amber" />
            <h3 className="text-sm font-semibold text-brand-ink">Session Controls</h3>
          </div>

          {/* Session number + timer */}
          {activeSession && (
            <div className="flex items-center gap-2 text-xs text-stone-gray">
              <Hash className="w-3 h-3" />
              <span className="font-medium">{activeSession.sessionNumber}</span>
              {isActive && elapsed && (
                <>
                  <span className="text-brand-ink/30">·</span>
                  <span className="font-mono text-brand-ink">{elapsed}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-parchment/60 border border-moss-green/15">
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isActive
                ? 'bg-success animate-pulse'
                : isPaused
                  ? 'bg-warm-amber'
                  : 'bg-stone-gray/40'
            }`}
          />
          <span className="text-sm font-medium text-stone-gray capitalize">
            {isActive ? 'Active' : isPaused ? 'Paused' : isInactive ? 'Inactive' : 'Preparation'}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {/* Start Session — PREPARATION or INACTIVE (new session, no resume) */}
          {(isPrep || isInactive) && (
            <Button
              onClick={handleStart}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              {isLoading ? 'Starting...' : 'Start Session'}
            </Button>
          )}

          {/* Resume Session — PAUSED only (same session, restores saved state) */}
          {isPaused && (
            <Button
              onClick={handleResume}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              {isLoading ? 'Resuming...' : 'Resume Session'}
            </Button>
          )}

          {/* Pause Session — ACTIVE only */}
          {isActive && (
            <Button
              onClick={handlePause}
              disabled={isLoading}
              variant="secondary" className="w-full flex items-center justify-center gap-2"
            >
              <Pause className="w-4 h-4" />
              {isLoading ? 'Pausing...' : 'Pause Session'}
            </Button>
          )}

          {/* End Session — ACTIVE or PAUSED */}
          {(isActive || isPaused) && (
            <button
              onClick={() => setIsEndModalOpen(true)}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-danger/30 text-danger-ink hover:bg-danger/10 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Square className="w-4 h-4" />
              End Session
            </button>
          )}
        </div>

        {/* Paused hint */}
        {isPaused && (
          <p className="text-xs text-warm-gray text-center italic">
            Players are in read-only mode.
          </p>
        )}

        {/* Inactive hint */}
        {isInactive && (
          <p className="text-xs text-warm-gray text-center italic">
            Session ended. Start a new session when ready.
          </p>
        )}
      </div>

      {/* End Session Modal */}
      {isEndModalOpen && activeSession && (
        <EndSessionModal
          session={activeSession}
          onConfirm={handleEndConfirm}
          onClose={() => setIsEndModalOpen(false)}
          isSubmitting={isLoading}
        />
      )}

      <Toast message={toast.message} type={toast.type} show={toast.show} onClose={hideToast} />
    </>
  );
}
