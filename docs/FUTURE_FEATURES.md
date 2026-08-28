# Future Features & Backlog

A running list of features, polish, and ideas that have been discussed or scoped but are not yet built. Use this to capture work that's not ready for the current release without losing the idea.

**How to use this doc:**
- New ideas go under **Backlog** with a short description and any relevant context.
- When work begins, move the entry to **In Progress** with a date and short note.
- When shipped, move it to **Shipped** with the version/date for searchability.
- When dropped, move it to **Won't Do** with a one-liner explaining why.
- Keep entries terse — link to a longer plan or PR if more detail is needed.

---

## In Progress

_Nothing in progress._

---

## Backlog

### User-facing

- **Sound effects** — dice-roll and notification audio. Needs: a small library of royalty-free sounds bundled in `frontend/public/sounds/`, a `useSound()` hook, and an opt-in toggle on the profile page. The toggle was removed on 2026-04-27 because no audio existed; restore it together with this feature.
- **Browser notifications** — desktop alerts when it's a player's turn (initiative tracker), or when chat activity happens while the tab is backgrounded. Needs: `Notification.requestPermission()` flow, a per-user opt-in toggle, server-side hooks for turn change + chat broadcast events. Removed alongside sound effects on 2026-04-27.
- **Per-user default dice color** — surface a color in the dice picker so a player's rolls visually stand apart in chat. Needs: pass the color into the dice renderer (`DicePanel`, roll display in chat, socket roll payload metadata), then re-add the color picker on the profile page. Removed on 2026-04-27 pending the renderer wiring.
- **Asset move-between-scopes UI** — the three-scope asset model (GLOBAL / USER / CAMPAIGN) is fully wired in the backend, but there's no UI for moving assets between scopes yet.
- **Bulk character export as a ZIP** — exporting multiple characters currently downloads each one as a separate file. Bundling them into a single ZIP (e.g. via JSZip) would be tidier. See the multi-character export path in `frontend/src/utils/character-export.ts`.
- **Merge the hardcoded starter templates into the character template library** — `backend/src/utils/character-templates/` holds four presets per system as source constants, served by `GET /api/characters/templates/:system/:name`, while user-published templates now live in the database. Two systems for one idea. Folding the presets in as seeded, admin-owned rows would leave one browsable list and one endpoint. Note `getTemplatesForGameSystem`, `getAllTemplates` and `getBlankTemplate` in that directory are already dead code with no callers; `getBlankCharacterTemplate` in `validators/game-systems/index.ts` is the one still in use.
- **Shadowrun 6E character sheet** — the backend (types, validation, templates) is complete, but the frontend sheet is still a placeholder and the system is hidden from the creation dropdown until it's finished. See `docs/GAME_SYSTEMS.md`.
- **NPC chatbot / asset generation (AI)** — No code yet. The `@anthropic-ai/sdk` dependency was removed before v1.0.0 launch (it was installed but unused, and shipping it left an open `npm audit` finding). When this feature work begins, re-add the current major of the SDK and introduce `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` env vars at the same time so they enter the codebase together rather than sitting around as dead config.
- **Admin upload UI for instance branding (logo / favicon / mascot)** — backend already accepts `customLogoUrl` / `customFaviconUrl` / `customMascotUrl` on `SystemSettings`, and `ThemeContext` reads them and dynamically swaps the favicon when set. What's missing is a file-upload form on the Admin → Appearance tab so an instance operator can swap branding at runtime without redeploy. Until then, operators replace the defaults at `frontend/public/default-logo.png` and `frontend/public/default-mascot.png` and rebuild.

### DM tools

- **Wall collision (`wallsBlockMovement`)** — previously implemented and removed due to bugs. If reattempted, start fresh rather than reviving the old code.
- **Auto-detection of walls from map images** — LLM, contour, and trace approaches all failed previously. Treat any future attempt as new R&D, not a continuation.

### Polish / tech debt

- **Saving a flexible character discards every top-level field except
  `sections`.** `FlexibleCharacterSheetEdit.tsx:97` calls
  `onSave({ sections }, ...)`, rebuilding the blob from scratch rather than
  spreading what was loaded — so anything else stored alongside is dropped on
  the next save, silently. Reproduced on a test character: two top-level keys
  before saving, one after. Untouched since v1.1.2, so it predates the 1.2.2
  work; found by round-tripping every system's sheet through save while
  verifying the typing changes. `FlexibleCharacterData` declares only
  `sections`, so nothing the sheet *renders* is lost, which is why it has gone
  unnoticed — but a character imported from elsewhere, or one that gains a
  field later, loses it. The fix is `onSave({ ...data, sections }, ...)`, which
  needs a moment's thought about whether any field is meant to be dropped.


- **Sign-in errors show a status label instead of the helpful sentence.** The
  API answers a failed login with
  `{ error: 'Authentication Failed', message: 'Invalid email or password' }` —
  `error` is the status label, `message` is the text meant for a person. The auth
  pages check `error` first, so that is what the user sees: "Authentication
  Failed" rather than "Invalid email or password". The friendlier 401 and 409
  branches sitting below it in `LoginPage`, `MFAVerifyPage` and `RegisterPage`
  are effectively unreachable for the same reason. Found while converting those
  catch blocks off `any`, and deliberately left alone there — the conversion was
  required to change no behaviour. Fixing it means preferring `message` over
  `error`, which is a one-line change per page plus a decision about whether any
  endpoint relies on `error` carrying something a user should read. Note the 429
  path is fine: the rate limiter replies with a bare string rather than JSON, so
  the status branch handles it and the wording is already correct.


