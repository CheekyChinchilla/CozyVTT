# Future Features & Backlog

A running list of features, polish, and ideas that have been discussed or scoped but are not yet built. Use this to capture work that's not ready for the current release without losing the idea.

**How to use this doc:**
- New ideas go under **Backlog** with a short description and any relevant context.
- When work begins, move the entry to **In Progress** with a date and short note.
- When shipped, delete the entry. `CHANGELOG.md` is the record of what shipped;
  keeping a second list here only gives the two something to disagree about.
- When dropped, move it to **Won't Do** with a one-liner explaining why.
- Keep entries terse — link to a longer plan or PR if more detail is needed.

---

## In Progress

_Nothing in progress._

---

## Known issues for 1.5.1

Bugs confirmed in 1.5.0 and left for 1.5.1. Most are marked in the code with a `TODO(<area>)` comment at the spot. "Suspected" means read from the code and not yet reproduced. Delete an entry when its fix ships, as with the rest of this file.

### Fix first: these lose data

- **Pathfinder 2e: a sheet made from a built-in template loses its attribute modifiers when saved from the editor.** The templates in `pathfinder2e-templates.ts` store skill and lore attributes as `str`/`dex`/`int` and spellcasting as `Arcane`/`Prepared`/`int`, while `Pathfinder2eCharacterEditor.tsx` looks them up by full lowercase name, so skill totals are recomputed without the modifier and saved that way (the Level 1 Fighter's Athletics +6 becomes +3), spell totals ignore the key attribute, and spells added start unprepared.
- **Importing a campaign archive drops a whole map when one token has a name or notes over the limit.** `MapDataSchema` in `validators/campaignImport.ts` refuses the map with its walls and tokens, and the import result still reports the archive's map count; 1.4.0 stored token notes of any length, so an archive exported from 1.4.0 can lose maps.

### Character sheets

- **D&D 5e: naming the spellcasting ability after raising that score leaves the spell save DC and attack unchanged.** The backfill in `DnD5eCharacterEditor.tsx` reads the DC the editor itself wrote as a hand-typed value and records minus the ability modifier as the other bonus.
- **List boxes lose what is typed at the end.** The Pathfinder 2e comma-separated boxes (senses, speeds, resistances, immunities, weaknesses, conditions, strike traits, languages) and the Call of Cthulhu possessions and spells boxes re-parse on every keystroke, so a typed comma, new line, trailing space or first " - " vanishes; pasting works.
- **D&D 5e and Call of Cthulhu read-only headers always use light text,** so a pale custom colour such as white makes the name unreadable (`DnD5eCharacterView.tsx`, `CallOfCthulhu7eCharacterView.tsx`).
- **The Call of Cthulhu read-only view's palette button changes nothing that lasts.** The colour picked there is never saved (`CallOfCthulhu7eCharacterView.tsx`).
- **On the Characters page, sheet stats look rollable but roll nothing.** `CharacterSheetViewerModal.tsx` passes a roll handler even when there is no live connection to roll on.
- **Call of Cthulhu: Firearms, Other Language and Science rows do not roll from the sheet,** and the last two print their language or specialization twice (`components/SkillsList.tsx`).
- **Pathfinder 2e: a sheet whose AC, Class DC or Spell DC works out under 10 cannot be saved.** `pathfinder2e.schema.ts` requires at least 10 for all three, and an untrained rank with a negative modifier goes below it.
- **D&D 5e: rows added with "+ Add" block saving until they are named.** Attack, item and spell rows start with an empty name and hit-dice rows with an empty class, which `dnd5e.schema.ts` refuses, and the in-campaign editor (`CharacterSheetEditorModal.tsx`) does not say which field.
- **The Call of Cthulhu read-only view shows a stray "0"** when Cthulhu Mythos is 0 and the spell list is empty (`CallOfCthulhu7eCharacterView.tsx`).
- **Character templates are stored as sent.** `routes/characterTemplates.ts` validates a template but stores the request body rather than the schema's output, so fields the schema would strip are kept; characters made from a template are cleaned on creation.
- **D&D 5e: an old sheet's less common languages land under Weapons.** For sheets saved before the four proficiency boxes were stored, `utils/proficiencies.ts` sorts entries by a fixed list of language names, so "Druidic" or "Thieves' Cant" goes to Weapons even when the sheet's own languages list names it.
- **Pathfinder 2e: a template feat's text cannot be edited.** The templates write a feat's text to `notes`, which the view shows, while the editor edits only `description`.
- **The full-page character editor discards edits after a stale save.** It has no live connection, so hit points changed at the table make its save stale, and the refused save (409) reloads the sheet over what was typed (`CharacterEditorPage.tsx`); it should offer to keep the edits.
- **Call of Cthulhu: an investigator with POW 100 cannot be saved.** Starting and current Sanity default to POW, and the schema caps Sanity at 99 (`CallOfCthulhu7eCharacterEditor.tsx`).
- **Pathfinder 2e: bulk typed as a number counts as nothing.** The inventory's Bulk box stores a string, and `calculateTotalBulk` and `BulkTracker` count only numbers and "L".

### Tokens

- **The Token Manager offers Send to Spirit Realm for objects,** which the map's right-click menu keeps on the material plane (`TokenManager.tsx`).
- **The Token Manager shows a "Player" chip on a token whose controller is no longer a player** (`TokenManager.tsx`).
- **Edit Token's Controlled By list has no entry for a spectator or former member still named on a token,** yet its hint still says "This player can move the token on the map." (`NpcQuickEditor.tsx`).
- **Copying a token template to another campaign shows nothing on success and only "Failed to copy template" on refusal** (`TokenTemplateLibrary.tsx`).
- **A refused Place on Map in the Token Manager says only "Failed to add token to map",** without the server's reason (`TokenManager.tsx`).
- **Right-click Hide, Obscure and Spirit Realm moves fail silently.** Their errors go only to the browser console (`MapCanvas.tsx`).
- **The DM's spirit-token toggle reads "Hiding spirit tokens (click to show)" while they are shown** (`MapCanvas.tsx`).
- **The REST token routes do not broadcast their changes.** Creating, updating or deleting a token through `routes/maps.ts` tells no open page, only a move between maps does, so a change made by an API client stays unseen until the next broadcast or a reload.

### Campaigns and assets

- **Clearing a campaign's description does not save.** The settings panel sends `undefined` for an empty box, so the server keeps the old text (`CampaignSettingsModal.tsx`).
- **A DM who is neither the owner nor an admin is offered Delete Campaign,** which the server refuses (`CampaignSettingsModal.tsx`).
- **A refused asset move shows only "Forbidden".** `AssetDetailPanel.tsx` reads the reply's short `error` label instead of its `message`.
- **Vibe settings are validated two ways, and the campaign name and description boxes stop short of the server's limits.** `PUT /api/campaigns/:id/vibe` checks with `validateVibeSettings` and `PUT /api/campaigns/:id` with `VibeSettingsSchema`, which disagree; the settings panel caps the name and description at 100 and 1000 characters against the server's 200 and 5000.
- **The dashboard shows a new invitation only after Refresh.** The page has no socket to hear `invitation.received`, and its query does not refetch on focus (`DashboardPage.tsx`).
- **An invitation names the campaign's owner as "DM:",** which is wrong after a handover (`routes/invitations.ts`, `DashboardPage.tsx`, `InvitationModal.tsx`).
- **The web app offers a campaign asset's Delete and Move only to its uploader or an admin,** though the server also lets the campaign's DM do both (`AssetDetailPanel.tsx`, `AssetCard.tsx`).
- **Suspected: the map-change listener keeps the role from MapCanvas's first render,** so after a role change without a reload a former DM may see a stale "Spirit Realm" badge and a new DM may hear the crossing sound (`MapCanvas.tsx`).

### Play and connection

- **A chat message sent while the connection is dropping is lost and stays "sending…".** It is emitted with no acknowledgement, and the server refuses one that arrives before the socket rejoins (`ChatPanel.tsx`).
- **Suspected: after a failed connect, the badge stays on Connection Error once socket.io reconnects by itself.** `WebSocketContext.tsx` attaches its lifecycle listeners only after a successful connect, so the session listeners in `CampaignPage.tsx` miss pause, end and resume until Retry.
- **Initiative rolls vanish from the dice log on reload.** `handlers/initiative.ts` broadcasts the entry but never stores it.
- **Suspected: a member offline when the DM clears the dice history keeps the old rolls until they reload.** The catch-up in `DiceRoller.tsx` only adds rolls.
- **A player rolling initiative for their own obscured token sees it logged as "Unknown creature",** unlike a roll from their sheet (`handlers/initiative.ts`).

### Maps

- **The DM's page ignores wall, door and light events.** `MapCanvas.tsx` skips them as echoes of its own edits, so a player's door toggle or an API change does not reach the DM's canvas until reload, and the DM's next bulk wall edit sends the stale list and undoes the other change for everyone.
- **Preview Player View gets stuck if lighting and fog are both turned off while previewing.** The button that ends it only renders while one of them is on (`MapCanvas.tsx`).
- **Door clicks ignore sight.** A player can open a door none of their tokens can see, a click in darkness reveals a locked door through its toast, and a spectator gets a toggle the server refuses, leaving their page out of step; `MapCanvas.tsx` and `handlers/walls.ts` both need the check.
- **The light tool still places, selects and drags lights during a preview,** where the light markers are hidden (`MapCanvas.tsx`).

### Accounts

- **Sign-up shows "Registration Failed" instead of the reason,** such as a missing display name or an email already registered. The same bug as "Sign-in errors show a status label instead of the helpful sentence" under Polish / tech debt, in `RegisterPage.tsx`.
- **The Admin Panel's Create User and Invite User skip the display-name check.** `routes/admin.ts` stores a sanitised, shortened name, so one typed as `<>` is saved empty.
- **Password checks made from a signed-in session have no attempt limit of their own.** Change password and delete account (`routes/auth.ts`) and the current-password check on an email change (`routes/users.ts`) count only against the general 300 requests a minute.
- **The reason a table's sign-in ended is only logged.** The server sends it on the socket before closing it, and `socket.ts` writes it to the browser console; only an open Dice tab shows it.
- **The sign-in and MFA pages show the reply's short error label** ("Authentication Failed", "Invalid Code", "Rate Limited") instead of its sentence. Described under Polish / tech debt as "Sign-in errors show a status label instead of the helpful sentence" (`LoginPage.tsx`, `MFAVerifyPage.tsx`).
- **"Back to login" on the MFA code page loops back to the code page,** because the pending sign-in is still set (`MFAVerifyPage.tsx`).
- **The app never shows how many MFA backup codes are left.** `AuthContext.tsx` only logs the server's low-codes warning.
- **Two setup-wizard requests racing each other both change the instance's settings.** In `routes/setup.ts` only the first becomes the administrator, but the second still applies its own wizard settings (registration open, instance name), completes setup and is signed in. Only the request that created the administrator should apply settings.
- **Deleting the account of a DM who does not own the campaign leaves it with no DM.** After a handover the DM and the owner can be different people, and `services/accountDeletion.ts` refuses a deletion only for a campaign the user owns, so the new DM's deletion goes through and the campaign has no DM until its owner hands the seat to someone from Campaign Settings → Members. The check should cover every campaign the user is DM of.

### Server and deployment

- **Stopping Postgres can crash the backend.** The session store's pool in `config/session.ts` has no `'error'` listener, so an idle client's dropped connection becomes an unhandled error.
- **The Backups list's bin icon deletes a backup without asking** (`AdminPage.tsx`).
- **The bundled nginx keeps the backend's address from its own start,** so recreating only the backend container can leave `/api` answering 502 until nginx is restarted. A `resolver` with a variable upstream in `nginx/nginx.conf` would fix it; the file carries no TODO because any change to it needs a new `NGINX_CONF_STAMP` in `docker-compose.yml`.
- **Restoring a file that is not a ZIP, or whose name does not end in .zip, shows only "An unexpected error occurred"** (`routes/admin.ts`).
- **A backend stopped during a restore leaves the uploaded backup behind** as `restore-temp-<ms>.zip` in the backups folder. It is removed only when the restore request ends, and the list's clean-up removes only unfinished backups (`routes/admin.ts`).

---

## Backlog

### User-facing

- **Sound effects** — dice-roll and notification audio. Needs: a small library of royalty-free sounds bundled in `frontend/public/sounds/`, a `useSound()` hook, and an opt-in toggle on the profile page. The toggle was removed on 2026-04-27 because no audio existed; restore it together with this feature.
- **Browser notifications** — desktop alerts when it's a player's turn (initiative tracker), or when chat activity happens while the tab is backgrounded. Needs: `Notification.requestPermission()` flow, a per-user opt-in toggle, server-side hooks for turn change + chat broadcast events. Removed alongside sound effects on 2026-04-27.
- **Per-user default dice color** — surface a color in the dice picker so a player's rolls visually stand apart in the dice panel. Needs: pass the color into the dice renderer (`DicePanel`, the roll list, socket roll payload metadata), then re-add the color picker on the profile page. Removed on 2026-04-27 pending the renderer wiring.
- **Bulk character export as a ZIP** — exporting multiple characters currently downloads each one as a separate file. Bundling them into a single ZIP (e.g. via JSZip) would be tidier. See the multi-character export path in `frontend/src/utils/character-export.ts`.
- **Merge the hardcoded starter templates into the character template library** — `backend/src/utils/character-templates/` holds four presets per system as source constants, served by `GET /api/characters/templates/:system/:name`, while user-published templates now live in the database. Two systems for one idea. Folding the presets in as seeded, admin-owned rows would leave one browsable list and one endpoint. Note `getTemplatesForGameSystem`, `getAllTemplates` and `getBlankTemplate` in that directory are already dead code with no callers; `getBlankCharacterTemplate` in `validators/game-systems/index.ts` is the one still in use.
- **Shadowrun 6E character sheet** — the backend (types, validation, templates) is complete, but the frontend sheet is still a placeholder and the system is hidden from the creation dropdown until it's finished. See `docs/GAME_SYSTEMS.md`.
- **NPC chatbot / asset generation (AI)** — No code yet. The `@anthropic-ai/sdk` dependency was removed before v1.0.0 launch (it was installed but unused, and shipping it left an open `npm audit` finding). When this feature work begins, re-add the current major of the SDK and introduce `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` env vars at the same time so they enter the codebase together rather than sitting around as dead config.
- **EPUB and other document formats in the library** — #39 asked for "PDF and standard e-reader formats"; the library shipped with PDF, plain text and Markdown, which a browser can show on its own. EPUB cannot: it is a zip of XHTML that needs a reader library (`epub.js` or similar), and every one of them renders the book's own HTML inside an iframe through `blob:` URLs, which means loosening the Content-Security-Policy the whole instance runs under, and trusting a third party to sanitise a file an anonymous user uploaded. That is the one genuinely risky part of the original request, and it is separable, so it waits. **Revisit if** people ask for it with real books in hand; the answer will hinge on finding a reader that renders into a sandboxed frame without `allow-same-origin`, and on measuring what the CSP change exposes.
- **Admin upload UI for instance branding (logo / favicon / mascot)** — backend already accepts `customLogoUrl` / `customFaviconUrl` / `customMascotUrl` on `SystemSettings`, and `ThemeContext` reads them and dynamically swaps the favicon when set. What's missing is a file-upload form on the Admin → Appearance tab so an instance operator can swap branding at runtime without redeploy. Until then, operators replace the defaults at `frontend/public/default-logo.png` and `frontend/public/default-mascot.png` and rebuild.
- **Change your email address from the app.** The server accepts a new address on `PUT /api/users/:id`, with the current password when the change is your own, but no screen sends one, so today an address can only be changed through the API.

### DM tools

- **Change a member's role from the app.** The spectator role exists, and the server has a route for changing a member's role, but nothing in the app calls it: every invitation makes a player, so the only way to make someone a spectator today is a direct API call. A role picker on the **Members** tab of Campaign Settings would close that gap.
- **Show that a hidden-HP creature is down.** Players are sent a creature's hit points only when its HP bar is on, so a creature at 0 HP with its bar off still looks standing to them and blocks its square. A separate "down" flag the server could send without the numbers would let the body fade and be stood on.
- **Play a vibe period's audio.** The period editor has an audio field for each vibe period, and it is saved, but nothing plays it. Either wire it to the atmosphere player when the period changes, or remove the field.
- **Reveal an obscured token to one player.** Obscure Identity is all-or-nothing today. A Perception roll that lets one player make the creature out, while the others still see a shape, needs a per-player reveal kept on the server, the way explored memory is kept per user.
- **A per-token "vision on/off" switch** — what Foundry calls Vision Enabled and Roll20 Has Sight: a token with it off contributes nothing to what its player sees, useful when a player controls several tokens (a familiar, a mount, an unconscious character) and one of them should not see. A boolean on the token JSON, DM-only like `sightRadius`, applied where the viewer set is built (`filterTokensByLighting` on the server, the `viewerOwn` filter in `MapCanvas`) so the shared visibility rule stays untouched; it needs carrying through every place a token is created or copied, the import schemas, and the shared vision fixture. The projected-screen case it was first asked for (#67) is covered by previewing from a token instead.
- **Wall collision (`wallsBlockMovement`)** — previously implemented and removed due to bugs. If reattempted, start fresh rather than reviving the old code.
- **Auto-detection of walls from map images** — LLM, contour, and trace approaches all failed previously. Treat any future attempt as new R&D, not a continuation.

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

- **One dice grammar for both sides.** The server owns the real parser
  (`backend/src/utils/dice-parser.ts`); the frontend has two character-set checks
  — `utils/diceExpression.ts` and a private one inside `DiceRoller` — which accept
  things the server refuses, such as `2d6+` and `dddd`. That is survivable for a
  roll about to be sent, because the server answers immediately and the person is
  still looking at the box, and saved macros close the dangerous half by
  validating server-side before anything is stored. But three implementations of
  one grammar is two too many. The fix is extracting the parser into something
  both sides import, which today means introducing a shared package where none
  exists — the reason it has not been done yet. **Revisit** when a second thing
  needs shared logic, or if the checks disagree in a way a user notices.

- **`file-type` has no automated coverage.** The upload validator's first line
  of defence is what that library says a file is, and it is ESM-only, which the
  Jest setup here cannot load; every test that reaches it swaps in a stub
  (`backend/src/__tests__/helpers/file-type-mock.ts`, or a per-suite mock). The
  stubs were written to match what the real library was observed to do for the
  same bytes, and the real library was exercised by hand against a running
  instance, but nothing in CI would notice if an upgrade changed a verdict. The
  fix is either a Jest ESM configuration that can load it, or one small
  integration test that runs under `node --test` outside Jest. **Revisit** when
  `file-type` is next upgraded, and before adding any format whose acceptance
  depends on it.

- **Dice macros shared by the DM.** #47 asked for personal saved rolls and got
  them. A DM may well want a table-wide one — "Wild Magic Surge, d100" — that
  everyone can click without each person saving it themselves. The storage would
  take it: a nullable `userId` for campaign-wide, or an explicit `shared` flag on
  `DiceMacro`. What it really adds is a visibility axis and the permission
  question that comes with it, plus deciding what happens to a shared macro when
  the DM seat moves. **Revisit if** people ask; the personal version covers the
  cases in the original request.

- **Two or more DMs in one campaign at the same time.** Raised alongside #33,
  which asked to *move* the DM seat and got that; sharing it is a different and
  much larger job. The schema already permits it — nothing enforces one DM but
  route code — so the cheap part is removing a guard. The expensive part is that
  "the DM" is assumed to be singular in roughly 32 socket checks and ~168
  frontend branches, and in places where singular is load-bearing rather than
  incidental: who controls initiative, who secret rolls are revealed to, who the
  fog is drawn for, and which single person a "DM rolled" attribution names.
  Ownership would need rethinking too, since `Campaign.ownerId` is what a
  transfer deliberately leaves alone. **Revisit if** people actually ask to
  co-run games — the handover added for #33 covers the cases reported so far
  (handing off, stepping back, an agent DM narrating while the owner plays).

- **Saving a flexible character discards every top-level field except
  `sections`.** `FlexibleCharacterSheetEdit.tsx:99` calls
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
  required to change no behaviour. Since the burn-down the reading is centralised in
  `apiErrorText` in `frontend/src/utils/errors.ts`, which returns
  `data.error` — so the fix is now one helper rather than a change per page,
  plus a decision about whether any endpoint relies on `error` carrying
  something a user should read. Note the 429
  path is fine: the rate limiter replies with a bare string rather than JSON, so
  the status branch handles it and the wording is already correct.

- **Map events still die on a reconnect.** `frontend/src/services/socket.ts` keeps
  a listener registry so subscriptions survive the socket being replaced, and the
  components fixed in 1.2.2 go through it. `MapCanvas.tsx` does not: twenty subscriptions there (walls, fog, lights, spirit layer, map changes,
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

- **Reassigning a character to a different player.** The roster's right-click
  menu carried a "Reassign to Player" entry that only ever showed "not yet
  available"; it was removed on 2026-09-01 rather than left advertising a
  control that did not exist. There is no endpoint behind it either —
  `POST /api/characters/:id/assign` moves a character between *campaigns*, not
  between owners. Building it means a new route (DM only, target must be a
  member of the same campaign), moving the character between both memberships'
  `characterIds` as well as changing `userId`, and a player picker in the menu.

- **Call of Cthulhu `pulpTalents` has no UI.** Declared in the type and the
  backend schema, shown and editable nowhere. It belongs to Pulp Cthulhu, a
  supplement the app does not otherwise support, so it was left alone when the
  rest of the CoC sheet was completed on 2026-09-01. Either build it with the
  rest of Pulp, or drop the field.

- **A D&D 5e sheet records a Player Name it never displays.** The editor writes
  `playerName`; the read-only view does not read it. The only edit/view gap left
  in 5e after the 2026-09-01 parity pass, and small enough that it was not worth
  its own commit at the time.

- **Pathfinder Class DC assumes Intelligence.** When a sheet has no
  `classDC.keyAttribute` stored, the editor falls back to Intelligence, but the
  key attribute is class-dependent — Strength for a fighter, Charisma for a
  sorcerer. Only affects sheets that never set it, and the DM can correct it by
  hand, so it is a default worth improving rather than a miscalculation.

- **`docs/API_REFERENCE.md` covers 80 of 153 routes.** Deliberate after the
  2026-09-01 documentation pass: it is a hand-written guide to the endpoints
  people ask about, and `backend/docs/API_DOCUMENTATION.yaml` is the complete
  list. `scripts/spec-coverage.py` enforces the split — the spec must be
  complete, the guide must not invent routes. Worth revisiting only if the guide
  starts being treated as exhaustive again.

- **`any` in test files.** *Finished.* The burn-down cleared every explicit
  `any` from production code in both projects first, and the test files were
  left for later so those diffs stayed readable. They have since been cleared
  too, in both projects, and both ESLint allowlists are gone:
  `@typescript-eslint/no-explicit-any` now applies to every file, tests
  included. Nothing is left to do here.

- **Campaign creation is uncapped, so the per-campaign notes limit is not a real
  ceiling.** A personal note is capped at 100,000 characters and 200 notes per
  campaign, but nothing limits how many campaigns one account can create, so the
  storage bound can be walked around by making more of them. True of every
  per-campaign limit rather than notes specifically, and capping campaign
  creation is a product decision — it would affect legitimate users — so it was
  left alone when notes were added.

- **The SRD creature import answers 504 when Open5e is unreachable.** The seed
  endpoint fetches from `api.open5e.com` with no timeout of its own, so when that
  host is down or blocked the request hangs until the reverse proxy gives up and
  the DM sees a bare gateway error rather than "could not reach the creature
  source". Reproduced on 2026-09-03 with the host unreachable. Wants a timeout on
  the fetch and an error the UI can explain.

- **Only maps check an asset reference at write time.** `canReadAsset` grants a
  read when an asset is *used* by a map, character, creature template or token
  template in a campaign the viewer and the uploader are both in. That is the
  right rule, but only `routes/maps.ts` calls `canReadAssetById` before storing
  a reference — `characters.ts`, `creatures.ts` and `tokenTemplates.ts` store
  one unchecked. So a campaign co-member can point their own character's
  `tokenImageUrl` at another member's `USER`-scoped asset and gain read access
  to it. Low severity and not a hole anyone can walk through: it grants viewing
  only, needs a shared campaign with the uploader, and needs the asset's UUID,
  which the listing route never discloses (it filters `USER` assets to
  `uploadedById: userId`). Found 2026-09-04 reviewing 1.3.0 before merge. The
  fix is the write-time check the map route already has, applied to the other
  three — the same one-fact-two-places shape the read side was consolidated to
  avoid.

- **Token moves bypass the spirit-plane filter.** *Fixed in 1.5.0.* The move fan-out applies `filterTokensByRole` before line of sight, and a drag's frames go only to those who could see the token where it began, so hidden tokens, DM notes and the wrong plane never reach a player on a move.

- **A lit map is black for a player in the spirit realm.** Dynamic lighting draws
  vision from the player's own tokens, and a player in the spirit realm receives
  none unless they control a spirit-layer token — so the map renders fully dark
  with no explanation. Currently documented in `DM_GUIDE.md` as a troubleshooting
  note rather than fixed. A spirit-realm player with no spirit token arguably
  wants either their own token back as a vision source, or a message saying why
  the map is empty.

- **CI reports, it does not block.** `.github/workflows/ci.yml` runs typecheck,
  lint, tests and build on both projects, but GitHub Actions only reports
  failures. Making them binding needs branch protection with required status
  checks on `dev` and `main`, which is a repository setting rather than a file.
  Worth doing the first time the workflow actually runs.

- **Serving the frontend from a folder, like `example.com/cozyvtt/`.** Asked for
  in #36 by a Traefik user; a subdomain works today and is what the deployment
  guide now points people at. The easy 10% is Vite's `base` and a router
  `basename`. The other 90% is that asset addresses are *stored in the database*
  as `/api/assets/{type}/{id}` (`backend/src/utils/asset-urls.ts`) and read raw at
  roughly 35 render sites. Writing the prefix into storage puts deployment
  configuration into user data — a backup restored onto a root-mounted instance
  would have every picture broken — and it breaks `normalizeAssetUrl`'s
  `startsWith('/api/assets/')` guard. Adding it at render time instead leaves a
  rule spread across 35 places that can only be violated silently, on a layout
  nobody here runs. Note also that `base` is **build-time**, so the runtime env
  var the issue asked for cannot do it, and the path would end up recorded in
  four or five places that fail as a blank page whenever two disagree. Roughly
  4-6 days including a browser test harness the project does not have and would
  then maintain. **Revisit if** more people ask, or if asset storage is reworked
  for another reason — the prerequisite is storing bare UUIDs rather than URLs,
  for which `extractAssetId` already exists on both sides and
  `backend/src/scripts/migrate-asset-urls.ts` is the precedent, in the opposite
  direction.

---

## Won't Do

- **Obscuring tokens automatically by light.** Dim light is lightly obscured in the rules (disadvantage on Perception) and darkness is heavily obscured (effectively blinded); there is no half-seen state in between for an automatic blur to stand for. It would also fight the DM's manual switch, flicker as tokens move, and do nothing on any map that already exists, since those have Global Illumination on.
_(items intentionally dropped — explain why)_
