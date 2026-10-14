# Contributing to CozyVTT

Thank you for your interest! CozyVTT is built with a very specific, "comfy" vision in mind. As the sole maintainer balancing this with limited hobby time, I have to be protective of the codebase and the project's direction.

**I am not accepting unsolicited ("cold") Pull Requests at this time.**

---

## How to Get Involved

### 🐞 Open an Issue

Found a bug or have a feature request? Opening an issue is the best place to start. Let's discuss the "why" and "how" there first before any code is written.

When reporting a bug, please include:
- CozyVTT version (or git commit hash)
- Browser and OS
- Steps to reproduce
- Expected vs actual behavior
- Console output or screenshots if relevant
- How it runs (Docker Compose, or installed without Docker), what is in front of it (the bundled nginx alone, a tunnel or another proxy), and whether an earlier version worked

A security problem does not go in an issue, since issues are public: follow [SECURITY.md](../SECURITY.md). Never paste your `.env`, a secret, a backup file or a session cookie into an issue.

### 🤝 Become a Collaborator

If you're a developer who wants to help build the official version of CozyVTT, I'd love to meet you. I prefer to get to know my collaborators so we can stay aligned on the project's aesthetic and architecture.

1. Reach out via the [Contact Form](https://cozyvtt.com/Tend-the-Fire/)
2. We'll chat, maybe jump on a call, and see if we're a good fit for working together

### 🍴 Fork It

Since CozyVTT is licensed under the **AGPLv3**, you are always free — and encouraged — to fork the repository, experiment with your own ideas, and host your own modified versions for your friends and community.

---

## Development Standards

If you become a collaborator, here's what the codebase expects:

### Code Quality

- **TypeScript strict mode** — no implicit nulls, and **no `any`**. This is not a
  style preference: `@typescript-eslint/no-explicit-any` is an *error* in both
  packages, so a diff containing one will not lint. Reach for `unknown` and a
  narrowing helper instead — `frontend/src/utils/errors.ts` and
  `backend/src/utils/prisma-json.ts` cover the two common cases
- **Tests** — new features should include tests; bug fixes should include a regression test that fails before the fix. A new HTTP route fails `backend/src/routes/__tests__/routeInventory.test.ts` until it is listed there, with the file of a test that sends a request to it
- **No new linter warnings** — `npm run lint` must pass cleanly in **both** `backend/` and `frontend/`; both run with `--max-warnings 0`
- **Run every gate, not a subset** — typecheck, lint, both test suites, the frontend build, and the two documentation checks with their own tests. The full list is in [DEVELOPMENT.md](DEVELOPMENT.md#everything-before-you-call-something-done). CI runs the same commands on every push and pull request into `dev` or `main`, and also checks the advisories in what an instance runs and builds the production images, starting them for the browser smoke tests. A pull request into `main` cannot merge until all five CI jobs pass; a push to `dev` is reported on, not blocked
- **Documentation is part of the change** — if you alter a route, an event, a sheet field or anything a user sees, update the affected document in the same commit
- **A dependency comes with its licence entry** — adding, removing or moving a package to a new major version updates `THIRD_PARTY_NOTICES.txt` (every package in a project's `dependencies`, by its major version line, with the licence its lockfile records) and, for a main library, `THIRD_PARTY_LICENSES.md`, in the same commit. `backend/src/__tests__/thirdPartyLicences.test.ts` fails until they match the lockfiles. A package that runs a script when it installs also needs its `allowScripts` entry ([DEVELOPMENT.md](DEVELOPMENT.md#1-install-dependencies)), which `dependencySources.test.ts` checks

### Security

- Never log sensitive data (passwords, session tokens, full `DATABASE_URL`)
- Log a caught error as `logger.error('What failed', { err: error })`. The logger writes the error's message, code and stack, masks email addresses and shortens very long values; it removes nothing else, so never log a request body or a socket payload as it arrived
- All authorization checks happen server-side — never trust the client
- File uploads must go through the existing magic byte validation middleware
- Any new WebSocket events that modify state must verify campaign membership server-side

### Styling and themes

CozyVTT ships 16 themes, including four dark ones, plus user-defined custom colors. Two rules keep
every screen working across all of them. The first is enforced by a test, so breaking it fails the
build; nothing checks the second, so it falls to you and the review:

- **Never use a raw Tailwind palette color** (`bg-red-50`, `text-stone-500`, `text-blue-600`) in
  themed UI. They keep their light-mode appearance on dark themes. Use the semantic tokens —
  `danger`, `success`, `warning`, `info`, `spirit` — or the `.alert-*` and `.badge-*` classes in
  `frontend/src/index.css`.
- **Use the `-ink` variant when the color is text**: `text-danger-ink`, not `text-danger`;
  `text-brand-ink`, not `text-moss-green`. The plain token is a fill (buttons, borders, tints); the
  `-ink` version is derived per theme to stay above WCAG AA against that theme's backgrounds.

Two areas are deliberately exempt and listed in `utils/__tests__/themeTokens.test.ts`: the character
sheets (styled as light "paper" cards, matching the physical sheets) and the dark DM overlays that
float over the map. If you add UI there, check its contrast by hand — exempt from theming is not
exempt from being readable.

See [ARCHITECTURE.md → Theming](ARCHITECTURE.md#theming) for the full token list.

### Performance

- Avoid blocking the event loop in route handlers — use `async/await` with Prisma
- Map/token updates should be debounced or throttled where appropriate (follow existing patterns)
- New React components should avoid unnecessary re-renders; use `useMemo`/`useCallback` where it matters

### Adding a New Game System

Adding a new tabletop game system is one of the most valuable contributions. Follow the step-by-step guide in [docs/GAME_SYSTEMS.md](GAME_SYSTEMS.md) — it covers every file you need to create and how they fit together.

---

## A Note on the AGPLv3 License

By contributing to this project, you agree that your contributions will be licensed under the **GNU Affero General Public License v3.0**. This ensures that CozyVTT — and any improvements made to it — remains open and accessible to the community forever.
