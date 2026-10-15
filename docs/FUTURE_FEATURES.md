# Future Features & Backlog

A running list of features, polish, and ideas that have been discussed or scoped but are not yet built. Use this to capture work that's not ready for the current release without losing the idea.

**How to use this doc:**
- New ideas go under **Backlog** with a short description and any relevant context.
- When work begins, move the entry to **In Progress** with a date and short note.
- When shipped, delete the entry. `CHANGELOG.md` is the record of what shipped;
  keeping a second list here only gives the two something to disagree about.
- When dropped, move it to **Won't Do** with a one-liner explaining why.
- Keep entries terse, and link to a longer plan or PR if more detail is needed.

---

## In Progress

_Nothing in progress._

---

## Known issues

Bugs confirmed in a released version and not fixed yet. Each entry starts with the release it is planned for, which can move as work is scheduled. Most are marked in the code with a `TODO(<area>)` comment at the spot. "Suspected" means read from the code and not yet reproduced. Delete an entry when its fix ships, as with the rest of this file.

### Fix first: these lose data

_Nothing at present._

### Character sheets

- `1.5.4` **D&D 5e: naming the spellcasting ability after raising that score leaves the spell save DC and attack unchanged.** The backfill in `DnD5eCharacterEditor.tsx` reads the DC the editor itself wrote as a hand-typed value and records minus the ability modifier as the other bonus.
- `1.5.4` **D&D 5e and Call of Cthulhu read-only headers always use light text,** so a pale custom colour such as white makes the name unreadable (`DnD5eCharacterView.tsx`, `CallOfCthulhu7eCharacterView.tsx`).
- `1.5.4` **The Call of Cthulhu read-only view's palette button changes nothing that lasts.** The colour picked there is never saved (`CallOfCthulhu7eCharacterView.tsx`).
- `1.5.4` **On the Characters page, sheet stats look rollable but roll nothing.** `CharacterSheetViewerModal.tsx` passes a roll handler even when there is no live connection to roll on.
- `1.5.4` **Call of Cthulhu: Firearms, Other Language and Science rows do not roll from the sheet,** and the last two print their language or specialization twice (`components/SkillsList.tsx`).
- `1.5.4` **Pathfinder 2e: a sheet whose AC, Class DC or Spell DC works out under 10 cannot be saved.** `pathfinder2e.schema.ts` requires at least 10 for all three, and an untrained rank with a negative modifier goes below it.
- `1.5.4` **D&D 5e: rows added with "+ Add" block saving until they are named.** Attack, item and spell rows start with an empty name and hit-dice rows with an empty class, which `dnd5e.schema.ts` refuses.
- `1.5.4` **The Call of Cthulhu read-only view shows a stray "0"** when Cthulhu Mythos is 0 and the spell list is empty (`CallOfCthulhu7eCharacterView.tsx`).
- `1.5.4` **Pathfinder 2e: a template feat's text cannot be edited.** The templates write a feat's text to `notes`, which the view shows, while the editor edits only `description`.
- `1.5.4` **Call of Cthulhu: an investigator with POW 100 cannot be saved.** Starting and current Sanity default to POW, and the schema caps Sanity at 99 (`CallOfCthulhu7eCharacterEditor.tsx`).
- `1.5.4` **Pathfinder 2e: bulk typed as a number counts as nothing.** The inventory's Bulk box stores a string, and `calculateTotalBulk` and `BulkTracker` count only numbers and "L".
- `1.5.4` **Call of Cthulhu: clearing a skill's box to retype it sets the skill to 0 first.** The box stores 0 the moment it is empty, the problem the sheets' `NumberField` already solves (`components/SkillsList.tsx`).
- `1.5.4` **A template sheet's token picker uploads a picture the template cannot use.** The upload becomes the user's own asset and a template's picture has to be a global one, so the sheet saves without it and says so, leaving an upload the template never uses (`CharacterTemplateEditorModal.tsx`).

### Tokens