- **Map events still die on a reconnect.** `frontend/src/services/socket.ts` keeps
  a listener registry so subscriptions survive the socket being replaced, and the
  components fixed in 1.2.2 go through it. `MapCanvas.tsx` does not: roughly
  fifteen subscriptions there (walls, fog, lights, spirit layer, map changes,
  pings, token appear/disappear) still bind straight to `socket.getSocket()`, so
  they are lost when the underlying socket is rebuilt and never re-attached. The
  pairs are symmetric, so nothing leaks — the events simply stop arriving until
  the page is reloaded. `token.moved` and the initiative and session listeners
  were converted as they were touched; the rest is a mechanical sweep, changing
  `socketInstance.on(...)` to the typed `socket.onXxx(...)` wrappers and
  `socketInstance.off(...)` to `socket.off(...)`.

- **Advantage on initiative.** Initiative is worked out per system in
  `utils/rules/initiative.ts`, but nothing expresses *advantage* on the roll — a
  Sentinel Shield in D&D 5e, for instance. The dice layer already understands
  `2d20kh1` (the roll pickers use it), so this is a sheet field and a branch in
  the resolver rather than new dice work. Left out of 1.2.2 to keep that change
  to the modifier.

- **Shadowrun 6e initiative base is taken as stored.** The resolver reads
  `derivedStats.initiative.meatspace.base` rather than deriving it from Reaction
  + Intuition, so it shares the "displayed but never calculated" weakness that
  D&D 5e and Pathfinder 2e were just fixed for. Doing it properly means the same
  derive-and-display treatment on the Shadowrun sheet.

- **Call of Cthulhu 7e and Shadowrun 6e creature stat blocks.** Creature rolls are
  now dispatched per game system, and these two deliberately offer nothing rather
  than the wrong dice — a d100 game and a dice-pool game have no d20 rolls,
  ability modifiers or proficiency bonus to compute from. Their NPC tokens fall
  back to the free-form custom roll input, which works but leaves the DM doing
  the arithmetic. Doing this properly means a per-system creature shape:
  characteristics and percentile skill values for CoC, attribute + skill dice
  pools and limits for Shadowrun, plus their own stat block editors and viewers.
  Neither has SRD seed data to test against. See the "Creature and NPC stat
  blocks" section of `docs/GAME_SYSTEMS.md` for where the branch points are.

- **Chat "load more" refetches the same 50 messages.** Two separate faults in one
  path, found while adding roll-history persistence in 1.2.2. The client sends a
  `before` cursor that `GET /:campaignId/messages` never reads, so scrolling back
  returns the newest page every time. And that route applies `take` *before*
  filtering `DICE_ROLL` rows out, so a campaign with a lot of rolls returns fewer
  than `limit` chat messages — occasionally none at all, which looks like empty
  history. Fixing the cursor properly means keyset pagination on `createdAt`;
  fixing the filter means excluding the type in the `where` clause rather than
  afterwards. Neither is urgent while chat fits in one page, and both were left
  alone in 1.2.2 to keep that change to its reported scope.

- **A shared character-sheet header / action bar.** Each per-system editor
  copy-pastes its own header: the Save and Cancel cluster, the palette button,
  the colour dropdown and the name and token fields are duplicated four times
  over, with no shared component between them. 1.2.2 fixed three separate
  duplicate-control bugs that all had the same shape — a page or modal drawing
  Save, Cancel or Edit that the sheet already draws — plus an overlap that had
  to be corrected in three files rather than one. The rule that resolved them is
  worth keeping: **the sheet owns Save, Cancel and Edit; whatever hosts it does
  not repeat them.** Extracting a shared header would make that structural
  instead of a convention, and would stop the next system added from inheriting
  the same layout bugs. `frontend/src/components/character-sheets/types.ts` holds
  the props contract the extraction would build on.

---

## Shipped

- **2026-08-23 — Global asset manager toggle (admin).** Was listed as outstanding long after it shipped; the pill toggle is in the user table on the admin panel, beside the new Templates one.
- **2026-04-26 — Per-user theme preferences.** Theme + font picker moved from admin-only to per-user (profile page). Admin theme becomes the public-page / new-user default. Bug fix: themes now persist across logout/login.
- **2026-04-26 — DM right-click NPC token rolls.** DMs can now right-click an NPC token to roll abilities, saves, skills, attacks, and damage parsed from the stat block. Includes a free-form custom roll fallback for tokens without stat blocks or non-d20 systems. D&D 5e gets full roll math; other systems get the custom roll path.
- **2026-04-26 — Token templates can edit stat blocks.** The Token Templates editor now mounts the full `StatBlockEditor` for NPC-type templates, matching the live token edit panel.
- **2026-04-26 — Number input clipping fixed.** Native browser spinner arrows are hidden via a new `input-cozy-number` utility on AC, ability scores, HP, initiative, save/skill bonuses, and template width/height fields.

---

## Won't Do

_(items intentionally dropped — explain why)_
