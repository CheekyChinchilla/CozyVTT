/**
 * Character Sheet Test Page
 * Development-only page for testing CharacterSheetRouter with different game systems.
 * Not registered in the app router — access directly if needed during development.
 */

import { useState } from 'react';
import { CharacterSheetRouter } from '@/components/character-sheets';
import { Character, GameSystem } from '@/types';
import { GAME_SYSTEM_LABELS } from '@/constants/game-systems';

// Mock character data for testing
const createMockCharacter = (
  gameSystem: GameSystem | null,
  name: string
): Character => ({
  id: `test-${gameSystem || 'flexible'}-${Date.now()}`,
  userId: 'test-user-123',
  campaignId: 'test-campaign-456',
  gameSystem,
  name,
  data: {
    // Mock data will vary by system
    level: 5,
    hp: 45,
    maxHp: 45,
    ac: 16,
    notes: 'This is mock character data for testing the router.',
  } as any,
  tokenImageUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// Full D&D 5e character data from Examples/DnD_5e_character.json
const DND_5E_CHARACTER: Character = {
  id: 'test-dnd5e-elara',
  userId: 'test-user-123',
  campaignId: 'test-campaign-456',
  gameSystem: GameSystem.DND_5E,
  name: 'Elara the Wizard',
  tokenImageUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  data: {
    characterName: 'Elara Voss',
    playerName: 'Jane Doe',
    class: 'Wizard',
    level: 5,
    background: 'Sage',
    race: 'High Elf',
    alignment: 'Neutral Good',
    experiencePoints: 6500,
    inspiration: false,
    proficiencyBonus: 3,
    stats: {
      strength: { score: 8, modifier: -1 },
      dexterity: { score: 14, modifier: 2 },
      constitution: { score: 12, modifier: 1 },
      intelligence: { score: 18, modifier: 4 },
      wisdom: { score: 13, modifier: 1 },
      charisma: { score: 10, modifier: 0 },
    },
    savingThrows: {
      strength: { proficient: false, bonus: -1 },
      dexterity: { proficient: false, bonus: 2 },
      constitution: { proficient: false, bonus: 1 },
      intelligence: { proficient: true, bonus: 7 },
      wisdom: { proficient: true, bonus: 4 },
      charisma: { proficient: false, bonus: 0 },
    },
    skills: {
      acrobatics: { proficient: false, expertise: false, bonus: 2 },
      animalHandling: { proficient: false, expertise: false, bonus: 1 },
      arcana: { proficient: true, expertise: false, bonus: 7 },
      athletics: { proficient: false, expertise: false, bonus: -1 },
      deception: { proficient: false, expertise: false, bonus: 0 },
      history: { proficient: true, expertise: false, bonus: 7 },
      insight: { proficient: false, expertise: false, bonus: 1 },
      intimidation: { proficient: false, expertise: false, bonus: 0 },
      investigation: { proficient: true, expertise: false, bonus: 7 },
      medicine: { proficient: false, expertise: false, bonus: 1 },
      nature: { proficient: false, expertise: false, bonus: 4 },
      perception: { proficient: false, expertise: false, bonus: 1 },
      performance: { proficient: false, expertise: false, bonus: 0 },
      persuasion: { proficient: false, expertise: false, bonus: 0 },
      religion: { proficient: true, expertise: false, bonus: 7 },
      sleightOfHand: { proficient: false, expertise: false, bonus: 2 },
      stealth: { proficient: false, expertise: false, bonus: 2 },
      survival: { proficient: false, expertise: false, bonus: 1 },
    },
    passivePerception: 11,
    armorClass: 12,
    initiative: 2,
    speed: 30,
    hp: {
      maximum: 28,
      current: 28,
      temporary: 0,
    },
    conditions: ['poisoned', 'prone'],
    hitDice: [
      {
        class: 'rogue',
        total: '5d8',
        remaining: 5,
      },
      {
        class: 'wizard',
        total: '5d6',
        remaining: 5,
      },
    ],
    deathSaves: {
      successes: 0,
      failures: 0,
    },
    attacks: [
      {
        name: 'Dagger',
        attackBonus: 5,
        damageRoll: '1d4+2',
        damageType: 'piercing',
        range: 5,
        properties: ['versatile', 'finesse'],
        notes: 'single handed weapon',
      },
      {
        name: 'Fire Bolt (Cantrip)',
        attackBonus: 7,
        damageRoll: '2d10',
        damageType: 'fire',
        range: 15,
        properties: ['versatile'],
        notes: 'long range attack',
      },
    ],
    currency: {
      cp: 0,
      sp: 0,
      ep: 0,
      gp: 150,
      pp: 0,
    },
    inventory: [
      {
        name: 'Spellbook',
        quantity: 1,
        weight: 3,
        notes: 'contains all known spells',
        equippable: false,
        equipped: true,
        requiresAttunement: false,
        attuned: false,
        value: 100,
      },
      {
        name: 'Wand of Magic Detection',
        quantity: 1,
        weight: 1,
        notes: 'a magic wand that detects magic within 30 feet',
        equippable: true,
        equipped: true,
        requiresAttunement: true,
        attuned: true,
        value: 500,
      },
      {
        name: 'Robes',
        quantity: 1,
        weight: 4,
        notes: 'dark red robes',
        equippable: false,
        equipped: true,
        requiresAttunement: false,
        attuned: false,
        value: 100,
      },
      {
        name: 'Dagger',
        quantity: 1,
        weight: 1,
        notes: 'a dull dagger',
        equippable: false,
        equipped: true,
        requiresAttunement: false,
        attuned: false,
        value: 100,
      },
      {
        name: 'Arcane Focus (Crystal)',
        quantity: 1,
        weight: 1,
        notes: 'glowing magic crystal, +1 to spell attacks',
        equippable: true,
        equipped: true,
        requiresAttunement: true,
        attuned: true,
        value: 750,
      },
      {
        name: 'Ring of Protection',
        quantity: 1,
        weight: 0,
        notes: '+1 bonus to AC and saving throws (requires attunement)',
        equippable: true,
        equipped: false,
        requiresAttunement: true,
        attuned: false,
        value: 2000,
      },
      {
        name: 'Backpack',
        quantity: 1,
        weight: 5,
        notes: 'a medium sized backpack',
        equippable: false,
        equipped: true,
        requiresAttunement: false,
        attuned: false,
        value: 100,
      },
    ],
    proficienciesAndLanguages: [
      // Armor (from Rogue multiclass)
      'Light Armor',
      // Weapons
      'Daggers',
      'Darts',
      'Slings',
      'Quarterstaffs',
      'Light Crossbows',
      // Tools
      'Calligrapher\'s Supplies',
      'Alchemist\'s Supplies',
      'Thieves\' Tools',
      // Languages
      'Common',
      'Elvish',
      'Draconic',
      'Dwarvish',
    ],
    featuresAndTraits: [
      'Arcane Recovery',
      'Darkvision 60 ft.',
      'Fey Ancestry',
      'Trance',
      'Keen Senses',
      'Elf Weapon Training',
      'Cantrip (High Elf)',
    ],
    spellcasting: {
      class: 'Wizard',
      ability: 'Intelligence',
      spellSaveDC: 15,
      spellAttackBonus: 7,
      cantrips: ['Fire Bolt', 'Mage Hand', 'Prestidigitation', 'Minor Illusion'],
      slots: {
        '1': { total: 4, expended: 1 },
        '2': { total: 3, expended: 0 },
        '3': { total: 2, expended: 1 },
        '4': { total: 1, expended: 0 },
        '5': { total: 0, expended: 0 },
        '6': { total: 0, expended: 0 },
        '7': { total: 0, expended: 0 },
        '8': { total: 0, expended: 0 },
        '9': { total: 0, expended: 0 },
      },
      spells: [
        { level: 1, name: 'Magic Missile', prepared: true, ritual: false, concentration: false },
        { level: 1, name: 'Shield', prepared: true, ritual: false, concentration: true },
        { level: 1, name: 'Mage Armor', prepared: true, ritual: false, concentration: true },
        { level: 1, name: 'Detect Magic', prepared: false, ritual: true, concentration: false },
        { level: 2, name: 'Misty Step', prepared: true, ritual: false, concentration: false },
        { level: 2, name: 'Shatter', prepared: false, ritual: false, concentration: false },
        { level: 3, name: 'Fireball', prepared: true, ritual: false, concentration: false },
        { level: 3, name: 'Counterspell', prepared: true, ritual: false, concentration: false },
      ],
    },
    appearance: {
      age: 128,
      height: '5\'7"',
      weight: '130 lbs',
      eyes: 'Silver',
      skin: 'Pale',
      hair: 'White',
    },
    personality: {
      traits: 'I use polysyllabic words that convey the impression of great erudition.',
      ideals: 'Knowledge. The path to power and self-improvement is through knowledge.',
      bonds: 'I have an ancient tome I must protect at all costs.',
      flaws: 'I overlook obvious solutions in favor of complicated ones.',
    },
    backstory:
      'Elara spent decades studying at the Arcane Academy before being expelled for conducting unsanctioned experiments. She now wanders in search of forbidden knowledge.',
    alliesAndOrganizations: {
      name: 'The Arcane Brotherhood',
      description: 'A secretive guild of wizards sharing rare arcane knowledge.',
    },
    treasure: 'A mysterious encrypted scroll, a silver locket with a portrait inside.',
    additionalFeaturesAndTraits:
      'Elara has developed a sixth sense for magical auras after years of study, often sensing enchantments before identifying them formally.',
  },
};

// Full Call of Cthulhu 7e character data
const COC_7E_CHARACTER: Character = {
  id: 'test-coc7e-eleanor',
  userId: 'test-user-123',
  campaignId: 'test-campaign-456',
  gameSystem: GameSystem.CALL_OF_CTHULHU_7E,
  name: 'Dr. Eleanor Voss',
  tokenImageUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  data: {
    investigatorName: 'Dr. Eleanor Voss',
    playerName: 'Test Player',
    era: '1920s',
    occupation: 'University Professor (Archaeology)',
    age: 42,
    sex: 'Female',
    residence: 'Arkham, Massachusetts',
    birthplace: 'Boston, Massachusetts',
    characteristics: {
      STR: { regular: 50, half: 25, fifth: 10 },
      CON: { regular: 65, half: 33, fifth: 13 },
      SIZ: { regular: 60, half: 30, fifth: 12 },
      DEX: { regular: 70, half: 35, fifth: 14 },
      APP: { regular: 75, half: 38, fifth: 15 },
      INT: { regular: 85, half: 43, fifth: 17 },
      POW: { regular: 70, half: 35, fifth: 14 },
      EDU: { regular: 90, half: 45, fifth: 18 },
    },
    derivedStats: {
      hp: { maximum: 13, current: 13, formula: '(CON+SIZ)/10', majorWoundThreshold: 6 },
      magicPoints: { maximum: 14, current: 14, formula: 'POW/5' },
      sanity: { starting: 70, current: 65, maximum: 99, formula: 'POW*5' },
      luck: { score: 60, notes: '' },
      moveRate: 8,
      build: 0,
      damageBonus: '0',
      dodge: { value: 35, formula: 'DEX/2', improvementChecked: false },
    },
    skills: {
      // Investigation Skills
      accounting: { baseValue: 5, currentValue: 25, improvementChecked: false },
      anthropology: { baseValue: 1, currentValue: 45, improvementChecked: true },
      appraise: { baseValue: 5, currentValue: 30, improvementChecked: false },
      archaeology: { baseValue: 1, currentValue: 75, improvementChecked: true },
      libraryUse: { baseValue: 20, currentValue: 65, improvementChecked: true },
      occult: { baseValue: 5, currentValue: 50, improvementChecked: true },
      spotHidden: { baseValue: 25, currentValue: 55, improvementChecked: true },
      listen: { baseValue: 20, currentValue: 45, improvementChecked: false },
      naturalWorld: { baseValue: 10, currentValue: 35, improvementChecked: false },
      // Social Skills
      charm: { baseValue: 15, currentValue: 60, improvementChecked: true },
      fastTalk: { baseValue: 5, currentValue: 20, improvementChecked: false },
      intimidate: { baseValue: 15, currentValue: 30, improvementChecked: false },
      persuade: { baseValue: 10, currentValue: 55, improvementChecked: true },
      psychology: { baseValue: 10, currentValue: 40, improvementChecked: false },
      // Physical Skills
      climb: { baseValue: 20, currentValue: 35, improvementChecked: false },
      jump: { baseValue: 20, currentValue: 30, improvementChecked: false },
      swim: { baseValue: 20, currentValue: 25, improvementChecked: false },
      throw: { baseValue: 20, currentValue: 30, improvementChecked: false },
      stealth: { baseValue: 20, currentValue: 40, improvementChecked: false },
      // Combat Skills
      dodge: { baseValue: 35, currentValue: 35, improvementChecked: false },
      fighting: {
        brawl: { baseValue: 25, currentValue: 40, improvementChecked: false },
        custom: []
      },
      firearms: {
        handgun: { baseValue: 20, currentValue: 35, improvementChecked: true },
        rifle: { baseValue: 25, currentValue: 30, improvementChecked: false },
        shotgun: { baseValue: 25, currentValue: 25, improvementChecked: false },
        custom: []
      },
      // Technical Skills
      artCraft: { baseValue: 5, currentValue: 15, improvementChecked: false, specialization: null },
      disguise: { baseValue: 5, currentValue: 20, improvementChecked: false },
      driveAuto: { baseValue: 20, currentValue: 40, improvementChecked: false },
      firstAid: { baseValue: 30, currentValue: 45, improvementChecked: false },
      locksmith: { baseValue: 1, currentValue: 10, improvementChecked: false },
      mechanicalRepair: { baseValue: 10, currentValue: 15, improvementChecked: false },
      electricalRepair: { baseValue: 10, currentValue: 15, improvementChecked: false },
      operateHeavyMachinery: { baseValue: 1, currentValue: 5, improvementChecked: false },
      sleightOfHand: { baseValue: 10, currentValue: 15, improvementChecked: false },
      pilot: { baseValue: 1, currentValue: 1, improvementChecked: false, specialization: null },
      // Academic Skills
      history: { baseValue: 5, currentValue: 70, improvementChecked: true },
      languageOwn: { baseValue: 90, currentValue: 90, improvementChecked: false, language: 'English' },
      languageOther: [
        { language: 'Latin', baseValue: 1, currentValue: 50, improvementChecked: true },
        { language: 'Greek', baseValue: 1, currentValue: 40, improvementChecked: true }
      ],
      law: { baseValue: 5, currentValue: 25, improvementChecked: false },
      medicine: { baseValue: 1, currentValue: 20, improvementChecked: false },
      science: [
        { specialization: 'Archaeology', baseValue: 1, currentValue: 35, improvementChecked: false }
      ],
      navigate: { baseValue: 10, currentValue: 10, improvementChecked: false },
      survival: { baseValue: 10, currentValue: 10, improvementChecked: false, specialization: null },
      track: { baseValue: 10, currentValue: 10, improvementChecked: false },
      // Unusual Skills
      creditRating: { baseValue: 0, currentValue: 45, improvementChecked: false },
      cthulhuMythos: { baseValue: 0, currentValue: 1, improvementChecked: false },
      psychoanalysis: { baseValue: 1, currentValue: 1, improvementChecked: false },
      ride: { baseValue: 5, currentValue: 5, improvementChecked: false },
      customSkills: []
    },
    combat: {
      weapons: [
        {
          name: '.32 Revolver',
          skill: 'Firearms (Handgun)',
          skillValue: 35,
          damage: '1D8',
          range: '15 yards',
          attacks: 1,
          ammo: 18,
          malfunction: 100,
          notes: '6-round cylinder; spare ammo in pocket'
        },
        {
          name: 'Walking Stick',
          skill: 'Fighting (Brawl)',
          skillValue: 40,
          damage: '1D6',
          range: 'Touch',
          attacks: 1,
          ammo: null,
          malfunction: null,
          notes: 'Elegant mahogany cane'
        },
      ],
    },
    wealth: {
      spendingLevel: 'Average',
      cash: 125,
      assets: 'Small apartment in Arkham, modest book collection valued at $500, university pension fund',
      notes: '',
    },
    possessions: [
      { name: 'Leather journal', notes: 'Field notes from various excavations' },
      { name: 'Camera (Kodak Brownie)', notes: 'For documenting archaeological finds' },
      { name: 'Magnifying glass', notes: 'High-quality brass frame' },
      { name: 'Pocket watch', notes: 'Heirloom from father, engraved with initials' },
      { name: 'Reading glasses', notes: 'Wire-rimmed spectacles' },
      { name: 'Fountain pen', notes: 'Parker Duofold, black' },
      { name: 'Flashlight', notes: 'Electric torch with spare batteries' },
      { name: 'Excavation tools set', notes: 'Brushes, trowels, measuring tape' },
      { name: 'Ancient coin collection', notes: 'Roman and Greek specimens' },
    ],
    backstory: {
      description: 'Dr. Eleanor Voss grew up in Boston as the daughter of a museum curator. From an early age, she was fascinated by ancient civilizations and mysterious artifacts. She earned her doctorate from Miskatonic University in Archaeology, specializing in pre-Columbian American cultures. For the past 15 years, she has taught at the university while conducting occasional field research. Her academic career has been distinguished, though some colleagues find her theories about ancient migrations to be unconventional.',
      personalDescription: 'Dr. Voss is a woman of 42 with graying auburn hair usually tied back in a practical bun. She has sharp, intelligent gray eyes behind wire-rimmed spectacles. She stands 5\'6" with a slender build. She typically wears practical tweed suits suitable for both the classroom and field work. Her hands show the calluses of someone who has spent time on archaeological digs.',
      ideology: 'Dr. Voss believes in the power of knowledge and rational investigation. She maintains that every mystery has a logical explanation, though recent experiences have begun to test this conviction. She is skeptical of organized religion but respects cultural traditions as historical artifacts.',
      significantPeople: 'Her father, Marcus Voss (deceased), who sparked her love of history; Dr. Henry Armitage, the university librarian who has been both mentor and friend; Professor James Whitmore, a colleague and occasional rival in academic circles; Sarah Chen, a bright graduate student who assists with her research.',
      meaningfulLocations: 'The Miskatonic University Library, where she has spent countless hours in research; The family estate in Boston (now sold) where she grew up surrounded by artifacts; The ruins of Chichen Itza in Mexico, site of her most important field work; Her small office at the university, cluttered with books and curiosities.',
      treasuredPossessions: 'Her father\'s pocket watch, which she carries daily; A jade figurine discovered on her first excavation; Her collection of field journals documenting 15 years of research; A set of antique excavation tools that belonged to her academic idol, Professor Challenger.',
      traits: 'Analytical and methodical in her approach to problems. Can be stubborn when she believes she is right. Genuinely curious about mysteries and puzzles. Sometimes too absorbed in her work to notice social cues. Loyal to friends and students. Has a dry sense of humor that occasionally surfaces.',
      injuriesAndScars: 'Scar on left forearm from a fall during an excavation in 1923. Occasional back pain from years of fieldwork. Reading glasses required for close work.',
      phobiasAndManias: 'Mild claustrophobia stemming from a childhood incident of being locked in a museum storage room. Becomes anxious in completely enclosed spaces without windows. Compulsive about organizing her research notes.',
      arcaneTomesAndSpells: 'Has recently acquired an ancient manuscript of uncertain origin, written in a language she is still attempting to translate. The text contains disturbing imagery and references to entities she cannot identify in any known mythology.',
      encountersWithStrangeEntities: 'During a recent expedition to examine certain Native American burial sites, Dr. Voss experienced vivid nightmares and witnessed strange lights in the forest. She attributes these to exhaustion and natural phenomena, but the experience left her shaken. Her sanity has decreased slightly from these events (from starting 70 to current 65).',
    },
  },
};

const MOCK_CHARACTERS: Character[] = [
  createMockCharacter(null, 'Flexible Character (No System)'),
  DND_5E_CHARACTER,
  createMockCharacter(GameSystem.PATHFINDER_2E, 'Gorim Stonefist (PF2e)'),
  createMockCharacter(GameSystem.SHADOWRUN_6E, 'Neon Jack (SR6)'),
  COC_7E_CHARACTER,
];

export default function CharacterSheetTest() {
  const [selectedCharacter, setSelectedCharacter] = useState<Character>(
    MOCK_CHARACTERS[0]
  );
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const handleSave = async (data: any) => {
    console.log('Character saved:', data);
    // Update the selected character with the new data
    setSelectedCharacter((prev) => ({
      ...prev,
      data: data,
    }));
    alert('Character data saved! Changes will persist in this test session.');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="glass-panel p-6">
          <h1 className="text-3xl font-bold text-moss-green mb-2">
            Character Sheet Router Test
          </h1>
          <p className="text-stone-gray">
            Session 43 - Test page for CharacterSheetRouter with different game
            systems
          </p>
        </div>

        {/* Controls */}
        <div className="glass-panel p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-moss-green mb-2">
              Select Test Character
            </label>
            <select
              value={selectedCharacter.id}
              onChange={(e) => {
                const char = MOCK_CHARACTERS.find((c) => c.id === e.target.value);
                if (char) setSelectedCharacter(char);
              }}
              className="w-full px-4 py-2 border border-moss-green/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-moss-green"
            >
              {MOCK_CHARACTERS.map((char) => (
                <option key={char.id} value={char.id}>
                  {char.name} (
                  {char.gameSystem
                    ? GAME_SYSTEM_LABELS[char.gameSystem]
                    : 'Flexible'}
                  )
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-moss-green mb-2">
              Display Mode
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setMode('view')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  mode === 'view'
                    ? 'bg-moss-green text-white'
                    : 'bg-moss-green/10 text-moss-green hover:bg-moss-green/20'
                }`}
              >
                View Mode
              </button>
              <button
                onClick={() => setMode('edit')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  mode === 'edit'
                    ? 'bg-moss-green text-white'
                    : 'bg-moss-green/10 text-moss-green hover:bg-moss-green/20'
                }`}
              >
                Edit Mode
              </button>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <strong>Testing Notes:</strong> The character sheet router will
              load the appropriate component based on the character's game
              system. D&D 5e sheet (read-only) is complete (Session 44).
              Pathfinder 2e, Shadowrun 6e, and Call of Cthulhu 7e sheets are
              placeholders (Sessions 45-47). The Flexible character sheet is
              fully functional.
            </p>
          </div>
        </div>

        {/* Character Sheet */}
        <CharacterSheetRouter
          character={selectedCharacter}
          mode={mode}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}
