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

import { useQuery, type QueryClient } from '@tanstack/react-query';
import campaignService from '@/services/campaign.service';
import characterService from '@/services/character.service';
import { api } from '@/services/api';
import type { AssetScope, AssetType, Character } from '@/types';

export const queryKeys = {
  campaigns: ['campaigns'] as const,
  characters: ['characters'] as const,
  pendingInvitations: ['invitations', 'pending'] as const,
  assets: (params: AssetListParams) => ['assets', params] as const,
  characterTemplates: (params: CharacterTemplateListParams) =>
    ['character-templates', params] as const,
  serverConfig: ['server-config'] as const,
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

export function useCharactersQuery() {
  return useQuery({
    queryKey: queryKeys.characters,
    queryFn: () => characterService.getCharacters(),
  });
}

/**
 * Put a character the server has just stored into the cached list that the
 * Characters page and the dashboard read, then mark that list for a refetch.
 *
 * A page that saves or creates a character outside the Characters page has to
 * do this. The list is otherwise served from cache when it was fetched less
 * than 30 seconds ago, and a card clicked before a background refetch lands
 * hands its viewer, its export and its editor the old copy. An edit made from
 * that copy is refused as out of date, which reads as the earlier save having
 * been lost. Writing the character first covers that window; the refetch then
 * picks up anything else that changed.
 */
export function storeCharacterInList(client: QueryClient, stored: Character): void {
  client.setQueryData<Character[]>(queryKeys.characters, (list) =>
    list && (list.some((c) => c.id === stored.id)
      ? list.map((c) => (c.id === stored.id ? stored : c))
      : [stored, ...list])
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
