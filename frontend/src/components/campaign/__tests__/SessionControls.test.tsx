/**
 * The DM's session buttons follow the session that is open, and the timer
 * counts from when it started.
 *
 * They followed the campaign's status alone, so a campaign an older version
 * left marked PAUSED or ACTIVE with its session already ended offered only
 * Resume or Pause, which had no session to act on. And Resume restarted the
 * DM's timer from the moment of resuming while everyone else, and the DM
 * after a reload, counted from the session's start.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CampaignStatus } from '@/types';

const resumeSession = vi.fn();
const setActiveSession = vi.fn();
const updateCampaignStatus = vi.fn();
let context: { status: CampaignStatus; activeSession: { id: string; sessionNumber: number; startedAt: string } | null };

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'campaign-1', status: context.status },
    userRole: 'DM',
    activeSession: context.activeSession,
    setActiveSession,
    updateCampaignStatus,
  }),
}));
vi.mock('@/services/api', () => {
  const client = { resumeSession: (...args: unknown[]) => resumeSession(...args) };
  return { api: client, default: client };
});

import SessionControls from '../SessionControls';

const open = { id: 'session-3', sessionNumber: 3, startedAt: '2026-10-18T18:00:00.000Z' };
const button = (name: string) => screen.queryByRole('button', { name: new RegExp(name) });

beforeEach(() => {
  resumeSession.mockReset();
  setActiveSession.mockReset();
  updateCampaignStatus.mockReset();
});

describe('SessionControls', () => {
  it.each([CampaignStatus.PAUSED, CampaignStatus.ACTIVE])('offers Start when the campaign says %s but no session is open', (status) => {
    context = { status, activeSession: null };
    render(<SessionControls />);
    expect(button('Start Session')).not.toBeNull();
    expect(button('Resume Session')).toBeNull();
    expect(button('Pause Session')).toBeNull();
    expect(button('End Session')).toBeNull();
  });

  it('offers Resume and End for a paused session', () => {
    context = { status: CampaignStatus.PAUSED, activeSession: open };
    render(<SessionControls />);
    expect(button('Resume Session')).not.toBeNull();
    expect(button('End Session')).not.toBeNull();
    expect(button('Start Session')).toBeNull();
    expect(button('Pause Session')).toBeNull();
  });

  it('offers Pause and End for an open session the campaign does not call paused', () => {
    context = { status: CampaignStatus.INACTIVE, activeSession: open };
    render(<SessionControls />);
    expect(button('Pause Session')).not.toBeNull();
    expect(button('End Session')).not.toBeNull();
    expect(button('Start Session')).toBeNull();
  });

  it('keeps the session start time on resume', async () => {
    context = { status: CampaignStatus.PAUSED, activeSession: open };
    resumeSession.mockResolvedValue({ message: 'ok', session: open });
    render(<SessionControls />);

    fireEvent.click(button('Resume Session')!);

    await waitFor(() => expect(setActiveSession).toHaveBeenCalledWith(open));
    expect(updateCampaignStatus).toHaveBeenCalledWith(CampaignStatus.ACTIVE);
  });
});
