# CozyVTT Frontend

React 18 + TypeScript + Vite SPA. Talks to the [backend](../backend/) over REST and Socket.io.

## Quick commands

```bash
npm install              # install deps
npm run dev              # vite dev server on :3000 (proxies /api and /socket.io to :4000)
npm run build            # production build → dist/
npm run preview          # serve the built dist/ locally
npm run test:run         # vitest one-shot
npm run lint             # eslint
npx tsc --noEmit         # type-check
```

## Where things live

- [`src/components/`](src/components/) — reusable UI
- [`src/pages/`](src/pages/) — top-level route components
- [`src/contexts/`](src/contexts/) — global React state (Auth, Campaign, WebSocket, Theme)
- [`src/services/api.ts`](src/services/api.ts) — REST client (Axios)
- [`src/services/socket.ts`](src/services/socket.ts) — Socket.io client. Subscribe through its `on…` methods and unsubscribe with `off(event, handler)`: it rebuilds the socket on reconnect and re-attaches only what it holds, so a listener bound to `getSocket()` dies with the first socket
- [`src/types/index.ts`](src/types/index.ts) — TypeScript types mirroring the backend
- [`src/themes.ts`](src/themes.ts) — built-in color themes and font families
- [`src/components/character-sheets/`](src/components/character-sheets/) — per-game-system character sheet implementations
- [`src/components/common/Markdown.tsx`](src/components/common/Markdown.tsx) — the one Markdown renderer (notes, documents). Import it; do not use `react-markdown` directly, so raw HTML stays off and the plugin set stays the same everywhere
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
