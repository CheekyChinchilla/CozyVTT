# CozyVTT — Adding a Game System

This guide explains how to add a new tabletop game system to CozyVTT end to end. It reflects the code as it actually ships — file names, the exact functions you extend, and the reference systems to copy from.

CozyVTT currently ships four systems: **D&D 5e**, **Pathfinder 2e**, **Call of Cthulhu 7e**, and **Shadowrun 6e** (backend-complete; its sheet UI is a placeholder — see [Reference systems](#reference-systems)). Adding a fifth means touching a fixed set of registration points, all of which are plain `switch` statements and enums — no dynamic plugin loader, no config file. If you add your system to every switch the compiler and tests point you at, it works.

---

## Table of Contents

1. [How a game system is wired](#how-a-game-system-is-wired)
2. [Creature and NPC stat blocks](#creature-and-npc-stat-blocks)
3. [Reference systems](#reference-systems)
4. [Naming conventions](#naming-conventions)
5. [Step 1 — Prisma enum + migration](#step-1--prisma-enum--migration)
6. [Step 2 — Backend character type](#step-2--backend-character-type)
7. [Step 3 — Backend type index (`game-systems/index.ts`)](#step-3--backend-type-index-game-systemsindexts)
8. [Step 4 — Zod schema](#step-4--zod-schema)
9. [Step 5 — Validator index (`validators/game-systems/index.ts`)](#step-5--validator-index-validatorsgame-systemsindexts)
10. [Step 6 — Character templates](#step-6--character-templates)
11. [Step 7 — Frontend enum + character type](#step-7--frontend-enum--character-type)
12. [Step 8 — Frontend display metadata](#step-8--frontend-display-metadata)
13. [Step 9 — Character sheet component](#step-9--character-sheet-component)
14. [Step 10 — Register the sheet in the router](#step-10--register-the-sheet-in-the-router)
15. [Step 11 — Creature support (optional)](#step-11--creature-support-optional)
16. [Testing](#testing)
17. [Full checklist](#full-checklist)
18. [Legal / content note](#legal--content-note)

---

## How a game system is wired

A character's data is stored as an unstructured JSON blob on the `Character.data` column. The `Character.gameSystem` column (a Prisma enum) tells the rest of the app how to interpret that blob. Nothing about the JSON is enforced by the database — **the Zod schema is the single enforcement point** and runs on every character create/update.

So a "game system" in CozyVTT is really six coordinated pieces:

| # | Piece | Location |
|---|-------|----------|
| 1 | Enum value | `backend/prisma/schema.prisma` + both `GameSystem` TS enums |
| 2 | Character **type** (the data shape) | `backend/src/game-systems/` + `frontend/src/types/game-systems/` |
| 3 | **Zod schema** (validation on save) | `backend/src/validators/game-systems/` |
| 4 | **Templates** (blank + example starting data) | `backend/src/utils/character-templates/` and a blank factory in the validator index |
| 5 | **Sheet component** (the UI) | `frontend/src/components/character-sheets/{system}/` |
| 6 | **Display metadata + registration** (labels, the creation dropdown, the router) | `frontend/src/constants/game-systems.ts` + `CharacterSheetRouter.tsx` |

Each of pieces 2–4 has a per-system file **and** an `index.ts` with a `switch` you extend. TypeScript will not compile until every switch handles the new enum value, which is your safety net — follow the compiler errors and you can't miss a spot.

### Design principle: almost everything is optional

Players fill out sheets incrementally — someone may save a character with just a name. **Make the vast majority of fields optional in your Zod schema.** Require only what genuinely identifies the character (usually just the name). This is why the existing schemas are permissive; match that.

---

## Creature and NPC stat blocks

**Creatures are a separate pipeline from characters, and the steps below do not
cover them.** A player character is a `Character` row with a per-system JSON blob
validated by a per-system Zod schema. A creature is a `CreatureTemplate` row (or
a `TokenTemplate`, or a token embedded in `Map.tokens`) holding an
**`NpcStatBlock`** — one shared shape used by every system, with system-specific
fields left optional.

That difference is deliberate. Character sheets differ wildly between systems, so
each gets its own type. Monsters mostly need the same handful of things — a
defence number, hit points, some attacks — so they share a shape and branch only
where the rules genuinely diverge.

### The shared shape

`NpcStatBlock` is declared in `frontend/src/types/index.ts` and validated by
`backend/src/validators/statBlock.ts`. There is **no per-system creature type**.

| Field | Meaning |
|---|---|
| `ac`, `hpMax`, `speed`, `senses`, `languages` | Shared by every system |
| `abilities` | Ability **scores** (D&D 5e's model) |
| `attributeModifiers` | Ability **modifiers**, for systems that print modifiers instead |
| `challengeRating` | D&D 5e's creature rating |
| `level` | Creature level, for systems that rate by level instead |
| `savingThrows`, `skills` | `Record<string, number>` of **final totals** — the value that gets rolled |
| `proficiencies` | Optional metadata saying *why* each total is what it is |
| `gameSystem` | Which system this block is written for |

**Totals are the storage format and are not changing.** They are what the roll
picker, the viewer, campaign export and the SRD importer all read. Proficiency
metadata sits *alongside* them, so a stat block written before it existed still
works: absent metadata means "take the totals as given".

### Derived versus printed — the important decision

Whether a creature's save and skill numbers can be *computed* is a per-system
question, and getting it wrong invents numbers the designers never intended.

- **D&D 5e derives.** A monster's proficiency bonus comes from its Challenge
  Rating on the same curve a character's comes from level, and a save or skill is
  ability modifier + proficiency (doubled for expertise). The maths lives in
  `frontend/src/utils/rules/dnd5e.ts` (duplicated at
  `backend/src/utils/rules/dnd5e.ts`; a parity test fails on drift). The editor
  is `npc-stat-blocks/ProficiencyEditor.tsx`.
- **Pathfinder 2e does not derive *creature* stat blocks.** PF2e stat blocks print final modifiers
  because Paizo builds creatures from level benchmark tables, not from
  "level + proficiency rank + attribute". The printed number *is* the rule.
  `npc-stat-blocks/Pf2eProficiencyEditor.tsx` therefore stores what the DM types
  and computes nothing; `pf2eStatBlock.ts` adds only a loose plausibility warning
  to catch typos, explicitly not a rules check.

  **Player characters are different.** A PF2e character sheet records the parts
  — proficiency rank, item bonus, Dex cap, key attribute — so Armor Class, Class
  DC and initiative *are* derivable, and `rules/pathfinder2e.ts` derives them.
  The distinction is where the number comes from: a creature's is printed by
  Paizo, a character's is built from their own sheet.
- **Call of Cthulhu 7e and Shadowrun 6e have no equivalent.** Percentile and
  dice-pool systems have neither ability modifiers nor a proficiency bonus, so
  there is nothing to derive and nothing sensible to offer from this data.

**Where a number is derived, give it a manual bonus alongside.** The 5e sheet
derives initiative, passive Perception, spell save DC and spell attack, and each
carries an "other bonus" box. Deriving without one is a trap: a feat or an item
adjusts the total without changing either input, and the player is then left with
no way to record a character they legitimately have. Spell save DC and spell
attack get **separate** boxes rather than sharing one, because items exist that
raise the attack roll and not the DC.

**Do not let the templates seed a derived number.** They shipped spell save DC 8
and attack +0 — the base with nothing added, which no character can legitimately
have. The formulas live in `rules/dnd5e.ts` alongside the rest of the 5e maths.

**The same pattern extends to skills a player invents.** A 5e sheet can carry
skills of its own beyond the standard eighteen — a tool proficiency, a homebrew
skill — and each records the ability it uses plus proficiency or expertise
rather than a typed total, so the bonus follows the character as their scores
and level change. `dnd5eCustomSkillBonus` in `rules/dnd5e.ts` computes it and it
carries an "other bonus" box for the same reason the others do. If you are
adding a system where players routinely track something the sheet does not
enumerate, this is the shape to copy: store the inputs, derive the total, and
leave one box for what the maths cannot know.

### Initiative — not every system rolls

The same per-system care applies to initiative, and it is the clearest example of
why forcing one shape onto every system produces wrong numbers. The maths lives
in `frontend/src/utils/rules/initiative.ts` (duplicated at
`backend/src/utils/rules/initiative.ts`; the parity test in
`backend/src/utils/rules/__tests__/dnd5e.test.ts` fails on drift).

| System | Rule | Shape |
|---|---|---|
| **D&D 5e** | `d20 +` Dexterity modifier `+ initiativeBonus` | `roll` |
| **Pathfinder 2e** | `d20 +` the stat named by `initiative.usedStat` — Perception by default, or a skill the GM calls for | `roll` |
| **Call of Cthulhu 7e** | **No roll.** Combatants are ranked in DEX order, highest first | `fixed` |
| **Shadowrun 6e** | `derivedStats.initiative.meatspace`: its dice pool plus its base | `roll` |
| Flexible / unknown | Nothing to derive | `null` — caller falls back to `1d20` |

Two consequences worth understanding before changing this code:

- **The return type admits a non-roll** (`{ kind: 'fixed', value }`) precisely
  because Call of Cthulhu has no initiative die. An earlier version returned only
  a dice expression, which forced someone to invent a `1d10 + DEX/5` roll for CoC
  that appears nowhere in the rulebook. If a system does not roll, say so in the
  type rather than fabricating dice.
- **The server resolves it, not the client** — see
  `backend/src/websocket/handlers/initiative.ts`. It is the only side holding the
  character sheet, and a `fixed` result cannot be expressed as a dice expression
  a client could send. Clients may pass an `expression` as a fallback for
  combatants nothing can be derived for. The frontend uses the same module purely
  to *display* what will happen.

D&D 5e's `initiativeBonus` is a single manual field covering everything that is
not Dexterity — the Alert feat, Jack of All Trades, Remarkable Athlete,
subclasses that swap the ability. Those are too open-ended to enumerate, and
inventing a toggle per feature would be the same mistake as inventing CoC's dice.

### Where creature code branches on system

Four places, all plain conditionals:

| Location | What it decides |
|---|---|
| `npc-stat-blocks/StatBlockEditor.tsx` | CR vs Level, scores vs modifiers, which proficiency editor |
| `npc-stat-blocks/StatBlockViewer.tsx` | Which read-only stat block renderer |
| `utils/npcRolls.ts` (`buildNpcRolls`) | What can be rolled — **returns nothing for systems without a model** |
| `campaign/NpcRollPicker.tsx` | Advantage-equivalent labels |

### Adding creature support for a new system

Optional — a system works without it, and its creatures fall back to the generic
viewer and the free-form custom roll input. See
[Step 11](#step-11--creature-support-optional).

> **Returning no roll options is a valid, correct outcome.** Offering a d20 roll
> for a d100 game is worse than offering nothing: the caller already falls back
> to a custom roll input that works for any system.

---

## Reference systems

Copy from a system that's shaped like the one you're adding:

- **Backend (all of steps 2–6): copy Shadowrun 6e.** It's the most recently added system and is fully wired through every backend registration point, while being smaller than D&D 5e — the cleanest end-to-end backend example. Files: `game-systems/shadowrun6e.ts`, `validators/game-systems/shadowrun6e.schema.ts`, `utils/character-templates/shadowrun6e-templates.ts`, plus its entries in all three backend `index.ts` files.
- **Frontend sheet (step 9): copy D&D 5e or Call of Cthulhu 7e.** These are the complete sheet implementations, split into `…CharacterSheet.tsx` (mode switcher) + `…CharacterView.tsx` + `…CharacterEditor.tsx` + a `components/` folder. (Shadowrun 6e's sheet is intentionally a single "not yet implemented" placeholder, so don't copy it for the UI — but it *is* the reference for the minimal single-file sheet shape.)

> **Note on Shadowrun 6e:** it is deliberately **not listed in the character-creation dropdown** — its entry in `GAME_SYSTEM_OPTIONS` (`frontend/src/constants/game-systems.ts`) is commented out because its sheet isn't finished. That commented block is a perfect illustration of [Step 8](#step-8--frontend-display-metadata): a system is only selectable once it's in `GAME_SYSTEM_OPTIONS`.

---

## Naming conventions

The codebase uses a compact per-system id. Pick one and use it **consistently**:

| Thing | Convention | Examples |
|-------|-----------|----------|
| Prisma / TS enum value | `SCREAMING_SNAKE` | `DND_5E`, `SHADOWRUN_6E` |
| Backend file stem | camelCase | `dnd5e.ts`, `shadowrun6e.ts`, `callOfCthulhu7e.ts` |
| Character-data type | `PascalCase…CharacterData` | `DnD5eCharacterData`, `SR6CharacterData` |
| Zod schema const | `camelCase…CharacterDataSchema` | `shadowrun6eCharacterDataSchema` |
| Frontend sheet folder | matches the file stem | `dnd5e/`, `shadowrun6e/`, `call-of-cthulhu-7e/` |

> Folder naming is slightly inconsistent today (`call-of-cthulhu-7e` is kebab-case while the others are run-together). Don't sweat matching that historical quirk — just keep your own system's id consistent across every file, and make the frontend folder name match the path you import in the router.

This guide uses a running example system with id **`mySystem`** and enum value **`MY_SYSTEM`**.

---

## Step 1 — Prisma enum + migration

Add the value to `backend/prisma/schema.prisma`:

```prisma
enum GameSystem {
  DND_5E
  PATHFINDER_2E
  SHADOWRUN_6E
  CALL_OF_CTHULHU_7E
  MY_SYSTEM          // ← add
}
```

Then create and apply the migration:

```bash
cd backend
npx prisma migrate dev --name add_my_system
```

This regenerates the Prisma client so `@prisma/client`'s `GameSystem` enum (used by the template layer) includes your value.

---

## Step 2 — Backend character type

Create `backend/src/game-systems/mySystem.ts` describing the data shape. Keep required fields minimal; everything else optional.

```typescript
// backend/src/game-systems/mySystem.ts

export interface MySystemCharacterData {
  // Identity — the only genuinely required field
  characterName: string;
  playerName?: string;

  // Core stats (optional — filled in over time)
  stats?: {
    strength?: number;
    dexterity?: number;
    // …
  };

  hp?: { current?: number; maximum?: number; temporary?: number };

  skills?: MySystemSkill[];
  inventory?: MySystemItem[];
  notes?: string;
}

export interface MySystemSkill {
  name: string;
  value?: number;
  proficient?: boolean;
}

export interface MySystemItem {
  name: string;
  quantity?: number;
  description?: string;
}
```

---

## Step 3 — Backend type index (`game-systems/index.ts`)

Open `backend/src/game-systems/index.ts` and make **five** edits (the TS enum lives here too):

```typescript
// 1. Re-export your module
export * from './mySystem';

// 2. Import the type (near the other data-type imports)
import { MySystemCharacterData } from './mySystem';

// 3. Add the enum value (must match Prisma + the frontend enum)
export enum GameSystem {
  DND_5E = 'DND_5E',
  PATHFINDER_2E = 'PATHFINDER_2E',
  SHADOWRUN_6E = 'SHADOWRUN_6E',
  CALL_OF_CTHULHU_7E = 'CALL_OF_CTHULHU_7E',
  MY_SYSTEM = 'MY_SYSTEM',          // ← add
}

// 4. Add to the mapped type and the union
export type CharacterDataBySystem = {
  // …existing…
  [GameSystem.MY_SYSTEM]: MySystemCharacterData;   // ← add
};

export type GameSystemCharacterData =
  | DnD5eCharacterData
  | PF2eCharacterData
  | SR6CharacterData
  | CoC7eCharacterData
  | MySystemCharacterData;                          // ← add

// 5. Add a structural type guard, then a case in BOTH switches below it
export function isMySystemData(
  data: unknown,
  gameSystem?: string
): data is MySystemCharacterData {
  if (gameSystem && gameSystem !== GameSystem.MY_SYSTEM) return false;
  const c = data as MySystemCharacterData;
  return (
    typeof c === 'object' &&
    c !== null &&
    'characterName' in c
    // …add a couple more distinctive keys so the guard is meaningful…
  );
}
```

Then add a `case` to **`getTypedCharacterData`** and to the structural **`validateCharacterData`** (the boolean one in this file — distinct from the Zod one in Step 5):

```typescript
case GameSystem.MY_SYSTEM:
  return isMySystemData(data) ? (data as CharacterDataBySystem[T]) : null;   // getTypedCharacterData
// …
case GameSystem.MY_SYSTEM:
  return isMySystemData(data, gameSystem);                                    // validateCharacterData
```

---

## Step 4 — Zod schema

Create `backend/src/validators/game-systems/mySystem.schema.ts`. This is the **real enforcement point** — it runs on every save.

```typescript
// backend/src/validators/game-systems/mySystem.schema.ts
import { z } from 'zod';

const mySystemSkillSchema = z.object({
  name: z.string().min(1),
  value: z.number().min(0).max(100).optional(),
  proficient: z.boolean().optional(),
});

export const mySystemCharacterDataSchema = z.object({
  characterName: z.string().min(1).max(100),
  playerName: z.string().max(100).optional(),

  stats: z.object({
    strength: z.number().int().optional(),
    dexterity: z.number().int().optional(),
  }).optional(),

  hp: z.object({
    current: z.number().int().optional(),
    maximum: z.number().int().min(0).optional(),
    temporary: z.number().int().min(0).optional(),
  }).optional(),

  skills: z.array(mySystemSkillSchema).optional(),
  notes: z.string().max(5000).optional(),
});

export type MySystemCharacterData = z.infer<typeof mySystemCharacterDataSchema>;
```

> Match the permissiveness of the existing schemas. Look at `shadowrun6e.schema.ts` before finalizing — the shipped schemas are intentionally lenient so partial and in-progress sheets save cleanly.

---

## Step 5 — Validator index (`validators/game-systems/index.ts`)

Two additions here. First, wire the schema into the Zod `validateCharacterData`:

```typescript
import { mySystemCharacterDataSchema, type MySystemCharacterData } from './mySystem.schema';

// re-export it alongside the others
export { /* …, */ mySystemCharacterDataSchema };
export type { /* …, */ MySystemCharacterData };

// add a case to validateCharacterData()
case GameSystem.MY_SYSTEM: {
  const validated = mySystemCharacterDataSchema.parse(data);
  return { success: true, data: validated };
}
```

Second, provide a **blank-character factory** and wire it into `getBlankCharacterTemplate`. This returns the minimal valid data object used to seed a brand-new character:

```typescript
case GameSystem.MY_SYSTEM:
  return createBlankMySystemCharacter();

// …lower in the file, next to the other createBlank* functions:
function createBlankMySystemCharacter(): MySystemCharacterData {
  return {
    characterName: 'New Character',
    // …minimal valid defaults…
  };
}
```

---

## Step 6 — Character templates

> **Two different things are called "templates".** This step is about the
> **hardcoded starter presets** compiled into the backend and served by
> `GET /api/characters/templates/:system/:name`. Separately, users publish
> **character templates** stored in the database (`CharacterTemplate`,
> `/api/character-templates`), browsable from the dashboard.
>
> Your system gets the user-published kind for free — that feature stores the
> same `data` blob a character does and edits it through `CharacterSheetRouter`,
> so once Steps 7–10 are done it works with no extra wiring. The one thing it
> needs from you is the blank factory in Step 5: publishing a template starts
> from `GET /api/characters/templates/<system>/blank`, so a system whose blank
> is missing or invalid cannot have templates created for it.

> **A template may only write fields the schema declares.** Every one of the
> original four had drifted: they seeded fields no reader knew about, so the
> data was stored and never shown. A D&D 5e Fighter's Features tab was blank
> while "Second Wind" sat in the character's own row. This survives because
> `PUT /api/characters/:id` stores the body as sent rather than Zod's parsed
> output, so an undeclared field is saved rather than rejected — validating a
> template proves it is acceptable, not that it is complete.
>
> `templateSchemaParity.test.ts` compares each template's top-level keys against
> its schema and fails on any extra. Run the suite after editing a template.

The template layer powers the "start from a preset" picker and the template API. Create `backend/src/utils/character-templates/mySystem-templates.ts` exporting **named `CharacterTemplate`s** plus two getter functions:

```typescript
// backend/src/utils/character-templates/mySystem-templates.ts
import { GameSystem } from '@prisma/client';
import type { CharacterTemplate } from './dnd5e-templates'; // the shared shape

export const mySystemBlankTemplate: CharacterTemplate = {
  name: 'Blank My System Character',
  description: 'A blank character sheet for My System',
  gameSystem: GameSystem.MY_SYSTEM,
  data: { characterName: 'New Character' /* …minimal defaults… */ },
};

export const mySystemExampleTemplate: CharacterTemplate = {
  name: 'Example Hero',
  description: 'A ready-made example character',
  gameSystem: GameSystem.MY_SYSTEM,
  data: { characterName: 'Example Hero' /* …fuller preset… */ },
};

export function getMySystemTemplates(): CharacterTemplate[] {
  return [mySystemBlankTemplate, mySystemExampleTemplate];
}

export function getMySystemTemplate(templateName?: string): CharacterTemplate {
  if (!templateName || templateName === 'blank') return mySystemBlankTemplate;
  if (templateName === 'example') return mySystemExampleTemplate;
  return mySystemBlankTemplate;
}
```

Then wire both getters into `backend/src/utils/character-templates/index.ts` — import them, then add a `case GameSystem.MY_SYSTEM:` to **`getTemplatesForGameSystem`** and **`getCharacterTemplate`**, and an entry in the **`getAllTemplates`** object. (`CharacterTemplate` is `{ name, description, gameSystem, data }`.)

---

## Step 7 — Frontend enum + character type

The frontend keeps its own copy of the types (TypeScript doesn't cross the front/back boundary).

1. **Enum** — add your value to the `GameSystem` enum in `frontend/src/types/index.ts` (it must exactly mirror the backend enum):

   ```typescript
   export enum GameSystem {
     DND_5E = 'DND_5E',
     PATHFINDER_2E = 'PATHFINDER_2E',
     SHADOWRUN_6E = 'SHADOWRUN_6E',
     CALL_OF_CTHULHU_7E = 'CALL_OF_CTHULHU_7E',
     MY_SYSTEM = 'MY_SYSTEM',        // ← add
   }
   ```

2. **Character type** — create `frontend/src/types/game-systems/mySystem.ts` mirroring the backend data shape, and export it from `frontend/src/types/game-systems/index.ts`. Keep it in sync with the backend type by hand.

---

## Step 8 — Frontend display metadata

Edit `frontend/src/constants/game-systems.ts` and add your system to **four** places. The first three are labels; the fourth — `GAME_SYSTEM_OPTIONS` — is what actually makes the system **selectable in the create-campaign / create-character dropdowns**.

```typescript
export const GAME_SYSTEM_LABELS: Record<GameSystem, string> = {
  // …
  [GameSystem.MY_SYSTEM]: 'My System (Full Name)',
};

export const GAME_SYSTEM_SHORT_LABELS: Record<GameSystem, string> = {
  // …
  [GameSystem.MY_SYSTEM]: 'MySys',
};

export const GAME_SYSTEM_DESCRIPTIONS: Record<GameSystem, string> = {
  // …
  [GameSystem.MY_SYSTEM]: 'One-sentence pitch shown in the creation dialog.',
};

export const GAME_SYSTEM_OPTIONS: GameSystemOption[] = [
  // …existing entries…
  {
    value: GameSystem.MY_SYSTEM,
    label: GAME_SYSTEM_LABELS[GameSystem.MY_SYSTEM],
    shortLabel: GAME_SYSTEM_SHORT_LABELS[GameSystem.MY_SYSTEM],
    description: GAME_SYSTEM_DESCRIPTIONS[GameSystem.MY_SYSTEM],
  },
];
```

> The three `Record<GameSystem, …>` maps are exhaustive, so TypeScript forces you to add the first three. `GAME_SYSTEM_OPTIONS` is a plain array — nothing forces you to add it, so **this is the step that's easy to forget.** If your system doesn't appear in the dropdown, this is why (see the commented-out Shadowrun 6e entry).

---

## Step 9 — Character sheet component

The router (Step 10) imports exactly one file per system: `…/{system}/{System}CharacterSheet.tsx`. That component receives `CharacterSheetProps`:

```typescript
// frontend/src/components/character-sheets/types.ts
export interface CharacterSheetProps {
  character: Character;                 // includes character.data (the JSON blob) and character.gameSystem
  mode: 'view' | 'edit';
  onSave?: (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => Promise<void>;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;   // fired on first edit and after each save
}
```

**Minimal (single file).** The smallest valid sheet is one component implementing `CharacterSheetProps` (this is the Shadowrun 6e shape). Fine for a placeholder or a simple system.

**Recommended (the D&D 5e / CoC 7e pattern).** Split responsibilities so view and edit stay manageable:

```
frontend/src/components/character-sheets/mySystem/
  MySystemCharacterSheet.tsx    ← the ONLY file the router imports; switches on mode
  MySystemCharacterView.tsx     ← read-only display; props: { character, onEdit }
  MySystemCharacterEditor.tsx   ← the form; props: { character, onSave, onCancel }
  components/                   ← reusable sub-sections (stat block, skills, etc.)
```

The `…CharacterSheet.tsx` mode-switcher looks like this (copied from D&D 5e):

```tsx
// MySystemCharacterSheet.tsx
import React, { useState } from 'react';
import { CharacterSheetProps } from '../types';
import { MySystemCharacterView } from './MySystemCharacterView';
import { MySystemCharacterEditor } from './MySystemCharacterEditor';

export const MySystemCharacterSheet: React.FC<CharacterSheetProps> = (props) => {
  const { mode, character, onSave } = props;
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);

  const handleSave = async (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => {
    if (onSave) await onSave(data, showToast, tokenImageUrl);
    setCurrentMode('view');
  };

  if (currentMode === 'edit') {
    return (
      <MySystemCharacterEditor
        character={character}
        onSave={handleSave}
        onCancel={() => setCurrentMode('view')}
      />
    );
  }
  return <MySystemCharacterView character={character} onEdit={() => setCurrentMode('edit')} />;
};

export default MySystemCharacterSheet;
```

**No `any`.** `@typescript-eslint/no-explicit-any` is an error in both projects
and there are none left in application code. Type the sheet's form state with
the per-system interface in `frontend/src/types/game-systems/`, which is what
those files are for. Where a value genuinely is not known, `unknown` plus a
narrowing check — never `any`.

**The editor and the view must agree on what exists.** Every field the editor
lets someone fill in has to appear when the sheet is read back, and vice versa.
This is the single most common defect in the existing sheets: Pathfinder 2e was
missing six sections from its view — rituals, proficiencies, conditions,
treasure, deity and alignment — and Call of Cthulhu displayed conditions,
appearance and Keeper's notes that the editor gave no way to set. Both went
unnoticed for releases.

Check it mechanically rather than by eye: list the fields the editor writes,
list the fields the view reads, and diff the two. A field declared in the type
and the Zod schema but present in neither is also a gap — it means the sheet
cannot record something the server will happily store.

**Derive what the sheet can work out; store what it cannot.** The 5e sheet's own
skills (`customSkills`) record a name, an ability and a proficiency level, and
nothing else — the bonus comes from `dnd5eCustomSkillBonus`, so it follows the
character's ability scores and level instead of going stale the way a stored
`passivePerception` did. The `otherBonus` field is the escape hatch for what the
rules cannot derive, matching initiative and passive Perception. Storing a total
here would have reintroduced exactly the drift those two were fixed for.

**They must also agree on what a stored value *means*.** Agreeing a field exists
is not enough if each end interprets it differently. The 5e sheet's four
proficiency boxes were flattened into one list for storage, and the read-only
view guessed the categories back from a hardcoded list of language names — a
list the editor also had, with different words in it. A player who wrote
"Thieves' Cant" or "Druidic" under Languages was shown them under Weapons.
Store what the player chose (`proficiencies`), keep the flattened list only for
older readers, and if a value has to be interpreted, put the interpretation in
one shared function rather than one per component.

**Styling.** Use the shared UI primitives and theme tokens so the sheet follows every theme:

- Inputs: the `input-cozy` class (or the `<Input>` / `<Field>` components in `frontend/src/components/ui/`).
- Buttons: the `<Button>` component (`frontend/src/components/ui/Button.tsx`).
- Text/surfaces: theme tokens — `text-ink`, `text-ink-muted`, `bg-surface`, `bg-paper`, `border-ink/10`, panels via `glass-panel`. **Do not** hardcode `gray-`/`slate-`/`stone-` colors or a fixed hex — those break the non-default themes. (The `sepia-*` scale is the one intentional exception, used only by the Call of Cthulhu sheet for its 1920s look.)

The editor calls `onSave(data, showToast?, tokenImageUrl?)`; the generic save chain (CharacterEditorPage → API) handles persistence — you don't wire anything else.

---

## Step 10 — Register the sheet in the router

Edit `frontend/src/components/character-sheets/CharacterSheetRouter.tsx`: add a lazy import and a `case`.

```tsx
const MySystemSheet = lazy(() => import('./mySystem/MySystemCharacterSheet'));

// inside the switch on character.gameSystem:
case GameSystem.MY_SYSTEM:
  return <MySystemSheet {...props} />;
```

The `default` / `null` / `undefined` cases fall through to the `FlexibleCharacterSheet` (a system-agnostic JSON editor), so a character with no matching sheet still opens — but add your case so yours renders.

---

## Step 11 — Creature support (optional)

Skip this and your system still works: creatures fall back to the generic stat
block viewer, and the NPC roll picker offers its free-form custom roll input.
Add it when your system's creatures need a shape the shared `NpcStatBlock` does
not already express, or when their rolls can be modelled.

First decide the question from
[Creature and NPC stat blocks](#creature-and-npc-stat-blocks): **are your
system's creature numbers derived from something, or printed as final values?**
Answer that from the rulebook before writing code — deriving values a system
does not derive fabricates numbers that look authoritative.

1. **Roll building** — add a `case` to `buildNpcRolls`
   (`frontend/src/utils/npcRolls.ts`). If the system has no d20-equivalent
   structure, return the empty set; the picker falls through to a custom roll.
   Add your value to `systemSupportsNpcRolls` only if it does.
2. **Stat block renderer** — add a `case` to `StatBlockViewer.tsx` pointing at a
   component beside `Dnd5eStatBlock.tsx`. `GenericStatBlock.tsx` is the fallback
   and is often good enough.
3. **Editor branches** — if creatures need different fields (a Level rather than
   a Challenge Rating, modifiers rather than scores), branch in
   `StatBlockEditor.tsx` on the `gameSystem` prop. Add new fields to
   `NpcStatBlock` as **optional**, and to
   `backend/src/validators/statBlock.ts` — never repurpose an existing field,
   since a campaign can switch systems and the data has to survive.
4. **Proficiency editor** — if saves and skills are derived, model it on
   `ProficiencyEditor.tsx`. If they are printed, model it on
   `Pf2eProficiencyEditor.tsx`, which deliberately computes nothing.
5. **Roll picker labels** — add an entry to `MODE_LABELS` in
   `NpcRollPicker.tsx` if your system names its advantage equivalent something
   else, and to `systemSupportsAdvantage` if it has one at all.

Bounds live in `backend/src/validators/statBlock.ts`. `MIN_STORED_BONUS` /
`MAX_STORED_BONUS` are deliberately wide (±50) because they cover every system
at once — PF2e modifiers pass +33 at high level, so a bound fitted to D&D 5e
would reject legitimate creatures. It is a backstop against absurd data, not a
rules check; per-system sanity belongs in the editor.

---

## Testing

### Backend (automated)

Add a schema test under `backend/src/validators/game-systems/__tests__/mySystem.schema.test.ts` (copy an existing one):

```typescript
import { mySystemCharacterDataSchema } from '../mySystem.schema';

describe('mySystemCharacterDataSchema', () => {
  it('accepts a minimal character (name only)', () => {
    expect(() => mySystemCharacterDataSchema.parse({ characterName: 'Test' })).not.toThrow();
  });

  it('rejects an empty name', () => {
    expect(() => mySystemCharacterDataSchema.parse({ characterName: '' })).toThrow();
  });
});
```

There is also a template test suite under `backend/src/utils/character-templates/__tests__/` — add coverage there if your templates have non-trivial logic. Then run the gates:

```bash
cd backend  && npx tsc --noEmit && npm test
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
```

The exhaustive `switch`/`Record` types mean a missed backend registration point shows up as a **compile error**, not a runtime surprise.

### Frontend (manual)

1. Create a character and pick your system from the dropdown (confirms Step 8).
2. Confirm the blank template loads (confirms Steps 5–6).
3. Fill fields, save → Network shows `200`/`201` (confirms the Zod schema accepts real input).
4. Reload → data persists.
5. Open the sheet in **view** mode from the campaign roster, then switch to **edit** and back.
6. Cycle to the darkest and lightest themes and confirm the sheet has no off-palette boxes.

---

## Full checklist

**Backend**
- [ ] `prisma/schema.prisma` — `GameSystem` enum value added; `prisma migrate dev` run
- [ ] `game-systems/mySystem.ts` — character-data interface(s)
- [ ] `game-systems/index.ts` — `export *`, type import, enum value, `CharacterDataBySystem`, `GameSystemCharacterData`, `isMySystemData` guard, cases in `getTypedCharacterData` + structural `validateCharacterData`
- [ ] `validators/game-systems/mySystem.schema.ts` — Zod schema + inferred type
- [ ] `validators/game-systems/index.ts` — import/re-export, case in Zod `validateCharacterData`, `createBlankMySystemCharacter()` + case in `getBlankCharacterTemplate`
- [ ] `utils/character-templates/mySystem-templates.ts` — templates + `getMySystemTemplates` / `getMySystemTemplate`
- [ ] `utils/character-templates/index.ts` — cases in `getTemplatesForGameSystem`, `getCharacterTemplate`, and `getAllTemplates`
- [ ] Schema (and template) tests written and passing

**Frontend**
- [ ] `types/index.ts` — `GameSystem` enum value (mirrors backend)
- [ ] `types/game-systems/mySystem.ts` — character-data type; exported from `types/game-systems/index.ts`
- [ ] `constants/game-systems.ts` — `GAME_SYSTEM_LABELS`, `GAME_SYSTEM_SHORT_LABELS`, `GAME_SYSTEM_DESCRIPTIONS`, **and `GAME_SYSTEM_OPTIONS`**
- [ ] `components/character-sheets/mySystem/MySystemCharacterSheet.tsx` (+ View/Editor/components if using the full pattern)
- [ ] `CharacterSheetRouter.tsx` — lazy import + `case`
- [ ] `tsc` / lint / tests / build all green; manual create → save → reload → view/edit pass done

**Creatures (optional — see [Step 11](#step-11--creature-support-optional))**
- [ ] Decided from the rulebook whether creature values are **derived** or **printed**
- [ ] `utils/npcRolls.ts` — `case` in `buildNpcRolls` (empty set is a valid answer)
- [ ] `StatBlockViewer.tsx` — `case`, or left on `GenericStatBlock`
- [ ] `StatBlockEditor.tsx` — branches for any system-specific fields
- [ ] New `NpcStatBlock` fields added as **optional**, mirrored in `validators/statBlock.ts`
- [ ] `NpcRollPicker.tsx` — `MODE_LABELS` / `systemSupportsAdvantage` entries

**Docs**
- [ ] Game system added to the systems table in `README.md`
- [ ] Any legal attribution added (see below)

---

## Legal / content note

CozyVTT ships **rules-reference scaffolding** (attribute names, skill lists, sheet structure), not publisher rulebooks. When you add a system, keep it that way: include the mechanical framework a player needs to fill in their own character, not copyrighted prose, adventures, stat blocks, or artwork.

If the system you're adding is published under an open license (OGL, ORC, Creative Commons, a fan-content policy, etc.), add the required attribution to `SRD_ATTRIBUTION.md` (or a sibling attribution file) and note the source in your PR. If it isn't openly licensed, restrict your contribution to the generic sheet structure and user-entered data. When in doubt, open an issue before writing code — it's easier to sort licensing up front than to unwind it later.
