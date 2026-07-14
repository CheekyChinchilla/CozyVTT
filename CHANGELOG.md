# Changelog

All notable changes to CozyVTT will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.1.0] — 2026-07-12

A modernization release: faster and smoother real-time play, a redesigned resizable session workspace, a shared UI component layer, a hardened and restructured backend, and accessibility + polish throughout — with no breaking changes for existing installs.

### Performance

- **The map now draws on three stacked canvases** (terrain / tokens / overlay) coordinated by a single animation-frame loop — dragging a token repaints only the token layer, leaving the map image, grid, and fog untouched, instead of repainting the entire scene several times per mouse move
- **Dynamic-lighting vision is memoized** — moving one token or light now re-raycasts only that source against the walls, and panning re-raycasts nothing, so lit maps with many walls stay smooth
- **Spirit-layer and lighting broadcasts no longer scale their database work with the player count** — map switches, spirit-layer toggles, and spirit-token moves now resolve every viewer's visibility in a fixed number of queries per event instead of repeating the visibility lookup once per connected socket, so large groups stay responsive
- The throttled token-drag handler now reads the map a single time per frame instead of twice, halving its per-frame database work during a drag
- Added per-connection flood ceilings on token movement and wall/light edits — a misbehaving or malicious client can no longer overwhelm the server with rapid map mutations (legitimate play stays far below the limits)
- **The campaign-load API response is now bounded** — opening a campaign no longer downloads every map's full token/wall/fog/light data and every character's full sheet; it fetches only the metadata it uses and loads the active map and character sheets on demand, so large campaigns open quickly
- **Live token state moved into a dedicated game store** (zustand) — socket events now write outside the React tree, so dragging a token re-renders only the map canvas, while the roster, initiative tracker, and side panels skip position updates entirely (previously every token move re-rendered every campaign component)
- **Dashboard, Characters, and Asset Library now cache server data** (react-query) — navigating back to a page is instant, duplicate requests are deduped, and data refetches automatically after a network reconnect
- Memoized all React context provider values (Campaign, WebSocket, Auth) — token movement no longer re-renders the entire campaign UI on every socket event
- Asset serving now sends `Cache-Control`/`ETag` headers with 304 conditional-request support; token and map images are cached by the browser instead of re-downloaded on every map load
- The map canvas is code-split into its own chunk, so the campaign page shell paints while canvas code loads
- Default logo and mascot images optimized (1.4 MB → 64 KB combined)

### Fixed

- **The setup wizard now appears automatically on a brand-new install** — visiting the root URL of a fresh instance redirects to `/setup` instead of showing a login prompt you can't yet use. The redirect fires only when no admin account exists; existing installs and container updates are unaffected, and the wizard route now bounces already-configured instances back to the landing page
- **Completing the setup wizard now reliably marks the instance as configured** — the setup-complete flag is written to, and read from, a single canonical settings row, fixing a race on brand-new installs where the wizard created the admin account but the app still reported "Setup Required" (and then refused to re-run setup because a user already existed)
- **Session status now updates live for players** — when the DM starts, pauses, resumes, or ends a session, players see it change to live / paused / inactive immediately instead of having to reload the page
- **Uploading a token image from a character sheet inside a campaign now saves** — previously the image uploaded but the character's token was never updated (the character-library path was unaffected)
- Ending combat and restoring a backup now use the themed in-app confirmation dialog instead of the native browser popup
- The `character.hp.update` WebSocket handler now rejects sockets that have not completed campaign authentication, matching all other handlers

### UI

- **Session screen redesigned as a resizable workspace** — the three campaign columns can now be resized by dragging the dividers and collapsed entirely (header toggle buttons or drag-to-collapse); layout persists per browser between sessions
- **Tabbed session sidebar** — Chat, Dice, Initiative, and Session (vibe + session controls) are now full-height tabs instead of a stacked scrolling column with fixed heights; chat shows an unread-message badge while another tab is active, and all tabs keep their state when switching
- **Grouped DM toolbar** — the seven header pill buttons are now compact icon buttons with tooltips, grouped by purpose (content / ambience / settings), with an active-state highlight while a panel is open
- The map canvas now resizes live as panels are dragged or collapsed
- New shared UI primitive components (Button, Modal, Input/Textarea/Select, Field, Tooltip) — buttons and dialogs now share one implementation instead of per-screen copies
- All ~180 buttons migrated to the shared Button component; 12 dialogs plus the confirmation dialog now render on the shared Modal (portal-based, so dialogs no longer risk clipping inside blurred panels)
- Dialogs, form hints, and status badges now use theme tokens throughout — hardcoded parchment backgrounds and raw gray/slate colors no longer break non-default themes
- The secret dice-roll popup follows the active theme instead of a hardcoded dark style
- Session sidebar tabs now cross-fade when switching instead of snapping
- Proper favicon set — crisp browser-tab and home-screen icons rendered from the logo replace the single oversized mascot image
- New shared empty-state component brings the mascot and consistent framing to "nothing here yet" screens (adopted on the Characters page)

