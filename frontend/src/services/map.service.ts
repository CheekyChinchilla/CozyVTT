// ============================================
// Map Service
// API calls for map management
// ============================================

import api from './api';
import type { Map, CreateMapRequest, UpdateMapRequest, Token, CreateTokenRequest } from '@/types';

class MapService {
  /**
   * Get all maps for a campaign (lightweight list, no tokens)
   */
  async getMaps(campaignId: string): Promise<Map[]> {
    const response = await api.listMaps(campaignId);
    return response.maps;
  }

  /**
   * Get a single map with full data (tokens, annotations)
   */
  async getMap(campaignId: string, mapId: string): Promise<Map> {
    const response = await api.getMap(campaignId, mapId);
    return response.map;
  }

  /**
   * Create a new map (DM only)
   */
  async createMap(campaignId: string, data: CreateMapRequest): Promise<Map> {
    const response = await api.createMap(campaignId, data);
    return response.map;
  }

  /**
   * Update map properties (DM only)
   */
  async updateMap(campaignId: string, mapId: string, data: UpdateMapRequest): Promise<Map> {
    const response = await api.updateMap(campaignId, mapId, data);
    return response.map;
  }

  /**
   * Import a UVTT/DD2VTT file — creates a map with embedded image and wall data.
   */
  async importUVTT(
    campaignId: string,
    file: File,
    name?: string,
    gridSize?: number,
  ): Promise<{ map: Map; wallCount: number; portalCount: number; totalSegments: number }> {
    return api.importUVTT(campaignId, file, name, gridSize);
  }

  /**
   * Delete a map (DM only) — cannot delete the active/current map
   */
  async deleteMap(campaignId: string, mapId: string): Promise<void> {
    await api.deleteMap(campaignId, mapId);
  }

  /**
   * Set a map as the current/active map for the campaign (DM only)
   */
  async setCurrentMap(campaignId: string, mapId: string): Promise<void> {
    await api.setCurrentMap(campaignId, mapId);
  }

  /**
   * Add a token to a map (DM only)
   */
  async addToken(campaignId: string, mapId: string, data: CreateTokenRequest): Promise<Token> {
    const response = await api.addToken(campaignId, mapId, data);
    return response.token;
  }

  /**
   * Remove a token from a map (DM only)
   */
  async deleteToken(campaignId: string, mapId: string, tokenId: string): Promise<void> {
    await api.deleteToken(campaignId, mapId, tokenId);
  }
}

const mapService = new MapService();
export default mapService;
