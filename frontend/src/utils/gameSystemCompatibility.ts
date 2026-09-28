// ============================================
// Which characters may join which campaigns
//
// A character joins a campaign of its own game system: a character with a
// system only a campaign with the same one, and a Flexible character (no
// system) only a Flexible campaign. The server applies it when a character
// is assigned to a campaign and when an invitation is accepted with
// characters; the browser uses it to decide which it offers.
//
// This file is byte-identical in backend/src/utils and frontend/src/utils; a
// backend test fails if the two copies drift.
// ============================================

/** Whether a character of one game system may join a campaign of another. */
export function systemsCompatible(characterSystem: string | null | undefined, campaignSystem: string | null | undefined): boolean {
  if (!characterSystem || !campaignSystem) return !characterSystem && !campaignSystem;
  return characterSystem === campaignSystem;
}
