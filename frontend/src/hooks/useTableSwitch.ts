// ============================================
// Moving the table to another map
// ============================================

import { useCallback, useState } from 'react';
import { useCampaign } from '@/contexts/CampaignContext';
import { api } from '@/services/api';
import mapService from '@/services/map.service';
import type { CampaignMap, Token } from '@/types';
import { apiErrorMessage } from '@/utils/errors';

/**
 * The one way this page moves the table to a map: the Map Library's Set
 * Active, and Bring everyone here while the DM prepares a map. Offers the
 * tokens on the table's map to bring along (`pending`, answered with
 * `confirm` or `cancel`), then asks the guards on the map on screen (an
 * editor with unsaved work), now that the switch is certain, makes the map
 * current, and shows it here with its tokens, which ends preparing.
 */
export function useTableSwitch() {
  const { campaign, currentMap, viewedMap, showTableMap, mayChangeViewedMap } = useCampaign();
  const [pending, setPending] = useState<CampaignMap | null>(null);
  const [tableTokens, setTableTokens] = useState<Token[]>([]);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campaignId = campaign?.id;
  const tableMapId = currentMap?.id ?? null;
  const viewedMapId = viewedMap?.id ?? null;

  const perform = useCallback(async (targetMap: CampaignMap, tokenIdsToTransfer: string[]) => {
    if (!campaignId) return;
    const kind = targetMap.id === viewedMapId ? 'bring-everyone' : 'set-active';
    if (!(await mayChangeViewedMap({ kind, toMapId: targetMap.id }))) return;
    setSwitching(true);
    setError(null);
    try {
      // 1. Transfer selected tokens to the new map, all in one request: the
      // server moves them as they are, under a lock on both maps, so none
      // is lost or doubled however many go at once.
      if (tokenIdsToTransfer.length > 0 && tableMapId) {
        await api.moveTokens(campaignId, tableMapId, tokenIdsToTransfer, targetMap.id);
      }
      // 2. Set target map as current. The server sends every page the new
      // map when it is set current.
      await mapService.setCurrentMap(campaignId, targetMap.id);
      // 3. Fetch full map (with filtered tokens), and show it here.
      const fullMap = await mapService.getMap(campaignId, targetMap.id);
      showTableMap(fullMap);
      setTableTokens([]);
    } catch (err: unknown) {
      setError(apiErrorMessage(err) || 'Failed to switch map. Please try again.');
    } finally {
      setSwitching(false);
    }
  }, [campaignId, tableMapId, viewedMapId, showTableMap, mayChangeViewedMap]);

  const requestSwitch = useCallback(async (map: CampaignMap) => {
    if (!campaignId || map.id === campaign?.currentMapId) return;
    setError(null);
    if (!tableMapId) {
      await perform(map, []);
      return;
    }
    // Fetch full current map to get actual tokens (context tokens may be empty
    // because they come from the lightweight campaign maps list, and while
    // preparing they are another map's)
    setSwitching(true);
    try {
      const fullCurrentMap = await mapService.getMap(campaignId, tableMapId);
      const actualTokens = fullCurrentMap.tokens || [];
      setTableTokens(actualTokens);
      setSwitching(false);
      if (actualTokens.length > 0) setPending(map);
      else await perform(map, []);
    } catch (err: unknown) {
      // Without the tokens there is nothing to offer to bring along, and
      // switching anyway could leave the party behind unasked.
      setSwitching(false);
      setTableTokens([]);
      setError(apiErrorMessage(err) || 'Could not read the tokens on this map, so the switch was stopped. Try again.');
    }
  }, [campaignId, campaign?.currentMapId, tableMapId, perform]);

  const confirm = useCallback(async (tokenIds: string[]) => {
    if (!pending) return;
    await perform(pending, tokenIds);
    setPending(null);
  }, [pending, perform]);

  const cancel = useCallback(() => {
    setPending(null);
    setTableTokens([]);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { requestSwitch, pending, tableTokens, confirm, cancel, switching, error, clearError };
}