- `1.5.4` **The Token Manager offers Send to Spirit Realm for objects,** which the map's right-click menu keeps on the material plane (`TokenManager.tsx`).
- `1.5.4` **The Token Manager shows a "Player" chip on a token whose controller is no longer a player** (`TokenManager.tsx`).
- `1.5.4` **Edit Token's Controlled By list has no entry for a spectator or former member still named on a token,** yet its hint still says "This player can move the token on the map." (`NpcQuickEditor.tsx`).
- `1.5.4` **Copying a token template to another campaign shows nothing on success and only "Failed to copy template" on refusal** (`TokenTemplateLibrary.tsx`).
- `1.5.4` **A refused Place on Map in the Token Manager says only "Failed to add token to map",** without the server's reason (`TokenManager.tsx`).
- `1.5.4` **Right-click Hide, Obscure and Spirit Realm moves fail silently.** Their errors go only to the browser console (`MapCanvas.tsx`).
- `1.5.4` **The DM's spirit-token toggle reads "Hiding spirit tokens (click to show)" while they are shown** (`MapCanvas.tsx`).
- `1.5.4` **The REST token routes do not broadcast their changes.** Creating, updating or deleting a token through `routes/maps.ts` sends open pages nothing about the token, only the initiative order when there is one. Only a move between maps sends the map, so a change made by an API client stays unseen until the next broadcast or a reload.

### Campaigns and assets

- `1.5.4` **Clearing a campaign's description does not save.** The settings panel sends `undefined` for an empty box, so the server keeps the old text (`CampaignSettingsModal.tsx`).
- `1.5.4` **A DM who is neither the owner nor an admin is offered Delete Campaign,** which the server refuses (`CampaignSettingsModal.tsx`).
- `1.5.4` **A refused asset move shows only "Forbidden".** `AssetDetailPanel.tsx` reads the reply's short `error` label instead of its `message`.
- `1.5.4` **Vibe settings are validated two ways, and the campaign name and description boxes stop short of the server's limits.** `PUT /api/campaigns/:id/vibe` checks with `validateVibeSettings` and `PUT /api/campaigns/:id` with `VibeSettingsSchema`, which disagree; the settings panel caps the name and description at 100 and 1000 characters against the server's 200 and 5000.
- `1.5.4` **The dashboard shows a new invitation only after Refresh.** The page has no socket to hear `invitation.received`, and its query does not refetch on focus (`DashboardPage.tsx`).
- `1.5.4` **An invitation names the campaign's owner as "DM:",** which is wrong after a handover (`routes/invitations.ts`, `DashboardPage.tsx`, `InvitationModal.tsx`).
- `1.5.4` **The asset library offers Delete and Move by a rule of its own.** It offers both only to an asset's uploader or an admin, though the server also lets a campaign's DM do both on the campaign's assets, and refuses a global asset's uploader who no longer has Global Assets (`AssetDetailPanel.tsx`, `AssetCard.tsx`). The asset list already tells the page whether the server will take each change (`canChange`), as the Documents page uses it.
- `1.5.4` **The Creature Library's rows put a button inside a button,** which React warns about in the console and screen readers announce oddly (`CreatureRow` in `CreatureLibrary.tsx`).
- `1.5.4` **Deleting a favourite creature leaves its row under the Creature Library's Favorites** until the library is reopened, whichever list it was deleted from. The delete removes it from the main list only (`CreatureLibrary.tsx`).
- `1.5.4` **The Creature Library and Token Templates forms say only "Failed to create creature" or "Failed to update creature" (or the same for a template) when the server refuses a stat block over 64 KB.** The server's reply says it is too large, and the token quick editor shows that; these two forms do not (`CreatureLibrary.tsx`, `TokenTemplateLibrary.tsx`).
- `1.5.4` **A campaign with more than 50 maps, 200 custom creatures, 500 token templates or 500 pictures and sound files exports but cannot be imported again.** The import refuses the whole archive over those counts, and the export does not check them (`services/campaignExporter.ts`, `validators/campaignImport.ts`).

### Play and connection

- `1.5.4` **A chat message sent while the connection is dropping is lost and stays "sending…".** It is emitted with no acknowledgement, and the server refuses one that arrives before the socket rejoins (`ChatPanel.tsx`).
- `1.5.4` **Initiative rolls vanish from the dice log on reload.** `handlers/initiative.ts` broadcasts the entry but never stores it.
- `1.5.4` **Suspected: a member offline when the DM clears the dice history keeps the old rolls until they reload.** The catch-up in `DiceRoller.tsx` only adds rolls.
- `1.5.4` **A player rolling initiative for their own obscured token sees it logged as "Unknown creature",** unlike a roll from their sheet (`handlers/initiative.ts`).
- `1.5.4` **Starting a session through the API while one is paused leaves the paused one open for good.** `POST /api/campaigns/:id/sessions` refuses only while a session is active, so the paused session never gets an end time. The app offers Start only when no session is running or paused.
- `1.5.4` **Ending a session with `saveState: false` throws away the state saved when it was paused** (`routes/campaigns.ts`).

