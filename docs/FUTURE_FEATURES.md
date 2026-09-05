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

## Backlog

### User-facing

- **Sound effects** — dice-roll and notification audio. Needs: a small library of royalty-free sounds bundled in `frontend/public/sounds/`, a `useSound()` hook, and an opt-in toggle on the profile page. The toggle was removed on 2026-04-27 because no audio existed; restore it together with this feature.
- **Browser notifications** — desktop alerts when it's a player's turn (initiative tracker), or when chat activity happens while the tab is backgrounded. Needs: `Notification.requestPermission()` flow, a per-user opt-in toggle, server-side hooks for turn change + chat broadcast events. Removed alongside sound effects on 2026-04-27.
- **Per-user default dice color** — surface a color in the dice picker so a player's rolls visually stand apart in chat. Needs: pass the color into the dice renderer (`DicePanel`, roll display in chat, socket roll payload metadata), then re-add the color picker on the profile page. Removed on 2026-04-27 pending the renderer wiring.
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

- **Chat "load more" refetches the same 50 messages.** Two separate faults in one
  path, found while adding roll-history persistence in 1.2.2. The client sends a
  `before` cursor that `GET /api/campaigns/:campaignId/messages` never reads, so scrolling back
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

- **`docs/API_REFERENCE.md` covers 75 of 141 routes.** Deliberate after the
  2026-09-01 documentation pass: it is a hand-written guide to the endpoints
  people ask about, and `backend/docs/API_DOCUMENTATION.yaml` is the complete
  list. `scripts/spec-coverage.py` enforces the split — the spec must be
  complete, the guide must not invent routes. Worth revisiting only if the guide
  starts being treated as exhaustive again.

- **`any` in test files.** The burn-down cleared every explicit `any` from
  production code in both projects; roughly 75 remain across ten test files,
  which are the only entries left in the two ESLint allowlists (eight backend,
  two frontend). Scoped out of
  that work deliberately so the diffs stayed readable. The allowlist is the
  to-do list.

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

- **Token moves bypass the spirit-plane filter.** `filterTokensByRole` is what
  splits the material and spirit planes, and `filterMapData` is its only caller.
  The token-move handler filters by lighting alone, so a player in the spirit
  realm is sent material token positions on every move; they persist until the
  player refreshes, when the plane filter reapplies and the tokens vanish. Two
  paths deciding one fact and disagreeing. Confirmed 2026-09-04 by measuring the
  map payload for a player with the campaign Spirit Layer on: zero tokens over
  REST, material tokens over the move broadcast. Left alone before 1.3.0 because
  the spirit layer is a minor feature and the fix changes what players see; the
  two paths should end up sharing one decision, with `filterMapData` as the
  authority.

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

---

## Won't Do

_(items intentionally dropped — explain why)_
