// ============================================
// react-query hooks — REST resource layer
//
// Thin wrappers around the EXISTING service functions (axios instance
// and interceptors in services/api.ts are untouched). Adopted
// per-endpoint; pages migrate as they're touched.
//
// BOUNDARY RULE: react-query owns server resources fetched over REST
// (campaign lists, characters, invitations, assets, map metadata).
// Live socket-fed session state (tokens, walls, fog, lights,
// initiative) belongs to the zustand game store. CampaignContext keeps
// campaign-level metadata. Never represent the same datum in two.
//
// Hooks are suffixed with `Query` to avoid colliding with the
// CampaignContext `useCampaign()` hook.
// ============================================

import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import campaignService from '@/services/campaign.service';
import characterService from '@/services/character.service';
import { api } from '@/services/api';
import type { AssetScope, AssetType, Character, CharacterSummary, PersonalNoteSummary } from '@/types';

export const queryKeys = {
  campaigns: ['campaigns'] as const,
  characters: ['characters'] as const,
  pendingInvitations: ['invitations', 'pending'] as const,
  assets: (params: AssetListParams) => ['assets', params] as const,
  characterTemplates: (params: CharacterTemplateListParams) =>
    ['character-templates', params] as const,
  serverConfig: ['server-config'] as const,
  leftCampaigns: ['left-campaigns'] as const,
  leftCampaignNote: (campaignId: string, noteId: string, updatedAt: string) =>
    ['left-campaign-note', campaignId, noteId, updatedAt] as const,
};

/**
 * Server-enforced upload limits. Changes only when the server restarts with new
 * MAX_*_SIZE_MB values, so it is cached for the session; callers fall back to
 * DEFAULT_UPLOAD_LIMITS (utils/uploadLimits.ts) while it loads or if the
 * endpoint is unavailable (e.g. an older backend).
 */
export function useServerConfigQuery() {
  return useQuery({
    queryKey: queryKeys.serverConfig,
    queryFn: () => api.getServerConfig(),
    staleTime: Infinity,
    retry: 1,
  });
}

export function useCampaignsQuery() {
  return useQuery({
    queryKey: queryKeys.campaigns,
    queryFn: () => campaignService.getCampaigns(),
  });
}

/** Campaigns the user has left that still hold their notes or dice macros. */
export function useLeftCampaignsQuery() {
  return useQuery({
    queryKey: queryKeys.leftCampaigns,
    queryFn: async () => (await api.listLeftCampaigns()).campaigns,
  });
}

/**
 * One note, with its text, from a campaign the user has left. Nobody can edit
 * it while they are out of the campaign, and the key carries its last edit, so
 * a fetched note is kept and a Download reuses it. No retry: a refusal for too
 * many requests is shown, and a retry would only add to them.
 */
export function leftCampaignNoteQuery(campaignId: string, note: Pick<PersonalNoteSummary, 'id' | 'updatedAt'>) {
  return queryOptions({
    queryKey: queryKeys.leftCampaignNote(campaignId, note.id, note.updatedAt),
    queryFn: async () => (await api.getLeftCampaignNote(campaignId, note.id)).note,
    staleTime: Infinity,
    retry: false,
  });
}

export function useCharactersQuery() {
  return useQuery({
    queryKey: queryKeys.characters,
    queryFn: () => characterService.getCharacters(),
  });
}

/** A character as the cached list holds it: without its sheet, as the server lists it. */
export function toCharacterSummary(character: Character): CharacterSummary {
  const { data: _sheet, ...summary } = character;
  return summary;
}

/**
 * Put a character the server has just stored into the cached list that the
 * Characters page and the dashboard read, then mark that list for a refetch.
 *
 * A page that saves or creates a character outside the Characters page has to
 * do this. The list is otherwise served from cache when it was fetched less
 * than 30 seconds ago, so a new character would be missing from it and a
 * renamed one would show its old name. Writing the character first covers
 * that window; the refetch then picks up anything else that changed. The list
 * holds no sheets: the Characters page fetches a character's sheet by id each
 * time it opens or exports one.
 */
export function storeCharacterInList(client: QueryClient, stored: Character): void {
  const listed = toCharacterSummary(stored);
  client.setQueryData<CharacterSummary[]>(queryKeys.characters, (list) =>
    list && (list.some((c) => c.id === stored.id)
      ? list.map((c) => (c.id === stored.id ? listed : c))
      : [listed, ...list])
  );
  void client.invalidateQueries({ queryKey: queryKeys.characters });
}

export function usePendingInvitationsQuery() {
  return useQuery({
    queryKey: queryKeys.pendingInvitations,
    queryFn: () => api.getPendingInvitations(),
  });
}

export interface AssetListParams {
  page: number;
  limit: number;
  type?: AssetType;
  scope?: AssetScope;
}

export function useAssetsQuery(params: AssetListParams) {
  return useQuery({
    queryKey: queryKeys.assets(params),
    queryFn: () => api.listAssets(params),
  });
}

export interface CharacterTemplateListParams {
  search?: string;
  /** A GameSystem value, or 'flexible' for the system-agnostic ones. */
  gameSystem?: string;
  mine?: boolean;
}

export function useCharacterTemplatesQuery(params: CharacterTemplateListParams = {}) {
  return useQuery({
    queryKey: queryKeys.characterTemplates(params),
    queryFn: () => api.listCharacterTemplates({ ...params, limit: 100 }),
  });
}