### Maps

- `1.5.4` **Preview Player View gets stuck if lighting and fog are both turned off while previewing.** The button that ends it only renders while one of them is on (`MapCanvas.tsx`).
- `1.5.4` **The light tool still places, selects and drags lights during a preview,** where the light markers are hidden (`MapCanvas.tsx`).
- `1.5.4` **A player's door toggle made while the DM is moving selected walls is undone for everyone.** The move's preview starts again from the walls as they were when it began, and the drop sends that list, so a change that arrived during the move is lost. Dragging a wall's end keeps the change, but Undo after it puts the old door back (`MapCanvas.tsx`).

### Accounts

_Nothing at present._

### Server and deployment

- `1.5.4` **A restore stopped part-way through unpacking keeps a file handle and the uploaded backup's disk space until the backend restarts,** for example a backup refused for unpacking to more than 10 GiB. Stopping an entry's read part-way leaves the file open (`utils/archive.ts`).

---

## Backlog

### User-facing

- **Sound effects.** Dice-roll and notification audio. Needs: a small library of royalty-free sounds bundled in `frontend/public/sounds/`, a `useSound()` hook, and an opt-in toggle on the profile page. The toggle was removed on 2026-04-27 because no audio existed; restore it together with this feature.
- **Browser notifications.** Desktop alerts when it's a player's turn (initiative tracker), or when chat activity happens while the tab is backgrounded. Needs: `Notification.requestPermission()` flow, a per-user opt-in toggle, server-side hooks for turn change + chat broadcast events. Removed alongside sound effects on 2026-04-27.
- **Per-user default dice color.** Surface a color in the dice picker so a player's rolls visually stand apart in the dice panel. Needs: pass the color into the dice log (`DiceRoller.tsx` and `DiceResult.tsx`) and the socket roll payload metadata, then re-add the color picker on the profile page. Removed on 2026-04-27 pending the renderer wiring.
- **Bulk character export as a ZIP.** The app exports one character at a time, with **Export as JSON** on the Characters page. `downloadMultipleCharactersZIP` in `frontend/src/utils/character-export.ts` was written for a bulk export, but nothing calls it, and it downloads each character as a separate file. Building it needs a way to pick several characters, a fetch of each one's sheet (the Characters page loads only summaries), and a ZIP library such as JSZip, which is a new dependency.
- **Merge the hardcoded starter templates into the character template library.** `backend/src/utils/character-templates/` holds two presets per system, a blank sheet and one example character, as source constants served by `GET /api/characters/templates/:gameSystem/:templateName`, and the New Character dialog lists them a second time (`NewCharacterModal.tsx`), while user-published templates live in the database. Two systems for one idea. Folding the presets in as seeded, admin-owned rows would leave one browsable list and one endpoint. `getTemplatesForGameSystem` and `getAllTemplates` in that directory have no callers, and `getBlankTemplate` there and `getBlankCharacterTemplate` in `validators/game-systems/index.ts` are called only by tests.
- **Shadowrun 6E character sheet.** The backend (types, validation, templates) is complete, but the frontend sheet is still a placeholder and the system is hidden from the creation dropdown until it's finished. See `docs/GAME_SYSTEMS.md`.
- **NPC chatbot / asset generation (AI).** No code yet. The `@anthropic-ai/sdk` dependency was removed before v1.0.0 launch (it was installed but unused, and shipping it left an open `npm audit` finding). When this feature work begins, re-add the current major of the SDK and introduce `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` env vars at the same time so they enter the codebase together and never sit around as dead config.
- **EPUB and other document formats in the library.** #39 asked for "PDF and standard e-reader formats"; the library shipped with PDF, plain text and Markdown, which a browser can show on its own. EPUB cannot: it is a zip of XHTML that needs a reader library (`epub.js` or similar), and every one of them renders the book's own HTML inside an iframe through `blob:` URLs, which means loosening the Content-Security-Policy the whole instance runs under, and trusting a third party to sanitise a file an anonymous user uploaded. That is the one genuinely risky part of the original request, and it is separable, so it waits. **Revisit if** people ask for it with real books in hand; the answer will hinge on finding a reader that renders into a sandboxed frame without `allow-same-origin`, and on measuring what the CSP change exposes.
- **Admin upload UI for instance branding (logo / favicon / mascot).** The backend already accepts `customLogoUrl` / `customFaviconUrl` / `customMascotUrl` on `SystemSettings`, as paths this instance serves, and `ThemeContext` reads them and dynamically swaps the favicon when set. What's missing is a file-upload form on the Admin → Appearance tab so an instance operator can swap branding at runtime without redeploy. Until then, operators replace the defaults at `frontend/public/default-logo.png` and `frontend/public/default-mascot.png` and rebuild.
- **Change your email address from the app.** The server accepts a new address on `PUT /api/users/:id`, with the current password when the change is your own, but no screen sends one, so today an address can only be changed through the API.
- **A per-user storage quota, as an admin setting.** Nothing limits how much one account uploads in total; the upload rate limit slows a script, and the Admin Panel's System Overview warns once the disk holding the uploads is over 80% full. A quota would sum each user's `Asset.fileSize` before accepting an upload, with a limit set in **Admin → Settings**, off by default so no upgrade starts refusing uploads. It needs a column in `SystemSettings` (a migration), the check in the upload, typed-document and UVTT routes and in campaign import, and a clear refusal saying how much space the user has left.
- **Clear a sign-in lock from the Admin Panel (planned for 1.5.4).** Ten wrong passwords in an hour lock an account from every address. The lock lifts by itself once the oldest of them is an hour old, or at once when the password changes. Today an administrator can clear it only by setting a temporary password, which makes someone who simply mistyped choose a new one. A button on **Admin → Users** would show that an account is locked, and until when, and clear the count, with a line in **Admin → Activity**. The count is kept in the backend's memory (`middleware/failureLimiter.ts`), so this needs no database change.
- **Disable an account (after 1.5.3).** An administrator can approve an account but cannot suspend one; the choices today are deleting it, which removes its characters and notes, or resetting its password. A disabled account would keep its data and could not sign in until an administrator enables it again. A password reset would not undo it, and the automatic sign-in lock would stay a separate thing that clears itself. It needs a field on the account (a migration); the check at every way in (password sign-in, the two-factor step, existing sessions, live table connections, password reset and invitations); disabling to end the account's sessions and live connections at once; the rule that keeps an instance from losing its last administrator; a message shown only after the right password, so no one can test which accounts exist; a reset request that answers as usual and sends nothing; a decision about campaigns a disabled account runs as DM; and a line in **Admin → Activity**.

