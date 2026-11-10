import {
  AUTHORING_STAT_BLOCK_LIMITS,
  NpcStatBlockSchema,
  createNpcStatBlockSchema,
} from '../statBlock';
import { CreateCreatureSchema, UpdateCreatureSchema } from '../creatures';
import { issueMessages } from '../issueMessages';
import { STAT_BLOCK_LIMITS } from '../statBlockLimits';

/** A minimal valid stat block — the fields the schema actually requires. */
const baseStatBlock = {
  ac: 12,
  speed: '30 ft.',
  abilities: { str: 10, dex: 14, con: 10, int: 10, wis: 14, cha: 10 },
};

describe('NpcStatBlockSchema', () => {
  it('accepts a minimal stat block', () => {
    expect(NpcStatBlockSchema.safeParse(baseStatBlock).success).toBe(true);
  });

  it('requires ac, speed and abilities', () => {
    expect(NpcStatBlockSchema.safeParse({}).success).toBe(false);
    expect(NpcStatBlockSchema.safeParse({ ...baseStatBlock, ac: undefined }).success).toBe(false);
  });

  describe('save and skill bonuses', () => {
    // The reported bug: a saving throw of +30 was accepted for a commoner and
    // then rolled as 1d20+30, because this record was z.record(z.string(),
    // z.number()) with no bounds at all.
    it('rejects an absurd saving throw', () => {
      const result = NpcStatBlockSchema.safeParse({
        ...baseStatBlock,
        savingThrows: { wis: 300 },
      });
      expect(result.success).toBe(false);
    });

    it('rejects an absurd skill bonus', () => {
      const result = NpcStatBlockSchema.safeParse({
        ...baseStatBlock,
        skills: { perception: 999 },
      });
      expect(result.success).toBe(false);
    });

    it.each([-30, -5, 0, 4, 17, 30])('accepts a plausible bonus of %i', (bonus) => {
      const result = NpcStatBlockSchema.safeParse({
        ...baseStatBlock,
        skills: { perception: bonus },
      });
      expect(result.success).toBe(true);
    });

    // The storage bound has to clear Pathfinder 2e, whose creature-building
    // benchmarks put an extreme skill at +33 by level 15 and higher beyond
    // that. A bound fitted to D&D 5e alone would reject real PF2e creatures.
    it('accepts a high-level Pathfinder 2e modifier', () => {
      const result = NpcStatBlockSchema.safeParse({
        ...baseStatBlock,
        level: 15,
        skills: { Athletics: 33 },
      });
      expect(result.success).toBe(true);
    });

    it('rejects a non-integer bonus', () => {
      const result = NpcStatBlockSchema.safeParse({
        ...baseStatBlock,
        skills: { perception: 4.5 },
      });
      expect(result.success).toBe(false);
    });

    it('rejects an empty key', () => {
      const result = NpcStatBlockSchema.safeParse({
        ...baseStatBlock,
        skills: { '': 4 },
      });
      expect(result.success).toBe(false);
    });

    it('caps the number of entries', () => {
      const skills: Record<string, number> = {};
      for (let i = 0; i < 200; i += 1) skills[`skill${i}`] = 1;

      const result = NpcStatBlockSchema.safeParse({ ...baseStatBlock, skills });
      expect(result.success).toBe(false);
    });

    // Keys stay unconstrained on purpose: the stat block is shared across game
    // systems, so Pathfinder 2e's fortitude/reflex/will must fit alongside
    // D&D 5e's six ability saves.
    it('accepts non-5e save keys', () => {
      const result = NpcStatBlockSchema.safeParse({
        ...baseStatBlock,
        savingThrows: { fortitude: 11, reflex: 7, will: 9 },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('proficiency metadata', () => {
    it('accepts proficiency levels', () => {
      const result = NpcStatBlockSchema.safeParse({
        ...baseStatBlock,
        skills: { perception: 4 },
        proficiencies: {
          saves: { wis: 'proficient' },
          skills: { perception: 'expertise', stealth: 'none', athletics: 'custom' },
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects an unknown proficiency level', () => {
      const result = NpcStatBlockSchema.safeParse({
        ...baseStatBlock,
        proficiencies: { skills: { perception: 'legendary' } },
      });
      expect(result.success).toBe(false);
    });

    it('bounds the proficiency bonus override to the range the rules use', () => {
      expect(
        NpcStatBlockSchema.safeParse({ ...baseStatBlock, proficiencies: { bonusOverride: 4 } })
          .success
      ).toBe(true);
      expect(
        NpcStatBlockSchema.safeParse({ ...baseStatBlock, proficiencies: { bonusOverride: 40 } })
          .success
      ).toBe(false);
    });

    // Backward compatibility: everything stored before this change, including
    // every seeded SRD creature, has totals and no proficiency metadata.
    it('accepts a stat block with totals and no proficiency metadata', () => {
      const result = NpcStatBlockSchema.safeParse({
        ...baseStatBlock,
        savingThrows: { dex: 4 },
        skills: { stealth: 6 },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Pathfinder 2e fields', () => {
    it('accepts printed attribute modifiers and a creature level', () => {
      const result = NpcStatBlockSchema.safeParse({
        ...baseStatBlock,
        level: 5,
        attributeModifiers: { str: 4, dex: 2, con: 3, int: -1, wis: 1, cha: 0 },
        savingThrows: { fortitude: 11, reflex: 7, will: 9 },
      });
      expect(result.success).toBe(true);
    });

    it('allows a negative attribute modifier', () => {
      const result = NpcStatBlockSchema.safeParse({
        ...baseStatBlock,
        attributeModifiers: { str: -2, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
      });
      expect(result.success).toBe(true);
    });

    it('rejects an absurd level', () => {
      expect(NpcStatBlockSchema.safeParse({ ...baseStatBlock, level: 500 }).success).toBe(false);
    });
  });

  // A Call of Cthulhu creature keeps its characteristics in the six score
  // slots and its skills as percentages, so it gets wider bounds than D&D 5e's
  // scores and the shared skill bound. Every other system keeps those.
  describe('Call of Cthulhu bounds', () => {
    const invented = {
      ...baseStatBlock,
      gameSystem: 'CALL_OF_CTHULHU_7E',
      abilities: { str: 60, dex: 45, con: 70, int: 40, wis: 50, cha: 15 },
      skills: { 'Lurk in Mud': 55 },
    };
    const messages = (block: unknown) => {
      const result = NpcStatBlockSchema.safeParse(block);
      return result.success ? '' : issueMessages(result.error);
    };

    it('accepts a characteristic over 30 and a skill over 50', () => {
      expect(messages(invented)).toBe('');
    });

    it('still refuses a D&D 5e score over 30, with the same message', () => {
      const dnd = { ...invented, gameSystem: 'DND_5E', skills: undefined, abilities: { ...baseStatBlock.abilities, str: 31 } };
      expect(messages(dnd)).toBe('abilities.str: Too big: expected number to be <=30');
    });

    it('still refuses a skill over 50 in D&D 5e, in Pathfinder 2e and with no game system', () => {
      for (const gameSystem of ['DND_5E', 'PATHFINDER_2E', undefined]) {
        expect(messages({ ...baseStatBlock, gameSystem, skills: { Athletics: 51 } })).toBe(
          'skills.Athletics: Too big: expected number to be <=50'
        );
      }
    });

    it('still refuses a score over 30 in Pathfinder 2e and with no game system', () => {
      for (const gameSystem of ['PATHFINDER_2E', undefined]) {
        const block = { ...baseStatBlock, gameSystem, abilities: { ...baseStatBlock.abilities, str: 60 } };
        expect(NpcStatBlockSchema.safeParse(block).success).toBe(false);
      }
    });

    it('refuses a characteristic or a skill past the Call of Cthulhu bound', () => {
      const { maxCallOfCthulhuCharacteristic, maxCallOfCthulhuSkill } = STAT_BLOCK_LIMITS;
      const atBound = {
        ...invented,
        abilities: { ...invented.abilities, str: maxCallOfCthulhuCharacteristic },
        skills: { 'Lurk in Mud': maxCallOfCthulhuSkill },
      };
      expect(messages(atBound)).toBe('');
      expect(messages({ ...atBound, abilities: { ...atBound.abilities, str: maxCallOfCthulhuCharacteristic + 1 } })).toBe(
        `abilities.str: Too big: expected number to be <=${maxCallOfCthulhuCharacteristic}`
      );
      expect(messages({ ...atBound, skills: { 'Lurk in Mud': maxCallOfCthulhuSkill + 1 } })).toBe(
        `skills.Lurk in Mud: Too big: expected number to be <=${maxCallOfCthulhuSkill}`
      );
    });

    it('keeps a whole number, and the lowest score, in Call of Cthulhu', () => {
      expect(NpcStatBlockSchema.safeParse({ ...invented, abilities: { ...invented.abilities, str: 60.5 } }).success).toBe(false);
      expect(NpcStatBlockSchema.safeParse({ ...invented, abilities: { ...invented.abilities, str: -1 } }).success).toBe(false);
      expect(NpcStatBlockSchema.safeParse({ ...invented, skills: { 'Lurk in Mud': 55.5 } }).success).toBe(false);
    });

    it('keeps the shared bound on saving throws in Call of Cthulhu', () => {
      expect(NpcStatBlockSchema.safeParse({ ...invented, savingThrows: { wis: 60 } }).success).toBe(false);
    });

    it('trims a skill name as before', () => {
      const result = NpcStatBlockSchema.safeParse({ ...invented, skills: { ' Lurk in Mud ': 55 } });
      expect(result.success && result.data.skills).toEqual({ 'Lurk in Mud': 55 });
    });
  });

  describe('unknown keys', () => {
    // Preserved from both schemas this consolidated: stored stat blocks may
    // carry fields the current type does not know about, and stripping them
    // would quietly discard data on a round trip.
    it('passes unknown top-level keys through', () => {
      const result = NpcStatBlockSchema.safeParse({ ...baseStatBlock, somethingElse: 'kept' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>).somethingElse).toBe('kept');
      }
    });
  });

  describe('per-caller limits', () => {
    const longName = 'x'.repeat(400);

    it('authoring limits reject a 400-character action name', () => {
      const schema = createNpcStatBlockSchema(AUTHORING_STAT_BLOCK_LIMITS);
      const result = schema.safeParse({
        ...baseStatBlock,
        actions: [{ name: longName, description: 'x' }],
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('CreateCreatureSchema', () => {
  const valid = { name: 'Commoner', statBlock: baseStatBlock };

  it('accepts a valid creature', () => {
    expect(CreateCreatureSchema.safeParse(valid).success).toBe(true);
  });

  it('requires a name', () => {
    expect(CreateCreatureSchema.safeParse({ statBlock: baseStatBlock }).success).toBe(false);
    expect(CreateCreatureSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
  });

  it('requires a stat block', () => {
    expect(CreateCreatureSchema.safeParse({ name: 'Commoner' }).success).toBe(false);
  });

  it('trims the name', () => {
    const result = CreateCreatureSchema.safeParse({ ...valid, name: '  Commoner  ' });
    expect(result.success && result.data.name).toBe('Commoner');
  });

  // The whole point of wiring validation into these routes: this used to be
  // stored verbatim because the only check was `typeof statBlock === 'object'`.
  it('rejects a creature carrying an absurd saving throw', () => {
    const result = CreateCreatureSchema.safeParse({
      ...valid,
      statBlock: { ...baseStatBlock, savingThrows: { wis: 30000 } },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a Call of Cthulhu creature with STR 60 and a skill of 55', () => {
    const statBlock = { ...baseStatBlock, gameSystem: 'CALL_OF_CTHULHU_7E', abilities: { ...baseStatBlock.abilities, str: 60 }, skills: { Burrow: 55 } };
    expect(CreateCreatureSchema.safeParse({ ...valid, gameSystem: 'CALL_OF_CTHULHU_7E', statBlock }).success).toBe(true);
  });

  it('rejects an unknown disposition', () => {
    const result = CreateCreatureSchema.safeParse({ ...valid, disposition: 'terrifying' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown game system', () => {
    const result = CreateCreatureSchema.safeParse({ ...valid, gameSystem: 'MADE_UP' });
    expect(result.success).toBe(false);
  });
});

describe('UpdateCreatureSchema', () => {
  it('accepts a partial update', () => {
    expect(UpdateCreatureSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(UpdateCreatureSchema.safeParse({}).success).toBe(false);
  });

  it('validates the stat block when one is supplied', () => {
    const result = UpdateCreatureSchema.safeParse({
      statBlock: { ...baseStatBlock, skills: { perception: 500 } },
    });
    expect(result.success).toBe(false);
  });
});
