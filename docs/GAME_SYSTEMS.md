# CozyVTT — Adding Game Systems

This guide explains how to add a new tabletop game system to CozyVTT. The architecture is designed so that each system is self-contained — you add files in predictable locations and the platform wires them in automatically.

---

## Table of Contents

1. [Overview](#overview)
2. [Backend: Type Definitions](#backend-type-definitions)
3. [Backend: Zod Validation Schema](#backend-zod-validation-schema)
4. [Backend: Character Template](#backend-character-template)
5. [Backend: Register the System](#backend-register-the-system)
6. [Frontend: Type Definitions](#frontend-type-definitions)
7. [Frontend: Character Sheet Component](#frontend-character-sheet-component)
8. [Frontend: Register the System](#frontend-register-the-system)
9. [Testing](#testing)
10. [Checklist](#checklist)

---

## Overview

A game system in CozyVTT is the combination of:

1. **A TypeScript type** describing the character data shape (backend + frontend)
2. **A Zod validation schema** that validates character data at the API layer (backend)
3. **A blank character template** used when creating a new character (backend)
4. **A React component** that renders the character sheet (frontend)

Character data is stored as JSON in the database and is not strongly typed at the DB level. The Zod schema is the enforcement point — it runs on every save to make sure the data is valid before it's persisted.

### Design Principle: Mostly Optional Fields

Character sheets are often filled out incrementally. A player might save a character after filling in just their name and class. **Make the vast majority of fields optional** in your Zod schema — only require the fields that are genuinely essential to identify the character (typically just `name`, possibly `class`/`background`).

---

## Backend: Type Definitions

Create `backend/src/game-systems/{system-id}.ts`:

```typescript
// backend/src/game-systems/my-system.ts
// Per SOW Section 5.4: Character Management

export interface MySystemCharacter {
  // Basic info (typically required)
  name: string;

  // Core stats (optional — filled in over time)
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;

  // Derived stats
  hitPoints?: {
    current?: number;
    maximum?: number;
    temporary?: number;
  };

  // Skills, abilities, equipment, etc.
  skills?: MySystemSkill[];
  inventory?: MySystemItem[];

  // Anything else the system needs
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

**Naming conventions:**
- File name: `{system-id}.ts` using kebab-case matching the `GameSystem` enum value (lowercased, hyphens for underscores)
- Interface prefix: Match the system name (e.g., `Dnd5eCharacter`, `PathfinderCharacter`)

---

## Backend: Zod Validation Schema

Create `backend/src/validators/game-systems/{system-id}.schema.ts`:

```typescript
// backend/src/validators/game-systems/my-system.schema.ts
// Most fields are optional to support partial saves and incremental character building.

import { z } from 'zod';

const mySystemSkillSchema = z.object({
  name: z.string().min(1),
  value: z.number().min(0).max(100).optional(),
  proficient: z.boolean().optional(),
});

const mySystemItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().min(0).optional(),
  description: z.string().optional(),
});

export const mySystemCharacterSchema = z.object({
  // Required fields — keep this list short
  name: z.string().min(1).max(100),

  // Optional stat fields
  strength: z.number().int().min(1).max(30).optional(),
  dexterity: z.number().int().min(1).max(30).optional(),
  constitution: z.number().int().min(1).max(30).optional(),
  intelligence: z.number().int().min(1).max(30).optional(),
  wisdom: z.number().int().min(1).max(30).optional(),
  charisma: z.number().int().min(1).max(30).optional(),

  hitPoints: z.object({
    current: z.number().int().optional(),
    maximum: z.number().int().min(0).optional(),
    temporary: z.number().int().min(0).optional(),
  }).optional(),

  skills: z.array(mySystemSkillSchema).optional(),
  inventory: z.array(mySystemItemSchema).optional(),

  notes: z.string().max(5000).optional(),
}).strict();

export type MySystemCharacterData = z.infer<typeof mySystemCharacterSchema>;
```

**Important:** Use `.strict()` on the root object to reject unknown keys — this prevents stale or malformed data from silently persisting.

---

## Backend: Character Template

Create `backend/src/utils/character-templates/{system-id}.ts`:

```typescript
// backend/src/utils/character-templates/my-system.ts
// Per SOW Section 5.4: Character Management

import type { MySystemCharacter } from '../../game-systems/my-system';

export const mySystemBlankTemplate: MySystemCharacter = {
  name: '',
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
  hitPoints: {
    current: 0,
    maximum: 0,
    temporary: 0,
  },
  skills: [],
  inventory: [],
  notes: '',
};

export const mySystemExampleTemplate: MySystemCharacter = {
  name: 'Example Hero',
  strength: 16,
  dexterity: 14,
  constitution: 14,
  intelligence: 10,
  wisdom: 12,
  charisma: 8,
  hitPoints: {
    current: 12,
    maximum: 12,
    temporary: 0,
  },
  skills: [
    { name: 'Athletics', value: 5, proficient: true },
    { name: 'Perception', value: 3, proficient: false },
  ],
  inventory: [
    { name: 'Longsword', quantity: 1, description: '1d8 slashing damage' },
    { name: 'Health Potion', quantity: 2 },
  ],
  notes: 'A seasoned adventurer with a mysterious past.',
};
```

---

## Backend: Register the System

### 1. Add to the `GameSystem` enum

In `backend/prisma/schema.prisma`, add your system to the `GameSystem` enum:

```prisma
enum GameSystem {
  DND_5E
  PATHFINDER_2E
  SHADOWRUN_6E
  CALL_OF_CTHULHU_7E
  MY_SYSTEM         // Add this
}
```

Then run:
```bash
cd backend
npx prisma migrate dev --name add_my_system
```

### 2. Register the Zod schema

In `backend/src/validators/game-systems/index.ts` (create if it doesn't exist, or find the existing registration point in `characters.ts`):

```typescript
import { mySystemCharacterSchema } from './my-system.schema';

export const gameSystemSchemas: Record<GameSystem, z.ZodType> = {
  [GameSystem.DND_5E]: dnd5eCharacterSchema,
  [GameSystem.PATHFINDER_2E]: pathfinder2eCharacterSchema,
  [GameSystem.CALL_OF_CTHULHU_7E]: callOfCthulhu7eCharacterSchema,
  [GameSystem.MY_SYSTEM]: mySystemCharacterSchema,   // Add this
  // ...
};
```

### 3. Register the template

In `backend/src/routes/characters.ts`, find the template endpoint and add your system:

```typescript
import { mySystemBlankTemplate, mySystemExampleTemplate } from '../utils/character-templates/my-system';

const templates: Record<string, object> = {
  // ... existing systems ...
  MY_SYSTEM_blank: mySystemBlankTemplate,
  MY_SYSTEM_example: mySystemExampleTemplate,
};
```

---

## Frontend: Type Definitions

Create `frontend/src/types/game-systems/{system-id}.ts` mirroring the backend types:

```typescript
// frontend/src/types/game-systems/my-system.ts
// Mirror of backend/src/game-systems/my-system.ts

export interface MySystemCharacter {
  name: string;
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  hitPoints?: {
    current?: number;
    maximum?: number;
    temporary?: number;
  };
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

Keep this in sync with the backend type manually — they should be identical. TypeScript doesn't share types across the monorepo boundary.

---

## Frontend: Character Sheet Component

Create the sheet component and its wrapper in `frontend/src/components/character-sheets/{system-id}/`:

### `{SystemId}CharacterSheet.tsx`

This is the actual form the user fills out. It receives the character data and calls `onChange` when any field is edited.

```typescript
// frontend/src/components/character-sheets/my-system/MySystemCharacterSheet.tsx

import { CharacterSheetProps } from '../types';
import type { MySystemCharacter } from '@/types/game-systems/my-system';

export const MySystemCharacterSheet: React.FC<CharacterSheetProps> = ({
  character,
  onChange,
  readOnly = false,
}) => {
  const data = (character.data || {}) as MySystemCharacter;

  const handleChange = (field: keyof MySystemCharacter, value: unknown) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-6">
      {/* Character Name */}
      <div className="glass-panel p-6">
        <h2 className="text-lg font-semibold text-warm-gray mb-4">Character Info</h2>
        <div>
          <label className="block text-sm font-medium text-stone-gray mb-1">
            Name
          </label>
          <input
            type="text"
            value={data.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            disabled={readOnly}
            className="input-field w-full"
            placeholder="Character name"
          />
        </div>
      </div>

      {/* Core Stats */}
      <div className="glass-panel p-6">
        <h2 className="text-lg font-semibold text-warm-gray mb-4">Ability Scores</h2>
        <div className="grid grid-cols-3 gap-4">
          {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const).map((stat) => (
            <div key={stat}>
              <label className="block text-xs font-medium text-stone-gray mb-1 uppercase">
                {stat}
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={data[stat] ?? ''}
                onChange={(e) => handleChange(stat, e.target.value ? parseInt(e.target.value) : undefined)}
                disabled={readOnly}
                className="input-field w-full text-center"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="glass-panel p-6">
        <h2 className="text-lg font-semibold text-warm-gray mb-4">Notes</h2>
        <textarea
          value={data.notes || ''}
          onChange={(e) => handleChange('notes', e.target.value)}
          disabled={readOnly}
          rows={4}
          className="input-field w-full"
          placeholder="Character notes, backstory, etc."
        />
      </div>
    </div>
  );
};

export default MySystemCharacterSheet;
```

### `{SystemId}SheetWrapper.tsx`

The wrapper is a thin adapter between the generic `CharacterSheetProps` interface and the save chain:

```typescript
// frontend/src/components/character-sheets/my-system/MySystemSheetWrapper.tsx

import React from 'react';
import { CharacterSheetProps } from '../types';
import { MySystemCharacterSheet } from './MySystemCharacterSheet';

const MySystemSheetWrapper: React.FC<CharacterSheetProps> = ({
  character,
  onChange,
  onSave,
  readOnly,
}) => {
  return (
    <MySystemCharacterSheet
      character={character}
      onChange={onChange}
      onSave={onSave}
      readOnly={readOnly}
    />
  );
};

export default MySystemSheetWrapper;
```

---

## Frontend: Register the System

### 1. Add to the `GameSystem` enum

In `frontend/src/types/game-systems/index.ts` (or wherever the enum is defined), add your system:

```typescript
export enum GameSystem {
  DND_5E = 'DND_5E',
  PATHFINDER_2E = 'PATHFINDER_2E',
  CALL_OF_CTHULHU_7E = 'CALL_OF_CTHULHU_7E',
  MY_SYSTEM = 'MY_SYSTEM',   // Add this
}
```

### 2. Add display metadata

In `frontend/src/utils/game-systems.ts` (or the constants file), add display name, description, and badge color:

```typescript
export const GAME_SYSTEM_LABELS: Record<GameSystem, string> = {
  // ... existing ...
  [GameSystem.MY_SYSTEM]: 'My System',
};

export const GAME_SYSTEM_DESCRIPTIONS: Record<GameSystem, string> = {
  // ... existing ...
  [GameSystem.MY_SYSTEM]: 'A brief description of the system for the character creation dialog.',
};

export const GAME_SYSTEM_BADGE_COLORS: Record<GameSystem, string> = {
  // ... existing ...
  [GameSystem.MY_SYSTEM]: 'bg-teal-100 text-teal-800',
};
```

### 3. Register the sheet component

In `frontend/src/components/character-sheets/CharacterSheetRouter.tsx`, add your system to the router:

```typescript
import MySystemSheetWrapper from './my-system/MySystemSheetWrapper';

// Inside the switch or map:
case GameSystem.MY_SYSTEM:
  return <MySystemSheetWrapper {...props} />;
```

---

## Testing

### Backend: Validate the Schema

Add a test in `backend/src/validators/game-systems/__tests__/{system-id}.schema.test.ts`:

```typescript
import { mySystemCharacterSchema } from '../my-system.schema';

describe('mySystemCharacterSchema', () => {
  it('accepts a minimal character (name only)', () => {
    expect(() => mySystemCharacterSchema.parse({ name: 'Test Hero' })).not.toThrow();
  });

  it('accepts a fully populated character', () => {
    const full = {
      name: 'Full Hero',
      strength: 16,
      dexterity: 14,
      // ... all fields ...
    };
    expect(() => mySystemCharacterSchema.parse(full)).not.toThrow();
  });

  it('rejects an empty name', () => {
    expect(() => mySystemCharacterSchema.parse({ name: '' })).toThrow();
  });

  it('rejects an ability score out of range', () => {
    expect(() => mySystemCharacterSchema.parse({ name: 'Hero', strength: 31 })).toThrow();
  });

  it('rejects unknown fields (.strict())', () => {
    expect(() => mySystemCharacterSchema.parse({ name: 'Hero', unknownField: 'value' })).toThrow();
  });
});
```

### Frontend: Manual Testing

1. Create a new character and select your game system
2. Verify the blank template loads correctly
3. Fill in various fields and save — check the network response for 200 OK
4. Reload the page — verify the data persists correctly
5. Test with `readOnly={true}` (e.g., viewing a character from the campaign roster)

---

## Checklist

Use this checklist when opening a PR for a new game system:

**Backend**
- [ ] `backend/src/game-systems/{system-id}.ts` — TypeScript interface
- [ ] `backend/src/validators/game-systems/{system-id}.schema.ts` — Zod schema with `.strict()`
- [ ] `backend/src/utils/character-templates/{system-id}.ts` — blank and example templates
- [ ] Schema registered in the character routes
- [ ] Templates registered in the template endpoint
- [ ] `GameSystem` enum updated in Prisma schema
- [ ] Migration created and applied
- [ ] Zod schema tests written and passing

**Frontend**
- [ ] `frontend/src/types/game-systems/{system-id}.ts` — TypeScript interface (mirroring backend)
- [ ] `frontend/src/components/character-sheets/{system-id}/` — sheet component and wrapper
- [ ] `GameSystem` enum updated in frontend types
- [ ] Display metadata added (label, description, badge color)
- [ ] Sheet registered in `CharacterSheetRouter.tsx`
- [ ] Manual testing complete (create, save, reload, read-only)

**Documentation**
- [ ] Game system added to the table in `README.md`
- [ ] Any system-specific sheet guidance added to `docs/USER_GUIDE.md`