### DM tools

- **Change a member's role from the app.** The spectator role exists, and the server has a route for changing a member's role, but nothing in the app calls it: every invitation makes a player, so the only way to make someone a spectator today is a direct API call. A role picker on the **Members** tab of Campaign Settings would close that gap.
- **Show that a hidden-HP creature is down.** Players are sent a creature's hit points only when its HP bar is on, so a creature at 0 HP with its bar off still looks standing to them and blocks its square. A separate "down" flag the server could send without the numbers would let the body fade and be stood on.
- **DM soundboard (layered audio).** One track plays at a time today: a one-shot from the Atmosphere panel replaces the vibe's music until it ends or is stopped, and then the music returns. True layering, the vibe's bed plus one-shot effects over it, needs a second audio channel end to end: stored state, its own broadcast, a second player element with volume and fade, and the asset read rule widened to every asset in the playing set. That is the foundation of a DM soundboard and belongs with it.
- **Reveal an obscured token to one player.** Obscure Identity is all-or-nothing today. A Perception roll that lets one player make the creature out, while the others still see a shape, needs a per-player reveal kept on the server, the way explored memory is kept per user.
- **A per-token "vision on/off" switch.** What Foundry calls Vision Enabled and Roll20 Has Sight: a token with it off contributes nothing to what its player sees, useful when a player controls several tokens (a familiar, a mount, an unconscious character) and one of them should not see. A boolean on the token JSON, DM-only like `sightRadius`, applied where the viewer set is built (`filterTokensByLighting` on the server, the `viewerOwn` filter in `MapCanvas`) so the shared visibility rule stays untouched; it needs carrying through every place a token is created or copied, the import schemas, and the shared vision fixture. The projected-screen case it was first asked for (#67) is covered by previewing from a token instead.
- **Optionally reveal along a carried token's path.** Sight and explored memory follow a token only where it is put down, for every drag. Roll20 makes this a page setting ("Update On Token Drop"), and with it off a player's explored areas fill in along the path as the DM drags their token, which some DMs use to walk a party through a map ahead of play. A per-map flag beside **Remember Explored Areas** could offer that, off by default. The drag frames already carry `dragging: true`, so the switch would be one decision in the store's `receiveTokenMove`: apply a frame as a move when the map allows it. It needs a column with a default (an additive migration), the map settings route and broadcast, the Edit Map checkbox and the DM guide. Not planned for any release yet.
- **Wall collision (`wallsBlockMovement`).** Previously implemented and removed due to bugs. If reattempted, start fresh without reviving the old code.
- **Auto-detection of walls from map images.** LLM, contour, and trace approaches all failed previously. Treat any future attempt as new R&D, not a continuation.

### Polish / tech debt

- **Player fog as a cached raster.** A player's fog is drawn on the overlay
  layer (so walls, doors and glows sit under it), one filled rectangle per
  unrevealed cell, and the overlay repaints on every mouse move. On a very
  large, mostly fogged map that is tens of thousands of rectangles per hover.
  Not measured to be slow at the sizes maps here have; if it is, draw the fog
  once into an offscreen canvas invalidated on reveal, as the lighting mask
  already is, at one pixel per cell scaled with smoothing off.

- **Move the database to a current PostgreSQL major.** The stack runs
  `postgres:15`, chosen at 1.0.0 and supported upstream until November 2027.
  Nothing in the app needs a newer server, and the client tools in the backend
  image are pinned to the nearest major this Alpine packages so backups stay
  restorable. What makes the move its own piece of work is the upgrade path: a
  data directory is specific to its major, so a newer image refuses to start on
  an existing volume and `docker compose up -d --build` would leave every
  self-hoster down until they dumped and reloaded by hand. The move needs a
  one-shot step at container start that notices a 15 data directory, dumps it,
  initialises the new cluster, loads the dump, and deletes nothing until the new
  cluster verifies, rehearsed on a seeded instance the way 1.5.0 was. Prisma's
  supported server range has to be checked for the target major first.
  **Do** before 15 leaves support; **revisit** sooner if a feature needs it.

- **Move the remaining libraries to their current major versions.** Prisma
  is on 7.10 since 1.5.3, connecting through the `pg` driver adapter and
  still generating the client with the `prisma-client-js` generator. Prisma 8,
  a rewrite that is still a release candidate, is the next data-layer step,
  together with the move to the `prisma-client` generator, once it is stable
  with a patch release or two. Vite, Vitest,
  Express and React are a major version or more behind. React Router 6 has
  two moderate advisories that cannot be reached in CozyVTT, a single-page
  app with no server rendering that never navigates to an address taken
  from a link; version 7.18 or later clears them. 1.5.2 updates every
  package within its current major version, moves to ESLint 10, and fails CI
  on a high or critical advisory in what an instance runs. **Do** in 1.5.3, a
  release of its own: Prisma to its newest stable major first, with a full
  upgrade rehearsal, then Vite and Vitest, Express 5, and React 19 with
  React Router 7. Dependabot holds back major versions of npm packages until
  then, and its automatic security pull requests are turned on once 1.5.3
  ships. **Done** for the frontend's build and test tools: Vite 8 with
  @vitejs/plugin-react 6, Vitest 5, jsdom 30 and jest-dom 7. **Defer**
  Tailwind CSS 4 and TypeScript 7.

- **Replace mathjs in the dice parser with a small evaluator.** mathjs stays
  on 12.4.3, the last 12.x release, three majors behind the current one: 1.5.2's
  dependency update left it alone. The dice parser
  (`backend/src/utils/dice-parser.ts`) uses it only to add, subtract,
  multiply and divide numbers it has built itself, so no typed text reaches
  it, yet it is about 18 MB installed. Replacing it means writing and testing
  an evaluator for those four operators. **Do** as a separate small project,
  not tied to a release, and before the dice grammar lets anything other
  than numbers and those operators through.

- **One dice grammar for both sides.** The server owns the real parser
  (`backend/src/utils/dice-parser.ts`); the frontend has two character-set checks,
  `utils/diceExpression.ts` and a private one inside `DiceRoller`, which accept
  things the server refuses, such as `2d6+` and `dddd`. That is survivable for a
  roll about to be sent, because the server answers immediately and the person is
  still looking at the box, and saved macros close the dangerous half by
  validating server-side before anything is stored. But three implementations of
  one grammar is two too many. The fix is extracting the parser into something
  both sides import, which today means introducing a shared package where none
  exists, and that is why it has not been done yet. **Revisit** when a second thing
  needs shared logic, or if the checks disagree in a way a user notices.

- **Two backend suites still stub `file-type`.** The backend tests load the
  real library (`backend/jest.config.js` compiles it to CommonJS), and
  `backend/src/middleware/__tests__/fileTypeVerdicts.test.ts` checks its
  verdict on a file of every format an upload accepts, so an upgrade that
  changes one fails there. `campaignImportAllowlist.e2e.test.ts` and
  `campaignArchiveAudio.test.ts` still stub it, because their fixtures are a
  format's first bytes and not whole files; `uploadUnidentifiedBytes.e2e.test.ts`
  stubs it on purpose, to reach the branch for a file it cannot identify.
  **Do** when either of the first two is next changed: give it whole files and
  drop its stub.

- **Dice macros shared by the DM.** #47 asked for personal saved rolls and got
  them. A DM may well want a table-wide one, such as "Wild Magic Surge, d100",
  that everyone can click without each person saving it themselves. The storage would
  take it: a nullable `userId` for campaign-wide, or an explicit `shared` flag on
  `DiceMacro`. What it really adds is a visibility axis and the permission
  question that comes with it, plus deciding what happens to a shared macro when
  the DM seat moves. **Revisit if** people ask; the personal version covers the
  cases in the original request.

- **Two or more DMs in one campaign at the same time.** Raised alongside #33,
  which asked to *move* the DM seat and got that; sharing it is a different and
  much larger job. The schema has no rule against it: one DM is kept by route
  code, which since 1.5.2 reads and changes the seat in one serializable
  transaction (`backend/src/utils/serializable.ts`). Promoting a second DM is
  refused, a hand-over steps down every DM, and a DM cannot be demoted,
  removed or have their account deleted. Relaxing those checks is the cheap
  part. The expensive part is the code that treats the DM as one person. The
  live table compares the DM role on about 60 lines and the frontend on about
  170, and most of those are checks any DM would pass, but some are not: who
  controls initiative, who the fog is drawn for, which single person a "DM
  rolled" attribution names, and `campaignDmMembership` in
  `frontend/src/utils/campaignRoles.ts`, which returns one DM. Ownership would
  need rethinking too, since a hand-over leaves `Campaign.ownerId` as it was.
  **Revisit if** people actually ask to co-run games. The hand-over added for
  #33 covers the cases reported so far (handing off, stepping back, an agent DM
  narrating while the owner plays).

