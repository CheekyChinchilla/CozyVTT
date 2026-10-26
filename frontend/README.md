# CozyVTT Frontend

React 19 + TypeScript + Vite SPA. Talks to the [backend](../backend/) over REST and Socket.io. Needs Node.js 26, the version `.nvmrc` names.

## Quick commands

```bash
npm install              # install deps
npm run dev              # vite dev server on :3000 (proxies /api and /socket.io to :4000)
npm run build            # production build → dist/
npm run preview          # serve the built dist/ locally
npm run test:run         # vitest one-shot (npm test is watch mode)
npm run test:coverage    # vitest one-shot with a coverage report
npm run test:e2e         # Playwright smoke tests against a running instance (e2e/)
npm run lint             # eslint, flat config in eslint.config.js; fails on any warning
npm run typecheck        # type-check the app, e2e/, vite.config.ts and vitest.config.ts
```

## Where things live

- [`src/components/`](src/components/) — reusable UI
- [`src/pages/`](src/pages/) — top-level route components
- [`src/contexts/`](src/contexts/) — global React state (Auth, Campaign, WebSocket, Theme, Toast)
- [`src/services/api.ts`](src/services/api.ts) — REST client (Axios)
- [`src/services/socket.ts`](src/services/socket.ts) — Socket.io client. Subscribe through its `on…` methods and unsubscribe with `off(event, handler)`: it rebuilds the socket on reconnect and re-attaches only what it holds, so a listener bound to `getSocket()` dies with the first socket
- [`src/services/api.ts`](src/services/api.ts) sends a page to sign in on a 401 (`services/pageLoad.ts`, carrying the page as `?next=`, checked by `utils/returnTo.ts`), except on a public page or while an editor holds unsaved changes (`services/unsavedWork.ts`). A 401 with `code: 'SIGN_IN_EXPIRED'` leaves its sentence for the sign-in page (`services/signInNotice.ts`). A 403 with `PASSWORD_CHANGE_REQUIRED` or `MFA_ENROLMENT_REQUIRED` sends the page to change the password or set up MFA. A call whose 401 means a wrong password or code, not a lost sign-in, passes `skipAuthRedirect` so its form can show the message
- [`src/constants/`](src/constants/) — game system labels, and limits copied byte for byte from the backend (`mapLimits.ts`, `sheetLimits.ts`, `assetLimits.ts`, `inviteSearchLimits.ts`, `statBlockLimits.ts`, `tokenLimits.ts`, `campaignLimits.ts`, and `uploadTypes.ts`, the files each kind of asset may be). So are several files in `src/utils/` (`raycasting.ts`, `spatialIndex.ts`, `visibilityRule.ts`, `tokenMask.ts`, `tokenCentre.ts`, `vibeAudio.ts`, `characterHp.ts`, `styleAllowlists.ts`) and `src/utils/rules/`. Change both copies together: backend tests fail while they differ
- [`src/utils/clipboard.ts`](src/utils/clipboard.ts) — `copyText`, which works on plain HTTP and says whether it copied. Use it, not `navigator.clipboard`, which is undefined outside HTTPS
- [`src/utils/errors.ts`](src/utils/errors.ts) — `errorSummary` for console lines. Never log a caught API error whole: it carries the request body, a password or a code among them, and error lines are kept in production builds. `src/__tests__/errorLogging.test.ts` fails when a console line passes a caught error whole, except the few it names that are not API errors
- [`src/types/index.ts`](src/types/index.ts) — TypeScript types mirroring the backend. Two are checked against it: the sheet types in `src/types/game-systems/` against the backend's Zod schemas, and `GameSystem` (`src/types/gameSystem.ts`) against `schema.prisma`. `backend/src/__tests__/keepInStep.test.ts` fails when either drifts, and names the frontend line
- [`src/themes.ts`](src/themes.ts) — built-in color themes and font families
- [`src/assets/fonts/`](src/assets/fonts/) — the typefaces those font families name, served by the instance itself, with one `@font-face` per family and character range (and per weight, for a family with no variable font) in `fonts.css` and the licences in `OFL.txt`. A new font family needs its files and rules here; `src/__tests__/fonts.test.ts` fails until each family a font choice names first has them
- [`src/components/character-sheets/`](src/components/character-sheets/) — per-game-system character sheet implementations
- [`src/components/campaign/map/mapPointer.ts`](src/components/campaign/map/mapPointer.ts) — `MapPointer`, the one shape a map tool reads a pointer in, made from a pointer event (or the context menu's mouse event), with the click count MapCanvas keeps, since a pointer event's own `detail` is 0
- [`src/components/campaign/map/gestures.ts`](src/components/campaign/map/gestures.ts) — the touch gesture recogniser: taps, long-presses, drags and pinches from pointer samples, with no DOM, so each rule is tested alone with fake timers. Mouse and pen samples make no gesture
- [`src/components/common/Markdown.tsx`](src/components/common/Markdown.tsx) — the one Markdown renderer (notes, documents). Import it; do not use `react-markdown` directly, so raw HTML stays off and the plugin set stays the same everywhere
- [`src/test/`](src/test/) — the Vitest setup file, which adds the jest-dom matchers to `expect` through `@testing-library/jest-dom/vitest` and stubs the pointer capture jsdom lacks; `pointer.ts`, which fires pointer events as a browser does (no `detail`, a move's `button` -1, a second button as a move); and `waitForDialogFocus`, which a test calls before typing into a dialog that has just opened: the dialog moves focus to its first control on the next animation frame, and keys typed after that move are lost. It waits for a frame of its own, since a field with `autoFocus` puts focus inside the dialog before that move
- [`e2e/`](e2e/) — a handful of Playwright smoke tests: a real browser against a running instance, in Chromium at desktop and phone sizes and in WebKit on an iPhone and an iPad. CI runs them against the production stack; `e2e/instance.ts` says which settings they read, and `docs/DEVELOPMENT.md` how to run them locally. Vitest leaves the folder alone. Keep them few: behaviour belongs in Vitest tests
- [`vite.config.ts`](vite.config.ts) — the production build (Vite 8) removes every `console.log`, `console.info`, `console.debug` and `console.trace` call (`build.rolldownOptions.treeshake.manualPureFunctions`), and the minifier drops `debugger`; `console.error` and `console.warn` stay. The dev server keeps every log, and CI fails if one of four known `console.log` lines turns up in the bundle. It also names the five `vendor-*` chunks, and builds for Chrome and Edge 111, Firefox 114 and Safari 16.4, Vite's default
- [`security-headers.conf`](security-headers.conf) — the Content-Security-Policy and other headers the production image serves the app page with. Included by [`nginx.conf`](nginx.conf) in every location, because nginx does not inherit them. Anything loading from a new host has to be allowed here, and the dev server has no policy, so a violation only shows up in a production build

## More information

This README is intentionally short. For everything else:

| Topic | Read |
|---|---|
| Project overview, features, license | [Root `README.md`](../README.md) |
| Local development setup (with or without Docker) | [`docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md) |
| Architecture and design decisions | [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) |
| Production deployment | [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) |
| Adding a new game system | [`docs/GAME_SYSTEMS.md`](../docs/GAME_SYSTEMS.md) |
| Backend REST API | [`backend/docs/API_DOCUMENTATION.yaml`](../backend/docs/API_DOCUMENTATION.yaml) |
| WebSocket event protocol | [`backend/docs/WEBSOCKET_DOCUMENTATION.md`](../backend/docs/WEBSOCKET_DOCUMENTATION.md) |

## License

AGPL-3.0 — see [`LICENSE`](../LICENSE) in the repo root.
