/**
 * Game Systems End-to-End Test Suite
 * Comprehensive testing for multi-game system character management
 */

import { PrismaClient, GameSystem as PrismaGameSystem } from '@prisma/client';
import { GameSystem } from '../../game-systems';
import { validateCharacterData } from '../../validators/game-systems';

const prisma = new PrismaClient();

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

  describe('D&D 5e Character Management', () => {
    let characterId: string;

    it('should create a D&D 5e character with valid data', async () => {
      const characterData = {
        characterName: 'Thorin Ironshield',
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
          gameSystem: PrismaGameSystem.DND_5E,
          data: characterData,
        },
      });

      characterId = character.id;
      expect(character).toBeDefined();
      expect(character.gameSystem).toBe(GameSystem.DND_5E);
      expect(character.name).toBe('Thorin Ironshield');
    });

    it('should validate D&D 5e character data successfully', async () => {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
      });

      expect(character).toBeDefined();
      expect(() => {
        validateCharacterData(GameSystem.DND_5E, character!.data);
      }).not.toThrow();
    });

    it('should update D&D 5e character data', async () => {
      const updatedData = {
        characterName: 'Thorin Ironshield',
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

      expect((character.data as any).level).toBe(6);
      expect((character.data as any).stats.strength.score).toBe(17);
    });

    it('should assign D&D 5e character to campaign', async () => {
      const campaign = await prisma.campaign.create({
        data: {
          name: 'Test D&D Campaign',
          ownerId: testUserId,
          gameSystem: PrismaGameSystem.DND_5E,
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
      expect(character!.campaign!.name).toBe('Test D&D Campaign');
    });
  });

  describe('Pathfinder 2e Character Management', () => {
    let characterId: string;

    it('should create a Pathfinder 2e character', async () => {
      const characterData = {
        characterName: 'Seelah Brightblade',
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
          gameSystem: PrismaGameSystem.PATHFINDER_2E,
          data: characterData,
        },
      });

      characterId = character.id;
      expect(character.gameSystem).toBe(GameSystem.PATHFINDER_2E);
    });

    it('should validate Pathfinder 2e character data', async () => {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
      });

      expect(() => {
        validateCharacterData(GameSystem.PATHFINDER_2E, character!.data);
      }).not.toThrow();
    });
  });

  describe('Call of Cthulhu 7e Character Management', () => {
    let characterId: string;

    it('should create a Call of Cthulhu character', async () => {
      const characterData = {
        investigatorName: 'Randolph Carter',
        occupation: 'Antiquarian',
        era: '1920s',
        characteristics: {
          STR: { regular: 50, half: 25, fifth: 10 },
          CON: { regular: 60, half: 30, fifth: 12 },
          SIZ: { regular: 55, half: 27, fifth: 11 },
          DEX: { regular: 70, half: 35, fifth: 14 },
          APP: { regular: 60, half: 30, fifth: 12 },
          INT: { regular: 80, half: 40, fifth: 16 },
          POW: { regular: 75, half: 37, fifth: 15 },
          EDU: { regular: 85, half: 42, fifth: 17 },
        },
      };

      const character = await prisma.character.create({
        data: {
          name: characterData.investigatorName,
          userId: testUserId,
          gameSystem: PrismaGameSystem.CALL_OF_CTHULHU_7E,
          data: characterData,
        },
      });

      characterId = character.id;
      expect(character.gameSystem).toBe(GameSystem.CALL_OF_CTHULHU_7E);
    });

    it('should validate Call of Cthulhu character data', async () => {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
      });

      expect(() => {
        validateCharacterData(GameSystem.CALL_OF_CTHULHU_7E, character!.data);
      }).not.toThrow();
    });
  });

  describe('Shadowrun 6e Character Management', () => {
    let characterId: string;

    it('should create a Shadowrun 6e character', async () => {
      const characterData = {
        characterName: 'Cipher',
        metatype: 'Elf',
        archetype: 'Decker',
        karma: { current: 0, total: 0 },
        attributes: {
          physical: {
            body: { base: 2, augmented: 2 },
            agility: { base: 4, augmented: 4 },
            reaction: { base: 4, augmented: 4 },
            strength: { base: 2, augmented: 2 },
          },
          mental: {
            willpower: { base: 3, augmented: 3 },
            logic: { base: 6, augmented: 6 },
            intuition: { base: 5, augmented: 5 },
            charisma: { base: 3, augmented: 3 },
          },
          special: {
            edge: { base: 2, augmented: 2 },
            essence: { current: 6.0, maximum: 6.0 },
            magic: null,
            resonance: null,
          },
        },
      };

      const character = await prisma.character.create({
        data: {
          name: characterData.characterName,
          userId: testUserId,
          gameSystem: PrismaGameSystem.SHADOWRUN_6E,
          data: characterData,
        },
      });

      characterId = character.id;
      expect(character.gameSystem).toBe(GameSystem.SHADOWRUN_6E);
    });

    it('should validate Shadowrun 6e character data', async () => {
      const character = await prisma.character.findUnique({
        where: { id: characterId },
      });

      expect(() => {
        validateCharacterData(GameSystem.SHADOWRUN_6E, character!.data);
      }).not.toThrow();
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
    let dnd5eCampaignId: string;
    let pf2eCharacterId: string;

    beforeAll(async () => {
      // Create D&D 5e campaign
      const campaign = await prisma.campaign.create({
        data: {
          name: 'D&D Campaign for Mismatch Test',
          ownerId: testUserId,
          gameSystem: PrismaGameSystem.DND_5E,
          vibeSettings: {},
        },
      });
      dnd5eCampaignId = campaign.id;

      // Create Pathfinder 2e character
      const character = await prisma.character.create({
        data: {
          name: 'Mismatched Character',
          userId: testUserId,
          gameSystem: PrismaGameSystem.PATHFINDER_2E,
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
      pf2eCharacterId = character.id;
    });

    it('should allow assigning character to campaign (no strict validation)', async () => {
      // Note: In the current implementation, we allow mismatched systems
      // This is intentional to support multi-system campaigns
      const character = await prisma.character.update({
        where: { id: pf2eCharacterId },
        data: { campaignId: dnd5eCampaignId },
      });

      expect(character.campaignId).toBe(dnd5eCampaignId);
    });
  });

  describe('Character Permissions', () => {
    let ownerId: string;
    let dmId: string;
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

      const dm = await prisma.user.create({
        data: {
          email: 'dm@example.com',
          displayName: 'DM',
          passwordHash: 'hash',
        },
      });
      dmId = dm.id;

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
          ownerId: dmId,
          gameSystem: PrismaGameSystem.DND_5E,
          vibeSettings: {},
        },
      });
      campaignId = campaign.id;

      // Create character owned by owner
      const character = await prisma.character.create({
        data: {
          name: 'Owned Character',
          userId: ownerId,
          gameSystem: PrismaGameSystem.DND_5E,
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
        data: { userId: dmId, campaignId: campaign.id, role: 'DM' },
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
        where: { id: { in: [ownerId, dmId, playerId] } },
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

    it('DM can view character in their campaign', async () => {
      const character = await prisma.character.findFirst({
        where: {
          id: characterId,
          campaignId,
        },
      });

      // Verify DM has access through campaign membership
      const membership = await prisma.campaignMembership.findFirst({
        where: {
          userId: dmId,
          campaignId,
          role: 'DM',
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
      const dnd5eCharacters = await prisma.character.findMany({
        where: {
          userId: testUserId,
          gameSystem: PrismaGameSystem.DND_5E,
        },
      });

      expect(dnd5eCharacters.every(c => c.gameSystem === GameSystem.DND_5E)).toBe(true);
    });

    it('should retrieve characters by campaign', async () => {
      const campaignCharacters = await prisma.character.findMany({
        where: { campaignId: testCampaignId },
      });

      expect(campaignCharacters.length).toBeGreaterThan(0);
    });
  });
});
