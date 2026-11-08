# CozyVTT — Adding a Game System

This guide explains how to add a new tabletop game system to CozyVTT end to end. It names the files, the functions you extend and the reference systems to copy from, as the code ships them.

CozyVTT currently ships three systems you can choose: **D&D 5e**, **Pathfinder 2e** and **Call of Cthulhu 7e**. A fourth, **Shadowrun 6e**, is in the code as groundwork: its schema and templates are complete and its sheet is a placeholder, so it is left out of the lists a game system is chosen from (see [Reference systems](#reference-systems)). Adding another system means touching a fixed set of registration points, all listed in the [Full checklist](#full-checklist). There is no plugin loader and no config file. Most of those points are `switch` statements with a `default` branch, so neither the compiler nor the tests point you at them: work through the checklist.

---

## Table of Contents

1. [How a game system is wired](#how-a-game-system-is-wired)
2. [Creature and NPC stat blocks](#creature-and-npc-stat-blocks)
3. [Reference systems](#reference-systems)
4. [Naming conventions](#naming-conventions)
5. [Step 1: Prisma enum and migration](#step-1-prisma-enum-and-migration)
6. [Step 2: Backend character type (from the schema)](#step-2-backend-character-type-from-the-schema)
7. [Step 3: Backend enum (nothing to edit)](#step-3-backend-enum-nothing-to-edit)
8. [Step 4: Zod schema](#step-4-zod-schema)
9. [Step 5: Validator index](#step-5-validator-index)
10. [Step 6: Character templates](#step-6-character-templates)
11. [Step 7: Frontend enum and character type](#step-7-frontend-enum-and-character-type)
12. [Step 8: Frontend labels and colours](#step-8-frontend-labels-and-colours)
13. [Step 9: Character sheet component](#step-9-character-sheet-component)
14. [Step 10: Register the sheet](#step-10-register-the-sheet)
15. [Step 11: Rolls, initiative and hit points](#step-11-rolls-initiative-and-hit-points)
16. [Step 12: Creature support (optional)](#step-12-creature-support-optional)
17. [Step 13: Documentation](#step-13-documentation)
18. [Testing](#testing)
19. [Full checklist](#full-checklist)
20. [Legal / content note](#legal--content-note)

---

## How a game system is wired

A character's data is stored as an unstructured JSON blob on the `Character.data` column. The `Character.gameSystem` column (a Prisma enum) tells the rest of the app how to interpret that blob. Nothing about the JSON is enforced by the database — **the Zod schema is the single enforcement point** and runs on every character create/update.

So a "game system" in CozyVTT is really seven coordinated pieces:

| # | Piece | Location |
|---|-------|----------|
| 1 | Enum value | `backend/prisma/schema.prisma` (the backend re-exports Prisma's) + the frontend enum in `frontend/src/types/gameSystem.ts` |
| 2 | Character **type** (the data shape) | Decided by the Zod schema (piece 3); described for the frontend in `frontend/src/types/game-systems/`, which a test compares with the schema |
| 3 | **Zod schema** (validation on save) | `backend/src/validators/game-systems/` |
| 4 | **Templates** (blank + example starting data) | `backend/src/utils/character-templates/` |
| 5 | **Sheet component** (the UI) | `frontend/src/components/character-sheets/{system}/` |
| 6 | **Display metadata + registration** (labels, the creation dropdown, the places a sheet opens) | `frontend/src/constants/game-systems.ts`, `CharacterSheetRouter.tsx` and the two sheet windows in `frontend/src/components/character/` |
| 7 | **Table rules** (rolls, initiative, hit points) | `frontend/src/utils/characterRolls.ts`, and `utils/characterHp.ts` and `utils/rules/` in both projects |

Pieces 3 and 4 each have a per-system file **and** an `index.ts` with a `switch` you extend. Those switches, like most of the places a system is named, have a `default` branch, so the compiler does not notice a missing case. Adding the enum value breaks the build only where a map is typed `Record<GameSystem, …>`: `SHEET_NAME_FIELD` in `validators/game-systems/index.ts` and the test helper `__tests__/helpers/builtInTemplates.ts` in the backend, and the four maps in `constants/game-systems.ts` (three labels and the badge tints) in the frontend. Every other place falls back without an error; the [Full checklist](#full-checklist) lists them all.

### Design principle: almost everything is optional

Players fill out sheets incrementally — someone may save a character with just a name. **Make the vast majority of fields optional in your Zod schema.** Require only what genuinely identifies the character (usually just the name). This is why the existing schemas are permissive; match that.

### Limits on every sheet

A sheet is shown to the whole table, so the schemas hold it to sizes a page can draw. The numbers live in `backend/src/validators/game-systems/sheetLimits.ts`, copied byte for byte as `frontend/src/constants/sheetLimits.ts` so the editors stop each box at the same place (`keepInStep.test.ts` fails when the two differ). Use them in a new system's schema and editor; do not write the numbers again.

| Limit | Constant | Where |
|---|---|---|
| The character's own name on the sheet: at most 200 characters, the `name` column's limit, since a save copies it there | `SHEET_NAME_MAX` | `sheetCharacterNameSchema` in `sheetText.ts`, used by every system's name field; the editors' name boxes stop there |
| Any other one-line text: at most 1,000 characters | `SHEET_SHORT_TEXT_MAX` | `sheetShortTextSchema` in `sheetText.ts` |
| Text that holds paragraphs (notes, descriptions, backstory, personality, a feature, which an older sheet may hold as one long line): at most 100,000 characters | `SHEET_LONG_TEXT_MAX` | `sheetLongTextSchema` in `sheetText.ts` |
| The name in Allies & Organizations (D&D 5e and Pathfinder 2e): the paragraph limit, since a sheet written before 1.3.0 had its whole allies paragraph moved into it | `SHEET_LONG_TEXT_MAX` | `alliesAndOrganizations.schema.ts`, imported by both schemas |
| A list on a D&D 5e, Pathfinder 2e, Call of Cthulhu or Shadowrun 6e sheet (inventory or possessions, attacks, strikes or weapons, spells, cantrips, conditions, hit dice, features, feats, languages, contacts and the rest): at most 500 entries, five times what the longest real list holds | `SHEET_LIST_MAX` | `sheetList` in `sheetLists.ts`; `listLimits.test.ts` walks every system's schema and fails on a list without a maximum. The editor turns each add button off at the limit and says why (`ListLimitNote`); a comma-separated box (`ListField`, the cantrips box) turns away the entry that would pass it |
| Entries in a list inside one row (the traits of one Pathfinder 2e strike, the firing modes of one Shadowrun weapon): at most 50, because it multiplies by the rows around it | `SHEET_ROW_TAGS_MAX` | `pathfinder2e.schema.ts` and `shadowrun6e.schema.ts`; the strike's traits box turns away the 51st |
| D&D 5e: skills of the player's own, at most 30; further damage lines on one attack, at most 10 | `DND5E_CUSTOM_SKILLS_MAX`, `DND5E_ATTACK_DAMAGE_ROLLS_MAX` | `dnd5e.schema.ts`; the editor's **+ Add Skill** and **+ Add Damage Roll** stop there, as above |
| Pathfinder 2e item bonus (saving throws, Perception, skills, lore skills, armor class, strikes, spell attack and spell DC): -30 to +30. The Core Rulebook's run from +4 down to -2 | `PF2E_ITEM_BONUS_MIN`, `PF2E_ITEM_BONUS_MAX` | `itemBonusSchema` in `pathfinder2e.schema.ts`; the editor's boxes clamp to the range when left |
| D&D 5e and Pathfinder 2e spell slots of one rank or level: 0 to 20 for the total and for the used count, and no more used than the total | `SPELL_SLOTS_MAX` | `dnd5e.schema.ts` and `pathfinder2e.schema.ts`; the D&D editor clamps a stored sheet's slots when it opens and on save, and the Spells tab writes a larger stored total as a count; the Pathfinder editor's boxes stop at 20, and it brings the used count within the total when a sheet opens and when the total is lowered |
| D&D 5e manual bonuses (initiative, passive Perception, the two spellcasting adjustments): -30 to +30 | `MIN_BONUS_OVERRIDE`, `MAX_BONUS_OVERRIDE` in `utils/rules/dnd5e.ts` | `dnd5e.schema.ts`; the D&D editor stops its boxes there and brings a stored or read-back value within the range when it opens |

A sheet stored before a limit existed still loads, with every entry; its next save is refused, with the path of each field over a limit in `validationErrors`, until the list is shortened. The two sheet editors, the Character Editor page and the editor that opens over a sheet at the table or on the Characters page, turn that into one message through `refusedSaveMessage` in `frontend/src/utils/sheetSaveRefusal.ts`: "Not saved." and the first five paths with their reasons, then a count of the rest.

### A field only the DM sees: Keeper's Notes

A sheet is read by the whole table, its player included, so a field meant for the DM alone has to be withheld by the server, never just hidden on the page. Call of Cthulhu has one: the top-level `notes`, shown as **Keeper's Notes**. `backend/src/utils/keeperNotes.ts` lists it in `KEEPER_ONLY_FIELD` and applies these rules:

- **Reading.** Only the DM of the character's campaign (the Keeper) is sent it, on `GET /api/characters/:id`, every save's reply and every `character.updated` event (the character list, `GET /api/characters`, carries no sheets). The Keeper is always sent it, as an empty string when nothing is written, and the editor offers the box exactly when the field arrives; anyone else, the character's owner included, never gets the key.
- **Writing.** Only the Keeper can change it. A save by anyone else (the owner, a script) keeps the stored value, whatever it sent for the field. A character created by anyone but the DM of the campaign it is created in is stored without it.
- **Moving.** A character entering a campaign it was not in (assigned to another campaign, or brought in when its owner accepts an invitation) loses it, and so does a copy. The notes were the last campaign's Keeper's, and a player who moved their investigator into a campaign they run would otherwise be its Keeper and read them.
- **Templates.** A template is read by every user, so publishing or saving one stores it without the field, whoever saves it, the Keeper and a template editor included. A template also never keeps the sheet's `playerName`: a character made from it is given its own owner's.

The notes stay inside the stored sheet, so an instance backup keeps them. A campaign export carries no character sheets at all, and a character's JSON export, made from `GET /api/characters/:id`, holds the notes only when the person exporting is the character's Keeper. To give another system such a field, add it to `KEEPER_ONLY_FIELD`; every route already goes through the helpers.

### Flexible sheets

A character or template with no game system has a **Flexible** sheet: a list of sections the player lays out. It has no enum value and no per-system files, but it is checked like the others, by `backend/src/validators/game-systems/flexible.schema.ts`, on create, update, template publish and template update (character import goes through create). The sheet must be an object, and each section's `type` decides the list its page reads:

| `type` | Holds | Limits |
|---|---|---|
| `stats` | `fields`: `{ id, name, value, modifier? }` | at most 200; `name` up to 200 characters; `value` and `modifier` numbers |
| `list` | `items`: `{ id, text, checked? }` | at most 1,000; `text` up to 1,000 characters |
| `text` | `value` | up to 100,000 characters |
| `table` | `columns`: `{ id, name, width? }`; `rows`: `{ id, cells }` | at most 50 columns and 1,000 rows; `cells` maps a column id to text of up to 1,000 characters |

Every section also has an `id` (1 to 100 characters), a `title` (up to 200) and an optional `collapsed`; a sheet holds at most 100 sections. Keys beside `sections` are stored as sent, since an import or a program may keep its own there and the editor sends them back. A sheet stored before these checks still loads, and its next save is checked. On the page, `initializeFlexibleData` (`frontend/src/components/character-sheets/flexible/utils/section-helpers.ts`) puts each stored section into the shape its type reads before the view or the editor sees it: a section of an unknown type is left out, a missing list is empty, and a value that is not text is shown as text or as nothing, so an old malformed sheet opens and can be saved in the checked shape.

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
  DC, saving throws, Perception, skills (a check penalty always a penalty),
  initiative, spell attack and spell DC *are* derivable (one spellcasting rank
  for both, each its own item bonus), and `rules/pathfinder2e.ts` derives them
  for the editor, the read-only sheet, the roll menu and the server's
  initiative roll alike,
  with the Bulk an inventory and purse carry (ten light items or a thousand
  coins to 1 Bulk, the rest rounded down) and its limits.
  The distinction is where the number comes from: a creature's is printed by
  Paizo, a character's is built from their own sheet.
- **Call of Cthulhu 7e and Shadowrun 6e have no equivalent.** Percentile and
  dice-pool systems have neither ability modifiers nor a proficiency bonus, so
  there is nothing to derive and nothing sensible to offer from this data.

  **A derived base is not a derived value.** Call of Cthulhu's Dodge is listed
  as "Dodge (half DEX)": half DEX, rounded down, is its *base*, and occupation
  points, personal-interest points and improvement checks raise it like any
  other skill. The editor therefore derives only `skills.dodge.baseValue`. The
  value, `skills.dodge.currentValue`, is the player's, editable with the base
  as its floor, and when DEX changes in the editor the points above the old
  base stay above the new one. `derivedStats.dodge.value` is a copy kept for
  older readers and follows the skill on save; the sheet shows and rolls the
  skill. Language (Own) works the same way with EDU as its base ("automatically
  starts as equal to the investigator's EDU"). The base is `cocDodgeBase` in `rules/callOfCthulhu7e.ts`, with the
  sheet's other derived attributes (hit points, magic points, maximum Sanity,
  half and fifth, damage bonus and build, move rate) and the skill bases
  (`COC_SKILL_BASES`, `cocBlankSkills`, from which both the blank template and
  the editor fill a sheet), mirrored in both projects like the other rules
  modules; keeping the points above the base is `settleSkillBase` in
  `components/character-sheets/call-of-cthulhu-7e/dodge.ts`.

**Where a number is derived, give it a manual bonus alongside.** The 5e sheet
derives initiative, passive Perception, spell save DC and spell attack, and each
carries an "other bonus" box. Deriving without one is a trap: a feat or an item
adjusts the total without changing either input, and the player is then left with
no way to record a character they legitimately have. Spell save DC and spell
attack get **separate** boxes, because items exist that raise the attack roll
and not the DC.

The eighteen skills and six saving throws follow the same rule. Each entry
stores its total as `bonus` and an optional `otherBonus` for what the maths
cannot know: Jack of All Trades, Aura of Protection, a Ring of Protection. The
editor keeps `bonus` equal to ability modifier, plus proficiency (doubled for a
skill with expertise, never for a save), plus `otherBonus`. The view and the
roll picker work the total out the same way, through `dnd5eSkillBonus` and
`dnd5eSaveBonus` in `rules/dnd5e.ts`.

**Adding a derived field to existing sheets: read the old total back once.** A
sheet saved before `otherBonus` existed holds only a total, and that total is
what it has always rolled. Deriving over it would silently take away whatever it
included. So the editor, once as it opens and on the sheet as stored, records
`stored − derived` as the other bonus wherever the two differ
(`dnd5eBackfilledSkillOtherBonus`, `dnd5eBackfilledSaveOtherBonus`), and until
then the view and the dice use the stored total. Doing it once matters: reading
back a total the editor had itself just worked out from a changed score would
turn the change into a bonus. The initiative bonus was converted the same way.

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
  a client could send. For a combatant nothing can be derived for, the DM's
  client may send an `expression`; a player's is ignored and `1d20` is rolled.
  The frontend uses the same module purely to *display* what will happen.

D&D 5e's `initiativeBonus` is a single manual field covering everything that is
not Dexterity — the Alert feat, Jack of All Trades, Remarkable Athlete,
subclasses that swap the ability. Those are too open-ended to enumerate, and
inventing a toggle per feature would be the same mistake as inventing CoC's dice.

### Hit points: damage, healing and temporary hit points

The rules live in `frontend/src/utils/rules/hitPoints.ts` (duplicated at
`backend/src/utils/rules/hitPoints.ts`; the parity test in
`backend/src/utils/rules/__tests__/hitPoints.test.ts` fails on drift). The
server applies them to a character's sheet (the roster's damage buttons,
`character.hp.temporary`) and the token editor and the token menu to a
creature's token. Checked against the D&D 5e Basic Rules and the Pathfinder 2e
Core Rulebook.

| System | Damage | Healing | Temporary hit points granted to a creature that has some |
|---|---|---|---|
| **D&D 5e** | Off temporary hit points first, the rest off current | Current only, up to the maximum | Never added together: the creature keeps the ones it has or takes the new ones (`grantTemporaryHitPoints`), so **Temporary HP...** offers **Keep N** and **Take M** |
| **Pathfinder 2e** | As D&D 5e | As D&D 5e | As D&D 5e: temporary hit points come from one source at a time |
| **Call of Cthulhu 7e** | Off current | Current only | None to grant: the rules give a temporary hit point only to a dying investigator stabilised with First Aid, which the sheet does not track, so the sheet keeps no pool and **Temporary HP...** is not offered |
| Flexible / unknown | As D&D 5e on a token | As D&D 5e on a token | No rule to follow: **Temporary HP...** is not offered |

A grant gives 1 to 99,999 (`MAX_TEMPORARY_HIT_POINTS`, which also bounds a
token's temporary hit points). Keeping the ones a creature has changes nothing,
so only taking the new ones is sent.

### Where creature code branches on system

Eight places, all plain conditionals with a fallback:

| Location | What it decides |
|---|---|
| `npc-stat-blocks/StatBlockEditor.tsx` | CR vs Level, scores vs modifiers, which proficiency editor: Pathfinder 2e's, or D&D 5e's in every other system |
| `CreatureLibrary.tsx` (`CreatureForm`) | The Creature Library's own creature form: the same choices as `StatBlockEditor` |
| `npc-stat-blocks/StatBlockViewer.tsx` | Which read-only stat block renderer |
| `utils/npcRolls.ts` (`buildNpcRolls`) | What can be rolled. A system with no case is treated as D&D 5e and offered d20 rolls; `CALL_OF_CTHULHU_7E` and `SHADOWRUN_6E` return nothing |
| `utils/rollModes.ts` | Advantage-equivalent labels, and whether the system has one (the roll pickers and a character sheet's **Roll mode** and roll menu) |
| `utils/rules/initiative.ts` (`resolveStatBlockInitiative`) | A creature's initiative: D&D 5e's from its Dexterity, a flat d20 in any other system |
| `utils/conditions.ts` (`conditionsOffered`, `effectsOffered`) | The conditions the token editor lists; none for a system with no case, where the DM types their own |
| `MapCanvas.tsx` (`coneRule`) | A cone template's shape: Pathfinder 2e's quarter circle, D&D 5e's in every other system |

### Adding creature support for a new system

Optional: a system works without it, but its creatures are then handled as
D&D 5e's, d20 rolls included. See
[Step 12](#step-12-creature-support-optional).

> **Returning no roll options is a valid, correct outcome.** Offering a d20 roll
> for a d100 game is worse than offering nothing: the caller already falls back
> to a custom roll input that works for any system. Since `buildNpcRolls` falls
> back to D&D 5e, a system that is not d20-based says so with a case of its own.

---

## Reference systems

Copy from a system that's shaped like the one you're adding:

- **Backend (steps 4 to 6): copy Shadowrun 6e.** It shows the schema, the validator index and the templates from start to finish. Files: `validators/game-systems/shadowrun6e.schema.ts`, `utils/character-templates/shadowrun6e-templates.ts`, plus its entries in both backend `index.ts` files. It keeps no hit points and offers no rolls from its sheet, so for [Step 11](#step-11-rolls-initiative-and-hit-points) copy D&D 5e or Call of Cthulhu 7e.
- **Frontend sheet (step 9): copy D&D 5e, Pathfinder 2e or Call of Cthulhu 7e.** These are the complete sheets, each split into `…CharacterSheet.tsx` (mode switcher) + `…CharacterView.tsx` + `…CharacterEditor.tsx` + a `components/` folder. Shadowrun 6e's sheet is a single "not yet implemented" placeholder, so don't copy it for the UI; it shows the smallest sheet the router accepts.

> **Note on Shadowrun 6e:** it is **not listed in the dropdowns a game system is chosen from**: its entry in `GAME_SYSTEM_OPTIONS` (`frontend/src/constants/game-systems.ts`) is commented out because its sheet isn't finished. That commented block illustrates [Step 8](#step-8-frontend-labels-and-colours): a system is only selectable once it's in `GAME_SYSTEM_OPTIONS`.

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

## Step 1: Prisma enum and migration

**Agree it first.** A new game system adds a value to a database enum, which is a schema change. Open an issue and agree it with the maintainer before you write the migration. The same goes for a new npm package, which also brings its licence entries ([CONTRIBUTING.md](CONTRIBUTING.md)).

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

Then create the migration as [Running Migrations](DEVELOPMENT.md#running-migrations) describes. On a database the backend has never started against, in a terminal that can answer questions:

```bash
cd backend
npx prisma migrate dev --name add_my_system
npx prisma generate
```

If `migrate dev` reports drift and offers a reset, answer no: a reset deletes everything in that database. Generate the migration with `prisma migrate diff` into a scratch database instead; the same section shows how.

`prisma generate` regenerates the Prisma client so its `GameSystem` enum includes your value. The backend imports that enum from `@prisma/client`, or through `game-systems/index.ts`. Since Prisma 7, `migrate dev` no longer generates the client itself.

The migration holds this one statement and nothing else that uses the value, because PostgreSQL does not let a new enum value be used in the transaction that adds it:

```sql
ALTER TYPE "GameSystem" ADD VALUE 'MY_SYSTEM';
```

PostgreSQL cannot remove an enum value, so going back to an older release after this upgrade means restoring a backup taken before it. Then:

- Check that the migrations and the schema agree, as CI does. With `SHADOW_DATABASE_URL` set (see [Running Migrations](DEVELOPMENT.md#running-migrations)), this fails on any difference:

  ```bash
  npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code
  ```

- Describe the migration in `backend/DATABASE_MIGRATIONS.md`, including that going back means restoring a backup, and add the value to the enum table in `backend/prisma/README.md`.
- Say under the changelog's **Upgrading** heading that there is a database change, made by itself on the first start.

---

## Step 2: Backend character type (from the schema)

There is no separate backend type to write. The Zod schema you write in Step 4 decides what a sheet holds, and the backend takes its TypeScript type from it (`export type MySystemCharacterData = z.infer<typeof mySystemCharacterDataSchema>`), so the two cannot drift. Keep required fields minimal there; everything else optional.

---

## Step 3: Backend enum (nothing to edit)

`backend/src/game-systems/index.ts` re-exports Prisma's `GameSystem`, so the value you added in Step 1 reaches every backend file through `prisma generate`. `backend/src/__tests__/keepInStep.test.ts` checks that the frontend enum (Step 7) names the same values, in the same order.

---

## Step 4: Zod schema

Create `backend/src/validators/game-systems/mySystem.schema.ts`. This is the **real enforcement point**: it runs on every save.

```typescript
// backend/src/validators/game-systems/mySystem.schema.ts
import { z } from 'zod';
import { themeColorSchema } from './sheetChrome';
import { sheetList } from './sheetLists';
import {
  sheetCharacterNameSchema,
  sheetShortTextSchema as shortText,
  sheetLongTextSchema as longText,
} from './sheetText';

const mySystemSkillSchema = z.object({
  name: shortText.min(1),
  value: z.number().min(0).max(100).optional(),
  proficient: z.boolean().optional(),
});

export const mySystemCharacterDataSchema = z.object({
  themeColor: themeColorSchema,
  characterName: sheetCharacterNameSchema,
  playerName: shortText.optional(),

  stats: z.object({
    strength: z.number().int().optional(),
    dexterity: z.number().int().optional(),
  }).optional(),

  hp: z.object({
    current: z.number().int().optional(),
    maximum: z.number().int().min(0).optional(),
    temporary: z.number().int().min(0).optional(),
  }).optional(),

  skills: sheetList(mySystemSkillSchema).optional(),
  notes: longText.optional(),
});

export type MySystemCharacterData = z.infer<typeof mySystemCharacterDataSchema>;
```

> Every text field needs a length limit, from `sheetText.ts`: `sheetCharacterNameSchema` for the character's own name, `shortText` for a one-line box, `longText` for anything that holds paragraphs. Every list needs a count limit too: build it with `sheetList(entry)` from `sheetLists.ts`. `sheetTextLimits.test.ts` fails on a string without a limit, and `listLimits.test.ts` on a list without a maximum, in each schema in the list at the top of the file: add your schema to both lists, or neither checks it. In the editor, turn the list's add button off at the limit with `listIsFull` and `ListLimitNote` from `components/character-sheets/ListLimitNote.tsx`.
>
> Every system's schema starts with `themeColor: themeColorSchema` from `sheetChrome.ts`. The header colour the editor saves is not a game-system field, and the routes store the parsed sheet, so a key no schema declares does not survive a save.
>
> Match the permissiveness of the existing schemas. Look at `shadowrun6e.schema.ts` before finalizing: the shipped schemas are lenient on purpose, so partial and in-progress sheets save cleanly.
>
> Keep the schema's top-level keys indented two spaces, and close the object with `});` on a line of its own: `templateSchemaParity.test.ts` (Step 6) reads the keys from the source.

---

## Step 5: Validator index

Four edits in `backend/src/validators/game-systems/index.ts`:

1. Import the schema and its type, and re-export both alongside the others.
2. Add a case to `validateCharacterData()`. It has a `default` branch, so the compiler does not notice a missing case: every save of the system is then refused as `Unknown game system`.
3. Add `MySystemCharacterData` to the union in the return type of `validateCharacterData`, and to the one `getBlankCharacterTemplate` returns. The case does not compile until the first is there.
4. Add your system to `SHEET_NAME_FIELD`, naming the sheet field that holds the character's name (`characterName` here, `investigatorName` in Call of Cthulhu). Creating a character writes its name into that field, and saving the sheet copies the field back to the character's name. The build fails until it is there.

```typescript
import { mySystemCharacterDataSchema, type MySystemCharacterData } from './mySystem.schema';

// 1. re-export it alongside the others
export { /* …, */ mySystemCharacterDataSchema };
export type { /* …, */ MySystemCharacterData };

// 2. a case in validateCharacterData()
case GameSystem.MY_SYSTEM: {
  const validated = mySystemCharacterDataSchema.parse(data);
  return { success: true, data: validated };
}

// 4. an entry in SHEET_NAME_FIELD
[GameSystem.MY_SYSTEM]: 'characterName',
```

`getBlankCharacterTemplate`, which the tests build their sheets on, then returns your system's `blank` starter sheet (Step 6) parsed by the schema, and throws if that sheet does not pass it. So the tests use the sheet players actually start from.

---

## Step 6: Character templates

> **Two different things are called "templates".** This step is about the
> **hardcoded starter presets** compiled into the backend and served by
> `GET /api/characters/templates/:system/:name`. Separately, users publish
> **character templates** stored in the database (`CharacterTemplate`,
> `/api/character-templates`), browsable from the dashboard.
>
> Your system gets the user-published kind with no extra wiring once Steps 7
> to 10 are done: that feature stores the same `data` blob a character does
> and edits it through `CharacterSheetRouter`, provided your sheet passes
> `allowTokenPicture` on to its editor (Step 9). What it needs from this step
> is the blank template: publishing a template starts from
> `GET /api/characters/templates/<system>/blank`, so a system whose blank is
> missing or invalid cannot have templates created for it.

> **A template may only write fields the schema declares.** Every one of the
> original four had drifted: they seeded fields no reader knew about, so the
> data was stored and never shown. A D&D 5e Fighter's Features tab was blank
> while "Second Wind" sat in the character's own row. The routes now store the
> schema's parsed sheet, and Zod drops a key the schema does not declare
> without complaint, so such a field is lost on the first save, silently. That
> is also why validating a template proves it is acceptable, not that it is
> complete.
>
> `templateSchemaParity.test.ts` compares each template's top-level keys
> against its schema and fails on any extra. It checks the systems in its
> `SYSTEMS` list, so add yours there, with the schema file and the text that
> opens the schema (`mySystemCharacterDataSchema = z.object({`). Run the suite
> after editing a template.

> **Spell a value the way the editor offers it.** A schema that takes any
> string accepts "str" as readily as "strength", but the editor compares with
> the values its own dropdowns hold. The Pathfinder 2e templates abbreviated
> every attribute, so the editor found no modifier for them and the Level 1
> Fighter's Athletics was saved as +3 where the sheet said +6. The same test
> file now checks that each Pathfinder 2e template names attributes,
> traditions and casting types as the editor does, and that its stored skill
> totals are the ones its own components give. The editor also accepts the
> short forms on load, through `pf2eAttributeName` in `rules/pathfinder2e.ts`,
> so sheets made before the templates were corrected recover.

The template layer powers the "start from a preset" picker and the template API. Create `backend/src/utils/character-templates/mySystem-templates.ts` exporting **named `CharacterTemplate`s** plus two getter functions:

```typescript
// backend/src/utils/character-templates/mySystem-templates.ts
import { GameSystem } from '@prisma/client';
import type { CharacterTemplate } from './types';

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

`CharacterTemplate`, in `types.ts` beside the template files, is `{ name, description, gameSystem, data }`. Then wire the templates in:

1. Import `getMySystemTemplate` into `backend/src/utils/character-templates/index.ts` and add a `case GameSystem.MY_SYSTEM:` to **`getCharacterTemplate`**. Its `default` throws, so the compiler does not remind you: without the case `GET /api/characters/templates/MY_SYSTEM/blank` answers 500, and neither a character nor a template of the system can be created.
2. Add `getMySystemTemplates` to the map in `backend/src/__tests__/helpers/builtInTemplates.ts`, which the template tests check every template from. The type check fails until it is there.
3. List the presets in New Character: add an entry to `TEMPLATE_OPTIONS_BY_SYSTEM` in `frontend/src/components/character/NewCharacterModal.tsx`, one `{ value, label, description }` per template, each `value` a name `getMySystemTemplate` matches (`blank`, `example`). Without it the dialog offers no presets and always starts from the blank sheet.

---

## Step 7: Frontend enum and character type

The frontend keeps its own copy of the types: its image is built from `frontend/` alone, so it cannot import the backend's. Tests keep the copies in step.

1. **Enum.** Add your value to the `GameSystem` enum in `frontend/src/types/gameSystem.ts`, the frontend's one copy (`types/index.ts` and `types/game-systems/index.ts` re-export it). It must name exactly the values in `schema.prisma`, in the same order; `keepInStep.test.ts` fails otherwise:

   ```typescript
   export enum GameSystem {
     DND_5E = 'DND_5E',
     PATHFINDER_2E = 'PATHFINDER_2E',
     SHADOWRUN_6E = 'SHADOWRUN_6E',
     CALL_OF_CTHULHU_7E = 'CALL_OF_CTHULHU_7E',
     MY_SYSTEM = 'MY_SYSTEM',        // ← add
   }
   ```

2. **Character type.** Create `frontend/src/types/game-systems/mySystem.ts` describing what the system's Zod schema accepts, and have the sheet interface extend `SheetChrome`. A field the schema lets be absent, or fills in by default, is optional in the type: the server sends a sheet as it was stored, so a sheet saved before the field existed arrives without it.

3. **Register the type.** In `frontend/src/types/game-systems/index.ts`, add `export * from './mySystem'`, and add the type to `CharacterDataBySystem` and `GameSystemCharacterData`. Add it also to the `CharacterData` union in `frontend/src/types/index.ts`, which `Character.data` and every sheet's `onSave` use: an editor that passes its form to `onSave` does not compile until it is there.

4. **Pair it with the schema.** Add the pair to the list in `describe('the character sheets, as the schemas take them and the frontend types describe them')` in `backend/src/__tests__/keepInStep.test.ts`, which compares the type with the schema field by field and fails on any difference in names, optionality, `null` or values. Inside a union it compares each object member field by field too; when a union has several objects, give them a field holding a different string in each (the Flexible sections' `type`), which the check pairs them by. A field the schema runs through `z.preprocess` takes anything, so it is not compared.

---

## Step 8: Frontend labels and colours

Edit `frontend/src/constants/game-systems.ts` and add your system to **five** places: three labels, the tint its badge is drawn in, and `GAME_SYSTEM_OPTIONS`, which is what makes the system **selectable**: in New Campaign, New Character and New Template, and in the Character Templates page's filter.

```typescript
export const GAME_SYSTEM_LABELS: Record<GameSystem, string> = {
  // …
  [GameSystem.MY_SYSTEM]: 'My System (Full Name)',
};

export const GAME_SYSTEM_SHORT_LABELS: Record<GameSystem, string> = {
  // …
  [GameSystem.MY_SYSTEM]: 'MySys',
};

export const GAME_SYSTEM_TINTS: Record<GameSystem, { bg: string; text: string; border: string }> = {
  // …
  [GameSystem.MY_SYSTEM]: { bg: 'bg-warning/10', text: 'text-warning-ink', border: 'border-warning/30' },
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

> The four `Record<GameSystem, …>` maps are exhaustive, so TypeScript forces you to add them. `GAME_SYSTEM_OPTIONS` is a plain array: nothing forces you to add it, so **this is the step that's easy to forget.** If your system doesn't appear in the dropdown, this is why (see the commented-out Shadowrun 6e entry).

The game system badge (`components/common/GameSystemBadge.tsx`) and the roster read the short label and the tint from here. Give the system a tint no other system uses: the four so far use `danger`, `info`, `spirit` and `success`.

---

## Step 9: Character sheet component

The router (Step 10) imports one file per system, `…/{system}/{System}CharacterSheet.tsx`, for the Character Editor page and the template editor. The sheet window opened at the table and on the Characters page imports the view and the editor directly (also Step 10). The sheet component receives `CharacterSheetProps`:

```typescript
// frontend/src/components/character-sheets/types.ts
export interface CharacterSheetProps {
  character: Character;                 // includes character.data (the JSON blob) and character.gameSystem
  mode: 'view' | 'edit';
  onSave?: (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => Promise<void>;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;   // fired on first edit and after each save
  onEditStart?: () => void;                   // call each time the editor opens
  allowTokenPicture?: boolean;                // false for a template's sheet: offer no picture upload
}
```

**Minimal (single file).** The smallest valid sheet is one component implementing `CharacterSheetProps` (this is the Shadowrun 6e shape). Fine for a placeholder.

**Recommended (the D&D 5e, Pathfinder 2e and Call of Cthulhu 7e pattern).** Split responsibilities so view and edit stay manageable:

```
frontend/src/components/character-sheets/mySystem/
  MySystemCharacterSheet.tsx    ← the file the router imports; switches on mode
  MySystemCharacterView.tsx     ← read-only display; props: { character, onEdit, onRoll, rollMode }
  MySystemCharacterEditor.tsx   ← the form; props: { character, onSave, onCancel, onDirtyChange, onDone, allowTokenPicture }
  components/                   ← reusable sub-sections (stat block, skills, etc.)
```

The `…CharacterSheet.tsx` mode switcher looks like this (taken from D&D 5e's):

```tsx
// MySystemCharacterSheet.tsx
import React, { useEffect, useEffectEvent, useState } from 'react';
import { CharacterSheetProps } from '../types';
import type { CharacterData } from '../../../types';
import { MySystemCharacterView } from './MySystemCharacterView';
import { MySystemCharacterEditor } from './MySystemCharacterEditor';

export const MySystemCharacterSheet: React.FC<CharacterSheetProps> = (props) => {
  const { mode, character, onSave, onDirtyChange, onEditStart, allowTokenPicture } = props;
  const [currentMode, setCurrentMode] = useState<'view' | 'edit'>(mode);

  // The host takes the character passed now as the version the edit starts from.
  const editStarted = useEffectEvent(() => onEditStart?.());
  useEffect(() => {
    if (currentMode === 'edit') editStarted();
  }, [currentMode]);

  const handleSave = async (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => {
    if (onSave) await onSave(data, showToast, tokenImageUrl);
  };

  if (currentMode === 'edit') {
    return (
      <MySystemCharacterEditor
        character={character}
        onSave={handleSave}
        onCancel={() => { onDirtyChange?.(false); setCurrentMode('view'); }}
        onDirtyChange={onDirtyChange}
        onDone={() => setCurrentMode('view')}
        allowTokenPicture={allowTokenPicture}
      />
    );
  }
  return <MySystemCharacterView character={character} onEdit={() => setCurrentMode('edit')} />;
};

export default MySystemCharacterSheet;
```

Import `CharacterData` from the app's types, as here. Without the import the name is the browser's own `CharacterData` interface, and the build fails where it meets `onSave`.

**Rolling from the view.** The sheet window passes the view an `onRoll` (a `SheetRollHandler`, from `components/character-sheets/useSheetRolls.tsx`) when the person looking may roll, and a `rollMode` when the system has one (Step 11). With them, `useSheetRolls(onRoll, character.gameSystem, rollMode)` gives `rollTest` for d20 tests, `roll` for anything rolled as written, `rootProps` to spread on the sheet's root and a `menu` to render. Spread `rollTarget(expression, purpose, gameSystem)` on each element that rolls a d20 test, which gives it the right-click and press-and-hold roll menu, and `sheetRoll` on anything else that rolls (a damage roll, a percentile skill), so the roll's feedback pulses what was pressed. Call of Cthulhu's view, which has no roll menu, calls `onRoll` directly and marks each roll with `sheetRoll`.

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

**The editor must write only what the schema declares, in the shape it
declares.** The server stores the schema's parsed sheet, so a key the editor
writes and the schema does not declare is dropped on save with no error, and an
entry missing a field the schema requires makes every save fail. Both have
happened: Pathfinder 2e feat descriptions were dropped, and adding a cantrip
blocked saving. Type each entry an editor creates with the sheet's interface
from `frontend/src/types/game-systems/`, which follows the schema, so a missing
field fails to compile, and give a field the editor writes a declaration in the
schema before anything else. A text box the player can clear writes an empty
string, so its field must accept one. `editorShapes.test.ts`, beside the
schemas, parses a sheet holding everything each editor writes and fails when
the schema refuses or drops any of it; add to it when an editor gains a
field.

**Derive what the sheet can work out; store what it cannot.** The 5e sheet's own
skills (`customSkills`) record a name, an ability and a proficiency level, and
nothing else — the bonus comes from `dnd5eCustomSkillBonus`, so it follows the
character's ability scores and level instead of going stale the way a stored
`passivePerception` did. The `otherBonus` field is the escape hatch for what the
rules cannot derive, matching initiative and passive Perception. Storing a total
here would have reintroduced exactly the drift those two were fixed for.
A number nobody adjusts need not be stored at all: the 5e view works carrying
capacity out from Strength (`carryingCapacity`: the score times 15, and twice
that to push, drag or lift) each time it draws. The proficiency bonus stays a
stored box, since a table may use another, and the editor moves it with
**Level** when it was the old level's bonus, offering the level's beside one
set otherwise.

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

- Inputs: the shared `input-cozy` class, or the `<Input>` / `<Field>` components in `frontend/src/components/ui/`, which carry it. The sheets written so far draw their own boxes from theme tokens instead (`border border-ink/20 rounded-sm focus:ring-2 focus:ring-brand`); either is fine. Size a box's text for the desktop and leave the touch screen to `index.css`: where the pointer is coarse it draws every text box, dropdown and text area at 16 px or more, and a larger one at its own size, so Safari on an iPhone or an iPad does not zoom the page when one is tapped. `text-xs` and `text-sm` are covered; a size in pixels below 16 (`text-[11px]`) must be one the rule there names, and `touchFormControls.test.ts` fails until it is. Write a text size in px or rem: the test also fails on one it cannot read (in em, a percentage, `clamp()` or a variable) and on a font size in a style object, which no stylesheet rule can raise, unless that expression keeps 16 px on a touch screen itself (`Math.max(coarsePointer ? 16 : …, …)`).
- Numbers: `<NumberField>`, so a box can be cleared and retyped. Lists typed as text ("Common, Elven", or one per line): `<ListField>`, which keeps the text as typed while the box is in use. Splitting and joining the text on every keystroke throws away the comma, space or new line typed after a word.
- Buttons: the `<Button>` component (`frontend/src/components/ui/Button.tsx`).
- Tabs: `<SheetTabs>` (`frontend/src/components/character-sheets/SheetTabs.tsx`), given an `id` from `useId()`, the tabs, the open one and the header colour for its underline; spread `sheetTabPanel(id, activeTab)` on the sheet's body, which is the tabs' panel. It is a `tablist` the arrows, Home and End move through (`utils/tabKeys.ts`, shared with the session rail and the Admin Panel). It wraps onto more rows where the tabs do not fit, so every tab stays in reach on a phone and on a tablet held upright; do not write a tab bar of your own, which `sheetTabs.test.tsx` refuses.
- Text/surfaces: theme tokens — `text-ink`, `text-ink-secondary`, `text-ink-muted`, the card `bg-paper`, inset panels a wash of ink (`bg-ink/5`, `bg-ink/10`: darker on a light paper, lighter on a dark one; the `surface` tokens invert on dark themes, so keep them off the card), borders `border-ink/10` and `border-ink/20`, focus rings `ring-brand`. **Do not** hardcode `gray-`/`slate-`/`stone-`/`sepia-` colors or a fixed hex — those break the non-default themes. This holds for every sheet, Call of Cthulhu's included, and `themeTokens.test.ts` checks it.
- Colour that means something takes its token: `danger` (hit points, damage, errors, remove), `spirit` (sanity, magic), `info`, `success`, `warning`. Text on the page uses the `-ink` variant (`text-danger-ink`), never the fill token. A panel or chip with text in it is a tint, `bg-danger/10 text-danger-ink`, with `border border-danger/30` where it needs an edge: white text fails on most of the state fills in some theme. A solid token fill is for things with no text on them, such as a bar; the one solid fill that carries text is the accent with its own label colour, `bg-accent text-accent-text`. A checkbox takes its colour from `accent-danger` and the like, not from a text colour.
- A system's own colour (D&D's red, Pathfinder's blue) is not a meaning: its buttons are `<Button>`, a selected toggle `bg-accent text-accent-text`.
- The header is the one exception: its colour is the player's (`colorPresets.ts`, or a custom hex), so its classes and the text on it do not follow the theme. Write every preset class out in full; Tailwind generates only class names it finds whole, and the test refuses one joined at runtime.
- On a phone the sheet is drawn across the whole screen, about 330 px wide on a 360 px phone, and the sheet's own layout decides whether it fits. Write the narrow layout first and the desktop's behind `sm:`, so a computer sees exactly what it did:
  - A button in the header's corner (the read-only sheet's **Edit**) is in the flow below `sm` (`ml-auto mb-3 w-fit sm:absolute sm:top-4 sm:right-4`), and the row it would cover pads clear of it from `sm` only (`sm:pr-24`).
  - A block beside the name (experience, hero points, the player) goes under it: `flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-0`. An editor's portrait goes above the name too, at 96 px (`w-24 h-24 sm:w-40 sm:h-40`, on a holder of the same width), with its caption in the flow under it (`mt-1 sm:absolute sm:top-full sm:whitespace-nowrap`).
  - A line of details wraps: `flex flex-wrap gap-x-4`. Do not space a row that may wrap with `space-x-*`, which leaves wrapped rows with no gap between them.
  - The header and the body pad `p-3 sm:p-6`, and anything between them or under the body lines up with it (`mx-3 sm:mx-6`). Give the header `data-sheet-header` and the body `data-sheet-body`, which the tests find them by.
  - What follows changes only what a phone sees. A row that wraps on a phone keeps to one line from `sm` up, as it did before (`flex flex-wrap … sm:flex-nowrap`); only a row that ran out of its column at every width wraps everywhere, such as a level's spell slot marks on the D&D 5e sheet.
  - A grid of three or more columns gets fewer on a phone, behind the desktop's count: `grid-cols-1 sm:grid-cols-3` where a cell holds text or a label and its box, `grid-cols-2 sm:grid-cols-3` or `grid-cols-3 sm:grid-cols-5` where it holds a number. So does a grid of two whose cells hold a label beside a box (the saving throws, `grid-cols-1 sm:grid-cols-2`). A grid of three short numbers that fits (hit points' **Maximum**, **Current** and **Temporary**) stays as it is.
  - A grid with a column template of its own (`grid-cols-[…]`) has a phone template too, and a cell that does not fit goes onto a line of its own (`col-span-5 sm:col-span-1`). Write the class list once, in a constant, when a row of labels sits over the rows, so the two line up at every width.
  - A box with `flex-1` in a row takes `min-w-0`, so it shrinks beside the row's buttons and leaves them in reach. A row of more boxes than fit wraps (`flex flex-wrap gap-2 sm:flex-nowrap`), with the box that names the row on a line of its own (`basis-full sm:basis-0`) or filling the first line beside a small box (`basis-[calc(100%-4.25rem)] sm:basis-0`), and a box that matters less moved after the rest onto a line of its own (`order-last w-full sm:order-none sm:w-40`). A heading with an **Add** button beside it wraps too (`flex flex-wrap items-center justify-between gap-2`).
  - A box keeps its own width from `sm` up: add the phone's classes in front of it and leave its own where they are (`min-w-0 flex-1 sm:flex-initial w-28`). A label beside a box takes only its own width below `sm` (`sm:w-24`), so the box keeps the rest.
  - A row that needs two lines on a phone with its name and total on the first can be a grid below `sm` and its old row from `sm` up: `grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:justify-between`, the box around the middle parts `contents sm:flex`, and the total `col-start-2 row-start-1 justify-self-end` (the Pathfinder 2e saves).
  - A button that removes a row (**×**) takes `touch-target inline-flex items-center justify-center`, 44 by 44 px where the pointer is coarse, and the row or the grid column it sits in leaves room for it there.
  - The sheet has no scroller of its own below `sm`: the shell scrolls the sheet, and a box sized from the screen's height (`max-h-[calc(100vh-200px)] overflow-y-auto`) inside it is a second scroller, sized from a `100vh` taller than what a phone's browser shows. Put it behind `sm:` (`sm:max-h-[…] sm:overflow-y-auto`).
  - A control or a mark that shows only while the pointer is over its row (`opacity-0 group-hover:opacity-100`, or `group-hover:opacity-60` for the dice icon beside a stat that rolls) shows where nothing can hover too (`[@media(hover:none)]:opacity-100`, `…:opacity-60`): a finger never brings it up. `rollIconsByTouch.test.tsx` refuses one without it, except the editors' portrait upload hint, which would hide the picture.
  - An entry the player drags into a new place is a `DragEntry` (`frontend/src/components/character-sheets/flexible/components/DragEntry.tsx`), which a finger drags by its grip and a mouse from anywhere but a text box. A `Reorder.Item` on its own drags from anywhere, by touch too, so a swipe that starts on it moves it and the page does not scroll.
  - `smallScreenClasses.test.ts` (in `frontend/src/components/character-sheets/__tests__/`) reads every sheet file and the two shells, and refuses two of the layouts above: a grid of four or more columns on a phone, counting a column template's tracks, whatever its `sm:` form says (a layout that keeps four or more there on purpose, such as the D&D 5e hit dice rows, is listed by name in the test with the reason it fits); and a height taken from the screen (`vh`, `h-screen`) without `sm:` or a wider prefix. Grids of two and three columns are left to the screenshots, since some fit a phone as they are.

The editor calls `onSave(data, showToast?, tokenImageUrl?)`, and the host saves: the Character Editor page, the editor window opened over a sheet at the table or on the Characters page, or the template editor. Register the editor with all of them in Step 10; nothing else needs wiring.

**Leave edit mode through `onDone`, not when `onSave` returns.** Every field stays editable while a save is in flight, so something may have been typed in the meantime. When the save resolves, the editor compares its form with what it sent: if they match it reports `onDirtyChange(false)` and calls `onDone`, and the sheet goes back to the view; if not, it reports `onDirtyChange(true)` and stays open with the newer text. A rejected `onSave` leaves the editor as it was, so throw from it whenever nothing was saved. The existing editors' `handleSubmit` shows the pattern.

**Call `onEditStart` each time the editor opens.** A save the server refuses because the character changed since the editor opened (409) is handled by the host, which carries the user's changes onto the newest version and asks before saving. It measures those changes from the character it passed when the edit started, which is how it knows.

---

## Step 10: Register the sheet

A sheet is opened in three places, and each names every system. None fails to compile without yours: each falls back to the Flexible sheet.

1. **The router**, `frontend/src/components/character-sheets/CharacterSheetRouter.tsx`, used by the Character Editor page and the template editor. Add a lazy import and a `case`:

   ```tsx
   const MySystemSheet = lazy(() => import('./mySystem/MySystemCharacterSheet'));

   // inside the switch on character.gameSystem:
   case GameSystem.MY_SYSTEM:
     return <MySystemSheet {...props} />;
   ```

2. **The sheet window**, `frontend/src/components/character/CharacterSheetViewerModal.tsx`, which opens a sheet from the roster, the initiative tracker, the map and the Characters page. Import `MySystemCharacterView` and add a case to `renderCharacterSheet`, passing `character`, `onEdit={canEdit ? handleEdit : undefined}` and `onRoll={rollHandler}`, and `rollMode={rollMode}` if your system has a roll mode (Step 11).
3. **The editor window**, `frontend/src/components/character/CharacterSheetEditorModal.tsx`, which **Edit** in the sheet window opens. Import `MySystemCharacterEditor` and add a case to `renderCharacterEditor`, passing `character`, `onSave={handleSave}`, `onCancel={handleCancel}`, `onDirtyChange={setHasUnsavedChanges}` and `onDone={onClose}`.

The `default`, `null` and `undefined` cases fall through to the Flexible sheet, the section-based one, so a character with no matching case still opens, as an empty Flexible sheet. Add all three cases so yours renders.

---

## Step 11: Rolls, initiative and hit points

A system without these still works: the character roll picker lists nothing for its characters, they roll a flat `1d20` for initiative, and they show no hit points. Each is one more `case`, in a file that falls back without an error.

**Rules both projects need go in a module of their own.** A derived total or an initiative bonus that the server and the page both work out goes in `utils/rules/mySystem.ts`, written once and copied byte for byte to both `backend/src/utils/rules/` and `frontend/src/utils/rules/`: the two projects share no package. Add a parity test for it beside the others in `backend/src/utils/rules/__tests__/dnd5e.test.ts`, which reads both files and fails on any difference. The files below marked "two copies" follow the same rule: edit both the same way.

- **Rolls from the character.** Add a case to `getCharacterRolls` in `frontend/src/utils/characterRolls.ts`, returning what the character can roll. It fills the character roll picker, opened from the character's token, roster entry or initiative entry; without a case the picker lists nothing.
- **Roll mode.** If the system rolls a d20 twice for advantage, add it to `systemSupportsAdvantage` in `frontend/src/utils/rollModes.ts`, and to `MODE_LABELS` if it names the modes differently (Pathfinder 2e's **Fortune** and **Misfortune**). These decide whether a sheet shows **Roll mode** and a roll menu, and what the roll pickers offer, for characters and creatures alike.
- **Initiative.** Add a case to `resolveCharacterInitiative` in `utils/rules/initiative.ts` (two copies), returning `{ kind: 'roll', expression, label }` or `{ kind: 'fixed', value, label }` worked out from the sheet ([Initiative](#initiative--not-every-system-rolls) explains when a system does not roll). The server rolls what it returns; without a case the system's characters roll `1d20`.
- **Hit points.** If the sheet keeps hit points:
  - Add a case to `extractCharacterHp` in `utils/characterHp.ts` (two copies, in `backend/src/utils/` and `frontend/src/utils/`, compared by `backend/src/utils/__tests__/characterHp.test.ts`), naming where the sheet keeps its maximum, current and temporary hit points. It feeds the roster cards, the HP bars on tokens and the `character.hp.updated` event.
  - Add a case to `applyHpDelta` in `backend/src/websocket/handlers/characters.ts`, which applies the roster's damage and healing. Its `default` refuses them.
  - If the rules give temporary hit points, add the system to `SYSTEMS_WITH_TEMPORARY_HIT_POINTS` in `utils/rules/hitPoints.ts` (two copies), and check that `takeTemporaryHp`, beside `applyHpDelta`, reads them where your sheet keeps them: it reads `hp.temporary`, D&D 5e's place. Without the entry **Temporary HP...** is not offered and the server refuses it.

  A sheet that keeps `hp` as D&D 5e does (`{ current, maximum, temporary }`, as in the Step 4 example) can share D&D 5e's case in each of these.

---

## Step 12: Creature support (optional)

Skip this and your system's creatures are handled as D&D 5e's: the generic stat block viewer, but D&D 5e's editor (Challenge Rating, ability scores, and saves and skills worked out from them) in the token editor and the Creature Library, D&D 5e rolls in the NPC roll picker, a flat d20 for initiative and D&D 5e's cone. For a system that is not d20-based, do at least item 1, so the picker offers its custom roll input in place of d20 rolls. Add the rest when your system's creatures need a shape the shared `NpcStatBlock` does not already express, or when their rolls can be modelled.

First decide the question from
[Creature and NPC stat blocks](#creature-and-npc-stat-blocks): **are your
system's creature numbers derived from something, or printed as final values?**
Answer that from the rulebook before writing code: deriving values a system
does not derive fabricates numbers that look authoritative.

1. **Roll building.** Add a `case` to `buildNpcRolls` (`frontend/src/utils/npcRolls.ts`). Its `default` is D&D 5e, so a system without a d20-equivalent structure needs a case of its own returning `EMPTY_ROLLS`, as Call of Cthulhu has; the picker then falls through to a custom roll. `systemSupportsNpcRolls` beside it is read only by its test: keep it in step.
2. **Stat block renderer.** Add a `case` to `StatBlockViewer.tsx` pointing at a component beside `Dnd5eStatBlock.tsx`. `GenericStatBlock.tsx` is the fallback and is often good enough.
3. **Editor branches.** If creatures need different fields (a Level in place of a Challenge Rating, modifiers in place of scores), branch on the game system in `StatBlockEditor.tsx`, the token editor's, and in `CreatureForm` in `CreatureLibrary.tsx`, the Creature Library's own form. Both test `isPf2e` today, so every other system gets D&D 5e's fields. Add new fields to `NpcStatBlock` as **optional**, and to `backend/src/validators/statBlock.ts`; never repurpose an existing field, since a campaign can switch systems and the data has to survive.
4. **Proficiency editor.** If saves and skills are derived, model it on `ProficiencyEditor.tsx`. If they are printed, model it on `Pf2eProficiencyEditor.tsx`, which computes nothing on purpose.
5. **Roll mode labels.** The entries in `utils/rollModes.ts` from [Step 11](#step-11-rolls-initiative-and-hit-points) serve the creature pickers too.
6. **Initiative.** `resolveStatBlockInitiative` in `utils/rules/initiative.ts` (two copies) derives a creature's initiative for D&D 5e only; any other creature rolls a flat d20. Extend it if your stat blocks hold what initiative is worked out from.
7. **Conditions.** To list the system's conditions in the token editor, add a case to `conditionsOffered` (and to `effectsOffered`, if the system has effects) in `frontend/src/utils/conditions.ts`, with a two-letter code for each in `CONDITION_ABBREVIATIONS`, and add the list to the names `utils/__tests__/conditions.test.ts` checks the codes against. Without it the DM types each condition by hand.
8. **Area templates.** A cone is drawn Pathfinder 2e's way in a Pathfinder campaign and D&D 5e's in every other (`coneRule` in `MapCanvas.tsx`). Add your system there if its cones differ.

Bounds live in `backend/src/validators/statBlock.ts`. `MIN_STORED_BONUS` /
`MAX_STORED_BONUS` are deliberately wide (±50) because they cover every system
at once — PF2e modifiers pass +33 at high level, so a bound fitted to D&D 5e
would reject legitimate creatures. It is a backstop against absurd data, not a
rules check; per-system sanity belongs in the editor.

---

## Step 13: Documentation

A system is a feature self-hosters choose by name, so these change with it, in the same pull request:

- **This guide:** the count of systems in the first paragraph, and the system in the per-system tables (initiative, hit points). `backend/src/__tests__/documentedFacts.test.ts` fails until the count matches `GAME_SYSTEM_OPTIONS`.
- **`README.md`:** the **Character Sheets** list and the **Game Systems** table.
- **`docs/USER_GUIDE.md`:** a section under **Character Sheets by Game System**. **`docs/PLAYER_GUIDE.md`:** the systems table under **Step 1: Start a New Character**, and the table under **Rolling Your Own Initiative**.
- **`CHANGELOG.md`:** an **Added** entry, and the database change under **Upgrading** (Step 1). **`docs/api-changes/unreleased.md`:** the new value, which a script can now send and receive as a `gameSystem`.
- **`backend/docs/API_DOCUMENTATION.yaml`:** every place it lists the game systems (search it for `CALL_OF_CTHULHU_7E`), the starter template names, and the per-system sheet limits and name field. `spec-coverage.py` checks routes, not these values, so nothing catches a missed one.
- **`backend/DATABASE_MIGRATIONS.md` and `backend/prisma/README.md`** (Step 1).
- **`backend/src/scripts/validate-characters.ts`:** its help text names the systems `--system` takes.
- Any legal attribution (see [Legal / content note](#legal--content-note)).

---

## Testing

### Backend (automated)

Most backend checks hold a list of the systems they cover, and a system missing from a list is not checked at all. Add yours to each:

- `validators/game-systems/__tests__/sheetTextLimits.test.ts` and `listLimits.test.ts`: your schema in the `it.each` list of each (Step 4).
- `utils/character-templates/__tests__/templateSchemaParity.test.ts`: your system in `SYSTEMS` (Step 6).
- `utils/character-templates/__tests__/templates.test.ts`: a `describe` for your templates, like each system's there, and your templates in the list under `All Templates Cross-Check`.
- `validators/game-systems/__tests__/editorShapes.test.ts`: a `describe` for your editor, holding everything it writes (Step 9).
- `__tests__/keepInStep.test.ts`: your schema and type in the sheet check (Step 7).
- A parity test for each rules module of your own (Step 11).

`__tests__/helpers/builtInTemplates.ts` is the one list the compiler holds you to (Step 6). Put tests of your own schema beside the others in `validators/game-systems/__tests__/`. There is no per-system schema test to copy; `validation.test.ts` shows the pattern:

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

### Frontend (automated)

The tests in `frontend/src/components/character-sheets/__tests__/` hold every sheet to the rules in Step 9.

- These read every sheet file by themselves: `smallScreenClasses.test.ts`, `rollIconsByTouch.test.tsx` and `sheetTabs.test.tsx`, with `utils/__tests__/themeTokens.test.ts` and `styles/__tests__/touchFormControls.test.ts`.
- These check only the sheets they list, so add your view or editor to each: `typingDuringSave.test.tsx`, `characterNameLimit.test.tsx`, `themeColor.test.tsx`, `themeColourKept.test.tsx`, `headerColourDrawn.test.tsx`, `headerTextReadable.test.tsx`, `portraitNotes.test.tsx`, `sheetPaddingSmallScreens.test.tsx`, `sheetHeadersSmallScreens.test.tsx` and `editorButtonNames.test.tsx`; and, for a view with a roll menu, `sheetRollsByTouch.test.tsx` and `sheetRollPopup.test.tsx`.

### All the gates

Then run all of the gates in [DEVELOPMENT.md](DEVELOPMENT.md#everything-before-you-call-something-done), not a subset: the type check, lint, tests and build for the backend and the frontend, and the three documentation checks. The frontend tests run with `npx vitest run`; `npm test` there is watch mode, which waits for a key press and never finishes.

Only the maps typed `Record<GameSystem, …>` fail to compile when a system is missing from them. Everything else falls back to a default, so a missed registration point shows up at run time, which is why the [Full checklist](#full-checklist) and the manual pass below matter.

### Frontend (manual)

1. Create a campaign and a character, picking your system in each dialog (Step 8).
2. Confirm New Character lists your presets, and the blank one loads (Step 6).
3. Fill fields and save; the browser's network tab shows `200` or `201` (the Zod schema accepts real input).
4. Reload; the data is still there.
5. In the campaign, open the sheet from the roster. It shows your view, not a Flexible sheet; a stat rolls and pulses; **Edit** opens your editor (Steps 9 and 10).
6. The roster labels the character with your system's short name and shows its hit points, and its damage and healing buttons work (Steps 8 and 11).
7. Roll initiative for it from the initiative tracker (Step 11).
8. Publish a template from the character, and open it (Step 6).
9. Cycle to the darkest and lightest themes and confirm the sheet has no off-palette boxes.

---

## Full checklist

**Agreed first**
- [ ] The schema change agreed with the maintainer in an issue, and any new npm package

**Backend**
- [ ] `prisma/schema.prisma`: the `GameSystem` value; a migration of one `ALTER TYPE … ADD VALUE`; `prisma generate`; `migrate diff --exit-code` clean
- [ ] `validators/game-systems/mySystem.schema.ts`: the Zod schema, every text field limited and every list a `sheetList`, and the inferred type
- [ ] `validators/game-systems/index.ts`: import and re-export, a case in `validateCharacterData`, the two return-type unions, `SHEET_NAME_FIELD`
- [ ] `utils/character-templates/mySystem-templates.ts`: the templates, `getMySystemTemplates` and `getMySystemTemplate`
- [ ] `utils/character-templates/index.ts`: a case in `getCharacterTemplate`
- [ ] `websocket/handlers/characters.ts`: a case in `applyHpDelta`, and `takeTemporaryHp` reading your sheet's temporary hit points, if it keeps hit points
- [ ] Two copies each, kept identical: `utils/characterHp.ts` (`extractCharacterHp`), `utils/rules/initiative.ts` (`resolveCharacterInitiative`), `utils/rules/hitPoints.ts` (`SYSTEMS_WITH_TEMPORARY_HIT_POINTS`), and any rules module of your own with its parity test
- [ ] Tests: the lists in `sheetTextLimits.test.ts` and `listLimits.test.ts`, `SYSTEMS` in `templateSchemaParity.test.ts`, `templates.test.ts`, `editorShapes.test.ts`, the sheet check in `keepInStep.test.ts`, `__tests__/helpers/builtInTemplates.ts`

**Frontend**
- [ ] `types/gameSystem.ts`: the `GameSystem` value, in the order of `schema.prisma`
- [ ] `types/game-systems/mySystem.ts`: the sheet type, extending `SheetChrome`
- [ ] `types/game-systems/index.ts`: `export *`, `CharacterDataBySystem`, `GameSystemCharacterData`; `types/index.ts`: the `CharacterData` union
- [ ] `constants/game-systems.ts`: `GAME_SYSTEM_LABELS`, `GAME_SYSTEM_SHORT_LABELS`, `GAME_SYSTEM_TINTS`, `GAME_SYSTEM_DESCRIPTIONS`, **and `GAME_SYSTEM_OPTIONS`**
- [ ] `components/character/NewCharacterModal.tsx`: `TEMPLATE_OPTIONS_BY_SYSTEM`
- [ ] `components/character-sheets/mySystem/`: the sheet, view, editor and components; the editor takes `allowTokenPicture`; the view takes `onRoll` and marks what rolls
- [ ] `CharacterSheetRouter.tsx`, `CharacterSheetViewerModal.tsx` and `CharacterSheetEditorModal.tsx`: a case each
- [ ] `utils/characterRolls.ts`: a case in `getCharacterRolls`; `utils/rollModes.ts`: `systemSupportsAdvantage` and `MODE_LABELS`, if the system has advantage
- [ ] Tests: your sheet in the sheet tests that list theirs (see Testing)

**Creatures (optional, see [Step 12](#step-12-creature-support-optional))**
- [ ] Decided from the rulebook whether creature values are **derived** or **printed**
- [ ] `utils/npcRolls.ts`: a `case` in `buildNpcRolls` (its default is D&D 5e; `EMPTY_ROLLS` for a system that is not d20-based)
- [ ] `StatBlockViewer.tsx`: a `case`, or left on `GenericStatBlock`
- [ ] `StatBlockEditor.tsx` and `CreatureLibrary.tsx`: branches for any system-specific fields
- [ ] New `NpcStatBlock` fields added as **optional**, mirrored in `validators/statBlock.ts`
- [ ] `utils/rules/initiative.ts` (two copies): `resolveStatBlockInitiative`, if creature initiative can be worked out
- [ ] `utils/conditions.ts`: `conditionsOffered`, `CONDITION_ABBREVIATIONS` and the lists in its test
- [ ] `MapCanvas.tsx`: `coneRule`, if the system's cones differ

**Docs (see [Step 13](#step-13-documentation))**
- [ ] The count in this guide's first paragraph, and its per-system tables
- [ ] `README.md`: the Character Sheets list and the Game Systems table
- [ ] `docs/USER_GUIDE.md` and `docs/PLAYER_GUIDE.md`
- [ ] `CHANGELOG.md`, with the database change under Upgrading; `docs/api-changes/unreleased.md`
- [ ] `backend/docs/API_DOCUMENTATION.yaml`
- [ ] `backend/DATABASE_MIGRATIONS.md` and `backend/prisma/README.md`
- [ ] The help text in `validate-characters.ts`
- [ ] Any legal attribution added (see below)

**Gates**
- [ ] Every gate in DEVELOPMENT.md passes, and the manual pass is done

Nothing to do in these: `utils/sheetFieldMigrations.ts` moves the fields of sheets written before 1.3.0 and leaves any other system's sheet as it is, and `KEEPER_ONLY_FIELD` in `utils/keeperNotes.ts` needs your system only if it has a field for the DM alone ([Keeper's Notes](#a-field-only-the-dm-sees-keepers-notes)).

---

## Legal / content note

CozyVTT ships **rules-reference scaffolding** (attribute names, skill lists, sheet structure), not publisher rulebooks. When you add a system, keep it that way: include the mechanical framework a player needs to fill in their own character, not copyrighted prose, adventures, stat blocks, or artwork.

If the system you're adding is published under an open license (OGL, ORC, Creative Commons, a fan-content policy, etc.), add the required attribution to `SRD_ATTRIBUTION.md` (or a sibling attribution file) and note the source in your PR. If it isn't openly licensed, restrict your contribution to the generic sheet structure and user-entered data. When in doubt, open an issue before writing code — it's easier to sort licensing up front than to unwind it later.
