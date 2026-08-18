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

import { useQuery } from '@tanstack/react-query';
import campaignService from '@/services/campaign.service';
import characterService from '@/services/character.service';
import { api } from '@/services/api';
import type { AssetScope, AssetType } from '@/types';

export const queryKeys = {
  campaigns: ['campaigns'] as const,
  characters: ['characters'] as const,
  pendingInvitations: ['invitations', 'pending'] as const,
  assets: (params: AssetListParams) => ['assets', params] as const,
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
