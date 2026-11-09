// ============================================
// Who may draw on a map, who may erase a drawing, and who is sent one.
//
// DUPLICATED FILE — these two copies must stay byte-for-byte identical:
//   backend/src/utils/drawingRules.ts
//   frontend/src/utils/drawingRules.ts
// backend/src/utils/__tests__/visionParity.test.ts fails while they differ.
// The server refuses by it; the draw tool offers by it, so a stroke the
// server would refuse is never offered.
//
// The DM draws and erases anything, at any time. A player draws while the
// campaign's Players may draw is on, except while the session is paused or
// has ended, and erases only their own drawings for everyone, at any time.
// A spectator does neither. Everyone who may read a map is sent its drawings for
// everyone; a drawing for the DM alone goes to the DM alone.
// ============================================

/** What the drawing rules read of a campaign. */
export interface DrawingCampaign {
  status: string;
  playersMayDraw: boolean;
}

/**
 * Whether a session in this state lets players act on the map: not while it
 * is paused or has ended. Moving a token and drawing both ask it.
 */
export function sessionLetsPlayersAct(status: string): boolean {
  return status !== 'PAUSED' && status !== 'INACTIVE';
}

export const DRAW_SPECTATOR_REFUSAL = 'Spectators cannot draw on the map';
export const DRAW_SETTING_REFUSAL = 'The DM has turned off drawing for players';
export const DRAW_PAUSED_REFUSAL = 'Players cannot draw while the session is paused or ended';
export const DRAW_REFUSAL = 'Drawing is not allowed for you right now';
export const DRAW_LAYER_REFUSAL = 'Only the DM can draw on the ground layer';
export const ERASE_SPECTATOR_REFUSAL = 'Spectators cannot erase drawings';
export const ERASE_OTHERS_REFUSAL = 'You can erase only your own drawings';

/**
 * May this member draw on the map now: add a drawing, or send a preview of
 * one or the laser pointer. The DM always; a player while the campaign lets
 * players draw and the session lets them act; nobody else.
 */
export function canDraw(role: string | undefined, campaign: DrawingCampaign): boolean {
  if (role === 'DM') return true;
  return role === 'PLAYER' && campaign.playersMayDraw && sessionLetsPlayersAct(campaign.status);
}

/** Why canDraw says no, in the words the member is shown. */
export function drawRefusal(role: string | undefined, campaign: DrawingCampaign): string {
  if (role !== 'DM' && role !== 'PLAYER') return DRAW_SPECTATOR_REFUSAL;
  if (role === 'PLAYER' && !campaign.playersMayDraw) return DRAW_SETTING_REFUSAL;
  if (role === 'PLAYER' && !sessionLetsPlayersAct(campaign.status)) return DRAW_PAUSED_REFUSAL;
  return DRAW_REFUSAL;
}

/** May this member draw on this layer: the DM on any, anyone else on the markup layer alone. */
export function canDrawOnLayer(role: string | undefined, layer: string): boolean {
  return role === 'DM' || layer === 'MARKUP';
}

/**
 * May this member erase this drawing. The DM any; a player their own that
 * are for everyone; a spectator none, their own from before a demotion
 * included. A drawing for the DM alone goes with the DM's seat, so one who
 * has left the seat may not erase those they wrote in it, as they are no
 * longer sent them. A drawing whose author's account is gone is the DM's
 * to erase. Erasing asks nothing of the session or the setting: taking
 * back one's own drawing cannot hurt the table.
 */
export function canEraseDrawing(
  role: string | undefined,
  userId: string | undefined,
  drawing: { authorId: string | null; audience: string }
): boolean {
  if (role === 'DM') return true;
  return role === 'PLAYER' && !!userId && drawing.authorId === userId && drawing.audience === 'ALL';
}

/** Why canEraseDrawing says no, in the words the member is shown. */
export function eraseRefusal(role: string | undefined): string {
  return role === 'PLAYER' ? ERASE_OTHERS_REFUSAL : ERASE_SPECTATOR_REFUSAL;
}

/** Whether a member of this role is sent this drawing: the DM every one, anyone else those for everyone. */
export function drawingSentTo(role: string | undefined, drawing: { audience: string }): boolean {
  return role === 'DM' || drawing.audience === 'ALL';
}