- **Advantage on initiative.** Initiative is worked out per system in
  `utils/rules/initiative.ts`, but nothing expresses *advantage* on the roll,
  such as a Sentinel Shield gives in D&D 5e. The dice layer already understands
  `2d20kh1` (the roll pickers use it), so this needs a sheet field and a branch
  in the resolver, and no new dice work. Left out of 1.2.2 to keep that change
  to the modifier.

- **Shadowrun 6e initiative base is taken as stored.** The resolver in
  `utils/rules/initiative.ts` reads `derivedStats.initiative.meatspace.base`
  and does not work it out from Reaction + Intuition. Nothing shows or edits
  that value today, since the Shadowrun 6e sheet is a placeholder and the
  system cannot be chosen yet. When the sheet is built, it should work the base
  out the way the D&D 5e and Pathfinder 2e sheets work out initiative.

- **Call of Cthulhu 7e and Shadowrun 6e creature stat blocks.** Creature rolls are
  dispatched per game system (`buildNpcRolls` in `frontend/src/utils/npcRolls.ts`),
  and these two offer no rolls at all, since a d100 game and a dice-pool game
  have no d20 rolls, ability modifiers or proficiency bonus to compute from.
  Their NPC tokens fall back to the free-form custom roll input, which works but
  leaves the DM doing the arithmetic. Doing this properly means a per-system
  creature shape: characteristics and percentile skill values for CoC, attribute
  + skill dice pools and limits for Shadowrun, plus their own stat block editors
  and viewers. Neither has SRD seed data to test against. See the "Creature and
  NPC stat blocks" section of `docs/GAME_SYSTEMS.md` for where the branch points
  are.