### Accessibility

- **All animation now respects the operating system's "reduce motion" setting** — dice pops, toast slides, modal transitions, tab fades, and ambient effects are suppressed when a user has motion sensitivity enabled, via a single global motion configuration plus a CSS guard

### Security

- **Updated dependencies to clear every known vulnerability in shipped code** — `nodemailer` (email delivery) moved to 9.x and `express`/`ws`/`qs`/`body-parser` to patched releases, resolving reported CRLF-injection/SSRF and denial-of-service advisories; `react-router` updated to close a protocol-relative open-redirect. Production dependency audits (`npm audit --omit=dev`) now report zero vulnerabilities for both the backend and the frontend bundle
- **The admin backup restore now validates a ZIP before extracting it** — restore archives are checked for path-traversal ("zip-slip") entries and capped on file count and total decompressed size (zip-bomb protection), and are streamed to disk entry-by-entry so a malformed or hostile backup can neither write outside the temporary restore directory nor exhaust memory or disk. Campaign import and backup restore now share this single hardened extraction path

### Internal

- The 2,300-line WebSocket handler monolith was split into one focused module per domain (tokens, dice, chat, spirit layer, vibe, maps, atmosphere, characters, initiative, walls, fog, lights) behind a thin connection orchestrator — wire behaviour is unchanged, verified by the full 28-test integration suite passing without modification
- WebSocket handlers now use the structured winston logger instead of `console` calls, so real-time gameplay logs reach the configured file/JSON transports in production
- The rest of the backend (REST routes, services, middleware, config) was likewise swept from `console.*` to the winston logger — production errors now land in `backend/logs/error.log` as structured JSON instead of only the console
- Campaign and character create/update endpoints now validate request bodies with Zod schemas instead of hand-rolled type checks, rejecting malformed input with the same error shape as before
- Map rendering decomposed into pure, unit-tested draw layers (background, grid, fog, tokens, dynamic lighting, walls, tool overlays) with vision polygons computed in a separate module — the canvas render function is now a thin orchestrator, and each layer can be exercised with a mock context (17 new tests)
- Per-layer dirty-flag render scheduler (single requestAnimationFrame) replaces the previous scatter of imperative full-scene repaints; a per-source vision-polygon cache backs the lighting layer (5 new tests)
- Token-tween and fog-reveal animation loops extracted into dedicated hooks
- New state-layer architecture with a documented boundary rule: zustand owns live socket-fed session state, react-query owns REST resources, CampaignContext keeps campaign metadata — never both for the same data
- Game-store unit tests covering the token actions and the movement-ignoring subscription that keeps sidebars static during drags
- New WebSocket integration test suite (28 tests) covering connection auth, token movement permissions, walls/doors, fog of war, lights, initiative, chat, dice, and spirit-layer visibility filtering — run against a real Socket.io server and database
- Map-canvas geometry (Douglas-Peucker simplification, Sobel edge-snapping, grid distance rules) extracted to a pure, unit-tested `utils/geometry` module
- Added visibility-polygon test fixtures (closed rooms, doorway gaps, locked doors) and context-memoization regression tests
- Restored the missing ESLint configuration — `npm run lint` now runs clean (rule strictness documented for future ratcheting)
- The example frontend environment file no longer hardcodes an absolute backend URL — `VITE_API_URL`/`VITE_SOCKET_URL` are left empty so the Vite dev server proxies on a single origin like Docker and production; this fixes asset thumbnail previews not loading under local `npm run dev` (absolute URLs made the images cross-origin, which Cross-Origin-Resource-Policy blocks)

---

## [1.0.0] — 2026-05-17

Initial public release.

### Platform

- Self-hosted VTT platform supporting multiple concurrent campaigns run by different GMs for different player groups
- Three-tier role system: **Admin** (instance operator), **DM** (campaign owner), **Player**
- Setup wizard on first launch to initialize the instance and create the admin account
- Admin dashboard with user management, system settings, and database backup/restore
- User registration with optional admin approval gate
- Campaign invitations with accept/decline flow
- Player can belong to multiple campaigns simultaneously

### Theming & Customization

