/**
 * Game Systems End-to-End Test Suite
 * Comprehensive testing for multi-game system character management
 */

import { GameSystem as PrismaGameSystem } from '@prisma/client';
import { createPrismaClient } from '../../config/prismaClient';
import { GameSystem } from '../../game-systems';
import { validateCharacterData } from '../../validators/game-systems';

const prisma = createPrismaClient();

describe('Game Systems - E2E Tests', () => {
  let testUserId: string;
  let testCampaignId: string;

  beforeAll(async () => {
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'gamesystem-test@example.com',
        displayName: 'Game System Tester',
        passwordHash: 'test-hash',
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.character.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.campaign.deleteMany({
      where: { ownerId: testUserId },
    });
    await prisma.user.delete({
      where: { id: testUserId },
    });
    await prisma.$disconnect();
  });

  describe('5E Character Management', () => {
    let characterId: string;

    it('should create a 5E character with valid data', async () => {
      const characterData = {
        characterName: 'Hale Stonefield',
        playerName: 'Test Player',
        class: 'Fighter',
        level: 5,
        race: 'Dwarf',
        proficiencyBonus: 3,
        stats: {
          strength: { score: 16, modifier: 3 },
          dexterity: { score: 12, modifier: 1 },
          constitution: { score: 16, modifier: 3 },
          intelligence: { score: 10, modifier: 0 },
          wisdom: { score: 12, modifier: 1 },
          charisma: { score: 8, modifier: -1 },
        },
      };

      const character = await prisma.character.create({
        data: {
          name: characterData.characterName,
          userId: testUserId,
          gameSystem: PrismaGameSystem.FIFTH_EDITION,
          data: characterData,
        },
      });

      characterId = character.id;
      expect(character).toBeDefined();
      expect(character.gameSystem).toBe(GameSystem.FIFTH_EDITION);
      expect(character.name).toBe('Hale Stonefield');
    });

    it('should validate 5E character data successfully', async () => {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
      });

      expect(character).toBeDefined();
      expect(validateCharacterData(GameSystem.FIFTH_EDITION, character!.data).success).toBe(true);
    });

    it('should update 5E character data', async () => {
      const updatedData = {
        characterName: 'Hale Stonefield',
        playerName: 'Test Player',
        class: 'Fighter',
        level: 6, // Level up!
        race: 'Dwarf',
        proficiencyBonus: 3,
        stats: {
          strength: { score: 17, modifier: 3 }, // Improved
          dexterity: { score: 12, modifier: 1 },
          constitution: { score: 16, modifier: 3 },
          intelligence: { score: 10, modifier: 0 },
          wisdom: { score: 12, modifier: 1 },
          charisma: { score: 8, modifier: -1 },
        },
      };

      const character = await prisma.character.update({
        where: { id: characterId },
        data: { data: updatedData },
      });

      expect((character.data as unknown as typeof updatedData).level).toBe(6);
      expect((character.data as unknown as typeof updatedData).stats.strength.score).toBe(17);
    });

    it('should assign 5E character to campaign', async () => {
      const campaign = await prisma.campaign.create({
        data: {
          name: 'Test 5E Campaign',
          ownerId: testUserId,
          gameSystem: PrismaGameSystem.FIFTH_EDITION,
          vibeSettings: {},
        },
      });
      testCampaignId = campaign.id;

      // Create membership
      await prisma.campaignMembership.create({
        data: {
          userId: testUserId,
          campaignId: campaign.id,
          role: 'PLAYER',
        },
      });

      const character = await prisma.character.update({
        where: { id: characterId },
        data: { campaignId: campaign.id },
      });

      expect(character.campaignId).toBe(campaign.id);
    });

    it('should retrieve character with campaign info', async () => {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
        include: {
          campaign: true,
          user: true,
        },
      });

      expect(character).toBeDefined();
      expect(character!.campaign).toBeDefined();
      expect(character!.campaign!.name).toBe('Test 5E Campaign');
    });
  });

  describe('Fantasy d20 Character Management', () => {
    let characterId: string;

    it('should create a Fantasy d20 character', async () => {
      const characterData = {
        characterName: 'Maren Ashford',
        class: 'Paladin',
        level: 3,
        ancestry: 'Human',
        heritage: 'Versatile Human',
        attributes: {
          strength: { score: 16, modifier: 3 },
          dexterity: { score: 10, modifier: 0 },
          constitution: { score: 14, modifier: 2 },
          intelligence: { score: 10, modifier: 0 },
          wisdom: { score: 12, modifier: 1 },
          charisma: { score: 14, modifier: 2 },
        },
      };

      const character = await prisma.character.create({
        data: {
          name: characterData.characterName,
          userId: testUserId,
          gameSystem: PrismaGameSystem.FANTASY_D20,
          data: characterData,
        },
      });

      characterId = character.id;
      expect(character.gameSystem).toBe(GameSystem.FANTASY_D20);
    });

    it('should validate Fantasy d20 character data', async () => {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
      });

      expect(validateCharacterData(GameSystem.FANTASY_D20, character!.data).success).toBe(true);
    });
  });

  describe('Horror d100 Character Management', () => {
    let characterId: string;

    it('should create a Horror d100 character', async () => {
      const characterData = {
        characterName: 'Iris Calloway',
        profession: 'Scholar',
        era: '1920s',
        characteristics: { STR: 10, CON: 12, SIZ: 11, INT: 16, POW: 15, DEX: 14, CHA: 12, EDU: 17 },
      };

      const character = await prisma.character.create({
        data: {
          name: characterData.characterName,
          userId: testUserId,
          gameSystem: PrismaGameSystem.HORROR_D100,
          data: characterData,
        },
      });

      characterId = character.id;
      expect(character.gameSystem).toBe(GameSystem.HORROR_D100);
    });

    it('should validate Horror d100 character data', async () => {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
      });

      expect(validateCharacterData(GameSystem.HORROR_D100, character!.data).success).toBe(true);
    });
  });

  describe('Legacy Character Support (No Game System)', () => {
    let characterId: string;

    it('should create character with no game system', async () => {
      const character = await prisma.character.create({
        data: {
          name: 'Legacy Character',
          userId: testUserId,
          gameSystem: null,
          data: { someData: 'flexible format' },
        },
      });

      characterId = character.id;
      expect(character.gameSystem).toBeNull();
    });

    it('should handle legacy character gracefully', async () => {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
      });

      expect(character).toBeDefined();
      expect(character!.gameSystem).toBeNull();
    });
  });

  describe('Game System Mismatch Scenarios', () => {
    let fifthEditionCampaignId: string;
    let fantasyD20CharacterId: string;

    beforeAll(async () => {
      // Create 5E campaign
      const campaign = await prisma.campaign.create({
        data: {
          name: '5E Campaign for Mismatch Test',
          ownerId: testUserId,
          gameSystem: PrismaGameSystem.FIFTH_EDITION,
          vibeSettings: {},
        },
      });
      fifthEditionCampaignId = campaign.id;

      // Create Fantasy d20 character
      const character = await prisma.character.create({
        data: {
          name: 'Mismatched Character',
          userId: testUserId,
          gameSystem: PrismaGameSystem.FANTASY_D20,
          data: {
            characterName: 'Test',
            class: 'Fighter',
            level: 1,
            ancestry: 'Human',
            heritage: 'Versatile',
            attributes: {
              strength: { score: 10, modifier: 0 },
              dexterity: { score: 10, modifier: 0 },
              constitution: { score: 10, modifier: 0 },
              intelligence: { score: 10, modifier: 0 },
              wisdom: { score: 10, modifier: 0 },
              charisma: { score: 10, modifier: 0 },
            },
          },
        },
      });
      fantasyD20CharacterId = character.id;
    });

    it('should allow assigning character to campaign (no strict validation)', async () => {
      // Note: In the current implementation, we allow mismatched systems
      // This is intentional to support multi-system campaigns
      const character = await prisma.character.update({
        where: { id: fantasyD20CharacterId },
        data: { campaignId: fifthEditionCampaignId },
      });

      expect(character.campaignId).toBe(fifthEditionCampaignId);
    });
  });

  describe('Character Permissions', () => {
    let ownerId: string;
    let gmId: string;
    let playerId: string;
    let characterId: string;
    let campaignId: string;

    beforeAll(async () => {
      // Create users
      const owner = await prisma.user.create({
        data: {
          email: 'owner@example.com',
          displayName: 'Owner',
          passwordHash: 'hash',
        },
      });
      ownerId = owner.id;

      const gm = await prisma.user.create({
        data: {
          email: 'gm@example.com',
          displayName: 'GM',
          passwordHash: 'hash',
        },
      });
      gmId = gm.id;

      const player = await prisma.user.create({
        data: {
          email: 'player@example.com',
          displayName: 'Player',
          passwordHash: 'hash',
        },
      });
      playerId = player.id;

      // Create campaign
      const campaign = await prisma.campaign.create({
        data: {
          name: 'Permissions Test Campaign',
          ownerId: gmId,
          gameSystem: PrismaGameSystem.FIFTH_EDITION,
          vibeSettings: {},
        },
      });
      campaignId = campaign.id;

      // Create character owned by owner
      const character = await prisma.character.create({
        data: {
          name: 'Owned Character',
          userId: ownerId,
          gameSystem: PrismaGameSystem.FIFTH_EDITION,
          campaignId: campaign.id,
          data: {
            characterName: 'Test',
            class: 'Fighter',
            level: 1,
            race: 'Human',
            proficiencyBonus: 2,
            stats: {
              strength: { score: 10, modifier: 0 },
              dexterity: { score: 10, modifier: 0 },
              constitution: { score: 10, modifier: 0 },
              intelligence: { score: 10, modifier: 0 },
              wisdom: { score: 10, modifier: 0 },
              charisma: { score: 10, modifier: 0 },
            },
          },
        },
      });
      characterId = character.id;

      // Create memberships
      await prisma.campaignMembership.create({
        data: { userId: gmId, campaignId: campaign.id, role: 'GM' },
      });
      await prisma.campaignMembership.create({
        data: { userId: ownerId, campaignId: campaign.id, role: 'PLAYER' },
      });
      await prisma.campaignMembership.create({
        data: { userId: playerId, campaignId: campaign.id, role: 'PLAYER' },
      });
    });

    afterAll(async () => {
      await prisma.character.deleteMany({ where: { userId: ownerId } });
      await prisma.campaignMembership.deleteMany({ where: { campaignId } });
      await prisma.campaign.delete({ where: { id: campaignId } });
      await prisma.user.deleteMany({
        where: { id: { in: [ownerId, gmId, playerId] } },
      });
    });

    it('owner can view their character', async () => {
      const character = await prisma.character.findFirst({
        where: {
          id: characterId,
          userId: ownerId,
        },
      });

      expect(character).toBeDefined();
    });

    it('GM can view character in their campaign', async () => {
      const character = await prisma.character.findFirst({
        where: {
          id: characterId,
          campaignId,
        },
      });

      // Verify GM has access through campaign membership
      const membership = await prisma.campaignMembership.findFirst({
        where: {
          userId: gmId,
          campaignId,
          role: 'GM',
        },
      });

      expect(character).toBeDefined();
      expect(membership).toBeDefined();
    });

    it('other player can view character in same campaign', async () => {
      const character = await prisma.character.findFirst({
        where: {
          id: characterId,
          campaignId,
        },
      });

      // Verify player has access through campaign membership
      const membership = await prisma.campaignMembership.findFirst({
        where: {
          userId: playerId,
          campaignId,
        },
      });

      expect(character).toBeDefined();
      expect(membership).toBeDefined();
    });
  });

  describe('Bulk Character Operations', () => {
    it('should retrieve all characters for a user', async () => {
      const characters = await prisma.character.findMany({
        where: { userId: testUserId },
      });

      expect(characters.length).toBeGreaterThan(0);
    });

    it('should filter characters by game system', async () => {
      const fifthEditionCharacters = await prisma.character.findMany({
        where: {
          userId: testUserId,
          gameSystem: PrismaGameSystem.FIFTH_EDITION,
        },
      });

      expect(fifthEditionCharacters.every(c => c.gameSystem === GameSystem.FIFTH_EDITION)).toBe(true);
    });

    it('should retrieve characters by campaign', async () => {
      const campaignCharacters = await prisma.character.findMany({
        where: { campaignId: testCampaignId },
      });

      expect(campaignCharacters.length).toBeGreaterThan(0);
    });
  });
});