- **A shared character-sheet header / action bar.** Each system editor (D&D 5e,
  Pathfinder 2e, Call of Cthulhu) draws its own header: the Save and Cancel
  cluster, the palette button, the colour presets and the name and token
  picture fields, with no shared component between them. The Flexible editor
  repeats Save, Cancel and the token picture, and each editor and its view
  declare their own `COLOR_PRESETS`. 1.2.2 fixed three separate
  duplicate-control bugs that all had the same shape, a page or modal drawing
  Save, Cancel or Edit that the sheet already draws, plus an overlap that had
  to be corrected in three files where one should have done. The rule that
  resolved them is worth keeping: **the sheet owns Save, Cancel and Edit;
  whatever hosts it does not repeat them.** Extracting a shared header would
  make that structural instead of a convention, and would stop the next system
  added from inheriting the same layout bugs.
  `frontend/src/components/character-sheets/types.ts` holds the props contract
  the extraction would build on.

- **Reassigning a character to a different player.** The roster's right-click
  menu carried a "Reassign to Player" entry that only ever showed "not yet
  available"; it was removed in 1.3.0 so that it no longer advertised a control
  that did not exist. There is no endpoint behind it either:
  `POST /api/characters/:id/assign` moves a character between *campaigns*, not
  between owners. Building it means a new route (DM only, target must be a
  member of the same campaign), moving the character between both memberships'
  `characterIds` as well as changing `userId`, and a player picker in the menu.