- **16 built-in color themes** across light, warm, cool, dark, neutral, and vibrant categories
- **Custom theme builder** — pick primary, accent, background, and text colors; the system derives complementary shades automatically
- **8 font families** — all open-source (Google Fonts / SIL OFL): Default, Medieval, Elegant, Modern, Handwritten, Clean, Scholarly, Gothic
- **Per-user theme preferences** — each user picks their own theme and font from the Profile page; persists across logout/login
- **Admin-controlled defaults** — the admin's chosen theme is used on the login page and as the starting theme for new users
- **Custom branding** — admin-configurable logo, mascot, and browser favicon stored on system settings (admin upload UI is a planned enhancement; self-hosters can replace `frontend/public/default-logo.png` and `default-mascot.png` at deploy time)
- **Live preview** — theme and font changes apply instantly before saving

### Authentication & Security

- Email + password authentication with Passport.js
- **Multi-factor authentication (MFA)** via TOTP (compatible with any authenticator app) with single-use backup codes
- "Remember me" persistent sessions (30-day) alongside standard sessions (1-hour)
- Password reset via email (SMTP) or admin-generated temporary password
- Session secret validation — server refuses to start in production with placeholder secrets
- Express rate limiting: global API limit (300 req/min per IP) + strict auth limit (5 req/15 min) + asset-upload limit (30 req/min per user)
- Helmet.js with explicit Content Security Policy tuned for WebSocket and audio
- Magic-byte file validation on every upload (not just MIME header)
- Non-root Docker containers throughout

### Game Systems

Four character sheet implementations included at launch:

| System | Notes |
|--------|-------|
| D&D 5e | Ability scores, skills, combat stats, spells, equipment, features |
| Pathfinder 2e | Ability scores, skills, ancestry/class features, spells, equipment |
| Call of Cthulhu 7e | Investigator stats, skills, combat, possessions, backstory |
| Flexible | Freeform JSON-backed sheet for any system not listed above |

### Campaigns & Sessions

- Campaign creation with name, description, game system, and status lifecycle (Preparation → Active → Paused → Completed → Archived)
- DM roster management — invite players, assign roles, manage characters
- Session start/pause/resume/end with saved map state (token positions, annotations)
- Session history with notes
- **Campaign export & import** — portable `.cozyvtt` archives with maps, tokens, creatures, token templates, assets, and settings; manifest preview before import; optional audio toggle; security-hardened (path traversal prevention, zip-bomb detection, magic-byte validation, Zod schema, fresh UUIDs)

### Interactive Map

- Upload map images with configurable grid (size, feet-per-square, diagonal rule)
- Token placement and movement with real-time sync via Socket.io
- Token drag with live position broadcast to all connected players
- Token types: player, NPC, object — with disposition (friendly/neutral/hostile), HP bars, conditions, stat blocks, notes; three display modes (pog, top-down, full-art); colored-letter placeholders for tokens without images
- **Spirit layer** — optional ethereal overlay for spirit/astral scenes; per-token visibility control so spirit tokens are only visible to characters on the spirit layer
- **Fog of war** — DM-controlled fog brush with configurable radius; reveal/hide individual cells or reveal/hide all; animated fade transitions

### Walls & Dynamic Lighting

- **Wall drawing tools** — six tool modes: Draw, Select, Split, Erase, Polygon, Brush
- **Wall types** — Wall (blocks vision), Door (closed/open/locked, interactive), Window (transparent)
- **Polygon mode** — click corners to outline a room; close the shape to create all wall segments at once
- **Brush mode** — paint over the map to trace walls; Douglas-Peucker simplification converts strokes to straight segments; image-aware edge snapping refines placement when snap-to-grid is off
- **Snap-to-grid** — wall endpoints align to grid intersections for precise placement
- **Snap-to-endpoint** — connect walls to existing endpoints within a configurable radius
- **Snap-to-wall door/window placement** — click two points on an existing wall to automatically split it and insert a door or window
- **Select mode** — click segments to change type or delete; drag endpoints to reposition (all connected segments move together); merge intermediate points to join two segments into one
- **Split mode** — click a wall segment to add a midpoint
- **Erase mode** — brush-erase multiple wall segments by dragging
- **Wall color customization** — preset palette and custom color picker
- **Undo/redo** — full history for all wall operations (Ctrl+Z / Ctrl+Y)
- **Dynamic lighting** — per-map toggle; raycasting visibility from each player's token position with circular perimeter sampling for accurate light shapes in open areas
- **Three-state fog rendering** — dark, dim (half-tint), and bright zones with proper visual falloff
- **Dim-overlap-bright house rule** — two overlapping dim zones from different lights combine to bright via additive alpha
- **Light sources** — DM-placed point lights with separate bright and dim radii matching TTRPG light mechanics (D&D 5e, PF2e); named presets (Candle, Torch, Lamp, Lantern, Campfire); configurable color
- **DM preview player view** — DM can toggle to see what players actually see
- **Door interaction** — players can click doors to toggle open/closed; DM can lock/unlock
- **Performance** — spatial grid index activates automatically for maps with 200+ wall segments

