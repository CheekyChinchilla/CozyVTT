# CozyVTT — Adding a Game System

This guide explains how to add a new tabletop game system to CozyVTT end to end. It reflects the code as it actually ships — file names, the exact functions you extend, and the reference systems to copy from.

CozyVTT currently ships four systems: **D&D 5e**, **Pathfinder 2e**, **Call of Cthulhu 7e**, and **Shadowrun 6e** (backend-complete; its sheet UI is a placeholder — see [Reference systems](#reference-systems)). Adding a fifth means touching a fixed set of registration points, all of which are plain `switch` statements and enums — no dynamic plugin loader, no config file. If you add your system to every switch the compiler and tests point you at, it works.

---

## Table of Contents

1. [How a game system is wired](#how-a-game-system-is-wired)
2. [Reference systems](#reference-systems)
3. [Naming conventions](#naming-conventions)
4. [Step 1 — Prisma enum + migration](#step-1--prisma-enum--migration)
5. [Step 2 — Backend character type](#step-2--backend-character-type)
6. [Step 3 — Backend type index (`game-systems/index.ts`)](#step-3--backend-type-index-game-systemsindexts)
7. [Step 4 — Zod schema](#step-4--zod-schema)
8. [Step 5 — Validator index (`validators/game-systems/index.ts`)](#step-5--validator-index-validatorsgame-systemsindexts)
9. [Step 6 — Character templates](#step-6--character-templates)
10. [Step 7 — Frontend enum + character type](#step-7--frontend-enum--character-type)
11. [Step 8 — Frontend display metadata](#step-8--frontend-display-metadata)
12. [Step 9 — Character sheet component](#step-9--character-sheet-component)
13. [Step 10 — Register the sheet in the router](#step-10--register-the-sheet-in-the-router)
14. [Testing](#testing)
15. [Full checklist](#full-checklist)
16. [Legal / content note](#legal--content-note)

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
  onSave?: (data: any, showToast?: boolean, tokenImageUrl?: string) => Promise<void>;
  onCancel?: () => void;
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

  const handleSave = async (data: any, showToast?: boolean, tokenImageUrl?: string) => {
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

**Docs**
- [ ] Game system added to the systems table in `README.md`
- [ ] Any legal attribution added (see below)

---

## Legal / content note

CozyVTT ships **rules-reference scaffolding** (attribute names, skill lists, sheet structure), not publisher rulebooks. When you add a system, keep it that way: include the mechanical framework a player needs to fill in their own character, not copyrighted prose, adventures, stat blocks, or artwork.

If the system you're adding is published under an open license (OGL, ORC, Creative Commons, a fan-content policy, etc.), add the required attribution to `OGL_ATTRIBUTION.md` (or a sibling attribution file) and note the source in your PR. If it isn't openly licensed, restrict your contribution to the generic sheet structure and user-entered data. When in doubt, open an issue before writing code — it's easier to sort licensing up front than to unwind it later.