- **Call of Cthulhu `pulpTalents` has no UI.** Declared in the type and the
  backend schema, shown and editable nowhere. It belongs to Pulp Cthulhu, a
  supplement the app does not otherwise support, so it was left alone when the
  rest of the CoC sheet was completed in 1.3.0. Since 1.5.2 the server holds it
  to 500 entries, like every other list on the sheet. Either build it with the
  rest of Pulp, or drop the field.

- **A D&D 5e sheet shows its Player Name only in the editor.** The server fills
  `playerName` from the owner's display name when the character is made, and
  the editor shows it without letting it be changed. The read-only view
  (`DnD5eCharacterView.tsx`) does not show it, while the Pathfinder 2e and
  Call of Cthulhu views do.

- **Pathfinder Class DC assumes Intelligence.** When a sheet has no `classDC`
  stored, the editor fills one in with Intelligence as its key attribute, but
  the key attribute depends on the class: Strength for a fighter, Charisma for
  a sorcerer. Until such a sheet is saved, the editor shows 10 plus the
  Intelligence modifier while the read-only view shows a plain 10. Only sheets
  that never set it are affected, and the DM can correct it by hand.

- **`docs/API_REFERENCE.md` covers 84 of the 161 routes.** Deliberate: it is a
  hand-written guide to the endpoints people ask about, and
  `backend/docs/API_DOCUMENTATION.yaml` is the complete list.
  `scripts/spec-coverage.py` enforces the split and prints the current counts:
  the spec must be complete, and the guide must not invent routes. Worth
  revisiting only if the guide starts being treated as exhaustive again.

- **Campaign creation is uncapped, so the per-campaign notes limit is not a real
  ceiling.** A personal note is capped at 100,000 characters and 200 notes per
  person per campaign, but nothing limits how many campaigns one account can
  create, so the storage bound can be walked around by making more of them.
  1.5.2 caps characters (1,000) and published character templates (500) per
  account, and leaves campaigns uncapped. The same holds for every
  per-campaign limit, notes included, and capping campaign creation is a
  product decision, since it would affect legitimate users, so it was left
  alone when notes were added.