### Token Templates & Creature Library

- **Creature Library** — browse, search, and place creatures from the SRD bestiary (auto-imported from Open5e); per-campaign favorites; duplicate SRD creatures to customize stat blocks; **edit custom creatures in-place** (name, image, stat block, traits, actions, etc.); save token images back to creature templates
- **Token Templates** — save any token configuration (image, stats, HP, size, disposition, display mode, notes, full NPC stat block) as a reusable template; place on map with one click; copy templates between campaigns the DM owns
- **DM right-click NPC token rolls** — DMs can roll abilities, saves, skills, attacks, and damage parsed from the NPC's stat block; advantage/disadvantage selector for d20 systems; free-form custom roll fallback for non-5e systems or tokens without stat blocks; phase-1 D&D 5e math fully supported

### Asset Library

- Three-scope asset model: **Global** (admin-managed, instance-wide), **Campaign** (DM-managed, campaign-scoped), **User** (personal uploads)
- Supported asset types: Maps, Tokens, Audio, Avatars, Documents, Other
- File type validation via magic bytes (not just extension)
- Configurable upload size limits per asset type (env vars)
- Avatar serving per user (`GET /api/assets/avatars/:userId`)

### Atmosphere & Vibe

- **Vibe tracker** — DMs set the time-of-day "vibe" (dawn/day/dusk/night or custom periods); UI shifts ambiance accordingly
- **Atmosphere overlays** — six CSS particle effects (rain, mist, leaves, sparkles, snow, wind) rendered over the map canvas
- **Spirit layer controls** — DMs toggle spirit realm mode and choose the layer style (wispy, ethereal, shadow, custom color)
- **Atmosphere audio** — DMs play ambient audio tracks from the asset library for all connected players

### Chat & Dice

- In-session chat with message types: player, DM, system, dice roll, character action
- Dice roller supporting standard RPG notation (`2d6+3`, `4d6kh3`, etc.)
- Secret rolls visible only to the roller and the DM
- Roll results broadcast to the session with full breakdown

### Initiative Tracker

- Add/remove combatants, set initiative values
- Advance turn, highlight active combatant
- Real-time sync to all session participants

### Infrastructure

- **Docker Compose** production stack — PostgreSQL, backend, frontend (Nginx), reverse proxy (Nginx) on an isolated internal network
- **Development stack** (`docker-compose.dev.yml`) — hot-reload, all ports exposed
- Multi-stage production Dockerfiles (Alpine-based, non-root users, compiled output only)
- **Winston** structured logging — JSON in production (written to `backend/logs/`), pretty-printed in development
- Health check endpoint (`GET /health`) reporting API and database status
- Configurable host ports via `HTTP_PORT` / `HTTPS_PORT` env vars
- Support for external reverse proxies (Traefik, Caddy, Cloudflare Tunnel) — bundled Nginx is optional
- Production builds strip `console.log` / `debugger` statements via Vite/esbuild

### Known Limitations

- Moving assets between scopes (Global ↔ Campaign ↔ User) via the UI is not yet implemented; assets are assigned to their scope at upload time
- Admin UI toggle for the `globalAssetManager` permission is not yet exposed (field exists in the database)
- Admin upload UI for runtime branding swap (logo / favicon / mascot) is not yet built — backend supports the override; self-hosters replace files in `frontend/public/` at deploy time
- "Map-only" campaign import option (skip tokens) is not yet available — current toggles are audio-include only
- Shadowrun 6e character sheet is partially scaffolded but not yet shipped
- No built-in log rotation for `backend/logs/` — use `logrotate` on the host
- Accessibility has not been formally audited
- UVTT import/export supports walls and light sources; UVTT single-range format is mapped to bright/dim radii on import (bright = range/2, dim = range)

### Roadmap

- Asset scope management UI
- Admin UI for branding uploads
- Map-only campaign import toggle
- Shadowrun 6e character sheet
- AI-powered features (NPC chatbots, asset generation)
- In-app log viewer for admins
- Formal accessibility audit and remediation
