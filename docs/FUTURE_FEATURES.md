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
- **Asset move-between-scopes UI** — the three-scope asset model (GLOBAL / USER / CAMPAIGN) is fully wired in the backend, but there's no UI for moving assets between scopes. Frontend Sessions 75/76 are the placeholder.
- **Global asset manager toggle (admin)** — the backend permission is already live; admin UI needs to expose the toggle. Placeholder is Session 77.
- **Shadowrun 6E character sheet** — listed as "planned" in the README's game-system table. No sheet component yet.
- **NPC chatbot / asset generation (AI)** — No code yet. The `@anthropic-ai/sdk` dependency was removed before v1.0.0 launch (it was installed but unused, and shipping it left an open `npm audit` finding). When this feature work begins, re-add the current major of the SDK and introduce `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` env vars at the same time so they enter the codebase together rather than sitting around as dead config.
- **Admin upload UI for instance branding (logo / favicon / mascot)** — backend already accepts `customLogoUrl` / `customFaviconUrl` / `customMascotUrl` on `SystemSettings`, and `ThemeContext` reads them and dynamically swaps the favicon when set. What's missing is a file-upload form on the Admin → Appearance tab so an instance operator can swap branding at runtime without redeploy. Until then, operators replace the defaults at `frontend/public/default-logo.png` and `frontend/public/default-mascot.png` and rebuild.

### DM tools

- **Wall collision (`wallsBlockMovement`)** — previously implemented and removed (Sessions 95–101) due to bugs. If reattempted, start fresh rather than reviving the old code.
- **Auto-detection of walls from map images** — LLM, contour, and trace approaches all failed previously. Treat any future attempt as new R&D, not a continuation.

### Polish / tech debt

- _(add items here as they come up)_

---

## Shipped

- **2026-04-26 — Per-user theme preferences.** Theme + font picker moved from admin-only to per-user (profile page). Admin theme becomes the public-page / new-user default. Bug fix: themes now persist across logout/login. See `Dev-Docs/docs/PER_USER_THEMES_PLAN.md`.
- **2026-04-26 — DM right-click NPC token rolls.** DMs can now right-click an NPC token to roll abilities, saves, skills, attacks, and damage parsed from the stat block. Includes a free-form custom roll fallback for tokens without stat blocks or non-d20 systems. Phase 1 supports D&D 5e math; other systems get the custom roll path. See `Dev-Docs/TOKEN_ROLLS_AND_BUGFIX_PLAN.md`.
- **2026-04-26 — Token templates can edit stat blocks.** The Token Templates editor now mounts the full `StatBlockEditor` for NPC-type templates, matching the live token edit panel.
- **2026-04-26 — Number input clipping fixed.** Native browser spinner arrows are hidden via a new `input-cozy-number` utility on AC, ability scores, HP, initiative, save/skill bonuses, and template width/height fields.

---

## Won't Do

_(items intentionally dropped — explain why)_