- **A lit map is black for a player in the spirit realm.** Dynamic lighting draws
  vision from the player's own tokens, and a player in the spirit realm receives
  none unless they control a spirit-layer token, so the map renders fully dark
  with no explanation. Documented in `docs/DM_GUIDE.md` under "The Spirit Layer
  and dynamic lighting", and not fixed. A spirit-realm player with no spirit
  token arguably wants either their own token back as a vision source, or a
  message saying why the map is empty.

- **CI holds back only pull requests into `main`.** `.github/workflows/ci.yml`
  runs on every push to `dev` and `main` and on pull requests into them. A
  ruleset in the repository's settings keeps a pull request into `main` from
  merging until the Frontend, Backend, Docs, Dependency advisories and
  production images jobs pass. A push to `dev` is not held: CI only reports
  a failure there. Holding `dev` too would need a ruleset like `main`'s and
  every change landing through a pull request. **Revisit if** more people
  start pushing to `dev`.

- **Serving the frontend from a folder, like `example.com/cozyvtt/`.** Asked for
  in #36 by a Traefik user; a subdomain works today and is what the deployment
  guide now points people at. The easy 10% is Vite's `base` and a router
  `basename`. The other 90% is that asset addresses are mostly *stored in the
  database* as `/api/assets/{type}/{id}` (`backend/src/utils/asset-urls.ts`;
  token templates keep a bare id) and read raw at roughly 35 render sites.
  Writing the prefix into storage puts deployment configuration into user data:
  a backup restored onto a root-mounted instance would have every picture
  broken. It also breaks `normalizeAssetUrl`'s `startsWith('/api/assets/')`
  guard. Adding it at render time leaves a rule spread across 35 places that
  can only be violated silently, on a layout nobody here runs. Note also that
  `base` is **build-time**, so the runtime env var the issue asked for cannot
  do it, and the path would end up recorded in four or five places that fail
  as a blank page whenever two disagree. Roughly 4-6 days including browser
  tests of the prefixed layout on top of the smoke tests in `frontend/e2e/`.
  **Revisit if** more people ask, or if asset storage is reworked for another
  reason. The prerequisite is storing bare UUIDs in place of URLs, for which
  `extractAssetId` already exists on both sides (the backend's checks for a
  UUID, the frontend's takes the last part of the path) and
  `backend/src/scripts/migrate-asset-urls.ts` is the precedent, in the opposite
  direction.

- **A database role that is not a superuser.** The backend uses the role the
  PostgreSQL image creates from `DATABASE_USER`, a superuser, which can run
  programs in the database container (`COPY ... TO PROGRAM`) and read its
  files; the restore's statement checks in `backend/src/utils/pgRestore.ts`
  are not a sandbox. A role that owns the schema without being a superuser
  would close that off for a malicious backup and any future SQL injection.
  It needs an init step that creates the role on existing installs with no
  manual step, `DATABASE_URL` pointing at it, and the restore reworked to run
  without superuser rights. Recorded in `SECURITY.md`.

- **Serving the backend from a different address than the page.** `.env`
  offered `VITE_API_URL` and `VITE_SOCKET_URL` for it until 1.5.2, but only
  sign-in and the API ever worked that way: the page's Content-Security-Policy
  allows another address for `connect-src` alone, helmet's
  `Cross-Origin-Resource-Policy: same-origin` refuses a picture loaded from
  another site, and the map canvas loads images with `crossOrigin='anonymous'`,
  which leaves the session cookie off, so every asset route answers 401. The
  offer was withdrawn; the build arguments and the client code that reads them
  remain. Making it work needs the extra origin in `img-src`, `media-src` and
  `frame-src`, a `same-site` or `cross-origin` resource policy when
  `CORS_ORIGIN` differs, `use-credentials` on canvas images, and a test that
  renders the policy with an address set. **Revisit if** someone needs it with a
  setup a proxy cannot cover.

---

## Won't Do

- **Obscuring tokens automatically by light.** Dim light is lightly obscured in the rules (disadvantage on Perception) and darkness is heavily obscured (effectively blinded); there is no half-seen state in between for an automatic blur to stand for. It would also fight the DM's manual switch, flicker as tokens move, and do nothing on any map that already exists, since those have Global Illumination on.
