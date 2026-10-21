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

_Nothing at present._

### Tokens

_Nothing at present._

### Campaigns and assets

_Nothing at present._

### Play and connection

_Nothing at present._

### Maps

- `after 1.5.4` **Every wall, window and door on the map reaches every player, fog of war or not,** so a player who reads what their browser was sent can learn the layout of rooms their screen still covers. Their browser needs the walls to work out what their characters can see, so changing it is a design question: which walls a player is sent under fog, and what their line of sight does at the edge of what they were sent (`filterMapData` in `utils/spirit-layer.ts`). The DM guide's fog section already says the walls are sent. Since 1.5.4 a player cannot open or close a door wholly under fog.

### Accounts

_Nothing at present._

---

## Backlog

### User-facing

- **Show how far a carried token has moved.** While a token is picked up, show the distance from the square it left to where it would be put down, in squares and in the system's units, in the lower left of the map where the pointer's grid coordinates show today. Use the ruler's distance rule, so the two never disagree.
- `after 1.5.4` **Animated maps and tokens.** A token can be a GIF, and a WebP map or token is accepted whether or not it is animated, but on the map both stay on their first frame: in tests in Chrome 153 and Firefox 156 a canvas drew only the first frame of an animated GIF, WebP or PNG, however often it repainted, so playing one needs the browser's frame decoder (`ImageDecoder`, in Chrome and in Firefox from about 133, not in Safari) drawing each frame into the map layer, with a still picture where it is missing. An animated picture carries no script, so the guards that matter stay as they are: the content check, the image library limited to its PNG, JPEG, WebP and GIF readers (`utils/sharpInput.ts`), and the page's security policy. Since 1.5.4 an upload or import of a map, token or avatar is refused over 16,384 pixels on a side, and an animation over 1,000 frames or over 200 million pixels across its frames for a map (50 million for a token or avatar), read from the picture's header before anything is unpacked (`utils/pictureLimits.ts`). Needs: a map-layer playback hook (current frame and one ahead, frame durations, loop count, closing every frame), paused under reduced motion, in a hidden tab and by a per-viewer Pause button; a decision on tokens, whose layer would repaint at the frame rate; and, before accepting animated PNG (refused today as `image/apng`), a frame count read from its `acTL` chunk, since the image library does not report an APNG's frames and it would pass the limits unchecked. Large animated maps cost every player a lot (a 4,096-pixel frame took over 150 ms to decode in a test), so the guides would advise modest sizes. Best done with the map layer rework for screen resolution in the drawing and mobile work. Today, animated token pictures also play forever in the Token Roster, the Token Manager and the token hover card, whatever the reduced-motion setting.
- **A campaign page for phones and tablets** ([#31](https://github.com/CheekyChinchilla/CozyVTT/issues/31)). Below 1024 pixels the page now offers **Continue anyway** (1.5.4), but keeps its three-column desktop layout. A real small-screen layout also needs the chat list to hold and draw fewer messages: today it keeps every message loaded in a long session in memory and draws them all, which a phone's memory feels first. Window the list, or keep the newest few hundred and let **Load More** fetch older ones again. **Do** after 1.5.4.
- **Sound effects.** Dice-roll and notification audio. Needs: a small library of royalty-free sounds bundled in `frontend/public/sounds/`, a `useSound()` hook, and an opt-in toggle on the profile page. The toggle was removed on 2026-04-27 because no audio existed; restore it together with this feature.
- **Browser notifications.** Desktop alerts when it's a player's turn (initiative tracker), or when chat activity happens while the tab is backgrounded. Needs: `Notification.requestPermission()` flow, a per-user opt-in toggle, server-side hooks for turn change + chat broadcast events. Removed alongside sound effects on 2026-04-27.
- **Per-user default dice color.** Surface a color in the dice picker so a player's rolls visually stand apart in the dice panel. Needs: pass the color into the dice log (`DiceRoller.tsx` and `DiceResult.tsx`) and the socket roll payload metadata, then re-add the color picker on the profile page. Removed on 2026-04-27 pending the renderer wiring.
- **Bulk character export as a ZIP.** The app exports one character at a time, with **Export as JSON** on the Characters page. A bulk export needs a way to pick several characters, a fetch of each one's sheet (the Characters page loads only summaries), and a ZIP library such as JSZip, which is a new dependency.
- **Merge the hardcoded starter templates into the character template library.** `backend/src/utils/character-templates/` holds two presets per system, a blank sheet and one example character, as source constants served by `GET /api/characters/templates/:gameSystem/:templateName`, and the New Character dialog lists them a second time (`NewCharacterModal.tsx`), while user-published templates live in the database. Two systems for one idea. Folding the presets in as seeded, admin-owned rows would leave one browsable list and one endpoint. `getBlankTemplate` in that directory is called only through `getBlankCharacterTemplate` in `validators/game-systems/index.ts`, which only tests call.
- **Shadowrun 6E character sheet.** The backend (types, validation, templates) is complete, but the frontend sheet is still a placeholder and the system is hidden from the creation dropdown until it's finished. See `docs/GAME_SYSTEMS.md`.
- **NPC chatbot / asset generation (AI).** No code yet. The `@anthropic-ai/sdk` dependency was removed before v1.0.0 launch (it was installed but unused, and shipping it left an open `npm audit` finding). When this feature work begins, re-add the current major of the SDK and introduce `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` env vars at the same time so they enter the codebase together and never sit around as dead config.
- **Show PDFs inside CozyVTT in every browser.** The document reader shows a PDF in the browser's own viewer, in a frame sandboxed without `allow-same-origin`, which keeps the session cookie away from anything the viewer runs. Only Firefox on a computer shows a PDF there. Chrome and Edge block their viewer in such a frame, Safari leaves it blank, and phones do not show a PDF inside a page at all, so since 1.5.4 the reader offers those browsers **Open this PDF in a new tab** in place of the frame (`pdfShowsInFrame` in `DocumentReader.tsx`). Needs: a viewer that renders pages itself inside the sandbox, such as PDF.js (a new dependency), measured against the Content-Security-Policy and checked in each browser, before the frame is relaxed in any way.
- **EPUB and other document formats in the library.** #39 asked for "PDF and standard e-reader formats"; the library shipped with PDF, plain text and Markdown, which a browser can show on its own. EPUB cannot: it is a zip of XHTML that needs a reader library (`epub.js` or similar), and every one of them renders the book's own HTML inside an iframe through `blob:` URLs, which means loosening the Content-Security-Policy the whole instance runs under, and trusting a third party to sanitise a file an anonymous user uploaded. That is the one genuinely risky part of the original request, and it is separable, so it waits. **Revisit if** people ask for it with real books in hand; the answer will hinge on finding a reader that renders into a sandboxed frame without `allow-same-origin`, and on measuring what the CSP change exposes.
- **Admin upload UI for instance branding (logo / favicon / mascot).** The backend already accepts `customLogoUrl` / `customFaviconUrl` / `customMascotUrl` on `SystemSettings`, as paths this instance serves, and `ThemeContext` reads them and dynamically swaps the favicon when set. What's missing is a file-upload form on the Admin → Appearance tab so an instance operator can swap branding at runtime without redeploy. Until then, operators replace the defaults at `frontend/public/default-logo.png` and `frontend/public/default-mascot.png` and rebuild.
- **Change your email address from the app.** The server accepts a new address on `PUT /api/users/:id`, with the current password when the change is your own, but no screen sends one, so today an address can only be changed through the API.
- **A per-user storage quota, as an admin setting.** Nothing limits how much one account uploads in total; the upload rate limit slows a script, and the Admin Panel's System Overview warns once the disk holding the uploads is over 80% full. A quota would sum each user's `Asset.fileSize` before accepting an upload, with a limit set in **Admin → Settings**, off by default so no upgrade starts refusing uploads. It needs a column in `SystemSettings` (a migration), the check in the upload, typed-document and UVTT routes and in campaign import, and a clear refusal saying how much space the user has left.
- **Disable an account (after 1.5.3).** An administrator can approve an account but cannot suspend one; the choices today are deleting it, which removes its characters and notes, or resetting its password. A disabled account would keep its data and could not sign in until an administrator enables it again. A password reset would not undo it, and the automatic sign-in lock would stay a separate thing that clears itself. It needs a field on the account (a migration); the check at every way in (password sign-in, the two-factor step, existing sessions, live table connections, password reset and invitations); disabling to end the account's sessions and live connections at once; the rule that keeps an instance from losing its last administrator; a message shown only after the right password, so no one can test which accounts exist; a reset request that answers as usual and sends nothing; a decision about campaigns a disabled account runs as DM; and a line in **Admin → Activity**.

### DM tools

- **A light a token carries.** A torch, a lantern or a *Light* cantrip moves with whoever holds it, but every light today is placed on the map at a fixed point (`LightSource`, in map pixels), and a token has only its own darkvision (`sightRadius`). A token would carry a light of its own, with bright and dim radius, colour and on/off as a map light has, drawn at its centre and following it as it moves, kept with the token when it is saved as a template or creature. The server decides what players see by the lights (`filterTokensByLighting` in `backend/src/utils/spirit-layer.ts`, and the line-of-sight cache for lights), so a carried light has to count there too, and to move with the token when it is put down; while it is carried, the light stays where the token stands, as sight does.
- **Offer common spell and class effects beside the conditions.** The token editor's D&D 5e list is exactly the rules' fifteen conditions (`DND5E_CONDITIONS` in `frontend/src/utils/conditions.ts`), and stays so. Effects a table tracks the same way, such as Hexed, Hunter's Mark, Blessed, Baned, Concentrating, Raging, Hasted, Slowed and Dodging, can only be typed in today, and show as their first two letters. A separate **Effects** group under the conditions would offer them, each with its own two-letter badge kept unique beside the conditions' (the badge test already checks that), and a typed effect of your own would still work. Check each against the rules for its name and what it is.
- **Prepare a map without showing it to players.** During play the DM can edit walls, lights, fog and tokens only on the map at the table: the map canvas shows the campaign's current map, and opening another from the **Map Library** moves every player onto it. **Edit Map** changes a map's name, picture and grid without switching, but not what is drawn on it. A DM-only way to open any map on the DM's own screen while the players stay where they are, with a clear sign that it is not the table's map and a way back, needs the DM's canvas to follow a map the DM picks rather than the campaign's current one, and the edits made there to reach no player.
- **Give temporary hit points from the right-click menu.** Temporary hit points can be set on a character's sheet and on a creature in **Edit Token**, but not from the map or the roster. A **Temporary HP...** item on a token's right-click menu and on a roster character's would ask for a number and set it. A second grant follows each system's rules (in D&D 5e temporary hit points do not add together); check the rulebooks before building it, and leave the item out of systems without temporary hit points.
- **Damage takes temporary hit points first on creature tokens too.** Since 1.5.4 damage from the roster's buttons comes off a character's temporary hit points first, and they are gone once spent. A creature token's damage in **Edit Token** does not: it comes off current hit points and the temporary ones stay (`adjustHp` in `NpcQuickEditor.tsx`). Every place a token takes damage should follow the character rule, so the temporary hit points go away when they reach 0.

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
  The same release is the time to make the database container's filesystem
  read-only, as the backend's, the frontend's and the proxy's are, once the
  new image's first start and the dump-and-reload step are proven to write
  nowhere but the data volume and `/var/run/postgresql`.
  **Do** before 15 leaves support; **revisit** sooner if a feature needs it.

- **Move the remaining libraries to their current major versions.** 1.5.2
  updated every package within its current major version, moved to ESLint 10,
  and made CI fail on a high or critical advisory in what an instance runs.
  1.5.3 was the release for the major versions. **Done** for the data layer:
  Prisma 7.10, connecting through the `pg` driver adapter and still generating
  the client with the `prisma-client-js` generator. **Done** for the frontend's
  build and test tools: Vite 8 with @vitejs/plugin-react 6, Vitest 5, jsdom 30
  and jest-dom 7. **Done** for the backend's web framework: Express 5, with
  express-rate-limit 8 and helmet 8, and for its smaller libraries:
  connect-pg-simple 10, archiver 8, dotenv 18, file-type 22 and mathjs 15.
  **Done** for React: React 19.3 with React Router 8.4, and for framer-motion
  14, lucide-react 1 and react-markdown 10. React Router 6 had two moderate
  advisories that could not be reached in CozyVTT, a single-page app with no
  server rendering whose one address taken from a link, the page to go back to
  after signing in, is followed only when it is a path on this site with no
  backslash in it; React Router 8.4 clears both. **Done** for the advisories
  against the backend's developer tools: an npm override gives the coverage
  tool js-yaml 4 in place of the js-yaml 3 it asks for, and Node's own watch
  mode restarts the development server in place of nodemon. **Done** for
  TypeScript: 6.0 in both packages. **Done** for Tailwind CSS: version 4,
  which leaves no advisory against the app's build tools and needs Firefox
  128 where 114 was enough. Dependabot held back major
  versions of npm packages until 1.5.3; since then each comes as a pull
  request of its own, apart from those it names as waiting, and its automatic
  security pull requests are turned on once 1.5.3 is on `main`.
  **Do** Prisma 8 next in the data layer: it is a rewrite and still a release
  candidate, so wait until it is stable with a patch release or two, and move
  to the `prisma-client` generator with it. **Defer** TypeScript 7.

- **One dice grammar for both sides.** `1.5.4` The parser is now one file
  kept byte for byte in `backend/src/utils/` and `frontend/src/utils/`
  (checked by `visionParity.test.ts`), and the Dice panel checks expressions
  and rolls a paused table's dice with it. One character-set check is left,
  `frontend/src/utils/diceExpression.ts`, which decides whether a value on a
  character sheet is offered as a roll and accepts things the parser refuses,
  such as `2d6+` and `dddd`. **Do** by having it call the parser, after checking
  what each sheet's rolls send through it.

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
  repeats Save, Cancel and the token picture. (The colour presets are shared:
  each system's view and editor read one `colorPresets.ts`, and the header
  text colour comes from `utils/themeColor.ts`.) 1.2.2 fixed three separate
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

- **Pathfinder 2e strikes worked out from their parts.** A strike stores its
  attack bonus as typed, beside a proficiency rank, an attribute and an item
  bonus that the editor shows only as a hint ("Rank, attribute and item give
  +7"). Deriving the bonus, as AC and skills are, needs boxes for the
  attribute and item bonus, which the editor does not edit, and would change
  every stored strike's bonus, so it waits for its own change.

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
  allowed another address for `connect-src` alone, helmet's
  `Cross-Origin-Resource-Policy: same-origin` refuses a picture loaded from
  another site, and the map canvas loads images with `crossOrigin='anonymous'`,
  which leaves the session cookie off, so every asset route answers 401. The
  offer was withdrawn in 1.5.2, and in 1.5.3 the production image stopped
  taking the two as build arguments and stopped writing them into the page's
  policy; the client code that reads them remains, for a build outside Docker.
  Making it work needs the build arguments back, the extra origin in
  `connect-src`, `img-src`, `media-src` and `frame-src`, a `same-site` or
  `cross-origin` resource policy when `CORS_ORIGIN` differs, `use-credentials`
  on canvas images, and a test that renders the policy with an address set.
  **Revisit if** someone needs it with a setup a proxy cannot cover.

---

## Won't Do

- **Obscuring tokens automatically by light.** Dim light is lightly obscured in the rules (disadvantage on Perception) and darkness is heavily obscured (effectively blinded); there is no half-seen state in between for an automatic blur to stand for. It would also fight the DM's manual switch, flicker as tokens move, and do nothing on any map that already exists, since those have Global Illumination on.
