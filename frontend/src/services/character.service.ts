// ============================================
// Character Service
// API calls for character management
// ============================================

import api from './api';
import { downloadCharacterJSON } from '@/utils/character-export';
import type {
  Character,
  CreateCharacterRequest,
  UpdateCharacterRequest,
} from '@/types';

// Re-export for convenience
export type { Character } from '@/types';

// ============================================
// Character Service
// ============================================

class CharacterService {
  /**
   * Get all characters owned by the current user
   */
  async getCharacters(): Promise<Character[]> {
    const response = await api.listCharacters();
    return response.characters;
  }

  /**
   * Get a single character by ID
   */
  async getCharacter(id: string): Promise<Character> {
    const response = await api.getCharacter(id);
    return response.character;
  }

  /**
   * Create a new character
   */
  async createCharacter(data: CreateCharacterRequest): Promise<Character> {
    const response = await api.createCharacter(data);
    return response.character;
  }

  /**
   * Update an existing character
   */
  async updateCharacter(id: string, data: UpdateCharacterRequest): Promise<Character> {
    const response = await api.updateCharacter(id, data);
    return response.character;
  }

  /**
   * Delete a character (validates campaign assignment)
   */
  async deleteCharacter(id: string): Promise<void> {
    await api.deleteCharacter(id);
  }

  /**
   * Assign a character to a campaign
   */
  async assignCharacter(id: string, campaignId: string): Promise<Character> {
    const response = await api.assignCharacterToCampaign(id, campaignId);
    return response.character;
  }

  /**
   * Unassign a character from a campaign
   */
  async unassignCharacter(id: string): Promise<Character> {
    const response = await api.assignCharacterToCampaign(id, null);
    return response.character;
  }

  /**
   * Copy/duplicate a character
   */
  async copyCharacter(id: string): Promise<Character> {
    const response = await api.copyCharacter(id);
    return response.character;
  }

  /**
   * Export character as JSON
   */
  exportCharacterJSON(character: Character): void {
    downloadCharacterJSON(character);
  }
}

// Singleton instance
const characterService = new CharacterService();
export default characterService;
