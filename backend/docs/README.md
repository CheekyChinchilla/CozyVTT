# Backend Docs

Reference material for the CozyVTT backend, for people working on CozyVTT
itself.

> **This is not a public API.** The routes described here are the ones CozyVTT's
> own web client calls. They are not versioned, carry no compatibility promise,
> and may change shape or disappear in a point release.
>
> A program *can* use them: there are no API keys or service accounts, but
> signing in with a user's own credentials returns a session cookie that works
> for both REST and Socket.io. It simply comes with no stability promise, and
> acts only with that user's permissions. Treat these files as a map of the
> current code.

## Files

| File | Purpose |
|------|---------|
| **`API_DOCUMENTATION.yaml`** | OpenAPI 3.0 description of every HTTP route — request shapes, response schemas, error codes, security requirements, examples. |
| **`WEBSOCKET_DOCUMENTATION.md`** | Reference for the Socket.io real-time event protocol. REST handles state changes; WebSockets carry live broadcasts (token movement, dice rolls, chat, and so on). |
| **`redocly.yaml`** | Lint/render config used by `@redocly/cli`. Tunes off a handful of intentionally-noisy default rules — see the comments inside the file. |
| **`api-docs.html`** | The spec rendered to a single standalone page. Generated locally and git-ignored, so it exists only if you have built it. |

## Working with the spec

### Check the docs still match the code

Both documents drift the moment something is added without a matching entry.
Two checks, run from the repository root:

```bash
python scripts/spec-coverage.py       # HTTP routes
python scripts/websocket-events.py --check   # Socket.io events
```

The first covers `API_DOCUMENTATION.yaml`, which must be complete in both
directions, and `docs/API_REFERENCE.md`, a hand-written guide that is allowed to
be partial but must not describe routes that do not exist — twelve of those had
accumulated, all wrong paths rather than removed features. It also loads the
YAML file when PyYAML is installed (CI installs it; locally, `pip install
pyyaml`), because the route check reads it line by line and does not care
whether it loads, and three unquoted colons once made it unloadable.

The second regenerates the event inventory from the handlers and fails on any
difference from the one in the doc: a new or removed event, a handler that
gained or lost a gate, or a hand-edited cell. Refresh it with `--write`. It
reads both `backend/src/websocket/` and `backend/src/routes/`, and matches
`socket.emit` alongside the `broadcastToCampaign` / `broadcastToUser` helpers
and the token move handlers' `emitMoveToVisibleSockets` /
`emitMoveToDragRecipients`, which take the event name as their first argument —
a route pushing an event through a helper reaches a client just as surely as a
handler emitting one, and while the scan covered only handlers the table called
itself complete while omitting seven such events.

The **Who may send it** column is read from the handler and from any function
in the same file that it calls directly, each only as far as the end of its own
body. The first row that matches decides the cell:

| The handler, or a function it calls | Reads |
|---|---|
| Turns every non-DM away: an `if` among its own statements (inside a `try` counts; a nested block, an `else` or a callback does not) whose branch ends in a bare `return;`, and whose condition is `socket.role !== 'DM'` alone or as one side of an *or*, or whose refusal says "Only the DM" | DM only |
| Calls `canToggleDoor` | DM; a player may toggle an unlocked door |
| Calls `canControlToken` | DM, or the token's player (adding "while the session is live" when it also calls `canMoveTokensNow`) |
| Tests `character.userId !== socket.userId` | DM, or the character's owner (adding "never a spectator" when it also tests `socket.role === 'SPECTATOR'`) |
| Calls `canRollDice` | DM and players |
| None of these | Any member |

`socket.role !== 'DM' && …` refuses only some non-DMs, as the character-owner
test does, so it does not read as DM only. A rule written inline instead of
through the shared predicates in `services/permissions.ts` is not seen, which
is one more reason to use them; the line above the table says the handler is
authoritative.

### Validate

```bash
cd backend
npx @redocly/cli lint docs/API_DOCUMENTATION.yaml --config docs/redocly.yaml
```

Reports `Your API description is valid` plus a handful of long-standing
warnings — 6 at the time of writing, all pre-existing and none of them
structural. Errors are worth acting on; that warning count is the baseline.

### Render to standalone HTML

```bash
cd backend
npx @redocly/cli build-docs docs/API_DOCUMENTATION.yaml --output docs/api-docs.html
```

The rendered page is git-ignored, so it is only ever as current as the last time
you ran this locally.
