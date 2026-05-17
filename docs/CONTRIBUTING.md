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

- **TypeScript strict mode** — no `any`, no implicit nulls
- **Tests** — new features should include tests; bug fixes should include a regression test
- **No new linter warnings** — `npm run lint` in the frontend must pass cleanly

### Security

- Never log sensitive data (passwords, session tokens, full `DATABASE_URL`)
- All authorization checks happen server-side — never trust the client
- File uploads must go through the existing magic byte validation middleware
- Any new WebSocket events that modify state must verify campaign membership server-side

### Performance

- Avoid blocking the event loop in route handlers — use `async/await` with Prisma
- Map/token updates should be debounced or throttled where appropriate (follow existing patterns)
- New React components should avoid unnecessary re-renders; use `useMemo`/`useCallback` where it matters

### Adding a New Game System

Adding a new tabletop game system is one of the most valuable contributions. Follow the step-by-step guide in [docs/GAME_SYSTEMS.md](GAME_SYSTEMS.md) — it covers every file you need to create and how they fit together.

---

## A Note on the AGPLv3 License

By contributing to this project, you agree that your contributions will be licensed under the **GNU Affero General Public License v3.0**. This ensures that CozyVTT — and any improvements made to it — remains open and accessible to the community forever.
