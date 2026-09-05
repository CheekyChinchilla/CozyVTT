/**
 * The four proficiency boxes on a D&D 5e sheet: armour, weapons, tools and
 * languages.
 *
 * The sheet stores them twice. `proficiencies` is the structured object the
 * editor's four textareas bind to, and `proficienciesAndLanguages` is every
 * entry from all four flattened into one array, kept because exports and older
 * sheets read it.
 *
 * Flattening loses which box an entry came from, and the read-only view used to
 * guess it back from a hardcoded list of language names. Anything the list did
 * not recognise fell through to weapons — so a player who wrote "Thieves' Cant"
 * or "Druidic" under Languages was shown them under Weapons, and someone whose
 * languages were mostly homebrew saw only the one or two the list happened to
 * know. Two copies of that list existed, in the editor and the view, holding
 * different words.
 *
 * So the structured object wins whenever it is there, and nothing is parsed:
 * whatever the player typed into a box is what that box shows. The guess
 * survives in one place only, for sheets written before the object was stored.
 */

/** The four boxes, each holding whatever the player typed, verbatim. */
export interface ProficiencyGroups {
  armor: string;
  weapons: string;
  tools: string;
  languages: string;
}

const EMPTY: ProficiencyGroups = { armor: '', weapons: '', tools: '', languages: '' };

/**
 * Language names the legacy guess recognises.
 *
 * Deliberately not extended. It exists to interpret sheets saved before the
 * four boxes were stored separately, and adding to it cannot fix the real
 * problem — a player may write any language they like, and no list will hold
 * them all. New sheets never reach it.
 */
const KNOWN_LANGUAGES = [
  'Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc',
  'Abyssal', 'Celestial', 'Draconic', 'Deep Speech', 'Infernal', 'Primordial',
  'Sylvan', 'Undercommon', 'Aquan', 'Auran', 'Ignan', 'Terran',
];

const TOOL_WORDS = [
  'tools', 'kit', 'instrument', 'supplies', 'drum', 'flute', 'lute', 'viol',
  'horn', 'vehicle',
];

/** Narrow an unknown value to an indexable record, or null. */
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Read one box off the structured object, defaulting to empty. */
function box(source: Record<string, unknown>, key: keyof ProficiencyGroups): string {
  const value = source[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Sort a flat list into the four boxes by guessing.
 *
 * Only for sheets stored before the boxes were kept separately. The order of
 * the checks is the order the view has always used, so an old sheet reads
 * exactly as it did.
 */
export function categorizeProficiencyList(items: readonly string[]): ProficiencyGroups {
  const armor: string[] = [];
  const weapons: string[] = [];
  const tools: string[] = [];
  const languages: string[] = [];

  for (const item of items) {
    const lower = item.toLowerCase();
    if (KNOWN_LANGUAGES.some((language) => item.includes(language))) {
      languages.push(item);
    } else if (lower.includes('armor') || lower.includes('shield')) {
      armor.push(item);
    } else if (TOOL_WORDS.some((word) => lower.includes(word))) {
      tools.push(item);
    } else {
      weapons.push(item);
    }
  }

  return {
    armor: armor.join(', '),
    weapons: weapons.join(', '),
    tools: tools.join(', '),
    languages: languages.join(', '),
  };
}

/**
 * The four boxes as the sheet should display and edit them.
 *
 * Takes the whole sheet rather than a field, because which source is right
 * depends on what the sheet happens to carry. A sheet holding the structured
 * object is read from it verbatim; anything older falls back to the guess.
 */
export function readProficiencyGroups(sheet: unknown): ProficiencyGroups {
  const data = record(sheet);
  if (!data) return { ...EMPTY };

  const structured = record(data.proficiencies);
  if (structured) {
    return {
      armor: box(structured, 'armor'),
      weapons: box(structured, 'weapons'),
      tools: box(structured, 'tools'),
      languages: box(structured, 'languages'),
    };
  }

  const flat = data.proficienciesAndLanguages;
  if (Array.isArray(flat)) {
    return categorizeProficiencyList(flat.filter((entry): entry is string => typeof entry === 'string'));
  }

  return { ...EMPTY };
}

/**
 * Flatten the four boxes into the array older readers expect.
 *
 * Splitting on commas here matches how the editor has always turned these
 * textareas into stored entries. It is only for the compatibility array — the
 * boxes themselves keep the player's text untouched.
 */
export function flattenProficiencyGroups(groups: ProficiencyGroups): string[] {
  const split = (value: string) =>
    value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);

  return [
    ...split(groups.armor),
    ...split(groups.weapons),
    ...split(groups.tools),
    ...split(groups.languages),
  ];
}
