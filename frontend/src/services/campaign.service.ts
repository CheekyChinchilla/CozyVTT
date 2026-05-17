// ============================================
// Campaign Service
// API calls for campaign management
// ============================================

import api from './api';
import type {
  Campaign,
  CreateCampaignRequest,
  UpdateCampaignRequest,
} from '@/types';

// Re-export for convenience
export type { Campaign } from '@/types';

// ============================================
// Campaign Service
// ============================================

class CampaignService {
  /**
   * Get all campaigns the user is a member of
   */
  async getCampaigns(): Promise<Campaign[]> {
    const response = await api.listCampaigns();
    return response.campaigns;
  }

  /**
   * Get a single campaign by ID
   */
  async getCampaign(id: string): Promise<Campaign> {
    const response = await api.getCampaign(id);
    return response.campaign;
  }

  /**
   * Create a new campaign (user becomes DM)
   */
  async createCampaign(data: CreateCampaignRequest): Promise<Campaign> {
    const response = await api.createCampaign(data);
    return response.campaign;
  }

  /**
   * Update an existing campaign (DM only)
   */
  async updateCampaign(id: string, data: UpdateCampaignRequest): Promise<Campaign> {
    const response = await api.updateCampaign(id, data);
    return response.campaign;
  }

  /**
   * Delete a campaign (Owner/Admin only)
   */
  async deleteCampaign(id: string): Promise<void> {
    await api.deleteCampaign(id);
  }
}

// Singleton instance
const campaignService = new CampaignService();
export default campaignService;
